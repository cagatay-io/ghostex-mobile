/**
 * What the pane host shows now, from the stored layout of the window's shape, the chooser and the selection. The
 * selected session is the active pane's: the keyboard, the pad keys, the text editor and Upload already go to the
 * selected terminal, so they reach the pane tapped last without a routing of their own.
 * - Selecting the session of the other pane moves the focus there; one session is never shown in two panes (its
 *   terminal can be in one place only).
 * - Selecting any other session puts it into the active pane, as the tab strip does with one pane.
 * - While the chooser is open, the session selected next fills the second pane.
 * - When the window turns into a shape with nothing stored for it, the two session panes on screen before come along
 *   into its slots (the divider in the middle) and are stored for it, rather than one pane.
 * Free of React Native, so it loads in a plain `bun test`.
 */

import type { PaneIndex } from './geometry';
import type { PaneArrangement, PaneLayout } from './layout';
import type { PaneChooser } from './store';

export type PaneContent = { readonly kind: 'session'; readonly sessionKey: string } | { readonly kind: 'chooser' };

export type PaneDisplay =
  | { readonly kind: 'single' }
  | {
      readonly kind: 'panes';
      readonly slots: readonly [PaneContent, PaneContent];
      readonly active: PaneIndex;
    };

export type PaneResolution = {
  readonly display: PaneDisplay;
  /** Two session panes the stored layout must now hold (first, second), or null when it holds them already. */
  readonly store: readonly [string, string] | null;
};

export type PaneResolveInput = {
  /** The window has pane slots and the selected tab is an agent session shown as a terminal. */
  readonly offered: boolean;
  readonly arrangement: PaneArrangement;
  readonly selectedSessionKey: string | null;
  readonly layout: PaneLayout | undefined;
  readonly chooser: PaneChooser | null;
  /** The two session panes (first, second) on screen in the other window shape just before the window turned. */
  readonly carried: readonly [string, string] | null;
  /** The pane tapped last. */
  readonly activeSlot: PaneIndex;
  /** A tab is open for the session. */
  readonly isOpen: (sessionKey: string) => boolean;
  /** The session's computer is one the app knows, so a stored pane can be attached again. */
  readonly isKnown: (sessionKey: string) => boolean;
};

const SINGLE: PaneResolution = { display: { kind: 'single' }, store: null };

function session(sessionKey: string): PaneContent {
  return { kind: 'session', sessionKey };
}

export function resolvePanes(input: PaneResolveInput): PaneResolution {
  const { offered, arrangement, selectedSessionKey: selected, layout, chooser, carried } = input;
  if (!offered || selected === null) return SINGLE;

  if (layout === undefined && carried !== null) return showSessions(input, selected, carried, true);

  if (layout === undefined) {
    if (chooser === null || chooser.arrangement !== arrangement || !input.isOpen(chooser.firstSessionKey)) {
      return SINGLE;
    }
    if (selected === chooser.firstSessionKey) {
      return { display: { kind: 'panes', slots: [session(selected), { kind: 'chooser' }], active: 0 }, store: null };
    }
    return {
      display: { kind: 'panes', slots: [session(chooser.firstSessionKey), session(selected)], active: 1 },
      store: [chooser.firstSessionKey, selected],
    };
  }

  const first = layout.first.paneType === 'session' ? layout.first.sessionKey : undefined;
  const second = layout.second.paneType === 'session' ? layout.second.sessionKey : undefined;
  // This build shows session panes only; a stored pane it cannot show, or cannot attach, leaves one pane.
  if (first === undefined || second === undefined) return SINGLE;
  return showSessions(input, selected, [first, second], false);
}

/** Two session panes, the selected session in the active one; `unstored` stores them even when nothing changed. */
function showSessions(
  input: PaneResolveInput,
  selected: string,
  [first, second]: readonly [string, string],
  unstored: boolean,
): PaneResolution {
  const { activeSlot } = input;
  if (![first, second].every((key) => input.isOpen(key) || input.isKnown(key))) return SINGLE;

  if (selected === first || selected === second) {
    return {
      display: { kind: 'panes', slots: [session(first), session(second)], active: selected === first ? 0 : 1 },
      store: unstored ? [first, second] : null,
    };
  }
  const keys: [string, string] = activeSlot === 0 ? [selected, second] : [first, selected];
  return { display: { kind: 'panes', slots: [session(keys[0]), session(keys[1])], active: activeSlot }, store: keys };
}
