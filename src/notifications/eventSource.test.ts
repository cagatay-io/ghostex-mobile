/// <reference types="node" />
/**
 * Run with `bun test src/notifications/eventSource.test.ts`. A session entering attention is logged: the real event
 * source with a fake host transport; the source runs for the app, whatever screen is in front (here: Terminal).
 * First-fetch rule: rows already there at the first read never count as new.
 * The computer turns a session's unread `finished` row into `needsInput` in place (same row id;
 * `mark_unread_session_notification_needs_input` in the host's `notification_feed/store.rs`), which is a new event; a
 * row only marked read or unread again is none.
 *
 * A read that was under way when the app went away answers with the feed as it was before; it neither notifies nor
 * counts as the return's baseline, so the first read after the return only records what is there.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { FeedEventSource, POLL_INTERVAL_MS } from './eventSource';
import type { FeedRow, FeedSnapshot } from './feedContract';

function feedRow(id: string, kind: FeedRow['kind'] = 'finished'): FeedRow {
  return {
    id,
    projectId: 'p1',
    sessionId: 's1',
    kind,
    title: '',
    subtitle: '',
    agentName: '',
    createdAt: '2026-10-29T10:00:00Z',
    read: false,
  };
}

function harness() {
  let now = 0;
  let tick: () => void = () => undefined;
  const host: FeedRow[] = [feedRow('old')];
  const log: string[] = [];
  const fresh: string[] = [];
  const freshKinds: string[] = [];
  const activeRoute = 'Terminal';
  const source = new FeedEventSource({
    machines: () => [{ id: 'm1', label: 'Mac mini' }],
    read: async () => ({ rows: [...host] }),
    onRead: () => undefined,
    onNewRows: (_machine, rows) => {
      fresh.push(...rows.map((row) => row.id));
      freshKinds.push(...rows.map((row) => `${row.id}:${row.kind}`));
    },
    log: (message) => log.push(`${activeRoute}: ${message}`),
    now: () => now,
    setInterval: (run) => {
      tick = run;
      return 1;
    },
    clearInterval: () => undefined,
  });
  return {
    source,
    host,
    log,
    fresh,
    freshKinds,
    advance: async (ms: number) => {
      now += ms;
      tick();
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}

describe('the app-level event source', () => {
  test('a session entering attention is logged within one polling interval on Terminal', async () => {
    const h = harness();
    h.source.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(h.fresh, []);
    h.host.unshift(feedRow('n1', 'needsInput'));
    await h.advance(POLL_INTERVAL_MS);
    assert.deepEqual(h.fresh, ['n1']);
    assert.deepEqual(h.log, ['Terminal: Mac mini: notification feed event received (needsInput)']);
  });

  test('after a rebaseline the rows already there are not new', async () => {
    const h = harness();
    h.source.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    h.source.rebaseline();
    h.host.unshift(feedRow('while-paused'));
    await h.advance(POLL_INTERVAL_MS);
    assert.deepEqual(h.fresh, []);
  });

  test('a finished row the computer turns into needsInput in place is a new event', async () => {
    const h = harness();
    h.source.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    h.host.unshift(feedRow('n1', 'finished'));
    await h.advance(POLL_INTERVAL_MS);
    // The same row, promoted: its id stays, its kind changes (the questions of the finished turn were found).
    h.host[0] = { ...h.host[0], kind: 'needsInput' };
    await h.advance(POLL_INTERVAL_MS);
    assert.deepEqual(h.freshKinds, ['n1:finished', 'n1:needsInput']);
  });

  test('a row only marked read and unread again (markUnread, deferUnread) is no new event', async () => {
    const h = harness();
    h.source.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    h.host.unshift(feedRow('n1', 'needsInput'));
    await h.advance(POLL_INTERVAL_MS);
    h.host[0] = { ...h.host[0], read: true };
    await h.advance(POLL_INTERVAL_MS);
    h.host[0] = { ...h.host[0], read: false };
    await h.advance(POLL_INTERVAL_MS);
    assert.deepEqual(h.freshKinds, ['n1:needsInput']);
  });

  test('a read under way when the app went away does not take the return baseline', async () => {
    let reads = 0;
    const held = Promise.withResolvers<FeedSnapshot>();
    const fresh: string[] = [];
    const source = new FeedEventSource({
      machines: () => [{ id: 'm1', label: 'Mac mini' }],
      read: async () => {
        reads += 1;
        if (reads === 2) return held.promise;
        return { rows: reads === 1 ? [] : [feedRow('while-away')] };
      },
      onRead: () => undefined,
      onNewRows: (_machine, rows) => fresh.push(...rows.map((row) => row.id)),
      log: () => undefined,
      now: () => 0,
      setInterval: () => 1,
      clearInterval: () => undefined,
    });
    await source.refresh('m1');
    // The answer to this read is the feed before the app went away; it is still under way at the return.
    const underWay = source.refresh('m1');
    source.rebaseline();
    // The return's own read starts anew instead of joining the read from before.
    const returnRead = source.refresh('m1');
    held.resolve({ rows: [] });
    await Promise.all([underWay, returnRead]);
    await source.refresh('m1');
    assert.equal(reads, 4);
    assert.deepEqual(fresh, []);
  });
});
