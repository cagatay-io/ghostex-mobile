/// <reference types="node" />
/**
 * Run with `bun test src/notifications/eventIdentity.test.ts`. The record of announced events and its gate
 * (`eventIdentity.ts`): one notification and one attention sound per event, a feed row being one event per
 * kind it enters whatever the session list says when it comes again, a delivery without a row id being the
 * session's event of that kind in the same attention, the Sessions list's copy being the row the computer
 * names for it and, when it names none, an event of its own that no row is matched to; one rate limit for
 * every route that counts every notification and sound (a row's notification within 20 s after the sound of
 * the event that named it is part of that sound; the other order takes its own grant), kept across launches,
 * a clock set back stored so it holds back at most a minute; deliveries held back by the switches or the rate
 * limit add nothing; one held back for the session open on screen makes its event seen, kept apart within its
 * own bound, and no later copy announces it, while a seen copy covers no other row; what is remembered is
 * every announced event of a row in the computer's feed plus every event within two hours of its first
 * announcement, judged at a copy's arrival; the bound is checked and, when passed, reported without
 * forgetting anything; deliveries wait until the stored record is read.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  ANNOUNCED_WINDOW_MS,
  ANNOUNCED_WITHIN_WINDOW,
  AnnouncedEvents,
  SEEN_ON_SCREEN_IDS,
  type AnnouncedEventsStorage,
  type EventIdentity,
} from './eventIdentity';
import { FEED_RETENTION_ROWS } from './feedContract';
import { OVERALL_MAX, OVERALL_WINDOW_MS, PER_SESSION_INTERVAL_MS } from './rateLimit';

/** One delivery of an event of session s1 on computer m1. */
function delivery(fields: Partial<EventIdentity>): EventIdentity {
  return { machineId: 'm1', sessionId: 's1', kind: 'finished', rowId: '', episode: null, ...fields };
}

const feedRow = (rowId: string, kind: EventIdentity['kind'] = 'finished', episode: string | null = null) =>
  delivery({ rowId, kind, episode });
const pushWithoutRowId = (kind: EventIdentity['kind'], episode: string | null) => delivery({ kind, episode });
/** The Sessions list's copy of attention `episode`, naming the feed row `rowId` written for it ('' none). */
const sessionsList = (episode: string, rowId = '') => delivery({ kind: null, episode, rowId });

/** A record on a clock the test moves; `step` passes the rate limit's interval for one session. */
function record() {
  const clock = { now: 0 };
  const announced = new AnnouncedEvents(() => clock.now);
  return {
    clock,
    announced,
    step: () => void (clock.now += PER_SESSION_INTERVAL_MS + 1_000),
    /** The notification route: its notification, with its sound when `withSound`. */
    notify: (event: EventIdentity, withSound = false) =>
      announced.announce(event, { notification: true, sound: withSound }),
    /** The Sessions list's route: the attention sound alone. */
    sound: (event: EventIdentity) => announced.announce(event, { notification: false, sound: true }),
  };
}

describe('one event, many deliveries', () => {
  test('the same row is announced once, however often and late it comes, whatever attention the session is in', () => {
    const r = record();
    assert.deepEqual(r.notify(feedRow('n1', 'finished', 'a1'), true), {
      notification: true,
      sound: true,
      rateLimited: false,
    });
    r.step();
    assert.equal(r.notify(feedRow('n1', 'finished', 'a1'), true).notification, false);
    r.announced.sessionLeftAttention('m1', 's1');
    r.step();
    // A push carrying the row id after the session left attention, and after it entered the next one.
    assert.equal(r.notify(feedRow('n1'), true).notification, false);
    assert.equal(r.notify(feedRow('n1', 'finished', 'a2'), true).notification, false);
    assert.equal(r.sound(feedRow('n1', 'finished', 'a2')).sound, false);
  });

  test("a push without a row id is the session's event of its kind in the same attention, before or after the row", () => {
    const delayed = record();
    assert.equal(delayed.notify(feedRow('n1', 'finished', 'a1')).notification, true);
    delayed.step();
    assert.equal(delayed.notify(pushWithoutRowId('finished', 'a1')).notification, false);

    const reordered = record();
    assert.equal(reordered.notify(pushWithoutRowId('failed', 'a1')).notification, true);
    reordered.step();
    assert.equal(reordered.notify(feedRow('n1', 'failed', 'a1')).notification, false);
  });

  test('the Sessions list naming the feed row and that row sound once, in either order', () => {
    const listFirst = record();
    assert.equal(listFirst.sound(sessionsList('a1', 'n1')).sound, true);
    // The notification is still the row's to post, without the sound the list already played.
    assert.deepEqual(listFirst.notify(feedRow('n1', 'needsInput', 'a1'), true), {
      notification: true,
      sound: false,
      rateLimited: false,
    });

    const feedFirst = record();
    assert.equal(feedFirst.notify(feedRow('n1', 'needsInput', 'a1'), true).sound, true);
    assert.equal(feedFirst.sound(sessionsList('a1', 'n1')).sound, false);
  });

  test('the Sessions list naming no row and the row of its attention are two announcements, each within the limit', () => {
    const listFirst = record();
    assert.equal(listFirst.sound(sessionsList('a1')).sound, true);
    // The session's sound took its grant a second ago: the row's notification waits for its own.
    listFirst.clock.now = 1_000;
    assert.equal(listFirst.notify(feedRow('n1', 'needsInput', 'a1'), true).rateLimited, true);
    listFirst.clock.now = PER_SESSION_INTERVAL_MS + 1_000;
    assert.deepEqual(listFirst.notify(feedRow('n1', 'needsInput', 'a1'), true), {
      notification: true,
      sound: true,
      rateLimited: false,
    });

    const feedFirst = record();
    assert.equal(feedFirst.notify(feedRow('n1', 'needsInput', 'a1'), true).sound, true);
    feedFirst.step();
    assert.equal(feedFirst.sound(sessionsList('a1')).sound, true);
  });

  test('the attention sound after the notification of its event came silent takes its own grant', () => {
    const r = record();
    assert.equal(r.notify(feedRow('n1', 'finished', 'a1')).notification, true);
    // The rate limit is full for the minute.
    for (let i = 2; i <= OVERALL_MAX; i += 1) {
      assert.equal(r.notify({ ...feedRow(`n${i}`), sessionId: `s${i}` }).notification, true);
    }
    r.clock.now = 5_000;
    assert.deepEqual(r.sound(sessionsList('a1', 'n1')), { notification: false, sound: false, rateLimited: true });
    r.clock.now = OVERALL_WINDOW_MS;
    assert.deepEqual(r.sound(sessionsList('a1', 'n1')), { notification: false, sound: true, rateLimited: false });
    // A notification copy asking for its sound gets nothing: the event had both.
    r.step();
    assert.equal(r.notify(feedRow('n1'), true).sound, false);
  });

  test('a notification without its sound does not take the sound alone later: the sound comes only with it', () => {
    const r = record();
    assert.equal(r.notify(feedRow('n1')).notification, true);
    r.step();
    assert.deepEqual(r.notify(feedRow('n1'), true), { notification: false, sound: false, rateLimited: false });
  });
});

