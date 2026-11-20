/**
 * The one session menu, as the phone reads it from its chat core: every row's one name and icon and the order each
 * spot shows them in (`gx_session_menu_layout` in packages/gx-chat-wasm, built from packages/gx-core/src/sidebar_menu/
 * layout.rs in the main repo). The phone's three session menus (the long-press on a session row, the chat's ⋯ and the
 * terminal's ⋯) fill this layout with their own rows; none of them keeps an order or a name of its own.
 *
 * CDXC:ContextMenus 2026-11-20 SEE-ALSO: packages/gx-core/src/sidebar_menu/layout.rs (the user's decision, Q4292
 * "Apply as shown", and the list itself), packages/gx-chat-wasm/src/lib.rs (the door), screens/sessions-screen/
 * sidebar-menus.ts (the long-press), chat/native/composer/menus.ts (the chat's ⋯), components/terminal/TerminalMenu.tsx
 * (the terminal's ⋯).
 *
 * CDXC:ContextMenus 2026-11-20 WHY: there is no hard-coded copy of the list to fall back on. The layout rides in the
 * same over-the-air update as this code, so a menu opened before the core answered waits for it (`useSessionMenuLayout`,
 * `loadSessionMenuLayout`) instead of drawing a second list that could drift from the desktop's.
 */

import { useEffect, useSyncExternalStore } from 'react';

import { wasmCoreBridge } from '../chat/rust/wasm-core/bridge';

/** Where a session's menu opens (gx-core `SessionMenuSpot`). */
export type SessionMenuSpot = 'sidebar' | 'chatBox' | 'phoneRow' | 'phoneChat' | 'phoneTerminal';

/** One row's name and icon, and the reverse a toggle reads (Unpin, Wake, Reopen Thread…). */
export type SessionMenuEntry = {
  label: string;
  icon: string;
  altLabel?: string;
  altIcon?: string;
  /** The hotkey catalog action whose key the row shows on the desktop. */
  hotkey?: string;
  danger?: boolean;
  /** A slot the spot draws itself (its words depend on the moment): the label and icon are empty. */
  host?: boolean;
};

/** One place in a spot's layout. */
export type SessionMenuNode = { tiles: string[] } | { row: string } | { separator: true } | { more: SessionMenuNode[] };

export type SessionMenuLayout = {
  entries: Record<string, SessionMenuEntry>;
  /** The More submenu's own row. */
  more: { label: string; icon: string };
  spots: Record<SessionMenuSpot, SessionMenuNode[]>;
};

/** How a menu's rows are made, for {@link assembleSessionMenu}. */
export type SessionMenuMake<T> = {
  separator(): T;
  /** The quick row of tiles (only called with at least one). */
  tiles(items: T[]): T;
  /** The More submenu (only called with at least one row). */
  more(label: string, icon: string, items: T[]): T;
  isSeparator(item: T): boolean;
};

type LayoutState = {
  layout: SessionMenuLayout | null;
  error: string | null;
  /** When the last ask failed, so a menu re-rendering does not ask again in a tight loop. */
  failedAt: number;
  loading: Promise<SessionMenuLayout> | null;
};

/** A failed ask is tried again by the next menu that draws, at most this often. */
const RETRY_AFTER_MS = 3_000;

let state: LayoutState = { layout: null, error: null, failedAt: 0, loading: null };
const listeners = new Set<() => void>();

function setState(next: LayoutState): void {
  state = next;
  for (const listener of [...listeners]) listener();
}

function parseLayout(value: unknown): SessionMenuLayout {
  const layout = value as Partial<SessionMenuLayout> | null;
  if (
    layout === null ||
    typeof layout !== 'object' ||
    typeof layout.entries !== 'object' ||
    layout.entries === null ||
    typeof layout.spots !== 'object' ||
    layout.spots === null ||
    typeof layout.more?.label !== 'string'
  ) {
    throw new Error('The chat core answered no session menu.');
  }
  return layout as SessionMenuLayout;
}

/**
 * The layout, asked of the chat core once and kept for the app's life (it only changes with the update that carries
 * the core). A failed ask is forgotten, so the next menu asks again.
 */
