/// <reference types="node" />
/** Run with `bun test src/chat/native/cards/relayedApprovals.test.ts` from apps/mobile/app. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { ChatDocument } from '../../rust/document';
import { openRelayedCardForThread, relayedByReport, relayedCards } from './relayedApprovals';

const document = {
  relayedApprovals: [
    { key: 'k1', open: true, sessionId: 'G-thread', anchorId: 'm-report' },
    { key: 'k0', open: false, status: 'answeredInThread', sessionId: 'G-thread', anchorId: 'm-old' },
    { key: '', open: true, sessionId: 'G-broken' },
  ],
} as unknown as ChatDocument;

describe('relayed approval cards', () => {
  test('keyless cards are dropped', () => {
    assert.deepEqual(relayedCards(document).map((card) => card.key), ['k1', 'k0']);
    assert.deepEqual(relayedCards(null), []);
  });

  test("a board row answers only its thread's open card", () => {
    assert.equal(openRelayedCardForThread(document, 'G-thread')?.key, 'k1');
    assert.equal(openRelayedCardForThread(document, 'G-other'), null);
    assert.equal(openRelayedCardForThread(document, ''), null);
  });

  test('each report row gets its own card, ended ones included', () => {
    const byReport = relayedByReport(document);
    assert.equal(byReport['m-report']?.key, 'k1');
    assert.equal(byReport['m-old']?.status, 'answeredInThread');
  });
});
