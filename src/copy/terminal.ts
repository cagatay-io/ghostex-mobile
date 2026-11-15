/**
 * The terminal's "not sent" sign: keys typed while the terminal's link to the computer is replaced go nowhere and are
 * not sent later, and the card above the keyboard says so. Kept apart from src/copy.ts so that file stays under the
 * size limit; the same rules apply (no em dashes, the card rule for notices).
 */

/** Keys the sign counted: Return, Backspace and Esc by name, every other key only as a key. Never characters. */
export type NotSentKeyCounts = {
  readonly keys: number;
  readonly returns: number;
  readonly backspaces: number;
  readonly escapes: number;
};

/** "1 key", "3 keys"; "Return", "2 Returns". */
function counted(count: number, word: string): string {
  if (count === 1) return word === 'key' ? '1 key' : word;
  return `${count} ${word}s`;
}

export const NotSentCopy = {
  /** "Not sent: 1 key, 2 Returns and Backspace". */
  title: (counts: NotSentKeyCounts): string => {
    const parts = [
      ...(counts.keys > 0 ? [counted(counts.keys, 'key')] : []),
      ...(counts.returns > 0 ? [counted(counts.returns, 'Return')] : []),
      ...(counts.backspaces > 0 ? [counted(counts.backspaces, 'Backspace')] : []),
      ...(counts.escapes > 0 ? [counted(counts.escapes, 'Esc')] : []),
    ];
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
    return `Not sent: ${list ?? ''}`;
  },
  /** While the terminal opens again on its computer. */
  reconnecting: (computer: string) => `Ghostex is reconnecting to ${computer}. Type them again once it's back.`,
  /** Once the terminal is attached again; the card stays until the next key or its close button. */
  back: (computer: string) => `${computer} is back. Type them again.`,
  /**
   * The terminal ended or failed and is not reconnecting by itself (Disconnected, Connection Failed): only the part of
   * the reconnecting sentence that stays true, until the owner words this state.
   */
  waiting: "Type them again once it's back.",
  /** A computer without a saved name. */
  computerFallback: 'your computer',
  close: 'Close',
} as const;