export function loadSessionMenuLayout(): Promise<SessionMenuLayout> {
  if (state.layout !== null) return Promise.resolve(state.layout);
  if (state.loading !== null) return state.loading;
  const loading = wasmCoreBridge
    .call({ op: 'sessionMenuLayout' })
    .then((answer) => {
      const layout = parseLayout(answer);
      setState({ layout, error: null, failedAt: 0, loading: null });
      return layout;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      setState({ layout: null, error: message, failedAt: Date.now(), loading: null });
      throw error instanceof Error ? error : new Error(message);
    });
  setState({ ...state, loading });
  return loading;
}

/** The layout if the core has answered, else null. */
export function sessionMenuLayoutNow(): SessionMenuLayout | null {
  return state.layout;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = (): LayoutState => state;

/**
 * The layout for a component that draws a session menu: null until the core answers (the component re-renders then),
 * with the last failure's words in `error`. Asks the core when nothing is on its way.
 */
export function useSessionMenuLayout(): { layout: SessionMenuLayout | null; error: string | null } {
  const current = useSyncExternalStore(subscribe, snapshot);
  useEffect(() => {
    if (current.layout === null && current.loading === null) retrySessionMenuLayout();
  }, [current]);
  return { layout: current.layout, error: current.error };
}

/** Asks the core unless the layout is here, on its way, or the last ask failed only a moment ago. */
export function retrySessionMenuLayout(): void {
  if (state.layout !== null || state.loading !== null) return;
  if (state.error !== null && Date.now() - state.failedAt < RETRY_AFTER_MS) return;
  void loadSessionMenuLayout().catch(() => undefined);
}

/** A row's one name (its reverse, `altLabel`, for a toggle that is on: Unpin, Wake…). */
export function entryLabel(layout: SessionMenuLayout, id: string, alt = false): string {
  const entry = layout.entries[id];
  if (entry === undefined) return id;
  return alt ? (entry.altLabel ?? entry.label) : entry.label;
}

/** A row's icon id (`titlebar/<id>.svg` on the desktop). */
export function entryIcon(layout: SessionMenuLayout, id: string, alt = false): string {
  const entry = layout.entries[id];
  if (entry === undefined) return '';
  return alt ? (entry.altIcon ?? entry.icon) : entry.icon;
}

/** Whether a row is red (Close, Close Below, Kill Session, Disconnect). */
export function entryDanger(layout: SessionMenuLayout, id: string): boolean {
  return layout.entries[id]?.danger === true;
}

/** Drops a line that would open, end or double up a list (gx-core `tidy_separators`). */
export function tidySeparators<T>(items: readonly T[], isSeparator: (item: T) => boolean): T[] {
  const out: T[] = [];
  for (const item of items) {
    if (isSeparator(item) && (out.length === 0 || isSeparator(out[out.length - 1]!))) continue;
    out.push(item);
  }
  while (out.length > 0 && isSeparator(out[out.length - 1]!)) out.pop();
  return out;
}

/**
 * A spot's menu from its layout (gx-core `assemble_session_menu`): `fill` answers each row id with the rows the spot
 * shows for it right now (none, one, or a block such as a coordinator's). Tiles become one quick row of the filled
 * tiles, More one submenu of its filled rows; either is left out when empty, and stray lines are dropped.
 */
export function assembleSessionMenu<T>(
  layout: SessionMenuLayout,
  spot: SessionMenuSpot,
  fill: (id: string) => T[],
  make: SessionMenuMake<T>,
): T[] {
  const place = (node: SessionMenuNode): T[] => {
    if ('row' in node) return fill(node.row);
    if ('tiles' in node) {
      const tiles = node.tiles.flatMap((id) => fill(id));
      return tiles.length === 0 ? [] : [make.tiles(tiles)];
    }
    if ('more' in node) {
      const rows = tidySeparators(
        node.more.flatMap((child) => ('row' in child ? fill(child.row) : [make.separator()])),
        make.isSeparator,
      );
      return rows.length === 0 ? [] : [make.more(layout.more.label, layout.more.icon, rows)];
    }
    return [make.separator()];
  };
  return tidySeparators((layout.spots[spot] ?? []).flatMap(place), make.isSeparator);
}
