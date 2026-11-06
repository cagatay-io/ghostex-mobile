/**
 * Run with `bun test src`. Where a stored place puts the Befehlspad
 * (`commandPadLayout.ts`), for the cases the screen tests do not reach: no place yet and an unmeasured area keep the
 * default corner; a released height survives the stored fraction; wherever it is let go in an area with room for
 * it, the whole open pad (toggle, field and ring) lies inside the allowed area. Frames of an iPhone 17: terminal
 * area 402 x 700, 336 pt keyboard of which 302 pt cover the area.
 *
 * Areas too short for the open pad use the header above them when that is enough, and say so when it is not (then
 * the screen lowers the keyboard). Their numbers are the measured poses: an iPhone 17 in landscape (terminal area
 * 874 x 337 below a 44 pt header, a 200 pt keyboard of which 179 pt cover the area), an iPhone 17 Pro Max in landscape
 * (956 x 375), the unfolded iPhone Duo in landscape (870 x 587, 52 pt from the area's top up to the safe area) and
 * the folded Duo upright (382 x 606, 52 pt) and turned (594 x 394, 52 pt), each with its keyboard and text editor.
 */

import { describe, expect, test } from 'bun:test';

import {
  PAD_COVER_GAP,
  PAD_FIELD_OFFSET,
  PAD_KEY,
  PAD_KEY_GAP,
  PAD_LEFT_MARGIN,
  PAD_MARGIN,
  PAD_RING_BUTTON,
  PAD_RING_OFFSETS,
  PAD_TOGGLE,
  padAnchor,
  padHeaderReach,
  padPlacementAt,
  padToggleLeft,
  type PadAnchor,
  type PadArea,
  type PadDrop,
  type PadOffset,
} from './commandPadLayout';

const AREA = { width: 402, height: 700 };
const KEYBOARD_COVER = 302;
/** The text editor (56 pt) on the keyboard. */
const EDITOR_COVER = KEYBOARD_COVER + 56;

const FIELD = 3 * PAD_KEY + 2 * PAD_KEY_GAP;
/** Every control of the open pad as an offset from the toggle's anchor and its size. */
const CONTROLS: { at: PadOffset; width: number; height: number }[] = [
  { at: { right: 0, bottom: 0 }, width: PAD_TOGGLE, height: PAD_TOGGLE },
  { at: PAD_FIELD_OFFSET, width: FIELD, height: FIELD },
  ...PAD_RING_OFFSETS.map((at) => ({ at, width: PAD_RING_BUTTON, height: PAD_RING_BUTTON })),
];
/** The open pad's size, from its controls. */
const OPEN = {
  width: Math.max(...CONTROLS.map((control) => control.at.right + control.width)),
  height: Math.max(...CONTROLS.map((control) => control.at.bottom + control.height)),
};

type Frame = { left: number; top: number; right: number; bottom: number };

/**
 * Where a control of the open pad at `anchor` is drawn in `area` (origin top left), mirrored on the left edge, where
 * the toggle stands farther in.
 */
function frameOf(anchor: PadAnchor, area: PadArea, control: (typeof CONTROLS)[number]): Frame {
  const bottom = area.height - anchor.bottom - control.at.bottom;
  const left =
    anchor.side === 'left'
      ? PAD_LEFT_MARGIN + control.at.right
      : area.width - PAD_MARGIN - control.at.right - control.width;
  return { left, top: bottom - control.height, right: left + control.width, bottom };
}

/**
 * Asserts every control of the open pad at `anchor` lies inside the allowed area (origin top left): 16 pt in from
 * the area's sides and from its top (or from the safe area's top, `reach` points above it), 16 pt above its bottom
 * or 12 pt above what covers it.
 */
function expectInside(anchor: PadAnchor, area: PadArea, cover: number, reach = 0): void {
  const lowest = area.height - (cover > 0 ? cover + PAD_COVER_GAP : PAD_MARGIN);
  for (const control of CONTROLS) {
    const frame = frameOf(anchor, area, control);
    expect(frame.left).toBeGreaterThanOrEqual(PAD_MARGIN);
    expect(frame.top).toBeGreaterThanOrEqual(PAD_MARGIN - reach);
    expect(frame.right).toBeLessThanOrEqual(area.width - PAD_MARGIN);
    expect(frame.bottom).toBeLessThanOrEqual(lowest);
  }
}

/** The pad drawn at the right edge, let go with its toggle's right edge `right` points from the area's right. */
function dropAtRight(area: PadArea, right: number, bottom: number): PadDrop {
  return { side: 'right', left: area.width - right - PAD_TOGGLE, bottom };
}

