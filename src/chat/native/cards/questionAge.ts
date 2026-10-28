/**
 * How long ago a Chat Resources row was asked: "now" under a minute, "4m" and "2h" within the day,
 * "yesterday" for the day before, then "3d". Elapsed time like the core's `age_label`
 * (packages/gx-chat-core/src/transcript/message_time.rs; the user's words are there), so the list can
 * recompute it as the clock moves. A row with no stamp keeps the core's own `age`.
 */
import type { QuestionListRow } from '../../rust/document';

export function ageLabel(nowMs: number, atMs: number): string {
  const minutes = Math.floor(Math.max(0, nowMs - atMs) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  if (minutes < 2880) return 'yesterday';
  return `${Math.floor(minutes / 1440)}d`;
}

export function rowAge(row: Pick<QuestionListRow, 'atMs' | 'age'>, nowMs: number): string {
  return typeof row.atMs === 'number' ? ageLabel(nowMs, row.atMs) : (row.age ?? '');
}

/**
 * The action a row's For later button sends (the question cards' own `questionForLater`, so cards
 * and list agree): "For later" on an unanswered form or page, "Back to open" on one put off; none
 * for any other row. Desktop: `questions_list.rs` `later_action`.
 */
export function laterAction(
  sectionId: string,
  kind: string,
  id: string,
): { label: string; glyph: 'clock' | 'arrow-back-up'; action: { type: 'questionForLater'; id: string; later: boolean } } | null {
  if (kind === 'chart') return null;
  if (sectionId === 'unanswered') {
    return { label: 'For later', glyph: 'clock', action: { type: 'questionForLater', id, later: true } };
  }
  if (sectionId === 'later') {
    return { label: 'Back to open', glyph: 'arrow-back-up', action: { type: 'questionForLater', id, later: false } };
  }
  return null;
}
