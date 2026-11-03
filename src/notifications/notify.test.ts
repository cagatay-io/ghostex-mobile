/// <reference types="node" />
/**
 * Run with `bun test src/notifications/notify.test.ts`. Which events notify, their wording, the rate limit, the
 * switches, and one notification per event from both routes, delayed and reordered (the exact row stays one event
 * after the session moved on, also after the computer replaced it in its feed and across a restart): real `mapEvent`,
 * `AnnouncedEvents` (with its rate limit; its storage faked), `postNotification` with a fake notification centre and
 * `announceAttentionTransitions` (the Sessions list's attention sound) with a fake sound.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { parseMobileSummary } from '../contract/mobileSummary';
import { AnnouncedEvents, type AnnouncedEventsStorage, type EventIdentity } from './eventIdentity';
import { hostEventFromFeedRow, sessionFacts, type HostEvent, type SessionFacts } from './events';
import { parseFeedRow } from './feedContract';
import {
  announceAttentionTransitions,
  processHostEvents,
  type AttentionSoundDeps,
  type NotificationRequest,
  type NotifyDeps,
} from './notify';
import type { NotificationSettings } from './settings';

const ALL_ON: NotificationSettings = {
  enabled: true,
  finished: true,
  waiting: true,
  error: true,
  askedAt: '2026-10-29T10:00:00Z',
};

/** The session as the session list shows it: in its attention a1 since 09:59, before the rows below. */
function facts(sessionId: string, pendingQuestionCount = 0): SessionFacts {
  return {
    projectId: 'p1',
    agentLabel: 'Claude Code',
    agentIconId: 'claude',
    projectName: 'ghostex-mobile',
    title: `title of ${sessionId}`,
    pendingQuestionCount,
    awaitingAnswer: false,
    attentionId: 'a1',
    attentionEnteredAt: '2026-10-29T09:59:00Z',
  };
}

/** The route as the app starts it: a record of announced events that has read its (empty) storage. */
async function harness(
  settings: NotificationSettings = ALL_ON,
  listed: Record<string, SessionFacts> = { s1: facts('s1') },
  centre?: NotifyDeps['centre'],
) {
  const posted: NotificationRequest[] = [];
  const logs: string[] = [];
  /** Sessions open on screen, as `machineId\nsessionId`. */
  const onScreen = new Set<string>();
  let now = 1_000_000;
  // The app's storage of the record of announced events, across launches (`restart`).
  let stored: string | null = null;
  /** A run announced something the record has not written yet (every run of a restart test announces). */
  let unwritten = false;
  let wrote = Promise.withResolvers<void>();
  const storage: AnnouncedEventsStorage = {
    read: async () => stored,
    write: async (record) => {
      stored = record;
      unwritten = false;
      wrote.resolve();
      wrote = Promise.withResolvers<void>();
    },
    failed: (action) => assert.fail(`the record was not ${action === 'read' ? 'read' : 'written'}`),
  };
  const deps: NotifyDeps = {
    centre: centre ?? { post: async (request) => void posted.push(request) },
    announced: new AnnouncedEvents(() => now),
    settings: () => settings,
    soundOn: () => true,
    onScreen: (machineId, sessionId) => onScreen.has(`${machineId}\n${sessionId}`),
    log: (line) => void logs.push(line),
  };
  /** The Sessions list's attention sounds played, each with the events it announced. */
  const played: (readonly EventIdentity[])[] = [];
  const soundDeps: AttentionSoundDeps = {
    get announced() {
      return deps.announced;
    },
    soundOn: deps.soundOn,
    onScreen: deps.onScreen,
    play: (events) => void played.push(events),
    log: deps.log,
  };
  // Until the record has read its storage, deliveries wait (`whenLoaded`); the app reads it at its start.
  await deps.announced.load(storage);
  return {
    posted,
    played,
    logs,
    onScreen,
    listed,
    get announced() {
      return deps.announced;
    },
    advance: (ms: number) => void (now += ms),
    run: (events: HostEvent[]) => {
      unwritten = true;
      processHostEvents(events, (_m, s) => listed[s], deps);
    },
    /** One pass of the Sessions list: sessions that left attention, sessions that entered it. */
    sessionsList: (left: readonly { machineId: string; sessionId: string }[], entered: readonly EventIdentity[]) =>
      announceAttentionTransitions(left, entered, soundDeps),
    /** The app quits once what it announced is written, and starts again: a new record, its rate limit restored. */
    restart: async () => {
      if (unwritten) await wrote.promise;
      deps.announced = new AnnouncedEvents(() => now);
      await deps.announced.load(storage);
    },
  };
}

