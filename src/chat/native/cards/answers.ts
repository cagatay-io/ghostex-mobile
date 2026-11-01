/**
 * What the chat's question card sends into the session's chat core, and the card's fallback words and reconnecting
 * note, shared by the card and by the folded triage on the Sessions screen, which answers the same card of a session
 * from outside its chat: the same action into the same core builds the same `answerSessionChatPrompt` request. Free of
 * React Native, so `bun test` loads it.
 */

import type { UserAction } from '../../rust/actions';

/** The approval card's title when the chat core names none. */
export const APPROVAL_TITLE_FALLBACK = 'Approval request';
/** The approval card's question when it has no command to show and the chat core words none. */
export const APPROVAL_ASK_FALLBACK = 'Allow this tool?';
/** Shown while the card's answer waits for gxserver to come back (gx-chat-core `questions/unreachable_retry.rs`). */
export const RECONNECTING_NOTE = "Reconnecting to Ghostex… your answer goes out as soon as it's back.";

/** Allow (`true`) or Deny on an approval card (desktop `approval.rs`). */
export function approvalAnswer(allow: boolean): UserAction {
  return { type: 'answer', answer: { kind: 'approval', approvalSend: allow ? '1' : '' } };
}

/** A tap on a question's option; a single-select question's last step sends the answers with it. */
export function questionOptionAnswer(index: number): UserAction {
  return { type: 'questionOption', index };
}
