/**
 * What the Terminal screen's tab strips do with their tabs: select one (acknowledging its attention), close one, drag
 * one (reorder, move to the other side, open beside the rest), merge the sides, show a side's terminal, focus a side's
 * chat, and step to the neighbouring tab. Moved verbatim from src/screens/TerminalScreen.tsx so that file stays under
 * the size limit; its hooks run where they ran.
 */

import { useCallback } from 'react';
import * as Haptics from 'expo-haptics';

import { useTabDrag, type TabDropRequest } from '../../components/terminal/tabDrag/TabDrag';
import { useInventoryStore } from '../../inventory/store';
import type { PaneDisplay } from '../../panes/resolve';
import { acknowledgeSessionAttention } from '../../terminal/attention';
import { useTerminalStore, type TerminalTab } from '../../terminal/sessions';
import type { SplitView } from '../../terminal/tabSplit';
import { saveTerminalView } from '../../terminal/terminalHold';
import { tabChatCapable } from './session-lookups';

export type TerminalTabActionsDeps = {
  selectTab: (sessionKey: string) => void;
  requestCloseTab: (tab: TerminalTab) => void;
  splitWide: boolean;
  sideBySide: SplitView | null;
  twoPanes: Extract<PaneDisplay, { kind: 'panes' }> | null;
  chatModeActive: boolean;
};

export function useTerminalTabActions({
  selectTab,
  requestCloseTab,
  splitWide,
  sideBySide,
  twoPanes,
  chatModeActive,
}: TerminalTabActionsDeps) {
  const handleSelectTab = useCallback(
    (sessionKey: string): void => {
      if (sessionKey !== useTerminalStore.getState().selectedSessionKey) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      // Desktop parity: tapping a session's tab acknowledges its attention
      // status (even when the tab is already selected).
      const tab = useTerminalStore.getState().tabs.find((entry) => entry.sessionKey === sessionKey);
      if (tab?.ghostexSessionId !== undefined) {
        acknowledgeSessionAttention(tab.machineId, tab.ghostexSessionId);
      }
      selectTab(sessionKey);
    },
    [selectTab],
  );

  const closeTabByKey = useCallback(
    (sessionKey: string): void => {
      const tab = useTerminalStore.getState().tabs.find((entry) => entry.sessionKey === sessionKey);
      if (tab !== undefined) requestCloseTab(tab);
    },
    [requestCloseTab],
  );

  // A held tab let go over a bar or the chat (`useTabDrag` in tabDrag/TabDrag.tsx): reordered, moved to the other side, or opened
  // beside the rest. Only a chat view goes side by side, so a drop on the screen's right half is offered for a tab with
  // one, on a wide window with one bar; from the terminal view too, as the chat view's strip does, when the selected
  // tab has a chat view as well (the two then show as chats side by side).
  const canSplitTab = useCallback(
    (sessionKey: string): boolean => {
      if (!splitWide || sideBySide !== null || twoPanes !== null) return false;
      const store = useTerminalStore.getState();
      if (store.tabs.length < 2) return false;
      const hasChat = (key: string | null): boolean => {
        const tab = store.tabs.find((entry) => entry.sessionKey === key) ?? null;
        return tabChatCapable(
          tab,
          tab === null ? undefined : useInventoryStore.getState().inventoriesByMachineId[tab.machineId]?.summary,
        );
      };
      return hasChat(sessionKey) && (chatModeActive || hasChat(store.selectedSessionKey));
    },
    [splitWide, sideBySide, chatModeActive, twoPanes],
  );
  const handleTabDrop = useCallback((request: TabDropRequest): void => {
    const store = useTerminalStore.getState();
    if (request.kind === 'split') store.splitTab(request.key);
    else if (request.kind === 'side') store.moveTab(request.key, { bar: request.side, index: Number.MAX_SAFE_INTEGER });
    // The only bar while a split is kept for a wide window: places in the order both sides make.
    else store.moveTab(request.key, { bar: request.bar, index: request.index });
  }, []);
  const tabDrag = useTabDrag({ canSplit: canSplitTab, onDrop: handleTabDrop });
  // The split's handle: one bar again, the selected tab kept.
  const mergeTabs = useCallback((): void => useTerminalStore.getState().mergeTabs(), []);
  // A side's chat asks for its terminal, which needs the whole screen: the sides merge, then `saveTerminalView`.
  const showSplitTabTerminal = useCallback((sessionKey: string): void => {
    const store = useTerminalStore.getState();
    store.mergeTabs();
    store.selectTab(sessionKey);
    saveTerminalView(sessionKey);
  }, []);
  // A touch in a side's chat: that side's tab is the selected one, quietly (no tap, the chat keeps its place).
  const focusSplitTab = useCallback((sessionKey: string): void => {
    useTerminalStore.getState().selectTab(sessionKey, { scrollToBottom: false });
  }, []);

  const switchTabBy = useCallback((delta: -1 | 1): void => {
    const store = useTerminalStore.getState();
    const index = store.tabs.findIndex((tab) => tab.sessionKey === store.selectedSessionKey);
    if (index < 0) return;
    const next = store.tabs[index + delta];
    if (next === undefined) return;
    store.selectTab(next.sessionKey);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  return { handleSelectTab, closeTabByKey, tabDrag, mergeTabs, showSplitTabTerminal, focusSplitTab, switchTabBy };
}
