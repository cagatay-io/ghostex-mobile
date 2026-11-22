/**
 * The terminal hold: one per tab, in memory only, never stored. An open the person started from an entry path (a tap
 * in the Sessions list or a new session there, Find's Resume or Fork, a link from outside the app, a tapped
 * notification, an attention-list row) that ended at its time limit (`TerminalOpenTimedOut` in sessions.ts) holds its
 * tab on its terminal, where the failure with Retry shows, also where the session's view is its Chat View (chosen for
 * it or by the Default Agent View) and also once the session list shows it with a chat. The saved view is not changed.
 * An open the app started on its own (a background reattach) holds nothing.
 *
 * Where it shows: one content area shows the held tab's terminal instead of its chat (`useSavedChatView`); with the
 * tabs side by side, the held tab's side shows its terminal's failure with Retry instead of its chat
 * (`SplitPaneChat`). The iPhone Duo's two panes keep their own rule (each pane shows its terminal, with its failure and
 * Retry, unless it is the panes' chat pane).
 *
 * It ends when the person uses the Chat/Terminal toggle (`toggleEndsHold`: the Chat View shows, the saved view stays
 * as it is), when the person opens the session anew from any entry path (a tap in the Sessions list, also one that
 * opens its Chat View, and every opening `beginOpening` in src/app/currentOpening.ts begins: a link, a tapped
 * notification, Find, an attention-list row; an attach of that opening that ends at the time limit holds it again),
 * when the tab opens successfully (any open: Retry, a later entry, a reattach) and when the tab closes.
 */

import { create } from 'zustand';

import { useSettingsStore, type PreferredAgentInterface } from '../settings/store';
import { useTerminalStore } from './sessions';

const useHoldStore = create<{ held: readonly string[] }>()(() => ({ held: [] }));

let watchingTabs = false;

/** A held tab that opened successfully, or closed, is released. */
function watchTabs(): void {
  if (watchingTabs) return;
  watchingTabs = true;
  useTerminalStore.subscribe(({ tabs }) => {
    const { held } = useHoldStore.getState();
    if (held.length === 0) return;
    const kept = held.filter((key) => tabs.some((tab) => tab.sessionKey === key && tab.state !== 'open'));
    if (kept.length !== held.length) useHoldStore.setState({ held: kept });
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

/** Ends the hold of `sessionKey`'s tab (a new choice of the person's); true when there was one. */
export function endTerminalHold(sessionKey: string): boolean {
  const { held } = useHoldStore.getState();
  if (!held.includes(sessionKey)) return false;
  useHoldStore.setState({ held: held.filter((key) => key !== sessionKey) });
  return true;
}

/** Whether `sessionKey`'s tab is held on its terminal. */
export function terminalHeld(sessionKey: string): boolean {
  return useHoldStore.getState().held.includes(sessionKey);
}

/**
 * The Chat/Terminal toggle on `sessionKey`'s tab ends its hold. True when the hold was what kept its terminal over its
 * Chat View: that Chat View shows now, and the toggle changes nothing else (the saved view stays as it is).
 */
export function toggleEndsHold(sessionKey: string): boolean {
  return endTerminalHold(sessionKey) && useTerminalStore.getState().chatModeArmed(sessionKey);
}

function chatViewShown(held: boolean, saved: PreferredAgentInterface | undefined, preferred: PreferredAgentInterface) {
  return !held && (saved ?? preferred) === 'chat';
}

/**
 * Whether one content area shows `sessionKey`'s Chat View rather than its terminal, for a session that can show one:
 * Chat View chosen for it (else by the Default Agent View) and its terminal not held. `useSavedChatView` is the
 * Terminal screen's subscribing form.
 */
export function savedChatViewShown(sessionKey: string): boolean {
  return chatViewShown(
    terminalHeld(sessionKey),
    useTerminalStore.getState().sessionViewModeBySessionKey[sessionKey],
    useSettingsStore.getState().settings.preferredAgentInterface,
  );
}

/** `savedChatViewShown` for the Terminal screen, which follows the hold, the saved views and the setting. */
export function useSavedChatView(sessionKey: string | null): boolean {
  const held = useHoldStore((state) => sessionKey !== null && state.held.includes(sessionKey));
  const saved = useTerminalStore((state) =>
    sessionKey === null ? undefined : state.sessionViewModeBySessionKey[sessionKey],
  );
  const preferred = useSettingsStore((state) => state.settings.preferredAgentInterface);
  return sessionKey !== null && chatViewShown(held, saved, preferred);
}

/** Whether `sessionKey`'s tab is held, for a component that follows it. */
export function useTerminalHeld(sessionKey: string): boolean {
  return useHoldStore((state) => state.held.includes(sessionKey));
}
