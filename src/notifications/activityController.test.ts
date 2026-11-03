/**
 * When the activity starts and ends (none while a computer sends no start times or attention kind), the switch,
 * silent updates and the stale date: the real `ActivityController` with a fake ActivityKit adapter and an injected
 * clock and timers. Content states and the host check come from the real `buildContentState` and
 * `computersNeedingUpdate` on summaries in the CLI's wire form. The fake ActivityKit refuses a start while the app is
 * out of front, as iOS does: a start that waits for the app to be in front, or that iOS refused, is not the user
 * removing the activity.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { parseMobileSummary } from '../contract/mobileSummary';
import {
  createActivityController,
  END_AFTER_IDLE_MS,
  STALE_AFTER_MS,
  type ActivityContent,
  type LiveActivityAdapter,
} from './activityController';
import {
  buildContentState,
  computersNeedingUpdate,
  workingStints,
  type LiveActivityContentState,
} from './contentState';

const MACHINE = 'm1';
const T0 = Date.parse('2026-10-24T10:00:00Z');

type WireSession = { sessionId: string; activity: string; attention?: object; workingStartedAt?: string };

/** The summary as the CLI sends it (the phone keeps zmx sessions only), its working stints and whether its host is current. */
function stateAt(
  now: number,
  sessions: WireSession[],
): { state: LiveActivityContentState; stints: string[]; hostsCurrent: boolean } {
  const wire = sessions.map((session) => ({ provider: 'zmx', agent: 'claude', projectName: 'p', ...session }));
  const summary = parseMobileSummary(JSON.stringify({ sessions: wire }));
  assert.ok(summary !== null);
  const sources = [{ machineId: MACHINE, summary, loadedAt: now }];
  return {
    state: buildContentState(sources, now),
    stints: workingStints(sources, now),
    hostsCurrent: computersNeedingUpdate(sources).length === 0,
  };
}

const idle = (id: string): WireSession => ({ sessionId: id, activity: 'idle' });
const working = (id: string, since = T0): WireSession => ({
  sessionId: id,
  activity: 'working',
  workingStartedAt: new Date(since).toISOString(),
});
const waiting = (id: string, since = T0): WireSession => ({
  sessionId: id,
  activity: 'attention',
  attention: { enteredAt: new Date(since).toISOString(), kind: 'needsInput' },
});
/** A finished agent as a current host sends it: the start of the stint that ended is `attention.workingStartedAt`. */
const finished = (id: string, at: number, workedSince = T0): WireSession => ({
  sessionId: id,
  activity: 'attention',
  attention: {
    enteredAt: new Date(at).toISOString(),
    kind: 'finished',
    workingStartedAt: new Date(workedSince).toISOString(),
  },
});

/**
 * Records every call the controller makes and lets a test end the activity "outside the app". Like ActivityKit, it
 * starts an activity only while the app is in front (`ios.inFront`), and refuses every start while
 * `ios.refusesStarts` (iOS refusing it for another reason, such as Live Activities switched off for the app). While
 * `ios.answersLater`, a start's answer waits for `answerStart()`, and `hasActivity` is null meanwhile, as the adapter's
 * contract says for a call under way.
 */
function fakeAdapter() {
  const calls: Array<{ kind: 'request' | 'update' | 'end'; content?: ActivityContent }> = [];
  let onScreen = false;
  let unanswered: (() => void) | null = null;
  const ios = { inFront: true, refusesStarts: false, answersLater: false };
  const adapter: LiveActivityAdapter = {
    hasActivity: () => (unanswered !== null ? null : onScreen),
    request: (content) => {
      calls.push({ kind: 'request', content });
      // iOS decides when the start is asked for.
      const refused = !ios.inFront || ios.refusesStarts;
      const answered = Promise.withResolvers<void>();
      const answer = (): void => {
        unanswered = null;
        if (refused) {
          answered.reject(new Error('the activity was not started'));
          return;
        }
        onScreen = true;
        answered.resolve();
      };
      if (ios.answersLater) unanswered = answer;
      else answer();
      return answered.promise;
    },
    update: (content) => {
      calls.push({ kind: 'update', content });
      return Promise.resolve();
    },
    end: () => {
      calls.push({ kind: 'end' });
      onScreen = false;
      return Promise.resolve();
    },
  };
  return {
    adapter,
    calls,
    ios,
    kinds: () => calls.map((call) => call.kind),
    onScreen: () => onScreen,
    answerStart: () => unanswered?.(),
    dismissByUser: () => {
      onScreen = false;
    },
  };
}

/** Lets the answers of the ActivityKit calls made so far arrive. */
function settled(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setImmediate(resolve);
  return promise;
}

