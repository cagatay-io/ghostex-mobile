/**
 * A session wall tile's status badge: the dot its list row shows (`SessionRow`, rules in `sessionStatus.ts`), in the
 * row's colours, plus a word, so colour is not the only carrier (the session wall design). The order is the
 * row's: waiting for approval wins over everything, then a pending question (its pink dot paired behind the working
 * or waiting dot), then the row's activity dot. A coordinator whose threads are folded shows its row's stack instead:
 * the dots of the threads the fold hides plus its own (`shownFoldedStatus`), named by the most urgent in that same
 * order. A session without one has no badge; the tile shows the row's time label instead, as the row does. Free of
 * React Native, so it loads in a plain `bun test`.
 */

import {
  isAwaitingApproval,
  rowActivityIndicator,
  statusStackColors,
  type RowActivityIndicator,
} from '../../components/sessions/sessionStatus';
import type { FoldedStatus } from '../../contract/coordinatorTree';
import { hasQuestion, type GhostexSession } from '../../contract/mobileSummary';
import { WallCopy } from '../../copy';
import { SidebarPalette } from '../../theme/palette';

export type WallBadgeKind = keyof typeof WallCopy.badge;

export type WallBadge = {
  readonly kind: WallBadgeKind;
  readonly label: string;
  /** The dots back to front, as the row's `StatusDotStack` overlaps them. */
  readonly dots: string[];
};

const DOT: Record<NonNullable<RowActivityIndicator>, string> = {
  approval: SidebarPalette.ROW_APPROVAL,
  failed: SidebarPalette.ROW_FAILED,
  working: SidebarPalette.ROW_WORKING,
  attention: SidebarPalette.ROW_ATTENTION,
  backgroundWork: SidebarPalette.ROW_BACKGROUND_WORK,
};

/** A folded stack's word: the most urgent of its dots, in the order of a single session's badge below. */
const FOLDED_ORDER = ['approval', 'question', 'working', 'attention', 'backgroundWork'] as const;

/** `foldedStatus`: the row's shown folded stack (`shownFoldedStatus`), absent when the row draws its own status. */
export function statusBadge(session: GhostexSession, foldedStatus?: FoldedStatus): WallBadge | null {
  if (foldedStatus !== undefined) {
    const kind = FOLDED_ORDER.find((key) => foldedStatus[key]);
    if (kind !== undefined) return { kind, label: WallCopy.badge[kind], dots: statusStackColors(foldedStatus) };
  }
  if (isAwaitingApproval(session)) return { kind: 'approval', label: WallCopy.badge.approval, dots: [DOT.approval] };
  if (hasQuestion(session.pendingQuestionCount, false)) {
    // The row pairs the question with the working or the waiting dot (`QuestionIndicator`).
    const paired = session.activity === 'working' || session.activity === 'attention' ? [DOT[session.activity]] : [];
    return { kind: 'question', label: WallCopy.badge.question, dots: [SidebarPalette.ROW_QUESTION, ...paired] };
  }
  const indicator = rowActivityIndicator(session);
  if (indicator === null || indicator === 'approval') return null;
  return { kind: indicator, label: WallCopy.badge[indicator], dots: [DOT[indicator]] };
}
