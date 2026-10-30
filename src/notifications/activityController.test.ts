/**
 * REQ-LIVEACT-004 AC1-AC3 and its condition from D-063 (no activity while a computer lacks H1a or H1b),
 * REQ-LIVEACT-005 AC1-AC2, REQ-LIVEACT-006 AC1 and REQ-LIVEACT-007 AC1: the real `ActivityController` with a
 * fake ActivityKit adapter and an injected clock and timers. Content states and the host check come from the
 * real `buildContentState` and `computersNeedingUpdate` on summaries in the CLI's wire form.
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
/** A finished agent as a current host sends it: the start of its last stint stays (H1a addendum). */
const finished = (id: string, at: number, workedSince = T0): WireSession => ({
  sessionId: id,
  activity: 'attention',
  attention: { enteredAt: new Date(at).toISOString(), kind: 'finished' },
  workingStartedAt: new Date(workedSince).toISOString(),
});

/** Records every call the controller makes and lets a test end the activity "outside the app". */
function fakeAdapter() {
  const calls: Array<{ kind: 'request' | 'update' | 'end'; content?: ActivityContent }> = [];
  let onScreen = false;
  const adapter: LiveActivityAdapter = {
    hasActivity: () => onScreen,
    request: (content) => {
      calls.push({ kind: 'request', content });
      onScreen = true;
      return Promise.resolve();
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
    kinds: () => calls.map((call) => call.kind),
    dismissByUser: () => {
      onScreen = false;
    },
  };
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
    controller.process(state, stints, enabled, hostsCurrent);
  };
  /** A refresh right after iOS resumed the app, before its overdue timers ran. */
  const processAfterSuspension = (at: number, sessions: WireSession[]) => {
    time.jumpTo(at);
    const { state, stints, hostsCurrent } = stateAt(at, sessions);
    controller.process(state, stints, true, hostsCurrent);
  };
  return { ...fake, time, errors, process, processAfterSuspension };
}

