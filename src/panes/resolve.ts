/**
 * What the pane host shows now, from the stored layout of the window's shape, the chooser and the selection. The
 * selected session is a session pane's: the keyboard, the pad keys, the text editor and Upload already go to the
 * selected terminal, so they reach it without a routing of their own. Two panes always include a session pane.
 * - Selecting the session of the other session pane moves the focus there; one session is never shown in two panes
 *   (its terminal can be in one place only).
 * - Selecting any other session puts it into the active pane when that is a session pane, else into the session pane,
 *   as the tab strip does with one pane; that pane becomes the active one.
 * - A browser, files, Git changes, agents, attention list or usage pane tapped last stays the active one while the
 *   selection stays in the session pane beside it. Selecting sessions never changes what such a pane shows: files and
 *   Git changes keep the project of the session they were opened from, usage that session's computer, the browser and
 *   the agents pane show the selected session's computer, the attention list every computer.
 * - While the chooser is open, the session selected next fills its slot.
 * - When the window turns into a shape with nothing stored for it, the two panes on screen before come along into its
 *   slots (the divider in the middle) and are stored for it, rather than one pane.
 * Free of React Native, so it loads in a plain `bun test`.
 */

import type { PaneIndex } from './geometry';
import type { PaneArrangement, PaneLayout, PaneSlot } from './layout';
import type { PaneChooser } from './store';

export type PaneContent =
  | { readonly kind: 'session'; readonly sessionKey: string }
  | { readonly kind: 'chooser' }
  | { readonly kind: 'browser' }
  /** `origin`: the session the pane was opened from (`machineId:sessionId`), whose project it shows. */
  | { readonly kind: 'files'; readonly origin: string }
  | { readonly kind: 'git'; readonly origin: string }
  | { readonly kind: 'agents' }
  | { readonly kind: 'attention' }
  /** `origin`: the session the pane was opened from, whose computer's usage it shows. */
  | { readonly kind: 'usage'; readonly origin: string };

/** What a slot stores: a session pane by its session's key, any other pane as its stored slot. */
export type PaneEntry = string | PaneSlot;

export type PaneDisplay =
  | { readonly kind: 'single' }
  | {
      readonly kind: 'panes';
      readonly slots: readonly [PaneContent, PaneContent];
      readonly active: PaneIndex;
    };

export type PaneResolution = {
  readonly display: PaneDisplay;
  /** The two panes the stored layout must now hold (first, second), or null when it holds them already. */
  readonly store: readonly [PaneEntry, PaneEntry] | null;
};

export type PaneResolveInput = {
  /** The window has pane slots and the selected tab is an agent session shown as a terminal. */
  readonly offered: boolean;
  readonly arrangement: PaneArrangement;
  readonly selectedSessionKey: string | null;
  readonly layout: PaneLayout | undefined;
  readonly chooser: PaneChooser | null;
  /** The two panes (first, second) on screen in the other window shape just before the window turned. */
  readonly carried: readonly [PaneEntry, PaneEntry] | null;
  /** The pane tapped last; null before any was since the app started. */
  readonly activeSlot: PaneIndex | null;
  /** A tab is open for the session. */
  readonly isOpen: (sessionKey: string) => boolean;
  /** The session's computer is one the app knows, so a stored pane can be attached again. */
  readonly isKnown: (sessionKey: string) => boolean;
};

type Slots = readonly [PaneContent, PaneContent];

const SINGLE: PaneResolution = { display: { kind: 'single' }, store: null };
const BROWSER: PaneContent = { kind: 'browser' };
const AGENTS: PaneContent = { kind: 'agents' };
const ATTENTION: PaneContent = { kind: 'attention' };
const CHOOSER: PaneContent = { kind: 'chooser' };

function session(sessionKey: string): PaneContent {
  return { kind: 'session', sessionKey };
}

/** The computer of a session key (`machineId:sessionId`), as a usage pane names it from its origin. */
export function machineOfSessionKey(sessionKey: string): string {
  return sessionKey.slice(0, sessionKey.indexOf(':'));
}

/** A stored slot's content, or null for one this build cannot show (files, Git changes or usage without origin). */
export function paneContentOf(entry: PaneEntry): PaneContent | null {
  if (typeof entry === 'string') return session(entry);
  switch (entry.paneType) {
    case 'session':
      return entry.sessionKey === undefined ? null : session(entry.sessionKey);
    case 'browser':
      return BROWSER;
    case 'agents':
      return AGENTS;
    case 'attention':
      return ATTENTION;
    case 'files':
    case 'git':
    case 'usage':
      return entry.sessionKey === undefined ? null : { kind: entry.paneType, origin: entry.sessionKey };
  }
}

