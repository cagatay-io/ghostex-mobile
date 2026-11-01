/**
 * The stored pane layout, version 1: per window shape (`stacked` upright, `sideBySide` across and half folded like a
 * laptop) the pane type of each slot, the session a pane is bound to and the divider's position. A session pane's
 * session is the one it shows; a files or Git changes pane's is the session it was opened from, whose project it keeps,
 * and a usage pane's the session whose computer it keeps; a browser, agents or attention list pane has none. Only a
 * manual divider drag writes the position; the layout the keyboard rules give is never stored. The reader is the
 * trust boundary for what storage hands back: anything that is not exactly this shape, or that would show one session
 * in two session panes (a terminal can be shown in one place only), is discarded as a whole and one pane is used.
 * Free of React Native, so it loads in a plain `bun test`.
 */

import { isRecord } from '../docs/entries';
import { MAX_DIVIDER_RATIO, MIN_DIVIDER_RATIO } from './divider';

export const PANE_LAYOUT_VERSION = 1;

/** Every pane type the layout can name. What this build can show is the type registry's (`paneTypes.tsx`). */
export const PANE_TYPES = ['browser', 'session', 'files', 'agents', 'git', 'attention', 'usage'] as const;
export type PaneType = (typeof PANE_TYPES)[number];

export type PaneArrangement = 'stacked' | 'sideBySide';

export type PaneSlot = {
  readonly paneType: PaneType;
  /**
   * `machineId:sessionId`; set for session panes, and for files, Git changes and usage panes the session they came
   * from.
   */
  readonly sessionKey?: string;
};

export type PaneLayout = {
  readonly first: PaneSlot;
  readonly second: PaneSlot;
  /** The first slot's share of the pane container, 0.25 to 0.75. */
  readonly dividerRatio: number;
};

export type PaneLayoutDocument = {
  readonly schemaVersion: typeof PANE_LAYOUT_VERSION;
  readonly layouts: Readonly<Partial<Record<PaneArrangement, PaneLayout>>>;
};

/** Nothing stored, or nothing usable: one pane in every window shape. */
export const SINGLE_PANE_DOCUMENT: PaneLayoutDocument = Object.freeze({
  schemaVersion: PANE_LAYOUT_VERSION,
  layouts: Object.freeze({}),
});

const SESSION_KEY = /^[^:]+:[^:]+$/;

/** The contract allows no other fields at any level. */
function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function parseSlot(value: unknown): PaneSlot | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ['paneType', 'sessionKey'])) return null;
  const { paneType, sessionKey } = value;
  if (!PANE_TYPES.includes(paneType as PaneType)) return null;
  if (sessionKey === undefined) return paneType === 'session' ? null : { paneType: paneType as PaneType };
  if (typeof sessionKey !== 'string' || !SESSION_KEY.test(sessionKey)) return null;
  return { paneType: paneType as PaneType, sessionKey };
}

function parseLayout(value: unknown): PaneLayout | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ['first', 'second', 'dividerRatio'])) return null;
  const first = parseSlot(value.first);
  const second = parseSlot(value.second);
  const { dividerRatio } = value;
  if (first === null || second === null) return null;
  if (typeof dividerRatio !== 'number' || dividerRatio < MIN_DIVIDER_RATIO || dividerRatio > MAX_DIVIDER_RATIO) {
    return null;
  }
  if (first.paneType === 'session' && second.paneType === 'session' && first.sessionKey === second.sessionKey) {
    return null;
  }
  return { first, second, dividerRatio };
}

/** The stored value as the pane host may use it; `SINGLE_PANE_DOCUMENT` for anything else. */
export function parsePaneLayoutDocument(value: unknown): PaneLayoutDocument {
  if (!isRecord(value) || !hasOnlyKeys(value, ['schemaVersion', 'layouts'])) return SINGLE_PANE_DOCUMENT;
  if (value.schemaVersion !== PANE_LAYOUT_VERSION || !isRecord(value.layouts)) return SINGLE_PANE_DOCUMENT;
  if (!hasOnlyKeys(value.layouts, ['stacked', 'sideBySide'])) return SINGLE_PANE_DOCUMENT;
  const layouts: Partial<Record<PaneArrangement, PaneLayout>> = {};
  for (const arrangement of ['stacked', 'sideBySide'] as const) {
    const stored = value.layouts[arrangement];
    if (stored === undefined) continue;
    const layout = parseLayout(stored);
    if (layout === null) return SINGLE_PANE_DOCUMENT;
    layouts[arrangement] = layout;
  }
  return { schemaVersion: PANE_LAYOUT_VERSION, layouts };
}

/** One line for the development build's debug row: each slot's type and session, then the divider in percent. */
export function paneLayoutSummary(layout: PaneLayout | undefined): string {
  if (layout === undefined) return 'One pane';
  const slot = (entry: PaneSlot) =>
    entry.sessionKey === undefined ? entry.paneType : `${entry.paneType} ${entry.sessionKey}`;
  return `${slot(layout.first)} | ${slot(layout.second)} | ${Math.round(layout.dividerRatio * 100)} %`;
}
