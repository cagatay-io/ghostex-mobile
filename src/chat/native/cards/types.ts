/**
 * What a card asks of the app shell rather than of the chat core: `terminalView` (show the
 * session's terminal), `switchAccount` (open the accounts panel the notice's Switch account
 * button opens on desktop), `openAccountsSettings` (open the session's computer's Accounts screen,
 * optionally starting sign-in for `accountId`), named like desktop's `sessionChatHostAction`
 * messages, and `pickModel` (open the composer's model sheet, which the held-messages card's Pick
 * model opens; desktop's opens its model menu within the chat view).
 */
export type CardHostAction = (
  action: 'terminalView' | 'switchAccount' | 'pickModel' | 'openAgentSettings' | 'openAccountsSettings',
  params?: Record<string, unknown>,
) => void;
