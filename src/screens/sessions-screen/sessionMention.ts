/**
 * The text the session menu's Copy rows put on the clipboard that must match the desktop's
 * byte for byte (gx-core `clipboard.rs`, gx-protocol `session_ref.rs`).
 */

/** gx-core `MORE_DETAILS_LINE`, Copy Details' last line. */
export const MORE_DETAILS_LINE =
  'More details: run `ghostex agents` to see how to message other agents and check their status';

/**
 * gx-protocol `session_mention`, what Copy ID copies: `[<session title>](<Global Ref>)`, the title
 * on one line with Markdown's brackets and backslashes escaped.
 */
export function sessionMentionText(title: string, globalRef: string): string {
  const label = title.split(/\s+/).filter((part) => part.length > 0).join(' ') || 'Session';
  return `[${label.replace(/[\\[\]]/g, (character) => `\\${character}`)}](${globalRef})`;
}
