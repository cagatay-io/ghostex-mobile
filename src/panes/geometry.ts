/**
 * Where two panes stand in the pane container (the area below the header that they share), in the container's own
 * points (y grows downwards from its top). The geometry is the approved panes mockup's: the two slots meet at the
 * divider (`dividerRatio` of the container), each pane card stands half the 12 pt gap off it, every pane has a 44 pt
 * title bar, and the body side facing the divider keeps clear of the divider handle's 44 pt touch area.
 *
 * With the keyboard (or what covers the container's bottom in its place) the rules for two panes apply, and nothing
 * of them is stored:
 * - upright, top pane active: both keep their slots and the bottom pane ends at the keyboard, down to its title bar;
 *   a top pane that would leave no room for that title bar ends above it instead;
 * - upright, bottom pane active: the divider moves up as far as the bottom pane needs to keep 240 pt;
 * - across: both panes end at the keyboard;
 * - half folded like a laptop: both panes end above the fold, where the keyboard below it does not reach them.
 * Half folded like a book (the fold down the container) the panes stay as they are and their content may run across
 * the fold, but nothing to touch stands on it: where the divider handle would, it moves beside the fold into the
 * title bars' row (no terminal's content is there, and the terminals keep their size), each title bar keeps off
 * the fold and the handle, the controls in a body other than a terminal (a toolbar, a search row, a chooser) keep off
 * the fold the same way, and the active pane's accessory (the queued prompts) stands past a fold in its body's
 * leading half.
 * A terminal keeps the size its pane has without the keyboard (its grid stays, as on the full screen); what the
 * keyboard rules take from the pane's body is what the terminal slides over (`covered`). Free of React Native.
 */

import { clampDividerRatio } from './divider';
import type { PaneArrangement } from './layout';

export const PANE_TITLE_HEIGHT = 44;
/** The gap between the two pane cards; the divider lies in it. */
export const PANE_GAP = 12;
export const PANE_HANDLE_SIZE = 44;
/** How far the divider handle's touch area reaches into a pane beyond the gap: its body keeps clear of it. */
export const PANE_HANDLE_REACH = (PANE_HANDLE_SIZE - PANE_GAP) / 2;
/** The least height of an active bottom pane above the keyboard: its title bar and 15 terminal rows at size 10. */
export const PANE_MIN_USABLE_HEIGHT = 240;
/** Half folded like a laptop, the panes end this far above the fold. */
export const PANE_FOLD_CLEARANCE = 6;

const HALF_GAP = PANE_GAP / 2;

export type PaneIndex = 0 | 1;
export type PaneRect = { x: number; y: number; width: number; height: number };
export type PaneSize = { width: number; height: number };
/** The body's distance from its card's edges besides the title bar: the side facing the divider handle. */
export type PaneBodyInset = { left: number; right: number; bottom: number };
/**
 * A title bar's, or the controls' in a body, distance from the card's or the body's left and right edge: they keep off
 * the fold (a title bar also off the handle beside it).
 */
export type PaneBarInset = { left: number; right: number };
/** A stretch across the pane container, from `start` to `end` in container points. */
export type PaneSpan = { start: number; end: number };

export type PaneGeometryInput = {
  arrangement: PaneArrangement;
  /** The pane container's size. */
  width: number;
  height: number;
  /** The stored divider position; clamped to 25-75 %. */
  ratio: number;
  /** The pane tapped last: the keyboard's, the pad's and the text editor's target. */
  active: PaneIndex;
  /**
   * Where what covers the container across its whole width begins (the keyboard, a pad layer in its place and,
   * upright, the text editor riding on it), in container points; null while nothing covers it.
   */
  coverTop: number | null;
  /** Side by side: where the text editor over the active pane begins; null while it is closed. */
  editorTop: number | null;
  /** Half folded like a laptop: where the panes end, above the fold; null in every other pose. */
  end: number | null;
  /** Half folded like a book: the fold's division down the container; null or left out in every other pose. */
  division?: PaneSpan | null;
};

