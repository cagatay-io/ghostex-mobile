/**
 * What a held message hands the transcript menu as its selection: the whole message as Markdown,
 * the core's `copyText` (the same text the desktop's Copy copies, packages/gx-chat-core
 * `transcript/presentation.rs`). The menu's Copy row copies exactly this, so a long reply, a reply
 * with code blocks and a reply that asks questions (the ```questions block with its choices) copy
 * in full. The words' own selection bar copies only the words selected; its More opens this menu.
 */

import type { ProjectedMessage } from '../../rust/document';

/** The message's whole text for the menu, or null when the message has nothing to copy. */
export function messageMenuSelection(message: Pick<ProjectedMessage, 'copyText'>): string | null {
  const text = typeof message.copyText === 'string' ? message.copyText : '';
  return text.trim().length > 0 ? text : null;
}
