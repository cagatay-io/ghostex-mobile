/**
 * Run with `bun test src/screens/wall/badge.test.ts`. A tile's status badge says what the session's list row shows:
 * the same dot (or the question pair) in the row's colours, plus the word of the session wall design, so a
 * session that stops working and waits for the user changes its badge while the tiles stay on screen. The expectations
 * are the list's own mapping (`sessionStatus.ts`) and the design's words, never this module's output.
 */

import { describe, expect, test } from 'bun:test';

import {
  isAwaitingApproval,
  rowActivityIndicator,
  shownFoldedStatus,
} from '../../components/sessions/sessionStatus';
import type { FoldedStatus } from '../../contract/coordinatorTree';
import { hasQuestion, type GhostexSession, type GhostexSummaryCapabilities } from '../../contract/mobileSummary';
import { SidebarPalette } from '../../theme/palette';
import { statusBadge } from './badge';

const CURRENT: GhostexSummaryCapabilities = { awaitingAnswer: true, attentionNotificationId: true };
const OLDER: GhostexSummaryCapabilities = { awaitingAnswer: false, attentionNotificationId: false };

function session(overrides: Partial<GhostexSession>): GhostexSession {
  return {
    sessionId: 's1',
    activity: 'idle',
    pendingQuestionCount: 0,
    awaitingApproval: false,
    backgroundWorkDetectedAt: '',
    programStatusFailed: false,
    lastInteractionAt: '',
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

describe('a session that changes from working to attention', () => {
  test('its badge changes from the working dot and word to the waiting dot and word', () => {
    const working = session({ activity: 'working' });
    const waiting = { ...working, activity: 'attention' };
    // The list shows the same change on the row's dot.
    expect(rowActivityIndicator(working)).toBe('working');
    expect(rowActivityIndicator(waiting)).toBe('attention');
    expect(statusBadge(working, CURRENT)).toEqual({ kind: 'working', label: 'Working', dots: [SidebarPalette.ROW_WORKING] });
    expect(statusBadge(waiting, CURRENT)).toEqual({
      kind: 'attention',
      label: 'Waiting',
      dots: [SidebarPalette.ROW_ATTENTION],
    });
  });
});

describe('the badge follows the row for every status', () => {
  test('a session waiting for approval shows the red approval dot, ahead of a question and an error', () => {
    const stuck = session({ awaitingApproval: true, pendingQuestionCount: 1, programStatusFailed: true });
    expect(isAwaitingApproval(stuck)).toBe(true);
    expect(statusBadge(stuck, CURRENT)).toEqual({
      kind: 'approval',
      label: 'Waiting for approval',
      dots: [SidebarPalette.ROW_APPROVAL],
    });
  });

  test('a pending question shows the pink dot, paired behind the working or waiting dot as on the row', () => {
    const asking = session({ pendingQuestionCount: 2 });
    expect(hasQuestion(asking.pendingQuestionCount, false)).toBe(true);
    expect(statusBadge(asking, CURRENT)).toEqual({
      kind: 'question',
      label: 'Has a question',
      dots: [SidebarPalette.ROW_QUESTION],
    });
    expect(statusBadge({ ...asking, activity: 'working' }, CURRENT)?.dots).toEqual([
      SidebarPalette.ROW_QUESTION,
      SidebarPalette.ROW_WORKING,
    ]);
    expect(statusBadge({ ...asking, activity: 'attention' }, CURRENT)?.dots).toEqual([
      SidebarPalette.ROW_QUESTION,
      SidebarPalette.ROW_ATTENTION,
    ]);
  });

  test('an open question card has a question badge only when its computer announces it', () => {
    const card = session({ activity: 'attention', awaitingAnswer: true });
    expect(statusBadge(card, CURRENT)).toEqual({
      kind: 'question', label: 'Has a question',
      dots: [SidebarPalette.ROW_QUESTION, SidebarPalette.ROW_ATTENTION],
    });
    expect(statusBadge(card, OLDER)).toEqual({
      kind: 'attention', label: 'Waiting', dots: [SidebarPalette.ROW_ATTENTION],
    });
  });

  test('a program error in attention shows the failed dot', () => {
    const failed = session({ activity: 'attention', programStatusFailed: true });
    expect(rowActivityIndicator(failed)).toBe('failed');
    expect(statusBadge(failed, CURRENT)).toEqual({ kind: 'failed', label: 'Failed', dots: [SidebarPalette.ROW_FAILED] });
  });

  test('background work on an otherwise idle session shows the grey dot', () => {
    const shell = session({ backgroundWorkDetectedAt: 'set' });
    expect(rowActivityIndicator(shell)).toBe('backgroundWork');
    expect(statusBadge(shell, CURRENT)).toEqual({
      kind: 'backgroundWork',
      label: 'Background work',
      dots: [SidebarPalette.ROW_BACKGROUND_WORK],
    });
  });

  test('an idle session has no badge (the tile shows the row’s time label instead)', () => {
    const idle = session({});
    expect(rowActivityIndicator(idle)).toBeNull();
    expect(statusBadge(idle, CURRENT)).toBeNull();
  });
});

describe("a coordinator whose threads are folded shows its row's stack", () => {
  const none: FoldedStatus = {
    working: false,
    attention: false,
    backgroundWork: false,
    question: false,
    approval: false,
  };

  test('a hidden thread waiting for approval puts the red dot and its word on an idle coordinator', () => {
    const lead = session({});
    const stack = shownFoldedStatus(lead, { ...none, approval: true });
    expect(statusBadge(lead, CURRENT, stack)).toEqual({
      kind: 'approval',
      label: 'Waiting for approval',
      dots: [SidebarPalette.ROW_APPROVAL],
    });
  });

  test('every hidden dot stays, overlapping in the row’s order, and the most urgent names the badge', () => {
    const lead = session({ activity: 'working' });
    expect(statusBadge(lead, CURRENT, { ...none, question: true, working: true, attention: true, approval: true })).toEqual({
      kind: 'approval',
      label: 'Waiting for approval',
      dots: [
        SidebarPalette.ROW_QUESTION,
        SidebarPalette.ROW_WORKING,
        SidebarPalette.ROW_ATTENTION,
        SidebarPalette.ROW_APPROVAL,
      ],
    });
    expect(statusBadge(lead, CURRENT, { ...none, question: true, working: true })).toEqual({
      kind: 'question',
      label: 'Has a question',
      dots: [SidebarPalette.ROW_QUESTION, SidebarPalette.ROW_WORKING],
    });
  });

  test('the coordinator’s own approval or program error wins over the stack, as on its row', () => {
    const stack = { ...none, working: true };
    expect(shownFoldedStatus(session({ awaitingApproval: true }), stack)).toBeUndefined();
    expect(shownFoldedStatus(session({ activity: 'attention', programStatusFailed: true }), stack)).toBeUndefined();
    expect(shownFoldedStatus(session({}), stack)).toBe(stack);
  });
});