describe("the Sessions list's copy and its feed row", () => {
  /** The Sessions list's copy of attention a1, naming `rowId` or none. */
  const listCopy = (rowId = '') => sessionsList('a1', rowId);
  /** A row of s1, delivered after the session left the attention (none provable). */
  const lateRow = (rowId: string, kind: EventIdentity['kind'] = 'finished') => delivery({ rowId, kind });

  test('the row the computer names is the copy\u2019s event at any time it is remembered; another row is not', () => {
    const r = record();
    assert.equal(r.sound(listCopy('n1')).sound, true);
    r.announced.sessionLeftAttention('m1', 's1');
    r.clock.now = 30_000;
    assert.deepEqual(r.notify(lateRow('n2'), true), { notification: true, sound: true, rateLimited: false });
    r.clock.now = 60 * 60_000;
    assert.deepEqual(r.notify(lateRow('n1'), true), { notification: true, sound: false, rateLimited: false });
  });

  test('without the name no row is the copy\u2019s event: in its attention or after it, the row brings its own sound', () => {
    const after = record();
    assert.equal(after.sound(listCopy()).sound, true);
    after.announced.sessionLeftAttention('m1', 's1');
    after.clock.now = 30_000;
    assert.deepEqual(after.notify(lateRow('n1'), true), { notification: true, sound: true, rateLimited: false });

    const within = record();
    assert.equal(within.sound(listCopy()).sound, true);
    within.step();
    assert.deepEqual(within.notify(feedRow('n1', 'finished', 'a1'), true), {
      notification: true,
      sound: true,
      rateLimited: false,
    });
    // The attention's own copy stays one event while the attention lasts.
    assert.equal(within.sound(listCopy()).sound, false);
  });

  test('seen on screen, the copy naming a row covers that row at any time it is remembered, and no other row', () => {
    for (const left of [true, false]) {
      const r = record();
      r.announced.seenOnScreen(listCopy('n1'));
      if (left) r.announced.sessionLeftAttention('m1', 's1');
      r.clock.now = 30_000;
      // Another row of the session, after the session left the attention or while it is still in it.
      const other = left ? lateRow('n2', 'failed') : feedRow('n2', 'failed', 'a1');
      assert.deepEqual(r.notify(other, true), { notification: true, sound: true, rateLimited: false });
      r.clock.now = 30 * 60_000;
      const named = left ? lateRow('n1') : feedRow('n1', 'finished', 'a1');
      assert.deepEqual(r.notify(named, true), { notification: false, sound: false, rateLimited: false });
      // The row's next kind is a new event.
      assert.equal(r.notify({ ...named, kind: 'needsInput' }, true).notification, true);
    }
  });

  test('seen on screen, the copy naming no row covers no row; its own attention stays seen while it lasts', () => {
    for (const left of [true, false]) {
      const r = record();
      r.announced.seenOnScreen(listCopy());
      if (left) r.announced.sessionLeftAttention('m1', 's1');
      r.clock.now = 1_000;
      const row = left ? lateRow('n1') : feedRow('n1', 'finished', 'a1');
      assert.deepEqual(r.notify(row, true), { notification: true, sound: true, rateLimited: false });
      r.step();
      assert.equal(r.sound(listCopy()).sound, left);
    }
  });

  test("a row seen on screen and seen again in its attention: the Sessions list's copy naming it stays silent, one naming none sounds", () => {
    const r = record();
    r.announced.seenOnScreen(feedRow('n1'));
    r.step();
    assert.equal(r.notify(feedRow('n1', 'finished', 'a1'), true).notification, false);
    assert.equal(r.sound(listCopy('n1')).sound, false);
    assert.equal(r.sound(listCopy()).sound, true);
  });
});

describe('two events of one session', () => {
  test('a new row is a new event; a push without a row id then belongs to the attention it came in', () => {
    const r = record();
    assert.equal(r.notify(feedRow('n1', 'finished', 'a1')).notification, true);
    r.step();
    assert.equal(r.notify(feedRow('n2', 'finished', 'a2')).notification, true);
    r.step();
    assert.equal(r.notify(pushWithoutRowId('finished', 'a2')).notification, false);
    assert.equal(r.notify(feedRow('n2', 'finished', 'a2')).notification, false);
  });

  test('two rows are two events, also when the session list still shows one attention for both', () => {
    const r = record();
    assert.equal(r.notify(feedRow('n1', 'finished', 'a1')).notification, true);
    r.step();
    assert.equal(r.notify(feedRow('n2', 'finished', 'a1')).notification, true);
  });

  test('the row turned from finished into needsInput in place is a new event', () => {
    const r = record();
    assert.equal(r.notify(feedRow('n1', 'finished', 'a1')).notification, true);
    r.step();
    assert.equal(r.notify(feedRow('n1', 'needsInput', 'a1')).notification, true);
    r.step();
    assert.equal(r.notify(pushWithoutRowId('needsInput', 'a1')).notification, false);
  });

  test('a new attention in the Sessions list is a new event; on a computer without attention ids, after it left', () => {
    const r = record();
    assert.equal(r.sound(sessionsList('a1')).sound, true);
    r.step();
    assert.equal(r.sound(sessionsList('a2')).sound, true);

    const olderComputer = record();
    assert.equal(olderComputer.sound(sessionsList('')).sound, true);
    olderComputer.step();
    assert.equal(olderComputer.sound(sessionsList('')).sound, false);
    olderComputer.announced.sessionLeftAttention('m1', 's1');
    assert.equal(olderComputer.sound(sessionsList('')).sound, true);
  });

  test('the same row id on two computers or two sessions are two events', () => {
    const r = record();
    assert.equal(r.notify(feedRow('n1')).notification, true);
    assert.equal(r.notify({ ...feedRow('n1'), machineId: 'm2' }).notification, true);
    assert.equal(r.notify({ ...feedRow('n1'), sessionId: 's2' }).notification, true);
  });

  test('contract limit (the push route must send notificationId): a push without a row id outside its attention is announced', () => {
    // Without the row id and without the attention it came in, nothing tells this push from the session's
    // next event of the same kind.
    const r = record();
    assert.equal(r.notify(feedRow('n1', 'finished', 'a1')).notification, true);
    r.announced.sessionLeftAttention('m1', 's1');
    r.step();
    assert.equal(r.notify(pushWithoutRowId('finished', null)).notification, true);
  });
});

