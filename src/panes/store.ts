/**
 * The pane layouts (`layout.ts`), persisted to AsyncStorage as the other preference stores are, and what the pane host
 * keeps while the app runs: which pane was tapped last, which slot shows the chooser and the browser pane's page.
 *
 * A session pane lives as long as its session's tab: a tab that closes (closed, killed, slept, evicted at the warm
 * terminal limit) ends every layout whose session pane shows it, so a pane never stands on a terminal that is gone. A
 * files or Git changes pane only came from a session; that session's tab closing leaves it. After a
 * restart no tab is open yet; the pane host attaches the stored sessions again (`usePaneHost`).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { useMachinesStore } from '../machines/store';
import type { RootStackParamList } from '../navigation/types';
import { useTerminalStore } from '../terminal/sessions';
import { clampDividerRatio, DEFAULT_DIVIDER_RATIO } from './divider';
import type { PaneIndex } from './geometry';
import {
  parsePaneLayoutDocument,
  SINGLE_PANE_DOCUMENT,
  type PaneArrangement,
  type PaneLayout,
  type PaneLayoutDocument,
  type PaneSlot,
} from './layout';
import { paneSlotOf, type PaneEntry } from './resolve';

export const PANE_LAYOUT_STORAGE_KEY = 'panes.layout.v1';

/**
 * A slot shows the chooser beside the session that was on screen when it opened: the second slot right after Panes
 * (`slot` absent, nothing stored yet), or the slot of a stored pane whose type was set to Session (`slot`).
 */
export type PaneChooser = {
  readonly arrangement: PaneArrangement;
  readonly firstSessionKey: string;
  readonly slot?: PaneIndex;
};

/** The two panes on screen (first, second) and the window shape they stand in. */
export type PanesShown = { readonly arrangement: PaneArrangement; readonly slots: readonly [PaneEntry, PaneEntry] };

/** The page a browser pane shows, as the full-screen Web Preview opens it. */
export type BrowserPage = RootStackParamList['WebPreview'];

type PaneState = {
  hydrated: boolean;
  document: PaneLayoutDocument;
  /** The pane tapped last, null before any was since the app started; not stored. */
  activeSlot: PaneIndex | null;
  chooser: PaneChooser | null;
  /**
   * The two panes last on screen, kept while the panes are hidden (folded, the chat view, a shell tab); they come
   * along when the window turns into a shape with nothing stored for it. Not stored.
   */
  shown: PanesShown | null;
  /** The browser pane's computer and page (null at the Web Preview's start); not stored (the layout has no page). */
  browserPage: { readonly machineId: string; readonly page: BrowserPage | null } | null;

  hydrate: () => Promise<void>;
  openChooser: (chooser: PaneChooser) => void;
  closeChooser: () => void;
  setActiveSlot: (slot: PaneIndex) => void;
  setShown: (shown: PanesShown | null) => void;
  /** Two session panes in `arrangement`, the divider where it was last for that shape, or in the middle. */
  showSessions: (arrangement: PaneArrangement, first: string, second: string) => void;
  /** Two panes in `arrangement` (a session's key for a session pane), the divider as `showSessions` has it. */
  showSlots: (arrangement: PaneArrangement, first: PaneEntry, second: PaneEntry) => void;
  /** Swaps the two panes; the active one moves with its content. */
  swap: (arrangement: PaneArrangement) => void;
  setDividerRatio: (arrangement: PaneArrangement, ratio: number) => void;
  /** One pane again in `arrangement`. */
  closePanes: (arrangement: PaneArrangement) => void;
  /** Ends every layout whose session pane shows this session. */
  forgetSession: (sessionKey: string) => void;
  setBrowserPage: (browserPage: PaneState['browserPage']) => void;
};