/** A clock with one-shot timers, advanced by hand. */
function fakeTime() {
  let now = T0;
  let nextId = 1;
  const timers = new Map<number, { run: () => void; due: number }>();
  return {
    now: () => now,
    timers: {
      setTimeout: (run: () => void, ms: number): number => {
        const id = nextId++;
        timers.set(id, { run, due: now + ms });
        return id;
      },
      clearTimeout: (id: number): void => {
        timers.delete(id);
      },
    },
    /** Runs every timer due by `time`, as a running app does. */
    advanceTo(time: number): void {
      for (const [id, timer] of [...timers].sort((a, b) => a[1].due - b[1].due)) {
        if (timer.due > time) continue;
        now = timer.due;
        timers.delete(id);
        timer.run();
      }
      now = time;
    },
    /** Moves the clock without running timers: a suspended app that has not run its overdue timers yet. */
    jumpTo(time: number): void {
      now = time;
    },
  };
}

function setup() {
  const fake = fakeAdapter();
  const time = fakeTime();
  const errors: string[] = [];
  const controller = createActivityController({
    adapter: fake.adapter,
    now: time.now,
    timers: time.timers,
    onError: (message) => errors.push(message),
  });
  const process = (at: number, sessions: WireSession[], enabled = true) => {
    time.advanceTo(at);
    const { state, stints, hostsCurrent } = stateAt(at, sessions);
    controller.process(state, stints, enabled, hostsCurrent, fake.ios.inFront);
  };
  /** A refresh right after iOS resumed the app, before its overdue timers ran. */
  const processAfterSuspension = (at: number, sessions: WireSession[]) => {
    time.jumpTo(at);
    const { state, stints, hostsCurrent } = stateAt(at, sessions);
    controller.process(state, stints, true, hostsCurrent, fake.ios.inFront);
  };
  return { ...fake, time, errors, process, processAfterSuspension };
}

describe('start and end', () => {
  test('an agent starting to work while the app runs starts exactly one activity', () => {
    const { process, kinds } = setup();
    process(T0, [idle('s1')]);
    assert.deepEqual(kinds(), []);
    process(T0 + 5_000, [working('s1', T0 + 3_000)]);
    process(T0 + 10_000, [working('s1', T0 + 3_000)]);
    process(T0 + 15_000, [working('s1', T0 + 3_000), working('s2', T0 + 12_000)]);
    assert.equal(kinds().filter((kind) => kind === 'request').length, 1);
  });

  test('15 minutes without a working or waiting agent end it, not a second earlier', () => {
    const { process, time, kinds } = setup();
    process(T0, [working('s1')]);
    const stopped = T0 + 60_000;
    process(stopped, [idle('s1')]);
    time.advanceTo(stopped + END_AFTER_IDLE_MS - 1_000);
    assert.ok(!kinds().includes('end'), 'no end at 14 min 59 s');
    time.advanceTo(stopped + END_AFTER_IDLE_MS);
    assert.deepEqual(
      kinds().filter((kind) => kind === 'end'),
      ['end'],
    );
  });

  test('a refresh after the app was suspended past the 15 minutes ends it then', () => {
    const { process, processAfterSuspension, kinds } = setup();
    process(T0, [working('s1')]);
    process(T0 + 60_000, [idle('s1')]);
    processAfterSuspension(T0 + 60_000 + 20 * 60_000, [idle('s1')]);
    // The update is the idle content (no agent working or waiting) sent when the last agent stopped.
    assert.deepEqual(kinds(), ['request', 'update', 'end']);
  });

  test('an agent that starts again within the 15 minutes keeps the activity', () => {
    const { process, time, kinds } = setup();
    process(T0, [working('s1')]);
    process(T0 + 60_000, [idle('s1')]);
    process(T0 + 10 * 60_000, [waiting('s1', T0 + 10 * 60_000)]);
    time.advanceTo(T0 + 60_000 + END_AFTER_IDLE_MS + 1_000);
    assert.ok(!kinds().includes('end'));
  });

  test('removed by the user, it starts again only when an agent starts working', () => {
    const { process, kinds, dismissByUser } = setup();
    process(T0, [working('s1')]);
    dismissByUser();
    process(T0 + 5_000, [working('s1')]);
    process(T0 + 10_000, [working('s1'), waiting('s2')]);
    assert.equal(kinds().filter((kind) => kind === 'request').length, 1);
    process(T0 + 15_000, [working('s1'), waiting('s2'), working('s3', T0 + 14_000)]);
    assert.equal(kinds().filter((kind) => kind === 'request').length, 2);
  });

  // A restart probe: the user removed the activity, then the same session began
  // its next turn between two 5-second refreshes, with a new `workingStartedAt` and nothing else changed.
  test('removed by the user, the same session starting its next working stint starts a new one', () => {
    const { process, kinds, dismissByUser } = setup();
    process(T0, [working('s1', T0)]);
    dismissByUser();
    process(T0 + 5_000, [working('s1', T0)]);
    assert.equal(kinds().filter((kind) => kind === 'request').length, 1, 'the same stint does not restart it');
    process(T0 + 10_000, [working('s1', T0 + 8_000)]);
    assert.equal(kinds().filter((kind) => kind === 'request').length, 2);
  });

  test('removed by the user, an agent starting to work without a row (in "+N more") starts a new one', () => {
    const { process, kinds, dismissByUser, calls } = setup();
    const fourWaiting = [waiting('q1'), waiting('q2'), waiting('q3'), waiting('q4')];
    process(T0, [...fourWaiting, working('a', T0)]);
    assert.equal(calls[0]?.content?.state.moreCount, 1, 'the working agent has no row');
    dismissByUser();
    process(T0 + 5_000, [...fourWaiting, working('a', T0)]);
    // Between two refreshes `a` stopped and `b` started: one working agent before and after, the same four rows.
    process(T0 + 10_000, [...fourWaiting, idle('a'), working('b', T0 + 8_000)]);
    assert.equal(kinds().filter((kind) => kind === 'request').length, 2);
  });
});