function row(kind: string, sessionId = 's1'): HostEvent {
  const parsed = parseFeedRow({
    id: `n-${kind}-${sessionId}-${Math.random()}`,
    projectId: 'p1',
    sessionId,
    kind,
    title: 'fix build',
    subtitle: 'ghostex-mobile',
    body: 'secret text',
    agentName: 'claude',
    createdAt: '2026-10-29T10:00:00Z',
    read: false,
  });
  assert.ok(parsed !== null);
  const event = hostEventFromFeedRow('m1', parsed);
  assert.ok(event !== null);
  return event;
}

describe('agent events become notification requests', () => {
  test('finished gives exactly one request of kind finished for S', async () => {
    const h = await harness();
    h.run([row('finished')]);
    assert.equal(h.posted.length, 1);
    assert.equal(h.posted[0].line, 'Finished');
    assert.equal(h.posted[0].data.sessionId, 's1');
    assert.equal(h.posted[0].data.kind, 'finished');
  });

  test('needsInput gives one waiting request', async () => {
    const h = await harness();
    h.run([row('needsInput')]);
    assert.equal(h.posted.length, 1);
    assert.equal(h.posted[0].line, 'Waiting for you');
  });

  test('failed gives one request of kind failed', async () => {
    const h = await harness();
    h.run([row('failed')]);
    assert.equal(h.posted.length, 1);
    assert.equal(h.posted[0].line, 'Ended with an error');
  });

  test('abort, start, end and idle->working create nothing', async () => {
    const h = await harness();
    // They reach the phone only as summary changes: no host event of a notifying kind exists for them.
    h.run([
      { machineId: 'm1', sessionId: 's1', kind: 'aborted', eventId: 'a', occurredAt: '2026-10-29T10:00:00Z' },
      { machineId: 'm1', sessionId: 's1', kind: 'sessionStarted', eventId: 'b', occurredAt: '2026-10-29T10:00:00Z' },
      { machineId: 'm1', sessionId: 's1', kind: 'sessionEnded', eventId: 'c', occurredAt: '2026-10-29T10:00:00Z' },
      { machineId: 'm1', sessionId: 's1', kind: 'working', eventId: 'd', occurredAt: '2026-10-29T10:00:00Z' },
      row('bell'),
      row('custom'),
    ]);
    assert.equal(h.posted.length, 0);
  });

  test('an event of a session the computer does not list (a subagent) creates nothing', async () => {
    const h = await harness();
    h.run([row('finished', 'subagent-of-s1')]);
    assert.equal(h.posted.length, 0);
  });

  test('a coordinator thread is a listed session and notifies', async () => {
    const h = await harness(ALL_ON, { thread1: facts('thread1') });
    h.run([row('needsInput', 'thread1')]);
    assert.equal(h.posted.length, 1);
  });

  test('the feed text "secret text" is never in a request', async () => {
    const h = await harness();
    h.run([row('finished')]);
    assert.ok(!JSON.stringify(h.posted).includes('secret text'));
    assert.ok(!JSON.stringify(h.posted).includes('title of s1'));
    assert.equal(h.posted[0].title, 'Claude Code · ghostex-mobile');
  });

  test('three events of one session within 20 s give one request', async () => {
    const h = await harness();
    h.run([row('finished')]);
    h.advance(5_000);
    h.run([row('needsInput')]);
    h.advance(10_000);
    h.run([row('finished')]);
    assert.equal(h.posted.length, 1);
    h.advance(6_000);
    h.run([row('finished')]);
    assert.equal(h.posted.length, 2);
  });

  test('ten sessions within 60 s give eight requests', async () => {
    const listed: Record<string, SessionFacts> = {};
    for (let i = 0; i < 10; i += 1) listed[`s${i}`] = facts(`s${i}`);
    const h = await harness(ALL_ON, listed);
    for (let i = 0; i < 10; i += 1) {
      h.run([row('finished', `s${i}`)]);
      h.advance(5_000);
    }
    assert.equal(h.posted.length, 8);
  });

  test('an account row creates nothing', () => {
    const parsed = parseFeedRow({
      id: 'n9',
      projectId: 'accounts',
      sessionId: 'account:acc1',
      kind: 'resetExpiring',
      title: 'Usage reset expires',
      subtitle: 'Account acc1',
      body: 'Reset expires in 24 hours',
      createdAt: '2026-10-24T10:00:00Z',
      read: false,
      accountId: 'acc1',
    });
    assert.ok(parsed !== null);
    assert.equal(hostEventFromFeedRow('m1', parsed), null);
  });

  test('finished switch off: only the waiting event notifies', async () => {
    const h = await harness({ ...ALL_ON, finished: false }, { s1: facts('s1'), s2: facts('s2') });
    h.run([row('finished', 's1'), row('needsInput', 's2')]);
    assert.equal(h.posted.length, 1);
    assert.equal(h.posted[0].line, 'Waiting for you');
  });

  test('master off: nothing notifies', async () => {
    const h = await harness({ ...ALL_ON, enabled: false });
    h.run([row('finished'), row('failed', 's1'), row('needsInput')]);
    assert.equal(h.posted.length, 0);
  });

  test('before the ask is answered nothing notifies', async () => {
    const { askedAt: _asked, ...unasked } = ALL_ON;
    const h = await harness(unasked);
    h.run([row('finished')]);
    assert.equal(h.posted.length, 0);
  });
});