export type PaneGeometry = {
  /** The two slots; they meet at the divider and share the container. */
  slots: [PaneRect, PaneRect];
  /** The pane cards drawn in the slots. */
  cards: [PaneRect, PaneRect];
  /** The gap between the cards; the handle stands in its middle unless that is on the fold (`handle`). */
  divider: PaneRect;
  /** The divider handle's touch area. */
  handle: PaneRect;
  /** The divider handle can be dragged: not while the keyboard is up. */
  handleShown: boolean;
  bodyInsets: [PaneBodyInset, PaneBodyInset];
  barInsets: [PaneBarInset, PaneBarInset];
  /**
   * Where the controls in each body keep off the fold, from the body's edges (`bodyInsets` aside); its content may run
   * across the fold. Nothing without the fold.
   */
  controlInsets: [PaneBarInset, PaneBarInset];
  /** Where the active pane's accessory (the queued prompts) starts, from its body's left edge. */
  accessoryLeft: [number, number];
  /** Each terminal's size: its pane's body without the keyboard. */
  views: [PaneSize, PaneSize];
  /** How much of each terminal's height the keyboard rules hide: what it slides over. */
  covered: [number, number];
  /** Only the title bar is left. */
  collapsed: [boolean, boolean];
};

const NO_INSET: PaneBodyInset = { left: 0, right: 0, bottom: 0 };
const NO_BAR_INSET: PaneBarInset = { left: 0, right: 0 };

/** The handle's touch area centred on the divider: it reaches into both cards, whose bodies keep clear of it. */
function centredHandle(divider: PaneRect): PaneRect {
  return {
    x: divider.x + (divider.width - PANE_HANDLE_SIZE) / 2,
    y: divider.y + (divider.height - PANE_HANDLE_SIZE) / 2,
    width: PANE_HANDLE_SIZE,
    height: PANE_HANDLE_SIZE,
  };
}

/**
 * A title bar's insets that keep it off `keepOff` (the fold, and the handle beside it): the bar gives up its card's
 * side the stretch is nearer to, up to the stretch's far edge, so its grip, title and close button stay together.
 */
function barInset(card: PaneRect, keepOff: PaneSpan | null): PaneBarInset {
  if (keepOff === null) return NO_BAR_INSET;
  const start = Math.max(0, keepOff.start - card.x);
  const end = Math.min(card.width, keepOff.end - card.x);
  if (end <= start) return NO_BAR_INSET;
  return (start + end) / 2 < card.width / 2 ? { left: end, right: 0 } : { left: 0, right: card.width - start };
}

/**
 * Where the accessory starts in a body: past `division` (the fold) when the fold lies in the body with its middle in
 * the body's leading half, where the accessory stands; otherwise at the body's edge.
 */
function accessoryLeft(card: PaneRect, inset: PaneBodyInset, division: PaneSpan | null): number {
  if (division === null) return 0;
  const start = card.x + inset.left;
  const width = card.width - inset.left - inset.right;
  const inBody = division.end > start && division.start < start + width;
  return inBody && (division.start + division.end) / 2 - start < width / 2 ? division.end - start : 0;
}

export function paneGeometry(input: PaneGeometryInput): PaneGeometry {
  return input.arrangement === 'stacked' ? stackedGeometry(input) : sideBySideGeometry(input);
}

function stackedGeometry({ width, height, ratio, active, coverTop }: PaneGeometryInput): PaneGeometry {
  const at = Math.round(clampDividerRatio(ratio) * height);
  const bottom = coverTop === null ? height : Math.min(height, coverTop);
  let split = at;
  if (coverTop !== null) {
    split =
      active === 0
        ? Math.min(split, bottom - PANE_TITLE_HEIGHT - HALF_GAP)
        : Math.min(split, bottom - PANE_MIN_USABLE_HEIGHT - HALF_GAP);
    // The top pane keeps at least its title bar.
    split = Math.max(split, PANE_TITLE_HEIGHT + HALF_GAP);
  }
  const cards: [PaneRect, PaneRect] = [
    { x: 0, y: 0, width, height: split - HALF_GAP },
    { x: 0, y: split + HALF_GAP, width, height: Math.max(0, bottom - split - HALF_GAP) },
  ];
  const bodyInsets: [PaneBodyInset, PaneBodyInset] = [{ ...NO_INSET, bottom: PANE_HANDLE_REACH }, NO_INSET];
  const views: [PaneSize, PaneSize] = [
    { width, height: at - HALF_GAP - PANE_TITLE_HEIGHT - PANE_HANDLE_REACH },
    { width, height: height - at - HALF_GAP - PANE_TITLE_HEIGHT },
  ];
  const divider = { x: 0, y: split - HALF_GAP, width, height: PANE_GAP };
  return {
    slots: [
      { x: 0, y: 0, width, height: split },
      { x: 0, y: split, width, height: bottom - split },
    ],
    cards,
    divider,
    handle: centredHandle(divider),
    handleShown: coverTop === null,
    bodyInsets,
    barInsets: [NO_BAR_INSET, NO_BAR_INSET],
    controlInsets: [NO_BAR_INSET, NO_BAR_INSET],
    accessoryLeft: [0, 0],
    views,
    covered: [0, 1].map((index) => {
      const visible = cards[index].height - PANE_TITLE_HEIGHT - bodyInsets[index].bottom;
      return Math.max(0, views[index].height - Math.max(0, visible));
    }) as [number, number],
    collapsed: [cards[0].height <= PANE_TITLE_HEIGHT, cards[1].height <= PANE_TITLE_HEIGHT],
  };
}

