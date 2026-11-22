/**
 * The terminal hold: one per tab, in memory only, never stored. An open the person started from an entry path (a tap
 * in the Sessions list or a new session there, Find's Resume or Fork, a link from outside the app, a tapped
 * notification, an attention-list row) that ended at its time limit (`TerminalOpenTimedOut` in sessions.ts) while that
 * opening was still current (src/app/currentOpening.ts: no newer opening began and the person did not move on) holds
 * its tab on its terminal, where the failure with Retry shows, also where the session's view is its Chat View (chosen
 * for it or by the Default Agent View) and also once the session list shows it with a chat. The saved view is not
 * changed. An open the app started on its own (a background reattach) holds nothing, and neither does an ordinary
 * failed attach (only the time limit holds).
 *
 * Where it shows: one content area shows the held tab's terminal instead of its chat (`useSavedChatView`); with the
 * tabs side by side, the held tab's side shows its terminal's failure with Retry instead of its chat
 * (`SplitPaneChat`). The iPhone Duo's two panes keep their own rule (each pane shows its terminal, with its failure and
 * Retry, unless it is the panes' chat pane).
 *
 * It ends when the person uses the Chat/Terminal toggle (`toggleSessionView`: the Chat View shows and nothing is
 * saved, also where the saved view is the terminal), when the person opens the session anew from any entry path (a tap
 * in the Sessions list, also one that opens its Chat View, and every opening `beginOpening` in
 * src/app/currentOpening.ts begins: a link, a tapped notification, Find, an attention-list row; an attach of that
 * opening that ends at the time limit holds it again), when the tab opens successfully (any open: Retry, a later entry,
 * a reattach) and when the tab closes.
 */

import { create } from 'zustand';

import { useSettingsStore, type PreferredAgentInterface } from '../settings/store';
import { useTerminalStore } from './sessions';

/**
 * `held`: the held tabs. `chatShown`: tabs whose hold the Chat/Terminal toggle ended where the saved view is the
 * terminal: they show their Chat View until the next toggle, a new opening or their closing, without saving it.
 */
const useHoldStore = create<{ held: readonly string[]; chatShown: readonly string[] }>()(() => ({
  held: [],
  chatShown: [],
}));

let watchingTabs = false;

/** A held tab that opened successfully, or closed, is released; a closed tab's Chat View shown by the toggle goes. */
function watchTabs(): void {
  if (watchingTabs) return;
  watchingTabs = true;
  useTerminalStore.subscribe(({ tabs }) => {
    const { held, chatShown } = useHoldStore.getState();
    if (held.length === 0 && chatShown.length === 0) return;
    const kept = held.filter((key) => tabs.some((tab) => tab.sessionKey === key && tab.state !== 'open'));
    const shown = chatShown.filter((key) => tabs.some((tab) => tab.sessionKey === key));
    if (kept.length !== held.length || shown.length !== chatShown.length) {
      useHoldStore.setState({ held: kept, chatShown: shown });
    }
  });
}

/** An open the person started of `sessionKey`'s tab ended at its time limit: its terminal stays on screen. */
export function holdTerminal(sessionKey: string): void {
  const tab = useTerminalStore.getState().tabs.find((entry) => entry.sessionKey === sessionKey);
  // Closed meanwhile, or already open again (an open of the same tab under way succeeded): nothing to hold.
  if (tab === undefined || tab.state === 'open') return;
  watchTabs();
  const { held } = useHoldStore.getState();
  if (!held.includes(sessionKey)) useHoldStore.setState({ held: [...held, sessionKey] });
}

/**
 * Ends the hold of `sessionKey`'s tab, and a Chat View the toggle showed for it (a new choice of the person's); true
 * when there was a hold.
 */
export function endTerminalHold(sessionKey: string): boolean {
  const { held, chatShown } = useHoldStore.getState();
  if (!held.includes(sessionKey) && !chatShown.includes(sessionKey)) return false;
  useHoldStore.setState({
    held: held.filter((key) => key !== sessionKey),
    chatShown: chatShown.filter((key) => key !== sessionKey),
  });
  return held.includes(sessionKey);
}

/** Whether `sessionKey`'s tab is held on its terminal. */
export function terminalHeld(sessionKey: string): boolean {
  return useHoldStore.getState().held.includes(sessionKey);
}

/**
 * The Chat/Terminal toggle on `sessionKey`'s tab (`panes`: the iPhone Duo's two panes, which turn the pane instead),
 * as the Terminal screen's toggle applies it to the session's view; the view one content area shows now, or null with
 * two panes. On a held tab it ends the hold and shows the Chat View, saving nothing: where the saved view is the
 * terminal, that Chat View is kept in memory until the next toggle, which shows the terminal again, still saving
 * nothing. Otherwise the toggle saves the other view for the session, as before.
 */
export function toggleSessionView(sessionKey: string, panes: boolean): 'chat' | 'terminal' | null {
  const store = useTerminalStore.getState();
  // Read before `endTerminalHold`, which also ends a Chat View the toggle showed.
  const { chatShown } = useHoldStore.getState();
  if (endTerminalHold(sessionKey)) {
    if (panes) return null;
    if (!store.chatModeArmed(sessionKey)) useHoldStore.setState({ chatShown: [...chatShown, sessionKey] });
    return 'chat';
  }
  if (panes) return null;
  if (chatShown.includes(sessionKey)) return 'terminal';
  store.toggleChatMode(sessionKey);
  return store.chatModeArmed(sessionKey) ? 'chat' : 'terminal';
}

function chatViewShown(
  held: boolean,
  shown: boolean,
  saved: PreferredAgentInterface | undefined,
  preferred: PreferredAgentInterface,
) {
  return !held && (shown || (saved ?? preferred) === 'chat');
}

/**
 * Whether one content area shows `sessionKey`'s Chat View rather than its terminal, for a session that can show one:
 * Chat View chosen for it (else by the Default Agent View) or shown by the toggle after a hold, and its terminal not
 * held. `useSavedChatView` is the Terminal screen's subscribing form.
 */
export function savedChatViewShown(sessionKey: string): boolean {
  const { held, chatShown } = useHoldStore.getState();
  return chatViewShown(
    held.includes(sessionKey),
    chatShown.includes(sessionKey),
    useTerminalStore.getState().sessionViewModeBySessionKey[sessionKey],
    useSettingsStore.getState().settings.preferredAgentInterface,
  );
}

/** `savedChatViewShown` for the Terminal screen, which follows the hold, the saved views and the setting. */
export function useSavedChatView(sessionKey: string | null): boolean {
  const held = useHoldStore((state) => sessionKey !== null && state.held.includes(sessionKey));
  const shown = useHoldStore((state) => sessionKey !== null && state.chatShown.includes(sessionKey));
  const saved = useTerminalStore((state) =>
    sessionKey === null ? undefined : state.sessionViewModeBySessionKey[sessionKey],
  );
  const preferred = useSettingsStore((state) => state.settings.preferredAgentInterface);
  return sessionKey !== null && chatViewShown(held, shown, saved, preferred);
}

/** Whether `sessionKey`'s tab is held, for a component that follows it. */
export function useTerminalHeld(sessionKey: string): boolean {
  return useHoldStore((state) => state.held.includes(sessionKey));
}