describe('"has a question"', () => {
  test('a waiting session with a pending question is announced as a question', async () => {
    const h = await harness(ALL_ON, { s1: facts('s1', 1) });
    h.run([row('needsInput')]);
    assert.equal(h.posted[0].line, 'Has a question');
    assert.ok(h.posted[0].data.url.includes('view=question'));
  });

  test('without a pending question it is waiting', async () => {
    const h = await harness(ALL_ON, { s1: facts('s1', 0) });
    h.run([row('needsInput')]);
    assert.equal(h.posted[0].line, 'Waiting for you');
    assert.ok(!h.posted[0].data.url.includes('view=question'));
  });

  /** s1 as the phone reads it from the computer's summary: its `capabilities` as sent and s1's question fields. */
  function listedFrom(capabilities: object | undefined, questions: object): SessionFacts {
    const summary = parseMobileSummary(
      JSON.stringify({
        ...(capabilities === undefined ? {} : { capabilities }),
        sessions: [{ sessionId: 's1', projectId: 'p1', provider: 'zmx', activity: 'attention', ...questions }],
      }),
    );
    const listed = sessionFacts(summary, 's1');
    assert.ok(listed !== undefined);
    return listed;
  }

  for (const { name, capabilities, questions, line } of [
    {
      name: 'an open question card, the summary announcing the field',
      capabilities: { awaitingAnswer: true },
      questions: { awaitingAnswer: true },
      line: 'Has a question',
    },
    {
      name: 'an open question card, the summary not announcing the field (other capabilities only)',
      capabilities: { sessionGitStatus: true },
      questions: { awaitingAnswer: true },
      line: 'Waiting for you',
    },
    {
      name: 'an open question card, the summary without capabilities',
      capabilities: undefined,
      questions: { awaitingAnswer: true },
      line: 'Waiting for you',
    },
    {
      name: 'a pending question counted alone (a Codex question or a question form)',
      capabilities: { awaitingAnswer: true },
      questions: { awaitingAnswer: false, pendingQuestionCount: 1 },
      line: 'Has a question',
    },
    {
      name: 'a pending question counted by a computer without the question-card field',
      capabilities: undefined,
      questions: { pendingQuestionCount: 1 },
      line: 'Has a question',
    },
    {
      name: 'neither a question card nor a counted question',
      capabilities: { awaitingAnswer: true },
      questions: { awaitingAnswer: false },
      line: 'Waiting for you',
    },
  ]) {
    test(`${name}: "${line}"`, async () => {
      const h = await harness(ALL_ON, { s1: listedFrom(capabilities, questions) });
      h.run([row('needsInput')]);
      assert.equal(h.posted.length, 1);
      assert.equal(h.posted[0].line, line);
    });
  }

  test('the request holds only agent, project and session identity, no question text', async () => {
    const h = await harness(ALL_ON, { s1: facts('s1', 1) });
    h.run([row('needsInput')]);
    const request = h.posted[0];
    assert.deepEqual(Object.keys(request.data).sort(), ['kind', 'machineId', 'notificationId', 'sessionId', 'url']);
    assert.equal(request.title, 'Claude Code · ghostex-mobile');
  });

  test('waiting on, finished off: the question is posted', async () => {
    const h = await harness({ ...ALL_ON, finished: false }, { s1: facts('s1', 1) });
    h.run([row('needsInput')]);
    assert.equal(h.posted.length, 1);
  });

  test('waiting off, finished and error on: nothing is posted', async () => {
    const h = await harness({ ...ALL_ON, waiting: false }, { s1: facts('s1', 1) });
    h.run([row('needsInput')]);
    assert.equal(h.posted.length, 0);
  });
});

