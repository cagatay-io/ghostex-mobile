/**
 * The pane host's state for the terminal screen: what it shows (`resolve.ts`), kept in step with the stores. It
 * stores a layout the selection changed, remembers the pane tapped last and the panes on screen (they come along when
 * the window turns into a shape with nothing stored), tells the terminal store which session the second session pane
 * shows (eviction keeps it, a closing selected tab hands it the selection), attaches a stored pane's session again after
 * a restart without changing the selection, closes the chooser when the window changes, sets a slot's pane type
 * (the chooser's types and the title's pane type menu), and keeps which session pane shows its chat view
 * (`paneChatAfter`: one at most, the panes' own choice, never stored).
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';

import { machineTargetFor, tabChatCapable } from '../screens/terminal-screen/session-lookups';
import { useInventoryStore } from '../inventory/store';
import { useMachinesStore } from '../machines/store';
import { useSettingsStore } from '../settings/store';
import { useTerminalStore } from '../terminal/sessions';
import type { PaneIndex } from './geometry';
import type { PaneArrangement } from './layout';
import { usePaneProjectOffered } from './paneProject';
import { AVAILABLE_PANE_TYPES } from './paneTypes';
import { DEFAULT_DIVIDER_RATIO } from './divider';
import {
  machineOfSessionKey,
  paneChatAfter,
  paneEntryOf,
  resolvePanes,
  type PaneContent,
  type PaneDisplay,
  type PaneEntry,
} from './resolve';
import { usePaneStore } from './store';

export type PaneHostInput = {
  /** The window has pane slots and the selected tab is an agent session, unless a question from the attention list stands. */
  offered: boolean;
  arrangement: PaneArrangement;
};

/** The pane types a slot can be set to; Session opens the chooser there. */
export type SettablePaneType = 'session' | 'browser' | 'files' | 'agents' | 'git' | 'usage' | 'attention';

export type PaneHost = {
  display: PaneDisplay;
  /** The divider's stored position for the window's shape. */
  ratio: number;
  /** The session the second session pane shows beside the selected one, or null. */
  paneSessionKey: string | null;
  /** The session whose pane shows its chat view, or null: one at most, a session that has one. */
  chatSessionKey: string | null;
  /** Shows this session's chat view in its pane (the other pane's chat view goes back to its terminal), or, with null,
   * every session pane its terminal; the panes' own choice, never the session's saved view. */
  setChatSession: (sessionKey: string | null) => void;
  /** Panes in the header: the chooser in a second slot beside the selected session. */
  openChooser: () => void;
  /** A pane's close button (the Panes button closes the second): one pane again, a session staying. */
  closeSlot: (slot: PaneIndex) => void;
  swap: () => void;
  setRatio: (ratio: number) => void;
  /**
   * Sets what a slot shows, the other slot keeping its content; the slot becomes the active one. Files and Git changes
   * keep the project of the session the slot showed, or else of the selected session, usage that session's computer.
   * The only session pane keeps its session: the selected session is always a pane's.
   */
  setSlotType: (slot: PaneIndex, type: SettablePaneType) => void;
  /**
   * Whether a slot can be set to this type now: the only session pane keeps its session, and Files and Git changes
   * need a project with a folder for the session they would come from.
   */
  typeOffered: (slot: PaneIndex, type: SettablePaneType) => boolean;
};

type SessionContent = Extract<PaneContent, { kind: 'session' }>;