/** What a slot's content is stored as; null for the chooser, which is never stored. */
export function paneEntryOf(content: PaneContent): PaneEntry | null {
  switch (content.kind) {
    case 'session':
      return content.sessionKey;
    case 'browser':
    case 'agents':
    case 'attention':
      return { paneType: content.kind };
    case 'files':
    case 'git':
    case 'usage':
      return { paneType: content.kind, sessionKey: content.origin };
    case 'chooser':
      return null;
  }
}

/** The stored slot an entry stands for. */
export function paneSlotOf(entry: PaneEntry): PaneSlot {
  return typeof entry === 'string' ? { paneType: 'session', sessionKey: entry } : entry;
}

export function resolvePanes(input: PaneResolveInput): PaneResolution {
  const { offered, arrangement, selectedSessionKey: selected, layout, chooser, carried } = input;
  if (!offered || selected === null) return SINGLE;

  if (layout === undefined && carried !== null) {
    const contents = carried.map(paneContentOf);
    if (contents[0] === null || contents[1] === null) return SINGLE;
    return showSlots(input, selected, [contents[0], contents[1]], true);
  }

  if (layout === undefined) {
    if (chooser === null || chooser.arrangement !== arrangement || !input.isOpen(chooser.firstSessionKey)) {
      return SINGLE;
    }
    if (selected === chooser.firstSessionKey) {
      return { display: { kind: 'panes', slots: [session(selected), CHOOSER], active: 0 }, store: null };
    }
    return {
      display: { kind: 'panes', slots: [session(chooser.firstSessionKey), session(selected)], active: 1 },
      store: [chooser.firstSessionKey, selected],
    };
  }

  const first = paneContentOf(layout.first);
  const second = paneContentOf(layout.second);
  // A stored pane this build cannot show leaves one pane.
  if (first === null || second === null) return SINGLE;
  if (chooser?.slot !== undefined && chooser.arrangement === arrangement) {
    return chooserInSlot(input, selected, [first, second], chooser.slot);
  }
  return showSlots(input, selected, [first, second], false);
}

function showable(input: PaneResolveInput, content: PaneContent): boolean {
  switch (content.kind) {
    case 'session':
      return input.isOpen(content.sessionKey) || input.isKnown(content.sessionKey);
    case 'files':
    case 'git':
    case 'usage':
      return input.isKnown(content.origin);
    case 'browser':
    case 'agents':
    case 'attention':
    case 'chooser':
      return true;
  }
}

/** What the stored layout holds for these slots; the chooser is never among them. */
function entries([first, second]: Slots): readonly [PaneEntry, PaneEntry] {
  const stored = [paneEntryOf(first), paneEntryOf(second)] as const;
  if (stored[0] === null || stored[1] === null) throw new Error('The chooser is never stored as a pane.');
  return [stored[0], stored[1]];
}

function replaced(slots: Slots, slot: PaneIndex, content: PaneContent): Slots {
  return slot === 0 ? [content, slots[1]] : [slots[0], content];
}

/** Two panes, the selected session in a session pane; `unstored` stores them even when nothing changed. */
function showSlots(input: PaneResolveInput, selected: string, slots: Slots, unstored: boolean): PaneResolution {
  if (!slots.every((content) => showable(input, content))) return SINGLE;
  const sessionSlots = ([0, 1] as const).filter((slot) => slots[slot].kind === 'session');
  if (sessionSlots.length === 0) return SINGLE;
  const { activeSlot } = input;
  const tappedOther = activeSlot !== null && slots[activeSlot].kind !== 'session';

  const showing = sessionSlots.find((slot) => {
    const content = slots[slot];
    return content.kind === 'session' && content.sessionKey === selected;
  });
  if (showing !== undefined) {
    return {
      display: { kind: 'panes', slots, active: tappedOther ? activeSlot : showing },
      store: unstored ? entries(slots) : null,
    };
  }
  const target = activeSlot !== null && !tappedOther ? activeSlot : sessionSlots[0];
  const next = replaced(slots, target, session(selected));
  return { display: { kind: 'panes', slots: next, active: target }, store: entries(next) };
}

/** The chooser in place of a stored pane, beside the session pane, which keeps the selection until a pick. */
function chooserInSlot(input: PaneResolveInput, selected: string, slots: Slots, slot: PaneIndex): PaneResolution {
  const beside: PaneIndex = slot === 0 ? 1 : 0;
  const besideContent = slots[beside];
  if (besideContent.kind !== 'session' || !showable(input, besideContent)) return SINGLE;
  if (selected === besideContent.sessionKey) {
    return { display: { kind: 'panes', slots: replaced(slots, slot, CHOOSER), active: beside }, store: null };
  }
  const next = replaced(slots, slot, session(selected));
  return { display: { kind: 'panes', slots: next, active: slot }, store: entries(next) };
}