describe('one rate limit for every route', () => {
  test('an event not announced yet needs a grant: eight a minute, one per session every 20 s', () => {
    const r = record();
    assert.equal(r.notify(feedRow('n1')).notification, true);
    assert.equal(r.notify(feedRow('n2')).rateLimited, true);
    for (let i = 2; i <= OVERALL_MAX; i += 1) {
      assert.equal(r.notify({ ...feedRow(`n${i}`), sessionId: `s${i}` }).notification, true);
    }
    assert.equal(r.sound({ ...sessionsList('a9'), sessionId: 's9' }).rateLimited, true);
    r.clock.now = OVERALL_WINDOW_MS;
    assert.equal(r.sound({ ...sessionsList('a9'), sessionId: 's9' }).sound, true);
  });

  test('a delivery the rate limit held leaves no trace: a later copy is its first announcement, once', () => {
    const r = record();
    assert.equal(r.notify(feedRow('n1'), true).notification, true);
    assert.equal(r.notify(feedRow('n2'), true).rateLimited, true);
    assert.equal(r.announced.size(), 1);
    r.step();
    assert.deepEqual(r.notify(feedRow('n2'), true), { notification: true, sound: true, rateLimited: false });
    r.step();
    assert.equal(r.notify(feedRow('n2'), true).notification, false);
  });

  test('the Sessions list held by the rate limit is no announcement: its row later notifies and sounds once', () => {
    const r = record();
    assert.equal(r.notify({ ...feedRow('busy'), sessionId: 's0' }).notification, true);
    assert.equal(r.notify(feedRow('n0')).notification, true);
    r.clock.now += 1_000;
    assert.equal(r.sound(sessionsList('a1')).rateLimited, true);
    r.step();
    assert.deepEqual(r.notify(feedRow('n1', 'finished', 'a1'), true), {
      notification: true,
      sound: true,
      rateLimited: false,
    });
  });

  test("the limit's grants are kept across a restart: a new launch does not start the count anew", async () => {
    const storage = memoryStorage();
    const clock = { now: 0 };
    const before = new AnnouncedEvents(() => clock.now);
    await before.load(storage);
    for (let i = 1; i <= OVERALL_MAX; i += 1) {
      assert.equal(before.announce({ ...feedRow(`n${i}`), sessionId: `s${i}` }, ASK).notification, true);
    }
    await storage.written();

    clock.now = 30_000;
    const after = new AnnouncedEvents(() => clock.now);
    await after.load(storage);
    assert.equal(after.announce({ ...feedRow('n9'), sessionId: 's9' }, ASK).rateLimited, true);
    clock.now = OVERALL_WINDOW_MS;
    assert.equal(after.announce({ ...feedRow('n9'), sessionId: 's9' }, ASK).notification, true);
  });

  test('a clock set back holds nothing back for more than a minute, and forgets no announced event', () => {
    const r = record();
    r.clock.now = 10 * ANNOUNCED_WINDOW_MS;
    for (let i = 1; i <= OVERALL_MAX; i += 1) {
      assert.equal(r.notify({ ...feedRow(`n${i}`), sessionId: `s${i}` }).notification, true);
    }
    r.clock.now = 0;
    assert.equal(r.notify(feedRow('late')).rateLimited, true);
    r.clock.now = OVERALL_WINDOW_MS;
    assert.equal(r.notify(feedRow('late')).notification, true);
    assert.equal(r.notify({ ...feedRow('n8'), sessionId: 's8' }).notification, false);
  });

  test("every notification and sound takes a grant: an event's notification later than 20 s after its sound takes its own", () => {
    const r = record();
    for (let i = 0; i < OVERALL_MAX; i += 1) {
      assert.equal(r.sound({ ...sessionsList(`a${i}`, `old${i}`), sessionId: `old${i}` }).sound, true);
    }
    r.clock.now = OVERALL_WINDOW_MS;
    for (let i = 0; i < OVERALL_MAX; i += 1) {
      assert.equal(r.notify({ ...feedRow(`new${i}`), sessionId: `new${i}` }, true).notification, true);
    }
    r.clock.now += 1;
    // The first notifications of the sounded events: the minute is full, so they wait; their sound stays.
    for (let i = 0; i < OVERALL_MAX; i += 1) {
      const copy = { ...feedRow(`old${i}`, 'finished', `a${i}`), sessionId: `old${i}` };
      assert.deepEqual(r.notify(copy, true), { notification: false, sound: false, rateLimited: true });
    }
    r.clock.now += OVERALL_WINDOW_MS;
    assert.deepEqual(r.notify({ ...feedRow('old0', 'finished', 'a0'), sessionId: 'old0' }, true), {
      notification: true,
      sound: false,
      rateLimited: false,
    });
  });

  test("a row's notification within 20 s after the sound of the event that named it takes no grant; at 20 s it needs one", () => {
    for (const at of [PER_SESSION_INTERVAL_MS - 1, PER_SESSION_INTERVAL_MS]) {
      const r = record();
      assert.equal(r.sound(sessionsList('a1', 'n1')).sound, true);
      for (let i = 2; i <= OVERALL_MAX; i += 1) {
        assert.equal(r.notify({ ...feedRow(`n${i}`), sessionId: `s${i}` }).notification, true);
      }
      r.clock.now = at;
      const partOfSound = at < PER_SESSION_INTERVAL_MS;
      assert.deepEqual(r.notify(feedRow('n1', 'finished', 'a1'), true), {
        notification: partOfSound,
        sound: false,
        rateLimited: !partOfSound,
      });
      assert.equal(r.notify({ ...feedRow('n9'), sessionId: 's9' }).rateLimited, true);
    }
  });

  test('without the row named, a notification within 20 s of an attention sound takes its own grant', () => {
    const r = record();
    assert.equal(r.sound(sessionsList('a1')).sound, true);
    for (let i = 2; i <= OVERALL_MAX; i += 1) {
      assert.equal(r.notify({ ...feedRow(`n${i}`), sessionId: `s${i}` }).notification, true);
    }
    r.clock.now = 5_000;
    assert.equal(r.notify({ ...feedRow('n1', 'finished', 'a1'), sessionId: 's1' }, true).rateLimited, true);
  });

  test('a clock set back is stored: launches at 30 and 60 s do not hold the same minute again', async () => {
    const storage = memoryStorage();
    const clock = { now: 10 * ANNOUNCED_WINDOW_MS };
    const before = new AnnouncedEvents(() => clock.now);
    await before.load(storage);
    for (let i = 1; i <= OVERALL_MAX; i += 1) before.announce({ ...feedRow(`n${i}`), sessionId: `s${i}` }, ASK);
    await storage.written();
    const results: boolean[] = [];
    for (const now of [0, 30_000, OVERALL_WINDOW_MS]) {
      clock.now = now;
      const after = new AnnouncedEvents(() => clock.now);
      await after.load(storage);
      results.push(after.announce({ ...feedRow('fresh'), sessionId: 'new' }, ASK).notification);
      // The load stores the moved times when it moved them (a write after the task); a held announcement
      // changes nothing.
      for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();
    }
    assert.deepEqual(results, [false, false, true]);
  });

  test('a clock set forward by a minute: at most one more batch of eight in that minute, the next notice held', () => {
    const r = record();
    for (let i = 0; i < OVERALL_MAX; i += 1) r.notify({ ...feedRow(`n${i}`), sessionId: `s${i}` });
    r.clock.now = OVERALL_WINDOW_MS;
    const extra = Array.from({ length: OVERALL_MAX + 1 }, (_, i) =>
      r.notify({ ...feedRow(`b${i}`), sessionId: `other${i}` }),
    );
    assert.deepEqual(
      extra.map((announcement) => announcement.notification),
      [...Array.from({ length: OVERALL_MAX }, () => true), false],
    );
    r.clock.now += PER_SESSION_INTERVAL_MS + 1_000;
    assert.equal(r.notify({ ...feedRow('fresh'), sessionId: 'new' }).rateLimited, true);
  });

  test('a clock set forward by 30 s, 40 s after eight notices: at most one more batch of eight, the next notice held', () => {
    const r = record();
    for (let i = 0; i < OVERALL_MAX; i += 1) r.notify({ ...feedRow(`n${i}`), sessionId: `s${i}` });
    // 40 s pass, then the person sets the clock forward by 30 s: the first batch looks 70 s old.
    r.clock.now = 40_000 + 30_000;
    const extra = Array.from({ length: OVERALL_MAX + 1 }, (_, i) =>
      r.notify({ ...feedRow(`b${i}`), sessionId: `other${i}` }),
    );
    assert.deepEqual(
      extra.map((announcement) => announcement.notification),
      [...Array.from({ length: OVERALL_MAX }, () => true), false],
    );
    r.clock.now += PER_SESSION_INTERVAL_MS + 1_000;
    assert.equal(r.notify({ ...feedRow('fresh'), sessionId: 'new' }).rateLimited, true);
  });

  test('the app ended between showing and saving: one more batch of eight in that minute, then the limit holds again', async () => {
    const clock = { now: 0 };
    let durable: string | null = null;
    // The first launch ends before its write settles; the later ones save.
    const stalled: AnnouncedEventsStorage = {
      read: async () => durable,
      write: () => new Promise<void>(() => undefined),
      failed: () => assert.fail('the record reported a problem'),
    };
    const saving = memoryStorage();
    saving.read = async () => durable;
    saving.write = async (record) => {
      durable = record;
    };
    const first = new AnnouncedEvents(() => clock.now);
    await first.load(stalled);
    for (let i = 0; i < OVERALL_MAX; i += 1) first.announce({ ...feedRow(`n${i}`), sessionId: `s${i}` }, ASK);
    clock.now = 1_000;
    const second = new AnnouncedEvents(() => clock.now);
    await second.load(saving);
    const batch = Array.from({ length: OVERALL_MAX + 1 }, (_, i) =>
      second.announce({ ...feedRow(`b${i}`), sessionId: `other${i}` }, ASK),
    );
    assert.equal(batch.filter((announcement) => announcement.notification).length, OVERALL_MAX);
    for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();
    clock.now = PER_SESSION_INTERVAL_MS + 1_000;
    const third = new AnnouncedEvents(() => clock.now);
    await third.load(saving);
    assert.equal(third.announce({ ...feedRow('fresh'), sessionId: 'new' }, ASK).rateLimited, true);
  });
});