// A background run for a push refreshes the session list and brings the activity in line (`backgroundPush.ts`), also
// when no activity is on screen. ActivityKit starts an activity only for an app in front; it updates and ends a
// running one in the background too.
describe('a start needs the app in front', () => {
  test('a working agent read in the background starts its activity once the app is in front, the same stint', async () => {
    const { process, kinds, ios, onScreen } = setup();
    ios.inFront = false;
    process(T0, [working('s1')]);
    await settled();
    assert.deepEqual(kinds(), [], 'no start is asked for in the background');
    ios.inFront = true;
    process(T0 + 5_000, [working('s1')]);
    await settled();
    assert.deepEqual(kinds(), ['request']);
    assert.equal(onScreen(), true);
  });

  test('a start iOS refused is asked for again once the app was out of front and is back, not on each refresh', async () => {
    const { process, kinds, ios, onScreen, errors } = setup();
    ios.refusesStarts = true;
    process(T0, [working('s1')]);
    await settled();
    process(T0 + 5_000, [working('s1')]);
    await settled();
    assert.deepEqual(kinds(), ['request'], 'no second request while the app stays in front');
    assert.equal(errors.length, 1);
    ios.refusesStarts = false;
    ios.inFront = false;
    process(T0 + 10_000, [working('s1')]);
    ios.inFront = true;
    process(T0 + 15_000, [working('s1')]);
    await settled();
    assert.deepEqual(kinds(), ['request', 'request']);
    assert.equal(onScreen(), true);
  });

  test('a start iOS refused is asked for again when a working stint begins, also while the app stays in front', async () => {
    const { process, kinds, ios } = setup();
    ios.refusesStarts = true;
    process(T0, [working('s1', T0)]);
    await settled();
    ios.refusesStarts = false;
    process(T0 + 5_000, [working('s1', T0), working('s2', T0 + 4_000)]);
    await settled();
    assert.deepEqual(kinds(), ['request', 'request']);
  });

  test('a start refused as the app left the front is asked for again when it is back', async () => {
    const { process, kinds, ios, onScreen, answerStart } = setup();
    ios.refusesStarts = true;
    ios.answersLater = true;
    process(T0, [working('s1')]);
    // The app leaves the front, and a refresh runs, before iOS's answer arrives.
    ios.inFront = false;
    process(T0 + 1_000, [working('s1')]);
    answerStart();
    await settled();
    ios.refusesStarts = false;
    ios.answersLater = false;
    ios.inFront = true;
    process(T0 + 5_000, [working('s1')]);
    await settled();
    assert.deepEqual(kinds(), ['request', 'request']);
    assert.equal(onScreen(), true);
  });

  test('removed by the user, it stays away when the app comes back to front during the same stint', async () => {
    const { process, kinds, ios, dismissByUser } = setup();
    process(T0, [working('s1')]);
    await settled();
    dismissByUser();
    ios.inFront = false;
    process(T0 + 5_000, [working('s1')]);
    ios.inFront = true;
    process(T0 + 10_000, [working('s1')]);
    await settled();
    assert.deepEqual(kinds(), ['request']);
  });

  test('out of front a running activity is still updated and ended', async () => {
    const { process, kinds, ios } = setup();
    process(T0, [working('s1')]);
    await settled();
    ios.inFront = false;
    process(T0 + 5_000, [waiting('s1', T0 + 4_000)]);
    process(T0 + 10_000, [waiting('s1', T0 + 4_000)], false);
    assert.deepEqual(kinds(), ['request', 'update', 'end']);
  });
});

