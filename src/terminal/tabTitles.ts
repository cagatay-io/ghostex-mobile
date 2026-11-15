/**
 * An open session tab carries the session's current title, not the one it had when the tab opened.
 *
 * CDXC:SessionTabs 2026-11-15 DECISION:
 * User: "This one got renamed actually this session but in the tabs of the mobile app I see I still see just say
 * Claude so it didn't get renamed there please fix". A tab copied its title once, when it opened (`attachSession`,
 * `openChatTab`), and only replaced a raw-session-id placeholder after that, so a session renamed later (by its
 * agent, by the user on another device, or here) kept its old name in the tab strip while the Sessions list showed
 * the new one. Each Ghostex session tab now takes the title its computer's session list gives that session (the
 * rendered summary, so a rename made here shows before gxserver confirms it), whenever the list or the tabs change.
 * The terminal's own title (OSC) names only shell tabs (`initTerminalEvents`).
 */

import { useInventoryStore } from '../inventory/store';
import { useTerminalStore, type TerminalTab } from './sessions';

/** The title the session list gives `tab`'s session, or null when the list does not have it (yet). */
function listedTitle(tab: TerminalTab): string | null {
  if (tab.kind !== 'attach' || tab.ghostexSessionId === undefined) return null;
  const summary = useInventoryStore.getState().inventoriesByMachineId[tab.machineId]?.summary;
  const session = summary?.sessions.find((entry) => entry.sessionId === tab.ghostexSessionId);
  const title = session?.displayTitle.trim() ?? '';
  return title.length > 0 ? title : null;
}

function syncTabTitles(): void {
  const { tabs } = useTerminalStore.getState();
  let changed = false;
  const next = tabs.map((tab) => {
    const title = listedTitle(tab);
    if (title === null || title === tab.title) return tab;
    changed = true;
    return { ...tab, title };
  });
  if (changed) useTerminalStore.setState({ tabs: next });
}

let installed = false;

/** Keep open session tabs titled as their sessions are. Call once at app startup. */
export function initTabTitleSync(): void {
  if (installed) return;
  installed = true;
  useInventoryStore.subscribe((state, previous) => {
    if (state.inventoriesByMachineId !== previous.inventoriesByMachineId) syncTabTitles();
  });
  useTerminalStore.subscribe((state, previous) => {
    if (state.tabs !== previous.tabs) syncTabTitles();
  });
  syncTabTitles();
}