describe("kept for the computer's feed and the push's validity, never pushed out by a count", () => {
  test('after nine events of one session the first is still the same event', () => {
    const r = record();
    for (let i = 0; i <= 8; i += 1) {
      assert.equal(r.notify(feedRow(`n${i}`, 'finished', `a${i}`)).notification, true);
      r.step();
    }
    assert.equal(r.notify(feedRow('n0', 'finished', 'a0')).notification, false);
  });

  test("after events of 257 sessions, a row still in the computer's feed is still the same event", () => {
    const r = record();
    for (let i = 0; i <= 256; i += 1) {
      r.clock.now = i * 8_000;
      assert.equal(r.notify({ ...feedRow('n'), sessionId: `s${i}` }).notification, true);
      if (i === 0) r.announced.retainFeed('m1', [{ sessionId: 's0', id: 'n' }]);
    }
    assert.equal(r.notify({ ...feedRow('n'), sessionId: 's0' }).notification, false);
  });

  test('a row the computer replaced 41 times in its feed is still the same event', () => {
    const r = record();
    for (let i = 0; i <= FEED_RETENTION_ROWS + 1; i += 1) {
      r.announced.retainFeed('m1', [{ sessionId: 's1', id: `n${i}` }]);
      assert.equal(r.notify(feedRow(`n${i}`), true).notification, true);
      r.announced.sessionLeftAttention('m1', 's1');
      r.step();
    }
    assert.deepEqual(r.notify(feedRow('n0'), true), { notification: false, sound: false, rateLimited: false });
  });

  test('a row that left the feed is remembered for two hours from its announcement, one in the feed for longer', () => {
    const r = record();
    r.notify(feedRow('left'));
    r.notify({ ...feedRow('stays'), sessionId: 's2' });
    r.announced.retainFeed('m1', [{ sessionId: 's2', id: 'stays' }]);
    r.clock.now = ANNOUNCED_WINDOW_MS;
    assert.equal(r.notify(feedRow('left')).notification, false);
    r.clock.now = ANNOUNCED_WINDOW_MS + 1;
    // Outside the host contract (a push lives at most an hour): announced again.
    assert.equal(r.notify(feedRow('left')).notification, true);
    r.clock.now = 10 * ANNOUNCED_WINDOW_MS;
    r.announced.retainFeed('m1', [{ sessionId: 's2', id: 'stays' }]);
    assert.equal(r.notify({ ...feedRow('stays'), sessionId: 's2' }).notification, false);
  });

  test("an attention's first event stays, with its kind and row, while the session is in it, past the window", () => {
    const r = record();
    assert.equal(r.sound(sessionsList('a1', 'n1')).sound, true);
    assert.equal(r.sound({ ...sessionsList('a2'), sessionId: 's2' }).sound, true);
    r.step();
    assert.deepEqual(r.notify(feedRow('n1', 'finished', 'a1'), true), {
      notification: true,
      sound: false,
      rateLimited: false,
    });
    r.clock.now = 10 * ANNOUNCED_WINDOW_MS;
    // The Sessions list may see the session enter it late (its computer was hidden meanwhile).
    assert.equal(r.sound(sessionsList('a1', 'n1')).sound, false);
    assert.equal(r.sound({ ...sessionsList('a2'), sessionId: 's2' }).sound, false);
    assert.equal(r.notify(feedRow('n1', 'finished', 'a1'), true).notification, false);
    // The row's next kind is an event of its own.
    assert.equal(r.notify(feedRow('n1', 'needsInput', 'a1'), true).sound, true);
    r.step();
    r.announced.sessionLeftAttention('m1', 's2');
    assert.equal(r.sound({ ...sessionsList('a2'), sessionId: 's2' }).sound, true);
  });

  test('at the rate limit for three hours, every event inside its window stays; the record stays within its bound', async () => {
    const r = record();
    const storage = memoryStorage();
    await r.announced.load(storage);
    const announcedAt: { event: EventIdentity; at: number }[] = [];
    for (let minute = 0; minute < 180; minute += 1) {
      for (let i = 0; i < OVERALL_MAX; i += 1) {
        r.clock.now = minute * OVERALL_WINDOW_MS + i * 1_000;
        const event = { ...feedRow(`n${minute}-${i}`), sessionId: `s${i}` };
        assert.equal(r.notify(event).notification, true);
        announcedAt.push({ event, at: r.clock.now });
      }
      assert.ok(r.announced.size() <= ANNOUNCED_WITHIN_WINDOW, `${r.announced.size()} events`);
    }
    r.clock.now += 1;
    const inWindow = announcedAt.filter(({ at }) => r.clock.now - at <= ANNOUNCED_WINDOW_MS);
    assert.ok(inWindow.length > ANNOUNCED_WITHIN_WINDOW - 2 * OVERALL_MAX, `${inWindow.length} in the window`);
    for (const { event } of inWindow) assert.equal(r.notify(event).notification, false);
    assert.deepEqual(storage.failures, []);
  });

  test('past its bound the record keeps every event and reports it once', async () => {
    const r = record();
    const storage = memoryStorage();
    await r.announced.load(storage);
    const rows = Array.from({ length: FEED_RETENTION_ROWS + 1 }, (_, i) => ({ sessionId: `s${i}`, id: `n${i}` }));
    for (const [i, row] of rows.entries()) {
      r.clock.now = i * 8_000;
      assert.equal(r.notify({ ...feedRow(row.id), sessionId: row.sessionId }).notification, true);
    }
    // A computer that sends more rows than its feed holds keeps them all in it, past their window.
    r.announced.retainFeed('m1', rows);
    r.clock.now = 10 * ANNOUNCED_WINDOW_MS;
    r.announced.retainFeed('m1', rows);
    r.announced.retainFeed('m1', rows);
    assert.deepEqual(storage.failures, ['bound']);
    assert.equal(r.announced.size(), FEED_RETENTION_ROWS + 1);
    for (const row of rows) {
      assert.equal(r.notify({ ...feedRow(row.id), sessionId: row.sessionId }).notification, false);
    }
  });

  test("a row's new kind keeps its own two hours once the row leaves the feed", () => {
    const r = record();
    r.announced.retainFeed('m1', [{ sessionId: 's1', id: 'n0' }]);
    assert.equal(r.notify(feedRow('n0', 'finished')).notification, true);
    r.clock.now = ANNOUNCED_WINDOW_MS + 1;
    assert.equal(r.notify(feedRow('n0', 'needsInput')).notification, true);
    r.announced.retainFeed('m1', []);
    r.clock.now += ANNOUNCED_WINDOW_MS;
    assert.equal(r.notify(feedRow('n0', 'needsInput')).notification, false);
    // The first kind's window ended while the row was still in the feed; it goes with the row.
    assert.equal(r.notify(feedRow('n0', 'finished')).notification, true);
  });

  test('a hidden computer keeps its record; a removed one keeps only what it announced within two hours', () => {
    const r = record();
    for (const machineId of ['hidden', 'removed', 'removed-late']) {
      r.notify({ ...feedRow('n1'), machineId });
      r.announced.retainFeed(machineId, [{ sessionId: 's1', id: 'n1' }]);
    }
    r.announced.keepComputers(new Set(['hidden', 'removed-late']));
    assert.equal(r.notify({ ...feedRow('n1'), machineId: 'removed' }).notification, false);
    r.clock.now = ANNOUNCED_WINDOW_MS + 1;
    r.announced.keepComputers(new Set(['hidden']));
    assert.equal(r.notify({ ...feedRow('n1'), machineId: 'hidden' }).notification, false);
    assert.equal(r.notify({ ...feedRow('n1'), machineId: 'removed-late' }).notification, true);
    assert.equal(r.notify({ ...feedRow('n1'), machineId: 'removed' }).notification, true);
  });

  test("a kind that takes over the Sessions list's sound is kept two hours from the takeover, not from the sound", async () => {
    const r = record();
    const storage = memoryStorage();
    await r.announced.load(storage);
    assert.equal(r.sound(sessionsList('a1', 'n1')).sound, true);
    // Ninety minutes on, the row turned into needsInput comes: the sound's event, now with its notification.
    r.clock.now = 90 * 60_000;
    assert.deepEqual(r.notify(feedRow('n1', 'needsInput', 'a1'), true), {
      notification: true,
      sound: false,
      rateLimited: false,
    });
    r.announced.sessionLeftAttention('m1', 's1');
    r.clock.now = 90 * 60_000 + ANNOUNCED_WINDOW_MS;
    assert.equal(r.notify(feedRow('n1', 'needsInput'), true).notification, false);
    r.clock.now += 1;
    // Outside the host contract (its push lives at most an hour): announced again.
    assert.equal(r.notify(feedRow('n1', 'needsInput'), true).notification, true);
    assert.deepEqual(storage.failures, []);
  });
});