describe('start and end', () => {
  test('REQ-LIVEACT-004 AC1: an agent starting to work while the app runs starts exactly one activity', () => {
    const { process, kinds } = setup();
    process(T0, [idle('s1')]);
    assert.deepEqual(kinds(), []);
    process(T0 + 5_000, [working('s1', T0 + 3_000)]);
    process(T0 + 10_000, [working('s1', T0 + 3_000)]);
    process(T0 + 15_000, [working('s1', T0 + 3_000), working('s2', T0 + 12_000)]);
    assert.equal(kinds().filter((kind) => kind === 'request').length, 1);
  });

  test('REQ-LIVEACT-004 AC2, AC3: 15 minutes without a working or waiting agent end it, not a second earlier', () => {
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

  test('REQ-LIVEACT-004 AC2: a refresh after the app was suspended past the 15 minutes ends it then', () => {
    const { process, processAfterSuspension, kinds } = setup();
    process(T0, [working('s1')]);
    process(T0 + 60_000, [idle('s1')]);
    processAfterSuspension(T0 + 60_000 + 20 * 60_000, [idle('s1')]);
    // The update is the idle content (no agent working or waiting) sent when the last agent stopped.
    assert.deepEqual(kinds(), ['request', 'update', 'end']);
  });

  test('REQ-LIVEACT-004 AC2: an agent that starts again within the 15 minutes keeps the activity', () => {
    const { process, time, kinds } = setup();
    process(T0, [working('s1')]);
    process(T0 + 60_000, [idle('s1')]);
    process(T0 + 10 * 60_000, [waiting('s1', T0 + 10 * 60_000)]);
    time.advanceTo(T0 + 60_000 + END_AFTER_IDLE_MS + 1_000);
    assert.ok(!kinds().includes('end'));
  });

  test('REQ-LIVEACT-004 AC1: removed by the user, it starts again only when an agent starts working', () => {
    const { process, kinds, dismissByUser } = setup();
    process(T0, [working('s1')]);
    dismissByUser();
    process(T0 + 5_000, [working('s1')]);
    process(T0 + 10_000, [working('s1'), waiting('s2')]);
    assert.equal(kinds().filter((kind) => kind === 'request').length, 1);
    process(T0 + 15_000, [working('s1'), waiting('s2'), working('s3', T0 + 14_000)]);
    assert.equal(kinds().filter((kind) => kind === 'request').length, 2);
  });

  // The reviewer's restart probe (S8 review r1, K-1): the user removed the activity, then the same session began
  // its next turn between two 5-second refreshes, with a new `workingStartedAt` and nothing else changed.
  test('REQ-LIVEACT-004 AC1: removed by the user, the same session starting its next working stint starts a new one', () => {
    const { process, kinds, dismissByUser } = setup();
    process(T0, [working('s1', T0)]);
    dismissByUser();
    process(T0 + 5_000, [working('s1', T0)]);
    assert.equal(kinds().filter((kind) => kind === 'request').length, 1, 'the same stint does not restart it');
    process(T0 + 10_000, [working('s1', T0 + 8_000)]);
    assert.equal(kinds().filter((kind) => kind === 'request').length, 2);
  });

  test('REQ-LIVEACT-004 AC1: removed by the user, an agent starting to work without a row (in "+N more") starts a new one', () => {
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

describe('a computer without host changes H1a and H1b (D-063)', () => {
  /** An agent working on a Mac that does not send `workingStartedAt` (H1a). */
  const workingOnOlderMac = (id: string): WireSession => ({ sessionId: id, activity: 'working' });
  /** An agent in attention on a Mac that does not send `attention.kind` (H1b). */
  const attentionOnOlderMac = (id: string): WireSession => ({
    sessionId: id,
    activity: 'attention',
    attention: { enteredAt: new Date(T0).toISOString() },
  });

  test('REQ-LIVEACT-004 (D-063): an agent starting to work on a Mac without H1a starts no activity', () => {
    const { process, kinds } = setup();
    process(T0, [idle('s1')]);
    process(T0 + 5_000, [workingOnOlderMac('s1')]);
    process(T0 + 10_000, [workingOnOlderMac('s1'), attentionOnOlderMac('s2')]);
    assert.deepEqual(kinds(), []);
  });

  test('REQ-LIVEACT-004 (D-063): a running activity ends at the next refresh that shows an agent without H1b', () => {
    const { process, kinds } = setup();
    process(T0, [working('s1')]);
    process(T0 + 5_000, [working('s1'), attentionOnOlderMac('s2')]);
    assert.deepEqual(kinds(), ['request', 'end']);
  });

  test('REQ-LIVEACT-004 (D-063): once the Mac sends both, a working agent starts the activity', () => {
    const { process, kinds } = setup();
    process(T0, [workingOnOlderMac('s1')]);
    process(T0 + 5_000, [working('s1', T0)]);
    assert.deepEqual(kinds(), ['request']);
  });
});

describe('Settings switch', () => {
  test('REQ-LIVEACT-005 AC1: switching it off ends the running activity', () => {
    const { process, kinds } = setup();
    process(T0, [working('s1')]);
    process(T0 + 5_000, [working('s1')], false);
    assert.deepEqual(kinds(), ['request', 'end']);
  });

  test('REQ-LIVEACT-005 AC2: while it is off an agent starting to work starts nothing', () => {
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

  test('REQ-LIVEACT-006 AC1: no update across working, waiting and finished carries an alert configuration', () => {
    const sent = updatesAcrossTransitions();
    assert.deepEqual(
      sent.map((call) => call.kind),
      ['request', 'update', 'update', 'update'],
    );
    for (const call of sent) assert.deepEqual(Object.keys(call.content ?? {}).sort(), ['staleDate', 'state']);
  });

  test('REQ-LIVEACT-007 AC1: every content sent carries a stale date one stale interval after its data time', () => {
    for (const call of updatesAcrossTransitions()) {
      const content = call.content;
      assert.ok(content !== undefined);
      assert.equal(content.staleDate, Date.parse(content.state.updatedAt) + STALE_AFTER_MS);
      assert.ok(content.staleDate > Date.parse(content.state.updatedAt));
    }
  });

  test('REQ-LIVEACT-007 AC1: unchanged content is sent again once a minute so the stale date moves on', () => {
    const { process, kinds } = setup();
    process(T0, [working('s1')]);
    process(T0 + 5_000, [working('s1')]);
    process(T0 + 30_000, [working('s1')]);
    assert.deepEqual(kinds(), ['request']);
    process(T0 + 60_000, [working('s1')]);
    assert.deepEqual(kinds(), ['request', 'update']);
  });
});
