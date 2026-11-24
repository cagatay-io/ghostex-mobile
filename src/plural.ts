/**
 * English count/noun and count/verb agreement helpers shared across the mobile app.
 */

/**
 * Formats `count` with the singular (`count === 1`) or plural English phrase.
 *
 * Examples: `plural(1, 'needs you', 'need you')` -> `'1 needs you'`,
 * `plural(2, 'needs you', 'need you')` -> `'2 need you'`.
 */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Picks the singular (`count === 1`) or plural English word or phrase without repeating `count`. */
export function pluralWord(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}
