/**
 * Single source of truth for user-visible Inbox and Asks labels on the phone.
 * Swap `ASKS_GROUP_NAME` / `ASKS_GROUP_SINGULAR` / `ASKS_GROUP_PLURAL` here to rename the group in one place.
 */
export const ASKS_GROUP_NAME = 'Asks';
export const ASKS_GROUP_SINGULAR = 'ask';
export const ASKS_GROUP_PLURAL = 'asks';
export const INBOX_NAME = 'Inbox';
export const INBOX_FULL_NAME = 'Session Inbox';

export function asksCountWords(count: number): string {
  return count === 1 ? ASKS_GROUP_SINGULAR : ASKS_GROUP_PLURAL;
}
