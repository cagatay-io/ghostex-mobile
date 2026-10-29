/**
 * Geometry of the Befehlspad in the terminal area, from the approved mockups (`mockups/kit/pad.js`, D-034):
 * the toggle in the bottom right corner, the 3x3 field above it, and the four function buttons on an arc
 * around the field's upper left corner, every one `RING_CLEAR` points clear of the nearest key. All offsets are
 * from the toggle's anchor (its right and bottom edge), so the whole pad moves as one with the keyboard.
 * Laptop mode (S6, REQ-KEY-005) adds its own anchor here.
 */

/** A pad key: rounded square, well above the 44 pt touch target. */
export const PAD_KEY = 52;
export const PAD_KEY_GAP = 6;
export const PAD_TOGGLE = 46;
export const PAD_RING_BUTTON = 44;
/** From the terminal area's right edge, and from its bottom edge while nothing covers it. */
export const PAD_MARGIN = 16;
/** Above whatever covers the area's bottom (keyboard, text editor, a layer). */
export const PAD_COVER_GAP = 12;

const RING_CLEAR = 10;
const FIELD = 3 * PAD_KEY + 2 * PAD_KEY_GAP;
/** Degrees between neighbouring ring buttons: about 8 pt free between them at the ring's radius. */
const RING_STEP_DEGREES = 20;
const RING_BUTTONS = 4;

export type PadOffset = { right: number; bottom: number };

/** The field's bottom right corner, above the toggle. */
export const PAD_FIELD_OFFSET: PadOffset = { right: 0, bottom: PAD_TOGGLE + 10 };

/** The armed-modifier chip, left of the toggle. */
export const PAD_CHIP_OFFSET: PadOffset = { right: PAD_TOGGLE + 10, bottom: 12 };

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

/**
 * The toggle's bottom edge above the terminal area's bottom: `cover` points of the area are covered (keyboard,
 * text editor or a layer; 0 when nothing is), and the pad stands just above that.
 */
export function padAnchorBottom(cover: number): number {
  return cover > 0 ? cover + PAD_COVER_GAP : PAD_MARGIN;
}
