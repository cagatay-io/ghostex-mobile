/// <reference types="node" />
/**
 * Run with `bun test src/contract/mobileSummary.test.ts`. The summary's `capabilities` object and the session
 * fields that the phone reads only with a capability flag: `awaitingAnswer` and `attention.notificationId`.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { parseMobileSummary } from './mobileSummary';

function summary(root: object, session: object = {}) {
  const parsed = parseMobileSummary(
    JSON.stringify({ ...root, sessions: [{ sessionId: 's1', projectId: 'p1', provider: 'zmx', ...session }] }),
  );
  assert.ok(parsed !== null);
  return parsed;
}

describe('the summary capabilities', () => {
  test('absent: no capability', () => {
    assert.deepEqual(summary({}).capabilities, { awaitingAnswer: false, attentionNotificationId: false });
  });

  test('both flags set; other keys are ignored', () => {
    assert.deepEqual(
      summary({ capabilities: { sessionGitStatus: true, awaitingAnswer: true, attentionNotificationId: true } })
        .capabilities,
      { awaitingAnswer: true, attentionNotificationId: true },
    );
  });

  test('only a boolean true sets a flag; a capabilities value that is no object gives none', () => {
    assert.deepEqual(
      summary({ capabilities: { awaitingAnswer: 'true', attentionNotificationId: false } }).capabilities,
      { awaitingAnswer: false, attentionNotificationId: false },
    );
    assert.deepEqual(summary({ capabilities: ['awaitingAnswer'] }).capabilities, {
      awaitingAnswer: false,
      attentionNotificationId: false,
    });
  });
});

describe('the session fields behind a capability', () => {
  test('awaitingAnswer: true when sent as true, false when absent or no boolean', () => {
    assert.equal(summary({}, { awaitingAnswer: true }).sessions[0].awaitingAnswer, true);
    assert.equal(summary({}).sessions[0].awaitingAnswer, false);
    assert.equal(summary({}, { awaitingAnswer: 1 }).sessions[0].awaitingAnswer, false);
  });

  test("attention.notificationId: the feed row of the session's attention, '' without one", () => {
    const attention = { enteredAt: '2026-10-29T10:00:00Z', eventId: 'a1' };
    const named = summary({}, { activity: 'attention', attention: { ...attention, notificationId: ' n1 ' } });
    assert.equal(named.sessions[0].attentionNotificationId, 'n1');
    assert.equal(summary({}, { activity: 'attention', attention }).sessions[0].attentionNotificationId, '');
  });
});
