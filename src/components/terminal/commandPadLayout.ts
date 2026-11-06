/**
 * Geometry of the Befehlspad in the terminal area, from the designs:
 * the toggle in the bottom right corner, the 3x3 field above it, and the four function buttons on an arc
 * around the field's upper left corner, every one `RING_CLEAR` points clear of the nearest key. All offsets are
 * from the toggle's anchor (its right and bottom edge), so the whole pad moves as one: with the keyboard, and
 * where the user drags it. The user's place is a side edge and a height in the room the pad has; what covers the
 * area's bottom only pushes it up while it would stand under that. Laptop mode passes its own area (the upper half
 * above the fold), a higher lowest place while nothing covers that area (`floor`) and stores its own place. Offsets
 * are named for the right edge; on the left edge the pad is drawn mirrored (the toggle at the edge, the ring on the
 * field's other side), its toggle `PAD_LEFT_MARGIN` in from that edge, while the 3x3 field itself keeps its order.
 */

import type { CommandPadPlacement } from '../../settings/commandPad';

/** A pad key: rounded square, well above the 44 pt touch target. */
export const PAD_KEY = 52;
export const PAD_KEY_GAP = 6;
export const PAD_TOGGLE = 46;
export const PAD_RING_BUTTON = 44;
/**
 * From the pad room's right edge while the pad stands there and from its far edge across, and from its bottom edge
 * while nothing covers it.
 */
export const PAD_MARGIN = 16;
/**
 * From the pad room's left edge while the pad stands there: farther in than on the right, so a finger on the toggle
 * stays clear of the system's swipe back from the screen's left edge, whose width the system does not publish.
 */
export const PAD_LEFT_MARGIN = 32;
/** Above whatever covers the area's bottom (keyboard, text editor, a layer). */
export const PAD_COVER_GAP = 12;

const RING_CLEAR = 10;
const FIELD = 3 * PAD_KEY + 2 * PAD_KEY_GAP;
/** Degrees between neighbouring ring buttons: about 8 pt free between them at the ring's radius. */
const RING_STEP_DEGREES = 20;
const RING_BUTTONS = 4;

/** A control's offset from the toggle's outer and bottom edge; `right` is towards the middle when mirrored. */
export type PadOffset = { right: number; bottom: number };
/** The room the pad is drawn in: the terminal area, across only as far as the window's safe area reaches. */
export type PadArea = { width: number; height: number };
export type PadSide = CommandPadPlacement['side'];
/**
 * Where the toggle stands: at a side edge (`PAD_MARGIN` in on the right, `PAD_LEFT_MARGIN` on the left), its bottom
 * edge `bottom` points above the area's bottom.
 */
export type PadAnchor = { side: PadSide; bottom: number };
/** Where a lifted pad is let go: the side it is drawn for, and its toggle's left and bottom edge in the area. */
export type PadDrop = { side: PadSide; left: number; bottom: number };

/** The field's bottom right corner, above the toggle. */
export const PAD_FIELD_OFFSET: PadOffset = { right: 0, bottom: PAD_TOGGLE + 10 };

/** The armed-modifier chip, left of the toggle. */
export const PAD_CHIP_OFFSET: PadOffset = { right: PAD_TOGGLE + 10, bottom: 12 };

/** The line that says why a tapped ring button is unavailable: one line of type with its backplate. */
export const PAD_HINT_HEIGHT = 20;

/**
 * That line's own row, left of the toggle between the chips and the field (it ends at the field's bottom edge), so it
 * moves neither the chips nor any key; it may reach across to the pad room's far margin.
 */
export const PAD_HINT_OFFSET: PadOffset = {
  right: PAD_CHIP_OFFSET.right,
  bottom: PAD_FIELD_OFFSET.bottom - PAD_HINT_HEIGHT,
};

/** The ring buttons in order (Keys, Agent, Editor, Keyboard), symmetric around the field's upper left diagonal. */
export const PAD_RING_OFFSETS: readonly PadOffset[] = (() => {
  const half = FIELD / 2;
  const radius = Math.ceil(half * Math.SQRT2 + PAD_RING_BUTTON / 2 + RING_CLEAR);
  const centreRight = PAD_FIELD_OFFSET.right + half;
  const centreBottom = PAD_FIELD_OFFSET.bottom + half;
  const first = 135 + ((RING_BUTTONS - 1) * RING_STEP_DEGREES) / 2;
  return Array.from({ length: RING_BUTTONS }, (_, index) => {
    const angle = ((first - index * RING_STEP_DEGREES) * Math.PI) / 180;
    return {
      right: Math.round(centreRight - radius * Math.cos(angle) - PAD_RING_BUTTON / 2),
      bottom: Math.round(centreBottom + radius * Math.sin(angle) - PAD_RING_BUTTON / 2),
    };
  });
})();