describe('a computer that sends no start times or attention kind', () => {
  /** An agent working on a Mac that does not send `workingStartedAt`. */
  const workingOnOlderMac = (id: string): WireSession => ({ sessionId: id, activity: 'working' });
  /** An agent in attention on a Mac that does not send `attention.kind`. */
  const attentionOnOlderMac = (id: string): WireSession => ({
    sessionId: id,
    activity: 'attention',
    attention: { enteredAt: new Date(T0).toISOString() },
  });

  test('an agent starting to work on a Mac without workingStartedAt starts no activity', () => {
    const { process, kinds } = setup();
    process(T0, [idle('s1')]);
    process(T0 + 5_000, [workingOnOlderMac('s1')]);
    process(T0 + 10_000, [workingOnOlderMac('s1'), attentionOnOlderMac('s2')]);
    assert.deepEqual(kinds(), []);
  });

  test('a running activity ends at the next refresh that shows an agent without attention.kind', () => {
    const { process, kinds } = setup();
    process(T0, [working('s1')]);
    process(T0 + 5_000, [working('s1'), attentionOnOlderMac('s2')]);
    assert.deepEqual(kinds(), ['request', 'end']);
  });

  test('once the Mac sends both, a working agent starts the activity', () => {
    const { process, kinds } = setup();
    process(T0, [workingOnOlderMac('s1')]);
    process(T0 + 5_000, [working('s1', T0)]);
    assert.deepEqual(kinds(), ['request']);
  });

  test('a finished agent without attention.workingStartedAt on a current Mac keeps the activity', () => {
    const { process, kinds } = setup();
    // A current Mac leaves the start out when the attention came from idle: the Mac is current, the row has no time.
    const finishedFromIdle: WireSession = {
      sessionId: 's2',
      activity: 'attention',
      attention: { enteredAt: new Date(T0 + 4_000).toISOString(), kind: 'finished' },
    };
    process(T0, [working('s1')]);
    process(T0 + 5_000, [working('s1'), finishedFromIdle]);
    assert.deepEqual(kinds(), ['request', 'update']);
  });
});

describe('Settings switch', () => {
  test('switching it off ends the running activity', () => {
    const { process, kinds } = setup();
    process(T0, [working('s1')]);
    process(T0 + 5_000, [working('s1')], false);
    assert.deepEqual(kinds(), ['request', 'end']);
  });

  test('while it is off an agent starting to work starts nothing', () => {
    const { process, kinds } = setup();
    process(T0, [idle('s1')], false);
    process(T0 + 5_000, [working('s1')], false);
    process(T0 + 10_000, [working('s1'), working('s2')], false);
    assert.deepEqual(kinds(), []);
  });
});

describe('updates', () => {
  function updatesAcrossTransitions() {
    const fake = setup();
    fake.process(T0, [working('s1')]);
    fake.process(T0 + 5_000, [waiting('s1', T0 + 4_000)]);
    fake.process(T0 + 10_000, [finished('s1', T0 + 9_000)]);
    fake.process(T0 + 15_000, [finished('s1', T0 + 9_000), working('s2', T0 + 14_000)]);
    return fake.calls.filter((call) => call.content !== undefined);
  }

  test('no update across working, waiting and finished carries an alert configuration', () => {
    const sent = updatesAcrossTransitions();
    assert.deepEqual(
      sent.map((call) => call.kind),
      ['request', 'update', 'update', 'update'],
    );
    for (const call of sent) assert.deepEqual(Object.keys(call.content ?? {}).sort(), ['staleDate', 'state']);
  });

  test('every content sent carries a stale date one stale interval after its data time', () => {
    for (const call of updatesAcrossTransitions()) {
      const content = call.content;
      assert.ok(content !== undefined);
      assert.equal(content.staleDate, Date.parse(content.state.updatedAt) + STALE_AFTER_MS);
      assert.ok(content.staleDate > Date.parse(content.state.updatedAt));
    }
  });

  test('unchanged content is sent again once a minute so the stale date moves on', () => {
    const { process, kinds } = setup();
    process(T0, [working('s1')]);
    process(T0 + 5_000, [working('s1')]);
    process(T0 + 30_000, [working('s1')]);
    assert.deepEqual(kinds(), ['request']);
    process(T0 + 60_000, [working('s1')]);
    assert.deepEqual(kinds(), ['request', 'update']);
  });
});