describe('seen on screen', () => {
  const NOTHING = { notification: false, sound: false, rateLimited: false };

  test('no later copy announces an event seen on screen: its row, a push without the row id, the Sessions list; it takes no grant', () => {
    const r = record();
    r.announced.seenOnScreen(feedRow('n1', 'finished', 'a1'));
    assert.equal(r.announced.size(), 0);
    // Eight other sessions within the same minute: the seen event took none of the minute's grants.
    for (let i = 2; i <= OVERALL_MAX + 1; i += 1) {
      assert.equal(r.notify({ ...feedRow(`n${i}`), sessionId: `s${i}` }).notification, true);
    }
    r.step();
    // Within that minute a new event would be held by the rate limit; the seen one simply gets nothing.
    assert.deepEqual(r.notify(feedRow('n1', 'finished', 'a1'), true), NOTHING);
    assert.deepEqual(r.notify(feedRow('n1'), true), NOTHING);
    assert.deepEqual(r.notify(pushWithoutRowId('finished', 'a1'), true), NOTHING);
    assert.deepEqual(r.sound(sessionsList('a1', 'n1')), NOTHING);
  });

  test("other events stay their own: another row of the kind, the row's next kind, the session's next attention", () => {
    const r = record();
    r.announced.seenOnScreen(feedRow('n1', 'finished', 'a1'));
    assert.equal(r.notify(feedRow('n2', 'finished', 'a1')).notification, true);
    r.step();
    assert.equal(r.notify(feedRow('n1', 'needsInput', 'a1')).notification, true);
    r.step();
    assert.equal(r.sound(sessionsList('a2')).sound, true);
  });

  test("the Sessions list's copy seen on screen is the first event of the row it names; the next kind and other rows are new", () => {
    const r = record();
    r.announced.seenOnScreen(sessionsList('a1', 'n1'));
    assert.deepEqual(r.notify(feedRow('n1', 'finished', 'a1'), true), NOTHING);
    assert.deepEqual(r.notify(pushWithoutRowId('finished', 'a1'), true), NOTHING);
    // That row's push after the session left its attention.
    assert.deepEqual(r.notify(feedRow('n1'), true), NOTHING);
    assert.deepEqual(r.notify(feedRow('n2', 'needsInput', 'a1'), true), {
      notification: true,
      sound: true,
      rateLimited: false,
    });
  });

  test("the Sessions list's copy naming no row, seen on screen after a row of its attention was announced, covers no row", () => {
    const r = record();
    assert.equal(r.notify(feedRow('n1', 'finished', 'a1'), true).sound, true);
    r.step();
    r.announced.seenOnScreen(sessionsList('a1'));
    assert.equal(r.notify(feedRow('n2', 'needsInput', 'a1'), true).sound, true);
  });

  test('a row seen on screen in an attention the Sessions list sounded (naming no row) stays seen; the next kind sounds', () => {
    const r = record();
    assert.equal(r.sound(sessionsList('a1')).sound, true);
    r.step();
    r.announced.seenOnScreen(feedRow('n1', 'finished', 'a1'));
    assert.deepEqual(r.notify(feedRow('n1', 'finished', 'a1'), true), NOTHING);
    assert.deepEqual(r.notify(feedRow('n2', 'needsInput', 'a1'), true), {
      notification: true,
      sound: true,
      rateLimited: false,
    });
  });

  test('the attention seen on screen ends when the session leaves it (a computer without attention ids)', () => {
    const r = record();
    r.announced.seenOnScreen(sessionsList(''));
    assert.deepEqual(r.sound(sessionsList('')), NOTHING);
    r.announced.sessionLeftAttention('m1', 's1');
    assert.equal(r.sound(sessionsList('')).sound, true);
  });

  test('an event seen on screen is remembered for two hours from when it was seen, longer while its row is in the feed', () => {
    const r = record();
    r.announced.seenOnScreen(feedRow('left'));
    r.announced.seenOnScreen({ ...feedRow('stays'), sessionId: 's2' });
    r.announced.retainFeed('m1', [{ sessionId: 's2', id: 'stays' }]);
    r.clock.now = ANNOUNCED_WINDOW_MS;
    assert.equal(r.notify(feedRow('left')).notification, false);
    r.clock.now = ANNOUNCED_WINDOW_MS + 1;
    // Outside the host contract (a push lives at most an hour): announced.
    assert.equal(r.notify(feedRow('left')).notification, true);
    r.clock.now = 10 * ANNOUNCED_WINDOW_MS;
    r.announced.retainFeed('m1', [{ sessionId: 's2', id: 'stays' }]);
    assert.equal(r.notify({ ...feedRow('stays'), sessionId: 's2' }).notification, false);
  });

  test(`at most ${SEEN_ON_SCREEN_IDS} ids per computer: past that the oldest seen event goes first; announced events and other computers stay`, () => {
    const r = record();
    assert.equal(r.notify({ ...feedRow('announced'), sessionId: 's0' }, true).notification, true);
    r.announced.seenOnScreen({ ...feedRow('elsewhere'), machineId: 'm2' });
    // Rows without a proven attention: one id each, one more than the bound.
    for (let i = 0; i <= SEEN_ON_SCREEN_IDS; i += 1) r.announced.seenOnScreen(feedRow(`seen${i}`));
    assert.equal(r.announced.seenOnScreenIds('m1'), SEEN_ON_SCREEN_IDS);
    r.step();
    // The worst case: the oldest seen event's late copy is its first announcement, once.
    assert.equal(r.notify(feedRow('seen0'), true).notification, true);
    r.step();
    assert.equal(r.notify(feedRow('seen0'), true).notification, false);
    assert.equal(r.notify(feedRow('seen1'), true).notification, false);
    assert.equal(r.notify(feedRow(`seen${SEEN_ON_SCREEN_IDS}`), true).notification, false);
    assert.equal(r.notify({ ...feedRow('announced'), sessionId: 's0' }, true).notification, false);
    assert.equal(r.notify({ ...feedRow('elsewhere'), machineId: 'm2' }, true).notification, false);
  });

  test("a removed computer's attentions seen on screen end at once, its rows and kinds after their window", () => {
    const r = record();
    r.announced.seenOnScreen({ ...sessionsList('a1'), machineId: 'gone' });
    r.announced.seenOnScreen({ ...feedRow('n1', 'finished', 'a1'), machineId: 'gone' });
    r.announced.keepComputers(new Set());
    assert.equal(r.sound({ ...sessionsList('a1'), machineId: 'gone' }).sound, true);
    r.step();
    assert.equal(r.notify({ ...feedRow('n1'), machineId: 'gone' }).notification, false);
    r.clock.now = ANNOUNCED_WINDOW_MS + 1;
    r.announced.keepComputers(new Set());
    assert.equal(r.announced.seenOnScreenIds('gone'), 0);
  });

  test('what was seen on screen stays seen across a restart', async () => {
    const clock = { now: 0 };
    const storage = memoryStorage();
    const before = new AnnouncedEvents(() => clock.now);
    await before.load(storage);
    before.seenOnScreen(feedRow('n1', 'finished', 'a1'));
    before.seenOnScreen({ ...sessionsList('a2', 'n2'), sessionId: 's2' });
    await storage.written();

    clock.now = 30 * 60_000;
    const after = new AnnouncedEvents(() => clock.now);
    await after.load(storage);
    assert.equal(after.announce(feedRow('n1'), ASK).notification, false);
    assert.equal(after.announce(sessionsList('a1', 'n1'), { notification: false, sound: true }).sound, false);
    assert.equal(after.announce({ ...feedRow('n2', 'needsInput', 'a2'), sessionId: 's2' }, ASK).notification, false);
    assert.deepEqual(storage.failures, []);
  });
});