export function usePaneHost({ offered, arrangement }: PaneHostInput): PaneHost {
  const tabs = useTerminalStore((state) => state.tabs);
  const selectedSessionKey = useTerminalStore((state) => state.selectedSessionKey);
  const machines = useMachinesStore((state) => state.machines);
  const layout = usePaneStore((state) => state.document.layouts[arrangement]);
  const chooser = usePaneStore((state) => state.chooser);
  const activeSlot = usePaneStore((state) => state.activeSlot);
  const hydrated = usePaneStore((state) => state.hydrated);
  const shown = usePaneStore((state) => state.shown);
  const chatSession = usePaneStore((state) => state.chatSession);
  const pickedSession = usePaneStore((state) => state.pickedSession);
  // Whether a session pane comes with its chat view: the session's saved view and whether it has one.
  const sessionViewModes = useTerminalStore((state) => state.sessionViewModeBySessionKey);
  const preferredInterface = useSettingsStore((state) => state.settings.preferredAgentInterface);
  const inventories = useInventoryStore((state) => state.inventoriesByMachineId);
  // The window turned: the panes last on screen in the other shape come along where nothing is stored for this one.
  const carried = shown !== null && shown.arrangement !== arrangement ? shown.slots : null;

  const resolution = useMemo(
    () =>
      resolvePanes({
        offered: offered && hydrated,
        arrangement,
        selectedSessionKey,
        layout,
        chooser,
        carried,
        activeSlot,
        isOpen: (key) => tabs.some((tab) => tab.sessionKey === key),
        isKnown: (key) => machines.some((machine) => machine.id === machineOfSessionKey(key)),
      }),
    [offered, hydrated, arrangement, selectedSessionKey, layout, chooser, carried, activeSlot, tabs, machines],
  );
  const { display, store } = resolution;
  const active = display.kind === 'panes' ? display.active : null;
  // The session pane beside the selected session's, when both slots are session panes.
  const paneSessionKey =
    display.kind === 'panes'
      ? (display.slots.find(
          (content): content is SessionContent =>
            content.kind === 'session' && content.sessionKey !== selectedSessionKey,
        )?.sessionKey ?? null)
      : null;

  // Which session pane shows its chat view (`paneChatAfter`), from the session panes on screen at the last look.
  const hasChatView = (sessionKey: string): boolean => {
    const tab = tabs.find((entry) => entry.sessionKey === sessionKey) ?? null;
    return tabChatCapable(tab, tab === null ? undefined : inventories[tab.machineId]?.summary);
  };
  const savedViews =
    display.kind === 'panes'
      ? new Map(
          display.slots
            .filter((content): content is SessionContent => content.kind === 'session')
            .map((content) => [
              content.sessionKey,
              hasChatView(content.sessionKey) &&
                (sessionViewModes[content.sessionKey] ?? preferredInterface) === 'chat',
            ]),
        )
      : null;
  const lastViews = useRef<ReadonlyMap<string, boolean> | null>(null);
  const chat = paneChatAfter({
    before: lastViews.current,
    now: savedViews,
    selectedSessionKey,
    chatSession,
    picked: pickedSession,
  });
  const chatSessionKey = display.kind === 'panes' && chat !== null && hasChatView(chat) ? chat : null;
  const viewsKey = savedViews === null ? null : JSON.stringify([...savedViews]);
  useEffect(() => {
    lastViews.current = viewsKey === null ? null : new Map(JSON.parse(viewsKey) as [string, boolean][]);
    const panes = usePaneStore.getState();
    panes.setChatSession(chat);
    // The pick came in (or was on screen already): from now on it is like any session.
    if (pickedSession !== null && pickedSession === selectedSessionKey) panes.setPickedSession(null);
  }, [viewsKey, chat, pickedSession, selectedSessionKey]);

  // What the selection changed is the layout from now on; the pane tapped last is remembered. Keyed by value: the
  // resolver builds new slot objects on every render.
  const storeKey = store === null ? null : JSON.stringify(store);
  useEffect(() => {
    if (storeKey === null) return;
    const [first, second] = JSON.parse(storeKey) as [PaneEntry, PaneEntry];
    usePaneStore.getState().showSlots(arrangement, first, second);
  }, [arrangement, storeKey]);
  useEffect(() => {
    if (active !== null) usePaneStore.getState().setActiveSlot(active);
  }, [active]);

  // What is on screen comes along when the window turns; while the panes are hidden it waits as the layout does.
  const shownFirst = display.kind === 'panes' ? paneEntryOf(display.slots[0]) : null;
  const shownSecond = display.kind === 'panes' ? paneEntryOf(display.slots[1]) : null;
  const shownKey = shownFirst !== null && shownSecond !== null ? JSON.stringify([shownFirst, shownSecond]) : null;
  const showing = offered && hydrated;
  useEffect(() => {
    if (!showing) return;
    usePaneStore
      .getState()
      .setShown(shownKey === null ? null : { arrangement, slots: JSON.parse(shownKey) as [PaneEntry, PaneEntry] });
  }, [showing, arrangement, shownKey]);

  // The terminal store keeps the second pane's terminal warm and gives it the selection when the selected tab closes.
  // Set again on every selection change too: a pick in the chooser marks the first pane's session before it selects
  // (`pickPaneSession`), and whatever the pick ends in, this is what stays marked.
  useEffect(() => {
    useTerminalStore.getState().setPaneSessionKey(paneSessionKey);
  }, [paneSessionKey, selectedSessionKey]);
  useEffect(() => () => useTerminalStore.getState().setPaneSessionKey(null), []);

  // A stored pane whose session has no tab yet (after a restart) is attached again, once, beside the selection.
  const restored = useRef(new Set<string>());
  useEffect(() => {
    if (paneSessionKey === null || restored.current.has(paneSessionKey)) return;
    if (useTerminalStore.getState().tabs.some((tab) => tab.sessionKey === paneSessionKey)) return;
    const machine = machineTargetFor(machineOfSessionKey(paneSessionKey));
    if (machine === null) return;
    restored.current.add(paneSessionKey);
    const sessionId = paneSessionKey.slice(paneSessionKey.indexOf(':') + 1);
    const summary = useInventoryStore.getState().inventoriesByMachineId[machine.id]?.summary;
    const record = summary?.sessions.find((entry) => entry.sessionId === sessionId);
    void useTerminalStore
      .getState()
      .attachSession(
        machine,
        {
          sessionId,
          ...(record !== undefined && record.projectId.length > 0 ? { projectId: record.projectId } : {}),
          ...(record !== undefined && record.displayTitle.length > 0 ? { title: record.displayTitle } : {}),
        },
        { select: false },
      )
      .catch(() => {
        // The pane shows the failure with Retry (`TerminalStateOverlay`).
      });
  }, [paneSessionKey]);

  // The chooser belongs to the window shape and the slots it was opened in.
  useEffect(() => {
    if (chooser !== null && (!offered || chooser.arrangement !== arrangement)) {
      usePaneStore.getState().closeChooser();
    }
  }, [chooser, offered, arrangement]);

  const openChooser = useCallback(() => {
    if (selectedSessionKey !== null)
      usePaneStore.getState().openChooser({ arrangement, firstSessionKey: selectedSessionKey });
  }, [arrangement, selectedSessionKey]);

  const closeSlot = useCallback(
    (slot: PaneIndex) => {
      if (display.kind !== 'panes') return;
      const panes = usePaneStore.getState();
      if (display.slots[slot].kind === 'chooser') {
        panes.closeChooser();
        return;
      }
      // One pane again: the screen shows the selected session, so beside a pane without a terminal the session pane
      // stays whichever of the two closes.
      panes.closePanes(arrangement);
      // The pane that stays takes the keyboard and the pad.
      const staying = display.slots[slot === 0 ? 1 : 0];
      if (slot === display.active && staying.kind === 'session') {
        useTerminalStore.getState().selectTab(staying.sessionKey, { scrollToBottom: false });
      }
    },
    [arrangement, display],
  );

  const setSlotType = useCallback(
    (slot: PaneIndex, type: SettablePaneType) => {
      const terminal = useTerminalStore.getState();
      const selected = terminal.selectedSessionKey;
      if (display.kind !== 'panes' || selected === null) return;
      const current = display.slots[slot];
      const beside = display.slots[slot === 0 ? 1 : 0];
      if (current.kind === type || beside.kind === 'chooser') return;
      const panes = usePaneStore.getState();
      if (type === 'session') {
        // The chooser in this slot, beside the session pane; the session picked there fills it.
        if (current.kind !== 'chooser' && beside.kind === 'session') {
          panes.openChooser({ arrangement, firstSessionKey: beside.sessionKey, slot });
        }
        return;
      }
      if (current.kind === 'session' && beside.kind !== 'session') return;
      const origin = current.kind === 'session' ? current.sessionKey : selected;
      const content: PaneContent =
        type === 'files' || type === 'git' || type === 'usage' ? { kind: type, origin } : { kind: type };
      const entry = paneEntryOf(content);
      const besideEntry = paneEntryOf(beside);
      if (entry === null || besideEntry === null) return;
      // The selection stays a shown session's: it moves to the session pane beside before this one changes.
      if (current.kind === 'session' && current.sessionKey === selected && beside.kind === 'session') {
        terminal.selectTab(beside.sessionKey, { scrollToBottom: false });
      }
      if (slot === 0) panes.showSlots(arrangement, entry, besideEntry);
      else panes.showSlots(arrangement, besideEntry, entry);
      panes.setActiveSlot(slot);
    },
    [arrangement, display],
  );

  // Files and Git changes come from the slot's own session, or else the selected one (`setSlotType`).
  const selectedProjectOffered = usePaneProjectOffered(selectedSessionKey);
  const besideProjectOffered = usePaneProjectOffered(paneSessionKey);
  const typeOffered = useCallback(
    (slot: PaneIndex, type: SettablePaneType): boolean => {
      if (display.kind !== 'panes') return false;
      const current = display.slots[slot];
      const beside = display.slots[slot === 0 ? 1 : 0];
      if (current.kind === type) return true;
      if (beside.kind === 'chooser') return false;
      if (current.kind === 'session' && beside.kind !== 'session') return false;
      if (type === 'session') return current.kind !== 'chooser' && beside.kind === 'session';
      if (!AVAILABLE_PANE_TYPES.some((definition) => definition.type === type && definition.needsProject)) return true;
      const origin = current.kind === 'session' ? current.sessionKey : selectedSessionKey;
      return origin === selectedSessionKey ? selectedProjectOffered : besideProjectOffered;
    },
    [besideProjectOffered, display, selectedProjectOffered, selectedSessionKey],
  );

  const swap = useCallback(() => usePaneStore.getState().swap(arrangement), [arrangement]);
  const setRatio = useCallback(
    (ratio: number) => usePaneStore.getState().setDividerRatio(arrangement, ratio),
    [arrangement],
  );
  const setChatSession = useCallback((sessionKey: string | null) => {
    usePaneStore.getState().setChatSession(sessionKey);
  }, []);

  return {
    display,
    ratio: layout?.dividerRatio ?? DEFAULT_DIVIDER_RATIO,
    paneSessionKey,
    chatSessionKey,
    setChatSession,
    openChooser,
    closeSlot,
    swap,
    setRatio,
    setSlotType,
    typeOffered,
  };
}