describe('a place in the allowed area', () => {
  test('no place, or an area not measured yet: the default corner, 16 pt in and 12 pt above what covers the area', () => {
    expect(padAnchor(undefined, AREA, 0)).toEqual({ side: 'right', bottom: 16 });
    expect(padAnchor(undefined, AREA, KEYBOARD_COVER)).toEqual({ side: 'right', bottom: KEYBOARD_COVER + 12 });
    expect(padAnchor({ side: 'left', height: 0 }, null, 0)).toEqual({ side: 'right', bottom: 16 });
  });

  test('the released height comes back from the stored fraction, with and without the keyboard', () => {
    for (const bottom of [16, 120.5, 250, 376]) {
      const placement = padPlacementAt(dropAtRight(AREA, 16, bottom), AREA, 0);
      expect(placement.height).toBeGreaterThanOrEqual(0);
      expect(placement.height).toBeLessThanOrEqual(1);
      expect(padAnchor(placement, AREA, 0).bottom).toBeCloseTo(bottom, 9);
    }
    const aboveKeyboard = padPlacementAt(dropAtRight(AREA, 16, 350), AREA, KEYBOARD_COVER);
    expect(padAnchor(aboveKeyboard, AREA, KEYBOARD_COVER).bottom).toBeCloseTo(350, 9);
    expect(padAnchor(aboveKeyboard, AREA, 0).bottom).toBeCloseTo(350, 9);
  });

  test('let go over the keyboard, the pad is stored where it is shown, just above it', () => {
    const placement = padPlacementAt(dropAtRight(AREA, 16, 40), AREA, KEYBOARD_COVER);
    expect(padAnchor(placement, AREA, KEYBOARD_COVER).bottom).toBeCloseTo(KEYBOARD_COVER + 12, 9);
    expect(padAnchor(placement, AREA, 0).bottom).toBeCloseTo(KEYBOARD_COVER + 12, 9);
  });

  test('the side is the one nearer the middle of the whole pad, not of the toggle', () => {
    // The toggle right of the area's middle, the open pad mostly left of it.
    expect(padPlacementAt(dropAtRight(AREA, 180, 16), AREA, 0).side).toBe('left');
    expect(padPlacementAt(dropAtRight(AREA, 40, 16), AREA, 0).side).toBe('right');
  });

  test('the pad drawn mirrored on the left edge snaps by the middle of the pad as drawn, which lies right of its toggle', () => {
    // The toggle left of the area's middle, the mirrored pad mostly right of it.
    expect(padPlacementAt({ side: 'left', left: 120, bottom: 16 }, AREA, 0).side).toBe('right');
    expect(padPlacementAt({ side: 'left', left: 40, bottom: 16 }, AREA, 0).side).toBe('left');
    // The toggle stands 32 pt in from the left edge, clear of the system's swipe back there, and 16 pt from the right.
    expect(padToggleLeft('left', AREA.width)).toBe(32);
    expect(padToggleLeft('right', AREA.width)).toBe(AREA.width - 16 - PAD_TOGGLE);
  });

  test('on the left edge every control lies where its mirror image on the right edge lies, 16 pt farther in; the toggle 32 pt from the edge', () => {
    for (const height of [0, 0.5, 1]) {
      const left = padAnchor({ side: 'left', height }, AREA, 0);
      const right = padAnchor({ side: 'right', height }, AREA, 0);
      expect(left.bottom).toBe(right.bottom);
      for (const control of CONTROLS) {
        const mirrored = frameOf(left, AREA, control);
        const original = frameOf(right, AREA, control);
        expect(mirrored).toEqual({
          left: AREA.width - original.right + 16,
          top: original.top,
          right: AREA.width - original.left + 16,
          bottom: original.bottom,
        });
      }
      expect(frameOf(left, AREA, CONTROLS[0]).left).toBe(32);
    }
  });

  test('in an area with room for it, the whole open pad lies inside the allowed area wherever it is let go', () => {
    const cases: { area: PadArea; cover: number }[] = [
      { area: AREA, cover: 0 },
      { area: AREA, cover: KEYBOARD_COVER },
      { area: AREA, cover: EDITOR_COVER },
      // Exactly as tall and as wide as the open pad and its margins need.
      { area: { width: 874, height: 2 * PAD_MARGIN + OPEN.height }, cover: 0 },
      { area: { width: PAD_LEFT_MARGIN + OPEN.width + PAD_MARGIN, height: 700 }, cover: KEYBOARD_COVER },
      { area: { width: 600, height: PAD_MARGIN + OPEN.height + 120 + PAD_COVER_GAP }, cover: 120 },
    ];
    for (const { area, cover } of cases) {
      expect(padHeaderReach(area, cover, 44)).toBe(0);
      for (const right of [-500, 0, 16, area.width / 3, area.width - 100, area.width + 500]) {
        for (const bottom of [-500, 0, 16, cover + 1, area.height / 2, area.height - 50, area.height + 500]) {
          for (const drop of [
            dropAtRight(area, right, bottom),
            { side: 'left' as const, left: area.width - right - PAD_TOGGLE, bottom },
          ]) {
            const placement = padPlacementAt(drop, area, cover);
            expectInside(padAnchor(placement, area, cover), area, cover);
            // Stored above a cover, it stays inside once the cover leaves.
            expectInside(padAnchor(placement, area, 0), area, 0);
          }
        }
      }
      for (const side of ['left', 'right'] as const) {
        for (const height of [0, 0.5, 1]) expectInside(padAnchor({ side, height }, area, cover), area, cover);
      }
      expectInside(padAnchor(undefined, area, cover), area, cover);
    }
  });
});

