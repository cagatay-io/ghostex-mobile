/// <reference types="node" />
/** Run with `bun test src/components/sessions/sessionStatus.test.ts` from apps/mobile/app. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { GhostexSession, GhostexSummaryCapabilities } from '../../contract/mobileSummary';
import { rowActivityIndicator, rowTimeLabel } from './sessionStatus';

const ANNOUNCED: GhostexSummaryCapabilities = { awaitingAnswer: true, attentionNotificationId: false };
const UNANNOUNCED: GhostexSummaryCapabilities = { awaitingAnswer: false, attentionNotificationId: false };
const LATER = Date.parse('2026-10-27T00:05:00.000Z');

function session(overrides: Partial<GhostexSession>): GhostexSession {
  return {
    sessionId: 's1',
    activity: 'attention',
    pendingQuestionCount: 0,
    awaitingApproval: false,
    backgroundWorkDetectedAt: '',
    programStatusFailed: false,
    lastInteractionAt: '2026-10-27T00:00:00.000Z',
    delayedSendDeadlineAt: '',
    delayedSendRemainingLabel: '',
    sendWhenAgentStopsActive: false,
    sendWhenAllProjectSessionsStopActive: false,
    closeAfterDone: false,
    closeAfterDoneDeadlineAt: '',
    attentionAcknowledged: false,
    attentionEventId: '',
    attentionEnteredAt: '',
    ...overrides,
  } as GhostexSession;
}

describe('waiting for approval', () => {
  test('the red approval dot wins over every other status and hides the time', () => {
    const stuck = session({ awaitingApproval: true, activity: 'idle', programStatusFailed: true });
    assert.equal(rowActivityIndicator(stuck), 'approval');
    assert.equal(rowTimeLabel(stuck, ANNOUNCED, LATER), null);
  });

  test('without it the row keeps its usual dot', () => {
    assert.equal(rowActivityIndicator(session({})), 'attention');
    assert.equal(rowActivityIndicator(session({ activity: 'working' })), 'working');
  });
});

describe('an open question card', () => {
  // OMP's stored question card on an idle row, which would otherwise show its relative time.
  const card = session({ activity: 'idle', awaitingAnswer: true });

  test('from a computer that announces the field the question hides the time, as a counted question does', () => {
    assert.equal(rowTimeLabel(card, ANNOUNCED, LATER), null);
    assert.equal(rowTimeLabel(session({ activity: 'idle', pendingQuestionCount: 1 }), UNANNOUNCED, LATER), null);
  });

  test('from a computer that does not announce it the row keeps its time', () => {
    assert.equal(rowTimeLabel(card, UNANNOUNCED, LATER), '5m');
  });
});