describe('one event from two routes, delayed and reordered', () => {
  /** The same event as a push: its kind, computer and session, and the feed row id when it carries one. */
  const pushOf = (event: HostEvent, withRowId: boolean): HostEvent => ({
    machineId: event.machineId,
    sessionId: event.sessionId,
    kind: event.kind,
    eventId: withRowId ? event.eventId : '',
    occurredAt: event.occurredAt,
  });

  test('a feed row and a push of the same event within seconds give one notification', async () => {
    const h = await harness();
    h.run([row('finished')]);
    h.advance(2_000);
    h.run([{ machineId: 'm1', sessionId: 's1', kind: 'finished', eventId: '', occurredAt: '2026-10-29T10:00:01Z' }]);
    assert.equal(h.posted.length, 1);
  });

  test('the push of the same event 21 s after its feed row gives no second notification', async () => {
    const h = await harness();
    const event = row('finished');
    h.run([event]);
    h.advance(21_000);
    h.run([pushOf(event, false)]);
    assert.equal(h.posted.length, 1);
  });

  test('the push carrying the row id (the push contract) gives no second notification, also minutes later', async () => {
    const h = await harness();
    const event = row('needsInput');
    h.run([event]);
    h.advance(5 * 60_000);
    h.run([pushOf(event, true)]);
    assert.equal(h.posted.length, 1);
  });

  test('reordered: the push first, the feed row of the same event 25 s later gives no second notification', async () => {
    const h = await harness();
    const event = row('failed');
    h.run([pushOf(event, false)]);
    h.advance(25_000);
    h.run([event]);
    assert.equal(h.posted.length, 1);
  });

  test('two events of one session (a new row each) both notify once the rate limit lets them', async () => {
    const h = await harness();
    h.run([row('finished')]);
    h.advance(21_000);
    h.run([row('finished')]);
    assert.equal(h.posted.length, 2);
  });

  test('the row the computer turns from finished into needsInput in place is a new event', async () => {
    const h = await harness();
    const finished = row('finished');
    h.run([finished]);
    h.advance(21_000);
    h.run([{ ...finished, kind: 'needsInput' }]);
    assert.deepEqual(
      h.posted.map((request) => request.line),
      ['Finished', 'Waiting for you'],
    );
  });

  describe('the row id is the event, whatever the session list says by the time it comes again', () => {
    const n1: HostEvent = {
      machineId: 'm1',
      sessionId: 's1',
      kind: 'finished',
      eventId: 'n1',
      occurredAt: '2026-10-29T10:00:00Z',
    };
    const n2: HostEvent = { ...n1, eventId: 'n2', occurredAt: '2026-10-29T10:00:21Z' };

    for (const { name, enteredAt } of [
      { name: 'with', enteredAt: '2026-10-29T10:00:20Z' },
      // A session list that names the attention but not when it began.
      { name: 'without', enteredAt: '' },
    ]) {
      test(`n1, then n2 in the session's next attention, then n1 again (${name} its start): two notifications, two sounds`, async () => {
        const h = await harness();
        h.run([n1]);
        h.announced.sessionLeftAttention('m1', 's1');
        h.advance(21_000);
        h.listed.s1 = { ...facts('s1'), attentionId: 'a2', attentionEnteredAt: enteredAt };
        h.run([n2]);
        h.advance(21_000);
        h.run([n1]);
        assert.deepEqual(
          h.posted.map((request) => request.data.notificationId),
          ['n1', 'n2'],
        );
        assert.equal(h.posted.filter((request) => request.sound).length, 2);
      });
    }

    test('n1 comes again after the computer replaced it by n2 in its feed: still no second notification', async () => {
      const h = await harness();
      h.run([n1]);
      h.announced.retainFeed('m1', [{ sessionId: 's1', id: 'n1' }]);
      h.advance(21_000);
      h.listed.s1 = { ...facts('s1'), attentionId: 'a2', attentionEnteredAt: '2026-10-29T10:00:20Z' };
      h.run([n2]);
      // The host deletes a session's unread row when it writes the next one.
      h.announced.retainFeed('m1', [{ sessionId: 's1', id: 'n2' }]);
      h.advance(21_000);
      h.run([n1, n2]);
      assert.deepEqual(
        h.posted.map((request) => request.data.notificationId),
        ['n1', 'n2'],
      );
    });
  });

  describe("the record covers the push's validity, also across a restart", () => {
    /** A session list that shows no attention, so only the row id identifies the event. */
    const unattended: SessionFacts = { ...facts('s1'), attentionId: '', attentionEnteredAt: '' };
    const event = (index: number): HostEvent => ({
      machineId: 'm1',
      sessionId: 's1',
      kind: 'finished',
      eventId: `n${index}`,
      occurredAt: new Date(Date.parse('2026-10-29T00:00:00Z') + index * 21_000).toISOString(),
    });

    for (const restartAt of ['nowhere', 'after n0', 'before the late copy']) {
      test(`n0, the row replaced 41 times in the feed, then a late copy of n0 (restart ${restartAt}): one request, one sound`, async () => {
        const h = await harness(ALL_ON, { s1: unattended });
        for (let i = 0; i <= 41; i += 1) {
          h.announced.retainFeed('m1', [{ sessionId: 's1', id: `n${i}` }]);
          h.run([event(i)]);
          if (i === 0 && restartAt === 'after n0') await h.restart();
          h.advance(21_000);
          h.announced.sessionLeftAttention('m1', 's1');
        }
        if (restartAt === 'before the late copy') await h.restart();
        h.run([event(0)]);
        const n0 = h.posted.filter((request) => request.data.notificationId === 'n0');
        assert.equal(n0.length, 1);
        assert.equal(n0.filter((request) => request.sound).length, 1);
        assert.equal(h.posted.length, 42);
      });
    }

    test('no freshness rule: a first delivery hours after its event notifies', async () => {
      const h = await harness(ALL_ON, { s1: unattended });
      h.advance(3 * 60 * 60 * 1000);
      h.run([event(0)]);
      assert.deepEqual(
        h.posted.map((request) => request.data.notificationId),
        ['n0'],
      );
    });
  });
});

