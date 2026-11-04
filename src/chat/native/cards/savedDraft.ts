/**
 * How the Saved draft pill reads at a chat box width (desktop `saved_draft_pill.rs` `pill_label`):
 * in full where there is room, "Draft" where the box is narrow, and its icon alone narrower still,
 * so it never moves out of its spot (gx-chat-core extras/chat_pills.rs `saved_draft_pill` has the
 * user's words). An unmeasured box (0) reads in full.
 */
export type SavedDraftLabel = 'full' | 'short' | 'icon';

/** Desktop `SHORT_LABEL_BELOW` and `ICON_ONLY_BELOW`. */
export const SHORT_LABEL_BELOW = 480;
export const ICON_ONLY_BELOW = 300;

export function savedDraftLabel(width: number): SavedDraftLabel {
  if (width <= 0 || width >= SHORT_LABEL_BELOW) return 'full';
  if (width >= ICON_ONLY_BELOW) return 'short';
  return 'icon';
}
