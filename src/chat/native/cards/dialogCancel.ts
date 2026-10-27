/**
 * Whether the phone's card keeps a Cancel button under a numbered dialog.
 *
 * CDXC:SessionChat 2026-10-27 DECISION: User (Q687): "Yes, phone only, only those dialogs". Numbered rows are a card's buttons,
 * so Confirm and Cancel went (CDXC:SessionChat 2026-10-27 in the chat core's terminal_prompts.rs), and the desktop's Esc still
 * closes a dialog that has no "No" row. A phone has no Esc key, so on the phone only, a numbered dialog with no "No" row and no
 * other row Esc answers keeps a Cancel button that closes it the way Esc does. Every other card stays numbers only.
 * SEE-ALSO: apps/desktop/src/app/native_chat/keyboard.rs (Esc on such a dialog), apps/mobile/app/src/chat/native/cards/NoticeCard.tsx.
 */

import { arr, obj, str } from './json';

export function phoneKeepsCancel(notice: unknown): boolean {
  const card = obj(notice);
  if (card?.numbered !== true) return false;
  // Esc already answers a row here (a "No" row, or a two-way chooser's alternative).
  if (typeof card.secondaryChoice === 'number') return false;
  const choices = arr(card.choices);
  const declines = choices.some((choice) =>
    (str(choice, 'title') || str(choice, 'label')).trimStart().startsWith('No'),
  );
  if (declines) return false;
  return arr(obj(card.dialog)?.actions).includes('cancel');
}