describe('the app log', () => {
  test("a request iOS does not take logs a fixed line, not the system's error text or a path", async () => {
    const h = await harness(
      ALL_ON,
      { s1: facts('s1') },
      {
        post: () => Promise.reject(new Error('SYNTHETIC_PRIVATE_PAYLOAD in /Users/someone/private/projects/secret.db')),
      },
    );
    h.run([row('finished')]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(h.logs, ['Notification not shown (finished): iOS did not take it.']);
  });
});

describe('the session open on screen', () => {
  test("its events post no notification; other sessions' events do", async () => {
    const h = await harness(ALL_ON, { s1: facts('s1', 1), s2: facts('s2') });
    h.onScreen.add('m1\ns1');
    h.run([row('finished', 's1'), row('needsInput', 's1'), row('failed', 's1')]);
    assert.equal(h.posted.length, 0);
    h.run([row('finished', 's2')]);
    assert.deepEqual(
      h.posted.map((request) => request.data.sessionId),
      ['s2'],
    );
  });

  test('it holds back no rate budget: once the user leaves it, its next event notifies at once', async () => {
    const h = await harness();
    h.onScreen.add('m1\ns1');
    h.run([row('finished')]);
    h.onScreen.clear();
    h.advance(1_000);
    h.run([row('needsInput')]);
    assert.deepEqual(
      h.posted.map((request) => request.line),
      ['Waiting for you'],
    );
  });

  test('an event held back for the session on screen counts as seen: its copies after the user left stay silent', async () => {
    const h = await harness();
    const event = row('finished');
    h.onScreen.add('m1\ns1');
    h.run([event]);
    h.onScreen.clear();
    h.advance(30_000);
    h.run([{ ...event, eventId: '' }]);
    h.advance(30_000);
    h.run([event]);
    h.sessionsList([], [{ machineId: 'm1', sessionId: 's1', kind: null, rowId: event.eventId, episode: 'a1' }]);
    assert.equal(h.posted.length, 0);
    assert.deepEqual(h.played, []);
    // The session's next event is new, with its sound.
    h.run([row('needsInput')]);
    assert.deepEqual(
      h.posted.map((request) => [request.line, request.sound]),
      [['Waiting for you', true]],
    );
  });
});

describe("the Sessions list's attention sound goes through the same gate and rate limit", () => {
  /** The Sessions list's view of a session entering attention `episode`, naming the row `rowId` ('' none). */
  const entered = (sessionId: string, episode: string, rowId = ''): EventIdentity => ({
    machineId: 'm1',
    sessionId,
    kind: null,
    rowId,
    episode,
  });

  test('one sound for the sessions that entered attention together, none for the session on screen', async () => {
    const h = await harness();
    h.onScreen.add('m1\ns3');
    h.sessionsList([], [entered('s1', 'a1'), entered('s2', 'a2'), entered('s3', 'a3')]);
    assert.deepEqual(
      h.played.map((events) => events.map((event) => event.sessionId)),
      [['s1', 's2']],
    );
  });

  test('an event that sounded with its notification does not sound again from the Sessions list naming its row', async () => {
    const h = await harness();
    const event = row('finished');
    h.run([event]);
    assert.equal(h.posted[0]?.sound, true);
    h.sessionsList([], [entered('s1', 'a1', event.eventId)]);
    assert.deepEqual(h.played, []);
  });

  test('a Sessions list naming no row sounds on its own, also after the notification of a row in its attention', async () => {
    const h = await harness();
    h.run([row('finished')]);
    assert.equal(h.posted[0]?.sound, true);
    h.advance(21_000);
    h.sessionsList([], [entered('s1', 'a1')]);
    assert.equal(h.played.length, 1);
  });

  test('held back by the rate limit, the sound is no announcement: the row of that attention later notifies and sounds', async () => {
    const listed: Record<string, SessionFacts> = {};
    for (let i = 1; i <= 9; i += 1) listed[`s${i}`] = { ...facts(`s${i}`), attentionId: `a${i}` };
    const h = await harness(ALL_ON, listed);
    for (let i = 1; i <= 8; i += 1) h.run([row('finished', `s${i}`)]);
    assert.equal(h.posted.length, 8);
    h.sessionsList([], [entered('s9', 'a9')]);
    assert.deepEqual(h.played, []);
    assert.deepEqual(h.logs, ['Attention sound held back by the rate limit; the session is in the list.']);
    h.advance(61_000);
    h.run([row('finished', 's9')]);
    assert.deepEqual(
      h.posted.slice(8).map((request) => [request.data.sessionId, request.sound]),
      [['s9', true]],
    );
  });

  test('the row of a sounded attention that named it notifies silently; after the session left it, a late copy stays silent', async () => {
    const h = await harness();
    const event = row('finished');
    h.sessionsList([], [entered('s1', 'a1', event.eventId)]);
    assert.equal(h.played.length, 1);
    h.run([event]);
    assert.deepEqual(
      h.posted.map((request) => request.sound),
      [false],
    );
    h.sessionsList([{ machineId: 'm1', sessionId: 's1' }], []);
    h.listed.s1 = { ...facts('s1'), attentionId: '', attentionEnteredAt: '' };
    h.advance(61_000);
    h.run([event]);
    assert.equal(h.posted.length, 1);
    assert.equal(h.played.length, 1);
  });

  test("held back for the session on screen, the sound's attention counts as seen with the row it named, and no other row", async () => {
    const h = await harness();
    const named = row('finished');
    h.onScreen.add('m1\ns1');
    h.sessionsList([], [entered('s1', 'a1', named.eventId)]);
    h.onScreen.clear();
    h.run([named]);
    h.advance(30_000);
    h.run([row('needsInput')]);
    assert.deepEqual(h.played, []);
    assert.deepEqual(
      h.posted.map((request) => request.line),
      ['Waiting for you'],
    );
  });

  test('held back for the session on screen, a Sessions list naming no row covers no row: the row after the user left sounds', async () => {
    const h = await harness();
    h.onScreen.add('m1\ns1');
    h.sessionsList([], [entered('s1', 'a1')]);
    h.onScreen.clear();
    h.run([row('finished')]);
    assert.deepEqual(
      h.posted.map((request) => [request.line, request.sound]),
      [['Finished', true]],
    );
  });
});
