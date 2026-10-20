/**
 * Which transcript menu is open: the request a long press made (`openTranscriptMenu`), which
 * `TranscriptMenuSheet` turns into the core's rows. Kept apart from the sheet so a row can open the
 * menu without importing the menu's drawing.
 */

import { create } from 'zustand';

/**
 * A message's own action, offered under the core's Copy and Add to Chat rows (Edit, Back to
 * composer, Rewind, Save prompt, Save to md...). `icon` is a glyph name `MenuSheet` can draw.
 */
export type MessageMenuAction = { label: string; icon: string; run: () => void };

type MenuRequest = { href: string | null; selection: string; actions: MessageMenuAction[] };

export const useTranscriptMenuStore = create<{ request: MenuRequest | null }>(() => ({ request: null }));

/** A long press on a message (`selection` is its text, `actions` its own buttons) or on a link (`href`, no selection). */
export function openTranscriptMenu(request: {
  href?: string;
  selection?: string;
  actions?: MessageMenuAction[];
}): void {
  const href = request.href !== undefined && request.href.length > 0 ? request.href : null;
  const selection = (request.selection ?? '').trim();
  if (href === null && selection.length === 0) return;
  useTranscriptMenuStore.setState({ request: { href, selection, actions: request.actions ?? [] } });
}

export function closeTranscriptMenu(): void {
  useTranscriptMenuStore.setState({ request: null });
}
