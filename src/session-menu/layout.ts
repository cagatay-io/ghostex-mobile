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
 * CDXC:ContextMenus 2026-11-20 WHY: a menu never waits on the core and never lacks its rows. Until the core has
 * answered (a page still starting, an old page without the call, one that crashed or did not answer within
 * `CORE_TIMEOUT_MS`), the menus use the copy bundled with this code (layout.generated.json, written from the same
 * gx-core function by scripts/generate-session-menu-layout.mjs; the release fails on a stale one), so Close, Kill
 * Session, Disconnect and Settings are always there. The core's own answer replaces it as soon as it arrives.
 */

import { useEffect, useSyncExternalStore } from 'react';

import { logAppEvent } from '../app/appLog';
import { wasmCoreBridge } from '../chat/rust/wasm-core/bridge';
import BUNDLED_LAYOUT_JSON from './layout.generated.json';

/**
 * Where a menu opens: a session's (gx-core `SessionMenuSpot`), or a project's (`ProjectMenuSpot`: `project` is the
 * desktop's, `phoneProject` the phone's project header menu).
 */
export type SessionMenuSpot =
  | 'sidebar'
  | 'chatBox'
  | 'phoneRow'
  | 'phoneChat'
  | 'phoneTerminal'
  | 'project'
  | 'phoneProject';

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

/** One place in a spot's layout. A `submenu` (the project menu's Copy and Organise) is named by its entry. */
export type SessionMenuNode =
  | { tiles: string[] }
  | { row: string }
  | { separator: true }
  | { more: SessionMenuNode[] }
  | { submenu: string; rows: SessionMenuNode[] };

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
  /** The More submenu, or a named one (only called with at least one row). */
  more(label: string, icon: string, items: T[]): T;
  isSeparator(item: T): boolean;
};

/** How long a request for the layout waits on the core before the bundled copy stands in. */
const CORE_TIMEOUT_MS = 5_000;
/** After a failed request, the next menu that draws asks the core again at most this often. */
const RETRY_AFTER_MS = 30_000;

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

/** The copy bundled with this code, for whenever the core has not answered. */
const BUNDLED_LAYOUT: SessionMenuLayout = parseLayout(BUNDLED_LAYOUT_JSON);

type LayoutState = {
  /** The core's answer, once it came. */
  core: SessionMenuLayout | null;
  /** When the last request failed, so menus drawing again do not ask in a tight loop. */
  failedAt: number;
  loading: Promise<SessionMenuLayout> | null;
};

let state: LayoutState = { core: null, failedAt: 0, loading: null };
const listeners = new Set<() => void>();

function setState(next: LayoutState): void {
  state = next;
  for (const listener of [...listeners]) listener();
}

/**
 * Asks the chat core for the layout (once it has answered, its answer is kept for the app's life: it only changes with
 * the update that carries the core). Resolves with the core's answer, or with the bundled copy when the core fails or
 * does not answer within `CORE_TIMEOUT_MS`; never rejects.
 */
export function loadSessionMenuLayout(): Promise<SessionMenuLayout> {
  if (state.core !== null) return Promise.resolve(state.core);
  if (state.loading !== null) return state.loading;
  const loading = wasmCoreBridge
    .call({ op: 'sessionMenuLayout' }, { timeoutMs: CORE_TIMEOUT_MS })
    .then((answer) => {
      const core = parseLayout(answer);
      setState({ core, failedAt: 0, loading: null });
      return core;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      logAppEvent(`Session menus: using the bundled list (${message}).`);
      setState({ core: null, failedAt: Date.now(), loading: null });
      return BUNDLED_LAYOUT;
    });
  setState({ ...state, loading });
  return loading;
}

/** Asks the core again unless it has answered, a request is on its way, or the last one failed a moment ago. */
function retrySessionMenuLayout(): void {
  if (state.core !== null || state.loading !== null) return;
  if (state.failedAt > 0 && Date.now() - state.failedAt < RETRY_AFTER_MS) return;
  void loadSessionMenuLayout();
}

/** The layout to draw now: the core's answer, else the bundled copy (asking the core again, outside the caller). */
export function sessionMenuLayoutNow(): SessionMenuLayout {
  if (state.core !== null) return state.core;
  setTimeout(retrySessionMenuLayout, 0);
  return BUNDLED_LAYOUT;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = (): LayoutState => state;

/** The layout for a component that draws a session menu, drawn again when the core's answer replaces the bundled copy. */
export function useSessionMenuLayout(): SessionMenuLayout {
  const current = useSyncExternalStore(subscribe, snapshot);
  useEffect(() => {
    if (current.core === null) retrySessionMenuLayout();
  }, [current]);
  return current.core ?? BUNDLED_LAYOUT;
}

/**
 * A row of the list, from the bundled copy when an older core's list lacks it (the project menu's rows came after
 * the session menu's), so a newer phone page never draws a row by its id.
 */
function entryOf(layout: SessionMenuLayout, id: string): SessionMenuEntry | undefined {
  return layout.entries[id] ?? BUNDLED_LAYOUT.entries[id];
}

/** A row's one name (its reverse, `altLabel`, for a toggle that is on: Unpin, Wake…). */
export function entryLabel(layout: SessionMenuLayout, id: string, alt = false): string {
  const entry = entryOf(layout, id);
  if (entry === undefined) return id;
  return alt ? (entry.altLabel ?? entry.label) : entry.label;
}

/** A row's icon id (`titlebar/<id>.svg` on the desktop). */
export function entryIcon(layout: SessionMenuLayout, id: string, alt = false): string {
  const entry = entryOf(layout, id);
  if (entry === undefined) return '';
  return alt ? (entry.altIcon ?? entry.icon) : entry.icon;
}

/** Whether a row is red (Close, Close Below, Kill Session, Disconnect). */
export function entryDanger(layout: SessionMenuLayout, id: string): boolean {
  return entryOf(layout, id)?.danger === true;
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
 * A spot's menu from its layout (gx-core `assemble_menu`): `fill` answers each row id with the rows the spot shows
 * for it right now (none, one, or a block such as a coordinator's). Tiles become one quick row of the filled tiles,
 * More and a named submenu one submenu each of its filled rows (a named submenu left with one row shows that row
 * instead); any of them is left out when empty, and stray lines are dropped. A spot an older core's list lacks comes
 * from the bundled copy.
 */
export function assembleSessionMenu<T>(
  layout: SessionMenuLayout,
  spot: SessionMenuSpot,
  fill: (id: string) => T[],
  make: SessionMenuMake<T>,
): T[] {
  const rowsOf = (children: SessionMenuNode[]): T[] =>
    tidySeparators(
      children.flatMap((child) => ('row' in child ? fill(child.row) : [make.separator()])),
      make.isSeparator,
    );
  const place = (node: SessionMenuNode): T[] => {
    if ('row' in node) return fill(node.row);
    if ('tiles' in node) {
      const tiles = node.tiles.flatMap((id) => fill(id));
      return tiles.length === 0 ? [] : [make.tiles(tiles)];
    }
    if ('more' in node) {
      const rows = rowsOf(node.more);
      return rows.length === 0 ? [] : [make.more(layout.more.label, layout.more.icon, rows)];
    }
    if ('submenu' in node) {
      const rows = rowsOf(node.rows);
      if (rows.length <= 1) return rows;
      return [make.more(entryLabel(layout, node.submenu), entryIcon(layout, node.submenu), rows)];
    }
    return [make.separator()];
  };
  const nodes = layout.spots[spot] ?? BUNDLED_LAYOUT.spots[spot] ?? [];
  return tidySeparators(nodes.flatMap(place), make.isSeparator);
}
