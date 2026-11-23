/**
 * Single source of truth for user-visible Inbox and Pings labels on the phone.
 * Swap `ASKS_GROUP_NAME` / `ASKS_GROUP_SINGULAR` / `ASKS_GROUP_PLURAL` here to rename the group in one place.
 */
export const ASKS_GROUP_NAME = 'Pings';
export const ASKS_GROUP_SINGULAR = 'ping';
export const ASKS_GROUP_PLURAL = 'pings';
export const INBOX_NAME = 'Inbox';
export const INBOX_FULL_NAME = 'Session Inbox';

export function asksCountWords(count: number): string {
  return count === 1 ? ASKS_GROUP_SINGULAR : ASKS_GROUP_PLURAL;
}