/** A notification with its sound, as the feed route asks. */
const ASK = { notification: true, sound: true };

type MemoryStorage = AnnouncedEventsStorage & {
  record: string | null;
  failures: string[];
  /** Resolves when the record writes next. */
  written(): Promise<void>;
};

/** The app's storage as `load` sees it: one stored string, what was reported, and its next write. */
function memoryStorage(record: string | null = null): MemoryStorage {
  let wrote = Promise.withResolvers<void>();
  const storage: MemoryStorage = {
    record,
    failures: [],
    written: () => wrote.promise,
    read: async () => storage.record,
    write: async (next) => {
      storage.record = next;
      wrote.resolve();
      wrote = Promise.withResolvers<void>();
    },
    failed: (problem) => void storage.failures.push(problem),
  };
  return storage;
}

describe('kept across launches', () => {
  test('a row and an attention announced before a restart stay announced after it, for both channels', async () => {
    const clock = { now: 0 };
    const storage = memoryStorage();
    const before = new AnnouncedEvents(() => clock.now);
    await before.load(storage);
    assert.equal(before.announce(feedRow('n0'), ASK).sound, true);
    assert.equal(
      before.announce({ ...sessionsList('a2', 'n2'), sessionId: 's2' }, { notification: false, sound: true }).sound,
      true,
    );
    await storage.written();

    clock.now = 14 * 60 * 1000;
    const after = new AnnouncedEvents(() => clock.now);
    await after.load(storage);
    assert.equal(after.announce(feedRow('n0'), ASK).notification, false);
    // The feed row the Sessions list named when it sounded before the restart stays silent.
    assert.deepEqual(after.announce({ ...feedRow('n2', 'needsInput', 'a2'), sessionId: 's2' }, ASK), {
      notification: true,
      sound: false,
      rateLimited: false,
    });
    assert.deepEqual(storage.failures, []);
  });

  test("an attention's first event keeps its kind and row across a restart after its window: the row's next kind is new", async () => {
    const clock = { now: 0 };
    const storage = memoryStorage();
    const before = new AnnouncedEvents(() => clock.now);
    await before.load(storage);
    assert.equal(before.announce(feedRow('n1', 'finished', 'a1'), ASK).sound, true);
    clock.now = 3 * ANNOUNCED_WINDOW_MS;
    // Counting lets the record forget what is past its window and write that.
    assert.equal(before.size(), 1);
    await storage.written();

    const after = new AnnouncedEvents(() => clock.now);
    await after.load(storage);
    assert.equal(after.announce(sessionsList('a1', 'n1'), { notification: false, sound: true }).sound, false);
    assert.deepEqual(after.announce(feedRow('n1', 'needsInput', 'a1'), ASK), {
      notification: true,
      sound: true,
      rateLimited: false,
    });
  });

  test('what this launch announced before the stored record was read stays, and the stored record joins it', async () => {
    const clock = { now: 0 };
    const storage = memoryStorage();
    const before = new AnnouncedEvents(() => clock.now);
    await before.load(storage);
    before.announce(feedRow('n0'), ASK);
    await storage.written();

    clock.now = 30_000;
    const after = new AnnouncedEvents(() => clock.now);
    assert.equal(after.announce({ ...feedRow('n1'), sessionId: 's2' }, ASK).notification, true);
    // The load writes the joined record.
    const joined = storage.written();
    await after.load(storage);
    assert.equal(after.announce(feedRow('n0'), ASK).notification, false);
    assert.equal(after.announce({ ...feedRow('n1'), sessionId: 's2' }, ASK).notification, false);
    await joined;
    const third = new AnnouncedEvents(() => clock.now);
    await third.load(storage);
    assert.equal(third.announce(feedRow('n0'), ASK).notification, false);
    assert.equal(third.announce({ ...feedRow('n1'), sessionId: 's2' }, ASK).notification, false);
  });

  test('the stored record holds ids, kinds, channels, times and the rate grants only, also for events seen on screen', async () => {
    const storage = memoryStorage();
    const announced = new AnnouncedEvents(() => 1_000);
    await announced.load(storage);
    announced.announce({ ...sessionsList('a2'), sessionId: 's2' }, { notification: false, sound: true });
    announced.announce(feedRow('n1', 'needsInput', 'a1'), { notification: true, sound: false });
    announced.seenOnScreen({ ...feedRow('n3', 'failed', 'a3'), sessionId: 's3' });
    announced.retainFeed('m1', [{ sessionId: 's1', id: 'n1' }]);
    await storage.written();
    assert.deepEqual(JSON.parse(storage.record ?? 'null'), {
      version: 1,
      grants: [
        { session: 'm1\ns2', at: 1_000 },
        { session: 'm1\ns1', at: 1_000 },
      ],
      computers: {
        m1: {
          events: [
            {
              sessionId: 's1',
              rowId: 'n1',
              kind: 'needsInput',
              attention: 'a1',
              first: true,
              inFeed: true,
              at: 1_000,
              keptFrom: 1_000,
              channels: ['notification'],
            },
            {
              sessionId: 's2',
              rowId: '',
              kind: null,
              attention: 'a2',
              first: true,
              inFeed: false,
              at: 1_000,
              keptFrom: 1_000,
              channels: ['sound'],
            },
          ],
          seen: [
            { sessionId: 's3', rowId: 'n3', kind: 'failed', attention: null, at: 1_000, inFeed: false },
            { sessionId: 's3', rowId: 'n3', kind: 'failed', attention: 'a3', at: 1_000, inFeed: false },
          ],
        },
      },
    });
  });

  test('a stored record that is not one is reported, the record starts empty and is written anew', async () => {
    for (const stored of ['{not json', JSON.stringify({ version: 2, grants: [], computers: {} })]) {
      const storage = memoryStorage(stored);
      const announced = new AnnouncedEvents(() => 0);
      await announced.load(storage);
      assert.deepEqual(storage.failures, ['read']);
      assert.equal(announced.announce(feedRow('n1'), ASK).notification, true);
      await storage.written();
      assert.equal(JSON.parse(storage.record ?? 'null').version, 1);
    }
  });

  test('a stored entry that is not one is left out and reported; the valid ones are kept', async () => {
    const event = { sessionId: 's1', attention: null, first: false, inFeed: false, at: 0, channels: ['sound'] };
    const storage = memoryStorage(
      JSON.stringify({
        version: 1,
        grants: [],
        computers: {
          m1: {
            events: [
              { ...event, rowId: 'n1', kind: 'finished' },
              { ...event, rowId: 'n2', kind: 'bell' },
              // An entry of an earlier shape (a kind's channels only) is not one either.
              { sessionId: 's1', rowId: 'n3', inFeed: false, attention: null, kinds: { finished: ['sound'] } },
              // Neither is one without a row and without an attention.
              { ...event, rowId: '', kind: 'finished' },
              // Nor a Sessions-list copy without a row that is not its attention's first event.
              { ...event, rowId: '', kind: null, attention: 'a1' },
            ],
            seen: [
              { sessionId: 's1', rowId: 'n4', kind: 'failed', attention: null, inFeed: false, at: 0 },
              // A row's id has its row.
              { sessionId: 's1', rowId: '', kind: 'failed', attention: null, inFeed: false, at: 0 },
            ],
          },
        },
      }),
    );
    const clock = { now: 0 };
    const announced = new AnnouncedEvents(() => clock.now);
    await announced.load(storage);
    assert.deepEqual(storage.failures, ['read']);
    assert.equal(announced.announce(feedRow('n1'), { notification: false, sound: true }).sound, false);
    assert.equal(announced.announce(feedRow('n2'), { notification: false, sound: true }).sound, true);
    clock.now = PER_SESSION_INTERVAL_MS;
    assert.equal(announced.announce(feedRow('n3'), { notification: false, sound: true }).sound, true);
    assert.equal(announced.announce(feedRow('n4', 'failed'), ASK).notification, false);
    clock.now = 2 * PER_SESSION_INTERVAL_MS;
    assert.equal(announced.announce(feedRow('n5', 'failed'), ASK).notification, true);
  });
});