describe('too little room for the open pad', () => {
  test('the open pad is 252 x 308 pt and needs 340 pt of height with nothing covering the area, 336 pt above a cover', () => {
    expect(OPEN).toEqual({ width: 252, height: 308 });
    expect(padHeaderReach({ width: 874, height: 2 * PAD_MARGIN + OPEN.height }, 0, 0)).toBe(0);
    expect(padHeaderReach({ width: 874, height: 2 * PAD_MARGIN + OPEN.height - 1 }, 0, 0)).toBeNull();
    expect(padHeaderReach({ width: 874, height: PAD_MARGIN + OPEN.height + 179 + PAD_COVER_GAP }, 179, 0)).toBe(0);
  });

  test('short by up to the header: the open pad reaches over the header, 16 pt below the safe area, at every stored place, keys unchanged', () => {
    const cases: { name: string; area: PadArea; cover: number; header: number }[] = [
      {
        name: 'iPhone 17 landscape, keyboard down (3 pt short)',
        area: { width: 874, height: 337 },
        cover: 0,
        header: 44,
      },
      {
        name: 'unfolded Duo landscape, keyboard and editor (26 pt short)',
        area: { width: 870, height: 587 },
        cover: 277,
        header: 52,
      },
      {
        name: 'folded Duo upright, keyboard and editor (31 pt short)',
        area: { width: 382, height: 606 },
        cover: 301,
        header: 52,
      },
      {
        name: 'exactly the header short (44 pt)',
        area: { width: 402, height: 2 * PAD_MARGIN + OPEN.height - 44 },
        cover: 0,
        header: 44,
      },
      {
        name: 'a 62 pt header and 62 pt short',
        area: { width: 600, height: PAD_MARGIN + OPEN.height + 200 + PAD_COVER_GAP - 62 },
        cover: 200,
        header: 62,
      },
    ];
    for (const { name, area, cover, header } of cases) {
      expect({ name, reach: padHeaderReach(area, cover, header) }).toEqual({ name, reach: header });
      for (const side of ['left', 'right'] as const) {
        for (const height of [0, 0.5, 1]) {
          expectInside(padAnchor({ side, height }, area, cover), area, cover, header);
        }
      }
      expectInside(padAnchor(undefined, area, cover), area, cover, header);
      // Let go anywhere, it is stored where it stays inside.
      for (const bottom of [-500, 16, area.height + 500]) {
        const placement = padPlacementAt(dropAtRight(area, 16, bottom), area, cover);
        expectInside(padAnchor(placement, area, cover), area, cover, header);
      }
    }
    // The keys, the ring and the toggle keep their sizes: nothing is scaled to fit.
    expect([PAD_KEY, PAD_RING_BUTTON, PAD_TOGGLE].every((size) => size >= 44)).toBe(true);
  });

  test('short by more than the header (landscape with the keyboard up): no place fits, so the screen lowers the keyboard', () => {
    // iPhone 17, iPhone 17 Pro Max and the folded Duo turned, each with its keyboard up, and with the text editor on it.
    expect(padHeaderReach({ width: 874, height: 337 }, 179, 44)).toBeNull();
    expect(padHeaderReach({ width: 874, height: 337 }, 235, 44)).toBeNull();
    expect(padHeaderReach({ width: 956, height: 375 }, 179, 44)).toBeNull();
    expect(padHeaderReach({ width: 594, height: 394 }, 180, 52)).toBeNull();
    // With the keyboard down the same areas have room, over the header where they need it.
    expect(padHeaderReach({ width: 874, height: 337 }, 0, 44)).toBe(44);
    expect(padHeaderReach({ width: 956, height: 375 }, 0, 44)).toBe(0);
    expect(padHeaderReach({ width: 594, height: 394 }, 0, 52)).toBe(0);
  });
});
