/**
 * The iOS terminal in the iPhone Duo's laptop pose: half folded, the session output stays above the fold and the
 * keyboard lies below it; nothing lies on the knick (the approved laptop-mode mockup).
 * - Keyboard or a pad layer up: the terminal's visible part ends at the fold's top. The view keeps its size and
 *   slides as with every keyboard, by the part below the fold; what it still has below the fold (the cursor row won
 *   and it slid less) is covered. The text editor stands above the fold, at the bottom of the upper half, and the
 *   terminal ends above it. A Keys or Agent layer takes the keyboard's place below the fold.
 * - Neither: the terminal runs over the fold as in every other pose.
 * - The Befehlspad stands in the upper half above the fold: that is the room it is placed, moved and judged in
 *   (`laptopPadArea`), with its own stored place. The keyboard and the layers lie below the fold, so they never push
 *   it; only the text editor above the fold covers the bottom of that room (`laptopPadCover`). Only where the open
 *   pad does not fit there even reaching over the header, its room reaches below the fold by what is missing
 *   (`laptopPadRoomBelowFold`), and a layer that would come up into that room takes the place instead
 *   (`laptopPadReachBelowFold`).
 * Lengths in points, window coordinates unless named otherwise.
 */

import { FOLD_CLEARANCE, LAPTOP_CLEAR, type LaptopFold } from '../common/verticalBar/layout';
import { padHeaderReach, padRequiredHeight } from './commandPadLayout';

/** A rectangle in the window: the terminal area, or the pad's room in it. */
export type LaptopRect = { x: number; y: number; width: number; height: number };

/** The pad's room: the part of the terminal area (`area`) above the fold's top edge. */
export function laptopPadArea(area: LaptopRect, fold: LaptopFold): LaptopRect {
  return { ...area, height: Math.min(area.height, Math.max(0, fold.top - area.y)) };
}

/**
 * How much of the pad room's bottom is covered: the open text editor (`editorHeight`, 0 while closed) and the space
 * it keeps from the fold; nothing else lies in the upper half.
 */
export function laptopPadCover(editorHeight: number): number {
  return editorHeight > 0 ? LAPTOP_CLEAR + editorHeight : 0;
}

/**
 * The open pad's room where the upper half (`upperHalf`, nothing covering it) is too short for it even reaching over
 * the header (`headerRoom` points between the area's top and the window's safe area): the upper half reaching below
 * the fold's top by exactly what is missing, so the pad, reaching over all of the header, stands whole in it. The
 * keyboard lies below the fold, so lowering it would add no room here. Null where the pad fits without that.
 */
export function laptopPadRoomBelowFold(upperHalf: LaptopRect, headerRoom: number): LaptopRect | null {
  if (padHeaderReach(upperHalf, 0, headerRoom) !== null) return null;
  return { ...upperHalf, height: padRequiredHeight(0) - headerRoom };
}

/**
 * How far the open pad in its room below the fold (`laptopPadRoomBelowFold`) reaches over the header: all of
 * `headerRoom`, as the room is made for that; null where a Keys or Agent layer in the keyboard's place (its top edge
 * `layerTop` in the window, null while none is shown) comes up into the room further than the pad's gap above what
 * covers it allows, as the two would overlap then.
 */
export function laptopPadReachBelowFold(room: LaptopRect, headerRoom: number, layerTop: number | null): number | null {
  const layerCover = layerTop === null ? 0 : room.y + room.height - layerTop;
  return layerCover > 0 && padHeaderReach(room, layerCover, headerRoom) === null ? null : headerRoom;
}

/** The text editor's bottom edge above the window's bottom edge: `LAPTOP_CLEAR` above the fold's top. */
export function laptopEditorInset(fold: LaptopFold, windowHeight: number): number {
  return windowHeight - fold.top + LAPTOP_CLEAR;
}

/**
 * The height of a Keys or Agent layer in the keyboard's place: the keyboard's last height (`keyboardHeight`, from
 * the window's bottom edge; undefined while none was seen), but never reaching closer than `FOLD_CLEARANCE` to the
 * fold's bottom edge.
 */
export function laptopLayerHeight(fold: LaptopFold, windowHeight: number, keyboardHeight: number | undefined): number {
  const lowerHalf = Math.max(0, windowHeight - fold.bottom - FOLD_CLEARANCE);
  return keyboardHeight === undefined ? lowerHalf : Math.min(keyboardHeight, lowerHalf);
}

export type LaptopObstructionInput = {
  fold: LaptopFold;
  /** The terminal area's bottom edge in the window. */
  areaBottom: number;
  /** How much of the area's bottom the keyboard covers as reported (0 while it is down). */
  keyboardCover: number;
  /** How much of the area's bottom a layer in the keyboard's place covers (0 while none is shown). */
  layerCover: number;
  /** The open text editor's height, 0 while it is closed. */
  editorHeight: number;
};

/**
 * How much of the terminal area's bottom is covered, so the terminal slides by it and the cover hides it: with the
 * keyboard or a layer up everything below the fold's top (and the editor above it), else nothing.
 */
export function laptopObstruction({
  fold,
  areaBottom,
  keyboardCover,
  layerCover,
  editorHeight,
}: LaptopObstructionInput): number {
  if (keyboardCover <= 0 && layerCover <= 0) return 0;
  const belowFold = Math.max(0, areaBottom - fold.top);
  const editor = editorHeight > 0 ? LAPTOP_CLEAR + editorHeight : 0;
  return Math.max(belowFold + editor, keyboardCover, layerCover);
}
