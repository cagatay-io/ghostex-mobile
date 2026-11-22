/**
 * A token per terminal tab, for the not-sent sign: the native terminal keeps the token of the tab a paste's question
 * was asked in and returns it with a Paste answered late (`TerminalInputNotSentEvent.tabToken`), so a tab closed while
 * the question was open makes no sign on a tab opened later for the same session (`notSentKeys.ts`). A tab's first open
 * takes a new token; a reattach of the same tab keeps it; closing the tab drops it, so a tab opened anew (also one still
 * waiting for its connection, or a chat tab's first terminal) never has the closed tab's token. No clock times.
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

/** A reattach of the tab (`reopenTab`): its token, or a new one if it has none (its first terminal, or after a close). */
export function tabTokenFor(sessionKey: string): string {
  return tokens.get(sessionKey) ?? newTabToken(sessionKey);
}

/** The token of the session's current tab, if it has one. */
export function currentTabToken(sessionKey: string): string | undefined {
  return tokens.get(sessionKey);
}

/** The tab was closed (`closeTab`): its token goes with it. */
export function forgetTabToken(sessionKey: string): void {
  tokens.delete(sessionKey);
}
