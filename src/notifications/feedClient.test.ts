/// <reference types="node" />
/**
 * Run with `bun test src/notifications/feedClient.test.ts`. REQ-NOTIF-011 AC2/AC3/AC5, REQ-NOTIF-017
 * AC1/AC2: the real parser, list builder and feed client with a fake HTTP transport. Review s7-r1 K-2: a
 * failed request carries a fixed category, never the computer's error text (the app log can be exported).
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { parseMobileSummary } from '../contract/mobileSummary';
import { buildAttentionList } from './attentionRows';
import { sessionFacts, type SessionFacts } from './events';
import { FeedRequestError, readFeed, updateFeed, type FeedRpc } from './feedClient';
import { parseFeedState } from './feedContract';

const ACCOUNT_ROW = {
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
};

const NEEDS_INPUT = {
  id: 'n1',
  projectId: 'p1',
  sessionId: 's1',
  kind: 'needsInput',
  title: 'fix build',
  subtitle: 'ghostex-mobile',
  body: 'secret text',
  agentName: 'claude',
  createdAt: '2026-10-24T11:00:00Z',
  read: false,
};

function facts(pendingQuestionCount: number): SessionFacts {
  return {
    projectId: 'p1',
    agentLabel: 'Claude Code',
    agentIconId: 'claude',
    projectName: 'ghostex-mobile',
    title: 'fix build',
    pendingQuestionCount,
    awaitingAnswer: false,
    attentionId: '',
    attentionEnteredAt: '',
  };
}

describe('the attention list (REQ-NOTIF-011)', () => {
  test('AC3: the parser keeps an account row', () => {
    const snapshot = parseFeedState({ items: [ACCOUNT_ROW], unreadCount: 1 });
    assert.equal(snapshot?.rows.length, 1);
    assert.equal(snapshot?.rows[0].accountId, 'acc1');
  });

  test('AC2: an account row appears as a row; rows are newest first', () => {
    const snapshot = parseFeedState({ items: [NEEDS_INPUT, ACCOUNT_ROW] });
    assert.ok(snapshot !== null);
    const rows = buildAttentionList([{ machineId: 'm1', machineLabel: 'Mac', rows: snapshot.rows }], () => facts(0));
    assert.deepEqual(
      rows.map((row) => [row.notificationId, row.account]),
      [
        ['n1', false],
        ['n9', true],
      ],
    );
    assert.equal(rows[1].who, 'Account acc1');
  });

  test('AC6 (data side): no row carries the feed text', () => {
    const snapshot = parseFeedState({ items: [NEEDS_INPUT] });
    assert.ok(snapshot !== null);
    assert.ok(!JSON.stringify(snapshot).includes('secret text'));
    const rows = buildAttentionList([{ machineId: 'm1', machineLabel: 'Mac', rows: snapshot.rows }], () => facts(0));
    assert.ok(!JSON.stringify(rows).includes('secret text'));
  });

  test('a row of an unknown kind is skipped', () => {
    assert.equal(parseFeedState({ items: [{ ...NEEDS_INPUT, kind: 'mystery' }] })?.rows.length, 0);
  });

  test('AC5: opening an unread row sends one markRead POST', async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    const rpc: FeedRpc = async (method, params) => {
      calls.push([method, params]);
      return { result: { items: [{ ...NEEDS_INPUT, read: true }] }, error: null };
    };
    const snapshot = await updateFeed(rpc, { action: 'markRead', notificationId: 'n1' });
    assert.deepEqual(calls, [['updateNotificationFeed', { action: 'markRead', notificationId: 'n1' }]]);
    assert.equal(snapshot.rows[0].read, true);
  });

  test('reading the feed: an error answer throws', async () => {
    const rpc: FeedRpc = async () => ({ error: { message: 'nope' } });
    await assert.rejects(readFeed(rpc));
  });

  test('K-2: the error of a refused request is "refused", without the computer\'s text or paths', async () => {
    const rpc: FeedRpc = async () => ({
      error: { message: 'SYNTHETIC_PRIVATE_PAYLOAD in /Users/someone/private/projects/secret.db' },
    });
    const error: unknown = await updateFeed(rpc, { action: 'dismiss', notificationId: 'n1' }).then(
      () => null,
      (thrown: unknown) => thrown,
    );
    assert.ok(error instanceof FeedRequestError);
    assert.equal(error.category, 'refused');
    assert.ok(!String(error).includes('SYNTHETIC_PRIVATE_PAYLOAD'));
    assert.ok(!String(error).includes('/Users/'));
  });
});

describe('"has a question" in the list (REQ-NOTIF-017)', () => {
  const rowsWith = (count: number) => {
    const state = parseFeedState({ items: [NEEDS_INPUT] });
    assert.ok(state !== null);
    return buildAttentionList([{ machineId: 'm1', machineLabel: 'Mac', rows: state.rows }], () => facts(count));
  };

  test('AC1: needsInput of a session with pendingQuestionCount 2 says "has a question"', () => {
    assert.equal(rowsWith(2)[0].label, 'has a question');
  });

  test('AC2: with pendingQuestionCount 0 it says "waiting"', () => {
    assert.equal(rowsWith(0)[0].label, 'waiting');
  });

  /** The label of the needsInput row, its session read from the computer's summary as the list reads it. */
  const labelFrom = (capabilities: object | undefined, questions: object) => {
    const summary = parseMobileSummary(
      JSON.stringify({
        ...(capabilities === undefined ? {} : { capabilities }),
        sessions: [{ sessionId: 's1', projectId: 'p1', provider: 'zmx', activity: 'attention', ...questions }],
      }),
    );
    const state = parseFeedState({ items: [NEEDS_INPUT] });
    assert.ok(state !== null);
    const rows = buildAttentionList([{ machineId: 'm1', machineLabel: 'Mac', rows: state.rows }], (_m, sessionId) =>
      sessionFacts(summary, sessionId),
    );
    return rows[0].label;
  };

  test('an open question card says "has a question" only when the summary announces the field', () => {
    assert.equal(labelFrom({ awaitingAnswer: true }, { awaitingAnswer: true }), 'has a question');
    assert.equal(labelFrom({ sessionGitStatus: true }, { awaitingAnswer: true }), 'waiting');
    assert.equal(labelFrom(undefined, { awaitingAnswer: true }), 'waiting');
  });

  test('a counted pending question alone says "has a question", with or without the question-card field', () => {
    assert.equal(
      labelFrom({ awaitingAnswer: true }, { awaitingAnswer: false, pendingQuestionCount: 1 }),
      'has a question',
    );
    assert.equal(labelFrom(undefined, { pendingQuestionCount: 1 }), 'has a question');
  });

  test('neither a question card nor a counted question: "waiting"', () => {
    assert.equal(labelFrom({ awaitingAnswer: true }, { awaitingAnswer: false }), 'waiting');
    assert.equal(labelFrom(undefined, {}), 'waiting');
  });
});