export const usePaneStore = create<PaneState>()((set, get) => {
  const persist = (document: PaneLayoutDocument): void => {
    set({ document });
    void AsyncStorage.setItem(PANE_LAYOUT_STORAGE_KEY, JSON.stringify(document));
  };

  const withLayout = (arrangement: PaneArrangement, layout: PaneLayout | undefined): PaneLayoutDocument => {
    const layouts = { ...get().document.layouts };
    if (layout === undefined) delete layouts[arrangement];
    else layouts[arrangement] = layout;
    return { ...get().document, layouts };
  };

  return {
    hydrated: false,
    document: SINGLE_PANE_DOCUMENT,
    activeSlot: null,
    chooser: null,
    shown: null,
    browserPage: null,

    hydrate: async () => {
      if (get().hydrated) return;
      let document = SINGLE_PANE_DOCUMENT;
      try {
        const raw = await AsyncStorage.getItem(PANE_LAYOUT_STORAGE_KEY);
        if (raw !== null) {
          document = parsePaneLayoutDocument(JSON.parse(raw));
          // What could not be used is discarded, not kept to be read again.
          if (document === SINGLE_PANE_DOCUMENT) await AsyncStorage.removeItem(PANE_LAYOUT_STORAGE_KEY);
        }
      } catch {
        // Unreadable storage: one pane.
      }
      set({ hydrated: true, document });
    },

    openChooser: (chooser) => set({ chooser }),
    closeChooser: () => set({ chooser: null }),
    setActiveSlot: (activeSlot) => {
      if (get().activeSlot !== activeSlot) set({ activeSlot });
    },
    setShown: (shown) => {
      const current = get().shown;
      const same =
        current === shown ||
        (current !== null &&
          shown !== null &&
          current.arrangement === shown.arrangement &&
          current.slots.every((entry, index) => {
            const other = shown.slots[index];
            return typeof entry === 'string' || typeof other === 'string'
              ? entry === other
              : entry.paneType === other.paneType && entry.sessionKey === other.sessionKey;
          }));
      if (!same) set({ shown });
    },

    showSessions: (arrangement, first, second) => get().showSlots(arrangement, first, second),

    showSlots: (arrangement, first, second) => {
      const dividerRatio = get().document.layouts[arrangement]?.dividerRatio ?? DEFAULT_DIVIDER_RATIO;
      set({ chooser: null });
      persist(withLayout(arrangement, { first: paneSlotOf(first), second: paneSlotOf(second), dividerRatio }));
    },

    swap: (arrangement) => {
      const layout = get().document.layouts[arrangement];
      if (layout === undefined) return;
      const { activeSlot } = get();
      if (activeSlot !== null) set({ activeSlot: activeSlot === 0 ? 1 : 0 });
      persist(withLayout(arrangement, { ...layout, first: layout.second, second: layout.first }));
    },

    setDividerRatio: (arrangement, ratio) => {
      const layout = get().document.layouts[arrangement];
      if (layout === undefined) return;
      persist(withLayout(arrangement, { ...layout, dividerRatio: clampDividerRatio(ratio) }));
    },

    closePanes: (arrangement) => {
      if (get().document.layouts[arrangement] === undefined) return;
      persist(withLayout(arrangement, undefined));
    },

    forgetSession: (sessionKey) => {
      const { layouts } = get().document;
      if (get().shown?.slots.includes(sessionKey) === true) set({ shown: null });
      const showsIt = (slot: PaneSlot | undefined) => slot?.paneType === 'session' && slot.sessionKey === sessionKey;
      const showing = (Object.keys(layouts) as PaneArrangement[]).filter(
        (arrangement) => showsIt(layouts[arrangement]?.first) || showsIt(layouts[arrangement]?.second),
      );
      if (showing.length === 0) return;
      const next = { ...layouts };
      for (const arrangement of showing) delete next[arrangement];
      persist({ ...get().document, layouts: next });
    },

    setBrowserPage: (browserPage) => set({ browserPage }),
  };
});

let installed = false;

/**
 * Loads the stored layouts once the saved computers are loaded and ends the panes of tabs that close. Call once at
 * app startup. The layouts name sessions by their computer's id, and the computers' load can merge two records of one
 * computer and move what was saved under the dropped id, these layouts included, to the one it keeps: read before
 * that, the store would keep the dropped id and write it back.
 */
export function initPaneLayouts(): void {
  if (installed) return;
  installed = true;
  if (useMachinesStore.getState().hydrated) void usePaneStore.getState().hydrate();
  else {
    const unsubscribe = useMachinesStore.subscribe((state) => {
      if (!state.hydrated) return;
      unsubscribe();
      void usePaneStore.getState().hydrate();
    });
  }
  useTerminalStore.subscribe((state, previous) => {
    if (state.tabs === previous.tabs) return;
    const open = new Set(state.tabs.map((tab) => tab.sessionKey));
    for (const tab of previous.tabs) {
      if (!open.has(tab.sessionKey)) usePaneStore.getState().forgetSession(tab.sessionKey);
    }
  });
}