describe('deliveries wait until the stored record is read', () => {
  test('they run once it is read, in the order they came, and at once from then on', async () => {
    const clock = { now: 0 };
    const storage = memoryStorage();
    const before = new AnnouncedEvents(() => clock.now);
    await before.load(storage);
    before.announce(feedRow('n0'), ASK);
    await storage.written();

    clock.now = 30_000;
    const read = Promise.withResolvers<string | null>();
    const after = new AnnouncedEvents(() => clock.now);
    const loading = after.load({ ...storage, read: () => read.promise });
    const handled: string[] = [];
    after.whenLoaded(() => handled.push(`n0 ${after.announce(feedRow('n0'), ASK).notification}`));
    after.whenLoaded(() =>
      handled.push(`n1 ${after.announce({ ...feedRow('n1'), sessionId: 's2' }, ASK).notification}`),
    );
    assert.equal(handled.length, 0);
    read.resolve(storage.record);
    await loading;
    assert.deepEqual(handled, ['n0 false', 'n1 true']);
    after.whenLoaded(() => handled.push('at once'));
    assert.deepEqual(handled, ['n0 false', 'n1 true', 'at once']);
  });

  test('a copy that arrived within the window is judged by what was kept then, however late the read settles', async () => {
    const clock = { now: 0 };
    const storage = memoryStorage();
    const before = new AnnouncedEvents(() => clock.now);
    await before.load(storage);
    before.announce(feedRow('n0'), ASK);
    await storage.written();

    clock.now = 60_000;
    const read = Promise.withResolvers<string | null>();
    const after = new AnnouncedEvents(() => clock.now);
    const loading = after.load({ ...storage, read: () => read.promise });
    const handled: boolean[] = [];
    after.whenLoaded(() => handled.push(after.announce(feedRow('n0'), ASK).notification));
    // The read settles long after the window of n0 has passed.
    clock.now = 3 * ANNOUNCED_WINDOW_MS;
    read.resolve(storage.record);
    await loading;
    assert.deepEqual(handled, [false]);
    // Once that copy is handled, n0 is past its window: a copy arriving now is outside the contract.
    assert.equal(after.announce(feedRow('n0'), ASK).notification, true);
  });

  test('a copy that waits after its arrival (for the session list) keeps what it could match, while others go on', async () => {
    const r = record();
    await r.announced.load(memoryStorage());
    r.notify(feedRow('n0'), true);
    r.clock.now = 30 * 60_000;
    const arrival = r.announced.arrive();
    // The app is paused for hours; another delivery is handled before the waiting copy.
    r.clock.now = 4 * ANNOUNCED_WINDOW_MS;
    assert.equal(r.notify({ ...feedRow('other'), sessionId: 's2' }).notification, true);
    const handled: boolean[] = [];
    r.announced.whenLoaded(() => handled.push(r.notify(feedRow('n0'), true).notification), arrival);
    assert.deepEqual(handled, [false]);
    // Once that copy is handled, n0 is past its window.
    assert.equal(r.notify(feedRow('n0'), true).notification, true);
  });

  test('a stored record that cannot be read is reported, and the waiting deliveries still run', async () => {
    const storage = memoryStorage();
    const announced = new AnnouncedEvents(() => 0);
    const handled: boolean[] = [];
    announced.whenLoaded(() => handled.push(announced.announce(feedRow('n1'), ASK).notification));
    await announced.load({ ...storage, read: () => Promise.reject(new Error('unreadable')) });
    assert.deepEqual(handled, [true]);
    assert.deepEqual(storage.failures, ['read']);
  });

  test('a delivery that throws holds back none after it; the load reports the error', async () => {
    const announced = new AnnouncedEvents(() => 0);
    const handled: string[] = [];
    announced.whenLoaded(() => {
      throw new Error('broken delivery');
    });
    announced.whenLoaded(() => handled.push('next'));
    await assert.rejects(announced.load(memoryStorage()), /broken delivery/);
    assert.deepEqual(handled, ['next']);
  });
});
