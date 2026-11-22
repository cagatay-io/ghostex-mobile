/**
 * The terminal's "not sent" sign: keys typed, and texts sent (the pad's text editor, a paste, an upload's link), while
 * the terminal's link to the computer is replaced go nowhere and are not sent later, and the card above the keyboard
 * says so. Kept apart from src/copy.ts so that file stays under the size limit; the same rules apply (no em dashes, the
 * card rule for notices).
 */

/**
 * What the sign counted: Return, Backspace and Esc by name, every other key only as a key; the text editor's sends and
 * pastes as items; an upload's link by its title ("Image #1"). Never characters.
 */
export type NotSentKeyCounts = {
  readonly keys: number;
  readonly returns: number;
  readonly backspaces: number;
  readonly escapes: number;
  readonly texts: number;
  readonly pastes: number;
  readonly links: readonly string[];
};

/** "1 key", "3 keys"; "Return", "2 Returns". */
function counted(count: number, word: string): string {
  if (count === 1) return word === 'key' ? '1 key' : word;
  return `${count} ${word}s`;
}

/** "a", "a and b", "a, b and c". */
function listed(parts: readonly string[]): string {
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : (parts[0] ?? '');
}

/** "Type" for keys only; "Send" once the editor's text or a paste is on the card (both are sent again, not typed). */
function again(counts: NotSentKeyCounts): string {
  return counts.texts + counts.pastes > 0 ? 'Send' : 'Type';
}

/** Anything on the card besides upload links. */
function hasOthers(counts: NotSentKeyCounts): boolean {
  return counts.keys + counts.returns + counts.backspaces + counts.escapes + counts.texts + counts.pastes > 0;
}

/** An upload whose link was not inserted: the file itself is on the computer, so it is not uploaded again. */
function links(computer: string, counts: NotSentKeyCounts): string {
  return counts.links.length === 1
    ? `The file is on ${computer}; only its link was not inserted.`
    : `The files are on ${computer}; only their links were not inserted.`;
}

/**
 * The instruction after the card's state: "Type them again" / "Send them again" (`ending` follows), the link sentence
 * alone, or the link sentence and "the rest".
 */
function instruction(computer: string, counts: NotSentKeyCounts, ending: string): string {
  if (counts.links.length === 0) return `${again(counts)} them again${ending}.`;
  if (!hasOthers(counts)) return links(computer, counts);
  return `${links(computer, counts)} ${again(counts)} the rest again${ending}.`;
}

export const NotSentCopy = {
  /** "Not sent: 1 key, 2 Returns and Backspace"; "Not sent: 3 keys, your text, a paste and Image #1's link". */
  title: (counts: NotSentKeyCounts): string => {
    const parts = [
      ...(counts.keys > 0 ? [counted(counts.keys, 'key')] : []),
      ...(counts.returns > 0 ? [counted(counts.returns, 'Return')] : []),
      ...(counts.backspaces > 0 ? [counted(counts.backspaces, 'Backspace')] : []),
      ...(counts.escapes > 0 ? [counted(counts.escapes, 'Esc')] : []),
      ...(counts.texts > 0 ? ['your text'] : []),
      ...(counts.pastes === 1 ? ['a paste'] : counts.pastes > 1 ? [`${counts.pastes} pastes`] : []),
      ...counts.links.map((title) => `${title}'s link`),
    ];
    return `Not sent: ${listed(parts)}`;
  },
  /** While the terminal opens again on its computer. */
  reconnecting: (computer: string, counts: NotSentKeyCounts) =>
    `Ghostex is reconnecting to ${computer}. ${instruction(computer, counts, " once it's back")}`,
  /** Once the terminal is attached again; the card stays until the next key or its close button. */
  back: (computer: string, counts: NotSentKeyCounts) => `${computer} is back. ${instruction(computer, counts, '')}`,
  /**
   * The terminal ended or failed and is not reconnecting by itself (Disconnected, Connection Failed): only the part of
   * the reconnecting sentence that stays true, until the owner words this state.
   */
  waiting: (computer: string, counts: NotSentKeyCounts) => instruction(computer, counts, " once it's back"),
  /** A computer without a saved name. */
  computerFallback: 'your computer',
  close: 'Close',
} as const;
