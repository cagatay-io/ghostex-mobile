/** The Saved prompts sheet's rows: the session's own once it has any, else the project's. */

export type ScopedPrompt = { promptId: string; sessionId: string; projectId: string };

/**
 * The rows the sheet lists once the library has loaded. The sheet opens for one chat (the Stashed
 * pill's count is that chat's), so it lists that chat's prompts, and every prompt of the project
 * only when the chat has none; the desktop's Saved Prompts window opens the same way.
 *
 * CDXC:SavedPrompts 2026-11-02 DECISION:
 * User, of the Saved Prompts list the Stashed pill opens: "when i click on 'Stashed' pill we show lots of prompts in the list but then show just the ones i need. please fix this, dont show anything while the filter isn't applied yet". Same on the phone: the sheet draws a spinner, never the project's rows, until it has the chat's rows in hand (and not the previous open's rows either), then lists only those.
 */
export function sheetPrompts<T extends ScopedPrompt>(prompts: readonly T[], projectId: string, sessionId: string): T[] {
  const own = prompts.filter(
    (prompt) => prompt.sessionId === sessionId && (projectId.length === 0 || prompt.projectId === projectId),
  );
  return own.length > 0 ? own : [...prompts];
}
