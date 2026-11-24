/**
 * Short-lived in-memory signal for opening the first open Needs you question's details sheet
 * when the user taps a phone notification (`deepLinks.ts` -> `WorkCards.tsx`).
 *
 * CDXC:Coordinators 2026-11-24 DECISION (ask-details-page, Q3):
 * Tapping a Needs you notification on the phone opens the session's chat view and slides up the
 * question's full details sheet instead of dropping the user at the bottom of the chat.
 */

const PENDING_TTL_MS = 8_000;

let pending: { sessionKey: string; at: number } | null = null;
const listeners = new Set<() => void>();

export function requestOpenAskDetails(sessionKey: string): void {
  if (sessionKey.length === 0) return;
  pending = { sessionKey, at: Date.now() };
  for (const listener of listeners) listener();
}

export function subscribeOpenAskDetails(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function hasPendingAskDetails(sessionKey: string): boolean {
  if (pending === null) return false;
  if (Date.now() - pending.at > PENDING_TTL_MS) {
    pending = null;
    return false;
  }
  return pending.sessionKey === sessionKey;
}

export function consumePendingAskDetails(sessionKey: string): boolean {
  if (!hasPendingAskDetails(sessionKey)) return false;
  pending = null;
  return true;
}
