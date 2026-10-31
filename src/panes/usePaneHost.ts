/**
 * The pane host's state for the terminal screen: what it shows (`resolve.ts`), kept in step with the stores. It
 * stores a layout the selection changed, remembers the pane tapped last and the panes on screen (they come along when
 * the window turns into a shape with nothing stored), tells the terminal store which session the second pane shows
 * (eviction keeps it, a closing selected tab hands it the selection), attaches a stored pane's session again after a
 * restart without changing the selection, and closes the chooser when the window changes.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';

import { machineTargetFor } from '../screens/terminal-screen/session-lookups';
import { useInventoryStore } from '../inventory/store';
import { useMachinesStore } from '../machines/store';
import { useTerminalStore } from '../terminal/sessions';
import type { PaneIndex } from './geometry';
import type { PaneArrangement } from './layout';
import { DEFAULT_DIVIDER_RATIO } from './divider';
import { resolvePanes, type PaneDisplay } from './resolve';
import { usePaneStore } from './store';

export type PaneHostInput = {
  /** The window has pane slots and the selected tab is an agent session shown as a terminal. */
  offered: boolean;
  arrangement: PaneArrangement;
};

export type PaneHost = {
  display: PaneDisplay;
  /** The divider's stored position for the window's shape. */
  ratio: number;
  /** The session the second pane shows beside the active one, or null. */
  paneSessionKey: string | null;
  /** Panes in the header: the chooser in a second slot beside the selected session. */
  openChooser: () => void;
  /** A pane's close button (the Panes button closes the second): one pane again, the other one staying. */
  closeSlot: (slot: PaneIndex) => void;
  swap: () => void;
  setRatio: (ratio: number) => void;
};

function machineOf(sessionKey: string): string {
  return sessionKey.slice(0, sessionKey.indexOf(':'));
}

export function usePaneHost({ offered, arrangement }: PaneHostInput): PaneHost {
  const tabs = useTerminalStore((state) => state.tabs);
  const selectedSessionKey = useTerminalStore((state) => state.selectedSessionKey);
  const machines = useMachinesStore((state) => state.machines);
  const layout = usePaneStore((state) => state.document.layouts[arrangement]);
  const chooser = usePaneStore((state) => state.chooser);
  const activeSlot = usePaneStore((state) => state.activeSlot);
  const hydrated = usePaneStore((state) => state.hydrated);
  const shown = usePaneStore((state) => state.shown);
  // The window turned: the panes last on screen in the other shape come along where nothing is stored for this one.
  const carried = shown !== null && shown.arrangement !== arrangement ? shown.sessions : null;

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
        isKnown: (key) => machines.some((machine) => machine.id === machineOf(key)),
      }),
    [offered, hydrated, arrangement, selectedSessionKey, layout, chooser, carried, activeSlot, tabs, machines],
  );
  const { display, store } = resolution;
  const active = display.kind === 'panes' ? display.active : null;
  const other = display.kind === 'panes' ? display.slots[active === 0 ? 1 : 0] : null;
  const paneSessionKey = other?.kind === 'session' ? other.sessionKey : null;

  // What the selection changed is the layout from now on; the pane tapped last is remembered.
  const storeFirst = store?.[0] ?? null;
  const storeSecond = store?.[1] ?? null;
  useEffect(() => {
    if (storeFirst !== null && storeSecond !== null) {
      usePaneStore.getState().showSessions(arrangement, storeFirst, storeSecond);
    }
  }, [arrangement, storeFirst, storeSecond]);
  useEffect(() => {
    if (active !== null) usePaneStore.getState().setActiveSlot(active);
  }, [active]);

  // What is on screen comes along when the window turns; while the panes are hidden it waits as the layout does.
  const shownFirst =
    display.kind === 'panes' && display.slots[0].kind === 'session' ? display.slots[0].sessionKey : null;
  const shownSecond =
    display.kind === 'panes' && display.slots[1].kind === 'session' ? display.slots[1].sessionKey : null;
  const showing = offered && hydrated;
  useEffect(() => {
    if (!showing) return;
    usePaneStore
      .getState()
      .setShown(
        shownFirst !== null && shownSecond !== null ? { arrangement, sessions: [shownFirst, shownSecond] } : null,
      );
  }, [showing, arrangement, shownFirst, shownSecond]);

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
    const machine = machineTargetFor(machineOf(paneSessionKey));
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
      panes.closePanes(arrangement);
      // The pane that stays takes the keyboard and the pad.
      const staying = display.slots[slot === 0 ? 1 : 0];
      if (slot === display.active && staying.kind === 'session') {
        useTerminalStore.getState().selectTab(staying.sessionKey, { scrollToBottom: false });
      }
    },
    [arrangement, display],
  );

  const swap = useCallback(() => usePaneStore.getState().swap(arrangement), [arrangement]);
  const setRatio = useCallback(
    (ratio: number) => usePaneStore.getState().setDividerRatio(arrangement, ratio),
    [arrangement],
  );

  return {
    display,
    ratio: layout?.dividerRatio ?? DEFAULT_DIVIDER_RATIO,
    paneSessionKey,
    openChooser,
    closeSlot,
    swap,
    setRatio,
  };
}