/** The open pad's extent from the toggle's anchor (toggle, field and ring); it moves and snaps as one. */
const PAD_EXTENT: PadArea = {
  width: Math.max(
    PAD_TOGGLE,
    PAD_FIELD_OFFSET.right + FIELD,
    ...PAD_RING_OFFSETS.map((ring) => ring.right + PAD_RING_BUTTON),
  ),
  height: Math.max(
    PAD_TOGGLE,
    PAD_FIELD_OFFSET.bottom + FIELD,
    ...PAD_RING_OFFSETS.map((ring) => ring.bottom + PAD_RING_BUTTON),
  ),
};

/** The design's place: bottom right. */
export const DEFAULT_PAD_PLACEMENT: CommandPadPlacement = { side: 'right', height: 1 };

/**
 * The lowest the toggle's bottom edge may stand above the terminal area's bottom: `cover` points of the area are
 * covered (keyboard, text editor or a layer; 0 when nothing is), and the pad stands just above that; with nothing
 * covering it, `floor` points above the bottom.
 */
function lowestBottom(cover: number, floor: number): number {
  return cover > 0 ? cover + PAD_COVER_GAP : floor;
}

/** How far the toggle's bottom edge can rise in `area` with nothing covering it, the open pad 16 pt below the top. */
function heightRange(area: PadArea): number {
  return Math.max(0, area.height - 2 * PAD_MARGIN - PAD_EXTENT.height);
}

/** How far the toggle stands in from the side edge the pad stands at. */
export function padSideMargin(side: PadSide): number {
  return side === 'left' ? PAD_LEFT_MARGIN : PAD_MARGIN;
}

/** The toggle's left edge in an area `width` wide when it stands at `side`. */
export function padToggleLeft(side: PadSide, width: number): number {
  return side === 'left' ? padSideMargin(side) : width - padSideMargin(side) - PAD_TOGGLE;
}

/**
 * The toggle's anchor for the user's place (absent: the default, bottom right) in `area` with `cover` points of its
 * bottom covered, and `floor` its lowest place while nothing covers the area (16 pt; laptop mode keeps it higher). The
 * height is kept unless the pad would stand under what covers the area or below `floor`; the stored place is not
 * changed by that. Before the area is measured: the default place. Where the area has less room than the open pad
 * needs, the pad stands at its lowest place and its top reaches past the area's top (`padHeaderReach` says how far it
 * may).
 */
export function padAnchor(
  placement: CommandPadPlacement | undefined,
  area: PadArea | null,
  cover: number,
  floor = PAD_MARGIN,
): PadAnchor {
  const lowest = lowestBottom(cover, floor);
  if (area === null) return { side: DEFAULT_PAD_PLACEMENT.side, bottom: lowest };
  const { side, height } = placement ?? DEFAULT_PAD_PLACEMENT;
  return { side, bottom: Math.max(lowest, PAD_MARGIN + (1 - height) * heightRange(area)) };
}

/**
 * The height the open pad needs in the terminal area with `cover` points of its bottom covered: its toggle just
 * above the cover (or `floor` above the bottom while nothing covers it) and its highest control 16 pt below the top.
 */
export function padRequiredHeight(cover: number, floor = PAD_MARGIN): number {
  return lowestBottom(cover, floor) + PAD_EXTENT.height + PAD_MARGIN;
}

/**
 * How far above the terminal area the open pad may reach, given `headerRoom` points between the area's top and the
 * window's safe area (the header): none while it fits in the area above `cover` (or above `floor` while nothing
 * covers it); the header's room when it fits only with that, still 16 pt below the safe area's top; null when it does
 * not fit even then. The header's controls are not used while typing on the pad, so covering them costs less than
 * smaller keys would.
 */
export function padHeaderReach(area: PadArea, cover: number, headerRoom: number, floor = PAD_MARGIN): number | null {
  const needed = padRequiredHeight(cover, floor);
  if (needed <= area.height) return 0;
  return needed <= area.height + headerRoom ? headerRoom : null;
}

/**
 * The place a pad let go at `drop` snaps to: the side edge nearer to the pad's middle as it is drawn, and the
 * released height clamped to the allowed area (above what covers it or `floor`, below the top margin).
 */
export function padPlacementAt(drop: PadDrop, area: PadArea, cover: number, floor = PAD_MARGIN): CommandPadPlacement {
  const middle =
    drop.side === 'left' ? drop.left + PAD_EXTENT.width / 2 : drop.left + PAD_TOGGLE - PAD_EXTENT.width / 2;
  const side = middle < area.width / 2 ? 'left' : 'right';
  const range = heightRange(area);
  if (range === 0) return { side, height: DEFAULT_PAD_PLACEMENT.height };
  const bottom = Math.min(Math.max(drop.bottom, lowestBottom(cover, floor)), PAD_MARGIN + range);
  return { side, height: Math.min(1, Math.max(0, 1 - (bottom - PAD_MARGIN) / range)) };
}