function sideBySideGeometry({
  width,
  height,
  ratio,
  active,
  coverTop,
  editorTop,
  end,
  division = null,
}: PaneGeometryInput): PaneGeometry {
  const at = Math.round(clampDividerRatio(ratio) * width);
  const crossEnd = end ?? height;
  const bottom = coverTop === null ? crossEnd : Math.min(crossEnd, coverTop);
  const cards: [PaneRect, PaneRect] = [
    { x: 0, y: 0, width: at - HALF_GAP, height: bottom },
    { x: at + HALF_GAP, y: 0, width: width - at - HALF_GAP, height: bottom },
  ];
  const bodyInsets: [PaneBodyInset, PaneBodyInset] = [
    { ...NO_INSET, right: PANE_HANDLE_REACH },
    { ...NO_INSET, left: PANE_HANDLE_REACH },
  ];
  const views: [PaneSize, PaneSize] = [
    { width: cards[0].width - PANE_HANDLE_REACH, height: crossEnd - PANE_TITLE_HEIGHT },
    { width: cards[1].width - PANE_HANDLE_REACH, height: crossEnd - PANE_TITLE_HEIGHT },
  ];
  // The text editor stands over the active pane only, as wide as it.
  const editorOver = editorTop === null ? 0 : Math.max(0, bottom - editorTop);
  const divider = { x: at - HALF_GAP, y: 0, width: PANE_GAP, height: bottom };
  const centred = centredHandle(divider);
  // Half folded like a book, a handle that would stand on the fold stands beside it on the divider's side, in the
  // title bars' row, where no terminal's content is.
  const handle =
    division === null || centred.x + PANE_HANDLE_SIZE <= division.start || centred.x >= division.end
      ? centred
      : {
          ...centred,
          x: at <= (division.start + division.end) / 2 ? division.start - PANE_HANDLE_SIZE : division.end,
          y: 0,
        };
  const keepOff =
    division === null || handle === centred
      ? division
      : { start: Math.min(division.start, handle.x), end: Math.max(division.end, handle.x + PANE_HANDLE_SIZE) };
  // A body's controls give up its side nearer the fold, as a title bar does; the handle stands in the bars' row.
  const body = (index: PaneIndex): PaneRect => ({
    ...cards[index],
    x: cards[index].x + bodyInsets[index].left,
    width: cards[index].width - bodyInsets[index].left - bodyInsets[index].right,
  });
  return {
    slots: [
      { x: 0, y: 0, width: at, height: bottom },
      { x: at, y: 0, width: width - at, height: bottom },
    ],
    cards,
    divider,
    handle,
    handleShown: coverTop === null,
    bodyInsets,
    barInsets: [barInset(cards[0], keepOff), barInset(cards[1], keepOff)],
    controlInsets: [barInset(body(0), division), barInset(body(1), division)],
    accessoryLeft: [accessoryLeft(cards[0], bodyInsets[0], division), accessoryLeft(cards[1], bodyInsets[1], division)],
    views,
    covered: [0, 1].map((index) => {
      const visible = bottom - PANE_TITLE_HEIGHT - (index === active ? editorOver : 0);
      return Math.max(0, views[index].height - Math.max(0, visible));
    }) as [number, number],
    collapsed: [bottom <= PANE_TITLE_HEIGHT, bottom <= PANE_TITLE_HEIGHT],
  };
}
