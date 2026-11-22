/**
 * A token per terminal tab, for the not-sent sign: the native terminal keeps the token of the tab a paste's question
 * was asked in and returns it with a Paste answered late (`TerminalInputNotSentEvent.tabToken`), so a tab closed while
 * the question was open makes no sign on a tab opened later for the same session (`notSentKeys.ts`). A tab's first open
 * takes a new token; a reattach of the same tab keeps it. No clock times.
 */

let issued = 0;
const tokens = new Map<string, string>();

/** A tab's first open (`openTab`): a new token, whatever an earlier tab of the session had. */
export function newTabToken(sessionKey: string): string {
  issued += 1;
  const token = String(issued);
  tokens.set(sessionKey, token);
  return token;
}

/** A reattach of the tab (`reattachTab`): its token, or a new one if it has none yet. */
export function tabTokenFor(sessionKey: string): string {
  return tokens.get(sessionKey) ?? newTabToken(sessionKey);
}

/** The token of the session's current tab, if one was opened. */
export function currentTabToken(sessionKey: string): string | undefined {
  return tokens.get(sessionKey);
}
