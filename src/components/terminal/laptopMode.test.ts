/// <reference types="node" />
/**
 * Run with `bun test src/components/terminal/laptopMode.test.ts`.
 *
 * Laptop mode's geometry: the laptop pose as the layout layer gets it from the active division (and the dev-only
 * debug row's text); the terminal's cover, keyboard up or not; the pad's room in the upper half above
 * the fold, covered only by the text editor, and reaching below the fold where the upper half is too short for the
 * open pad even over the header; the round buttons a finger's width above the fold; the editor above the fold; a
 * layer below it; sheets, centred cards and a web page off the fold (the page ends above it); a list running across
 * the fold, its copy below the band continuing where the list ends above it, the band not counted (no copy for short
 * content or with the keyboard up). Frames: the iPhone Duo's inner display in the laptop pose as the simulator reports
 * it, window 669 x 951 pt, division `[0, 455.5, 669, 40]` active when half folded, home indicator inset 20; the
 * keyboard's top at 555 is assumed.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  foldCardRegion,
  foldCopyOffset,
  foldDivisionsSummary,
  foldListAcross,
  foldListInsets,
  foldListOffset,
  foldSheetMaxHeight,
  foldUpperHalfInset,
  laptopCoverTop,
  laptopFoldOf,
} from '../common/verticalBar/layout';
import { DEFAULT_PAD_PLACEMENT, PAD_MARGIN, padAnchor, padHeaderReach } from './commandPadLayout';
import {
  laptopEditorInset,
  laptopFloatingBottom,
  laptopLayerHeight,
  laptopObstruction,
  laptopPadArea,
  laptopPadCover,
  laptopPadReachBelowFold,
  laptopPadRoomBelowFold,
} from './laptopMode';

const WINDOW = { width: 669, height: 951 };
const DIVISION = { x: 0, y: 455.5, width: 669, height: 40 };
const FOLD = { top: 455.5, bottom: 495.5 };
const HOME = 20;
const KEYBOARD_TOP = 555;
const AREA_BOTTOM = WINDOW.height - HOME;
/** The terminal area below the status band, which holds the header in this pose. */
const AREA = { x: 0, y: 82, width: WINDOW.width, height: AREA_BOTTOM - 82 };
/** The open pad: 252 x 308 pt from the toggle's anchor, 16 pt margins around it. */
const OPEN_PAD_HEIGHT = 308;
const EDITOR = 56;

const obstruction = (patch: Partial<Parameters<typeof laptopObstruction>[0]> = {}) =>
  laptopObstruction({
    fold: FOLD,
    areaBottom: AREA_BOTTOM,
    keyboardCover: WINDOW.height - KEYBOARD_TOP - HOME,
    layerCover: 0,
    editorHeight: 0,
    ...patch,
  });

describe('the laptop pose comes from the active division across the window', () => {
  test('half folded in portrait: the band of the active horizontal division', () => {
    assert.deepEqual(laptopFoldOf([{ ...DIVISION, active: true }]), FOLD);
  });

  test('flat (inactive), book pose (a division along the height) and no divisions: no laptop pose', () => {
    assert.equal(laptopFoldOf([{ ...DIVISION, active: false }]), null);
    assert.equal(laptopFoldOf([{ x: 455.5, y: 0, width: 40, height: 669, active: true }]), null);
    assert.equal(laptopFoldOf([]), null);
    assert.equal(laptopFoldOf(undefined), null);
  });

  test('the debug row names one active region with its height half folded, none active flat', () => {
    assert.equal(foldDivisionsSummary([{ ...DIVISION, active: true }]), 'active x 0 y 455.5 w 669 h 40');
    assert.equal(foldDivisionsSummary([{ ...DIVISION, active: false }]), 'inactive x 0 y 455.5 w 669 h 40');
    assert.equal(foldDivisionsSummary(undefined), 'none');
  });
});

describe('the terminal: keyboard up or not, the output ends at the fold', () => {
  test('keyboard up: everything below the fold top is covered, so the visible part ends at the fold top', () => {
    assert.equal(obstruction(), AREA_BOTTOM - FOLD.top);
  });

  test('a keyboard reported from the fold top covers the same', () => {
    assert.equal(obstruction({ keyboardCover: AREA_BOTTOM - FOLD.top }), AREA_BOTTOM - FOLD.top);
  });

  test('a layer in the keyboard place: the same cover, the layer lower than the fold', () => {
    assert.equal(obstruction({ keyboardCover: 0, layerCover: 300 }), AREA_BOTTOM - FOLD.top);
  });

  test('the text editor stands 12 pt above the fold and the terminal ends at its top', () => {
    const editorBottom = WINDOW.height - laptopEditorInset(FOLD, WINDOW.height);
    assert.equal(editorBottom, FOLD.top - 12);
    assert.equal(AREA_BOTTOM - obstruction({ editorHeight: EDITOR }), editorBottom - EDITOR);
  });

  test('neither keyboard nor layer: the same cover, the visible part ends at the fold top', () => {
    assert.equal(obstruction({ keyboardCover: 0 }), AREA_BOTTOM - FOLD.top);
  });

  test('the cover of dialogs and text fields starts at the fold, not at the keyboard', () => {
    assert.equal(laptopCoverTop(KEYBOARD_TOP, FOLD), FOLD.top);
    assert.equal(laptopCoverTop(null, FOLD), null);
    assert.equal(laptopCoverTop(KEYBOARD_TOP, null), KEYBOARD_TOP);
  });
});

describe('the pad: its room is the upper half above the fold', () => {
  const room = laptopPadArea(AREA, FOLD);

  test('the room runs from the terminal area top to the fold top, across the whole area', () => {
    assert.deepEqual(room, { ...AREA, height: FOLD.top - AREA.y });
  });

  test('a fold above the area leaves no room; a fold below it leaves the whole area', () => {
    assert.equal(laptopPadArea({ ...AREA, y: 500 }, FOLD).height, 0);
    assert.equal(laptopPadArea({ ...AREA, height: 300 }, FOLD).height, 300);
  });

  test('default place: the toggle 16 pt above the fold, the open pad inside the upper half', () => {
    const anchor = padAnchor(undefined, room, laptopPadCover(0));
    assert.deepEqual(anchor, { side: DEFAULT_PAD_PLACEMENT.side, bottom: PAD_MARGIN });
    const padTop = FOLD.top - anchor.bottom - OPEN_PAD_HEIGHT;
    assert.ok(padTop >= AREA.y + PAD_MARGIN);
    assert.equal(padHeaderReach(room, 0, 0), 0);
  });

  test('a moved place stays inside the upper half at its height, top and bottom', () => {
    const top = padAnchor({ side: 'left', height: 0 }, room, 0);
    assert.equal(FOLD.top - top.bottom - OPEN_PAD_HEIGHT, AREA.y + PAD_MARGIN);
    assert.equal(padAnchor({ side: 'left', height: 1 }, room, 0).bottom, PAD_MARGIN);
  });

  test('the keyboard and the layers lie below the fold and cover nothing of the room; the editor does', () => {
    assert.equal(laptopPadCover(0), 0);
    assert.equal(laptopPadCover(EDITOR), 12 + EDITOR);
  });

  test('with the editor the open pad does not fit (the case the toggle above the editor is for); with more room it does', () => {
    assert.equal(padHeaderReach(room, laptopPadCover(EDITOR), 0), null);
    const tall = laptopPadArea({ ...AREA, y: 20, height: AREA_BOTTOM - 20 }, FOLD);
    assert.equal(padHeaderReach(tall, laptopPadCover(EDITOR), 0), 0);
    // There the toggle stands 12 pt above the editor.
    assert.equal(padAnchor(undefined, tall, laptopPadCover(EDITOR)).bottom, 12 + EDITOR + 12);
  });
});

describe('an upper half too short for the open pad even over the header: its room reaches below the fold', () => {
  /** The header's room: the terminal area's top less the safe area's top. */
  const HEADER = 2;
  /** A fold at y 380: an upper half of 298 pt, 40 pt short of the 340 pt the open pad needs with the header. */
  const short = laptopPadArea(AREA, { top: 380, bottom: 420 });

  test('where the open pad fits, in the upper half or reaching over the header, its room stays there', () => {
    assert.equal(laptopPadRoomBelowFold(laptopPadArea(AREA, FOLD), HEADER), null);
    // 338 pt and the header's 2 pt: exactly what the open pad needs.
    assert.equal(laptopPadRoomBelowFold(laptopPadArea(AREA, { top: 420, bottom: 460 }), HEADER), null);
  });

  test('40 pt short: the room reaches 40 pt below the fold, exactly what reaching over the header needs', () => {
    const below = laptopPadRoomBelowFold(short, HEADER);
    assert.ok(below !== null);
    assert.deepEqual(below, { ...short, height: 2 * PAD_MARGIN + OPEN_PAD_HEIGHT - HEADER });
    assert.equal(below.y + below.height - 380, 40);
    assert.equal(padHeaderReach(below, 0, HEADER), HEADER);
    assert.equal(padHeaderReach({ ...below, height: below.height - 1 }, 0, HEADER), null);
    // The toggle 16 pt above the room's bottom: the open pad's top 16 pt below the safe area's top.
    const toggleBottom = below.y + below.height - padAnchor(undefined, short, 0).bottom;
    assert.equal(toggleBottom - OPEN_PAD_HEIGHT, AREA.y - HEADER + PAD_MARGIN);
  });

  test('without a header the room reaches below the fold by the whole shortfall', () => {
    assert.equal(laptopPadRoomBelowFold(short, 0)?.height, 2 * PAD_MARGIN + OPEN_PAD_HEIGHT);
  });

  test('a layer below the fold: clear of the room, or covering no more than the pad keeps free, the pad stays; further up it gives way', () => {
    const below = laptopPadRoomBelowFold(short, HEADER);
    assert.ok(below !== null);
    const bottom = below.y + below.height;
    assert.equal(laptopPadReachBelowFold(below, HEADER, null), HEADER);
    assert.equal(laptopPadReachBelowFold(below, HEADER, bottom + 100), HEADER);
    // The toggle stands 16 pt above the room's bottom and keeps 12 pt above what covers it: 4 pt may be covered.
    assert.equal(laptopPadReachBelowFold(below, HEADER, bottom - 4), HEADER);
    assert.equal(laptopPadReachBelowFold(below, HEADER, bottom - 5), null);
  });
});

describe('the round buttons stand a finger’s width above the fold', () => {
  /** A finger's width above the fold's top, while nothing above the fold covers the terminal. */
  const FINGER = 44;
  /** Their window y for a cover (`obstruction` patch): the corner 16 pt above it, lifted where that is lower. */
  const buttonsBottom = (patch: Partial<Parameters<typeof laptopObstruction>[0]> = {}) =>
    AREA_BOTTOM - laptopFloatingBottom(FOLD, AREA_BOTTOM, 16 + obstruction(patch));

  test('keyboard up, down, or a layer in its place: a finger’s width above the fold, not 16 pt', () => {
    assert.equal(buttonsBottom(), FOLD.top - FINGER);
    assert.equal(buttonsBottom({ keyboardCover: 0 }), FOLD.top - FINGER);
    assert.equal(buttonsBottom({ keyboardCover: 0, layerCover: 300 }), FOLD.top - FINGER);
  });

  test('the text editor open: 16 pt above it, as before', () => {
    assert.equal(buttonsBottom({ editorHeight: EDITOR }), FOLD.top - 12 - EDITOR - 16);
  });
});

describe('a layer in the keyboard place stays below the fold', () => {
  test('the keyboard height where that ends lower than the fold', () => {
    assert.equal(laptopLayerHeight(FOLD, WINDOW.height, WINDOW.height - KEYBOARD_TOP), WINDOW.height - KEYBOARD_TOP);
  });

  test('a keyboard reported from the fold top, or none seen yet: up to 8 pt below the fold', () => {
    assert.equal(WINDOW.height - laptopLayerHeight(FOLD, WINDOW.height, WINDOW.height - FOLD.top), FOLD.bottom + 8);
    assert.equal(WINDOW.height - laptopLayerHeight(FOLD, WINDOW.height, undefined), FOLD.bottom + 8);
  });
});

describe('sheets and centred cards off the fold', () => {
  test('a bottom sheet starts 8 pt below the fold; no limit outside the laptop pose', () => {
    assert.equal(WINDOW.height - (foldSheetMaxHeight(FOLD, WINDOW.height) ?? 0), FOLD.bottom + 8);
    assert.equal(foldSheetMaxHeight(null, WINDOW.height), undefined);
  });

  test('a web page ends 8 pt above the fold; nothing changes outside the laptop pose or for an area already above it', () => {
    assert.equal(931 - foldUpperHalfInset(FOLD, 931), FOLD.top - 8);
    assert.equal(foldUpperHalfInset(null, 931), 0);
    assert.equal(foldUpperHalfInset(FOLD, 400), 0);
  });

  test('a card that fits stands below the fold, a taller one above it, with the keyboard up always above', () => {
    const window = { height: WINDOW.height, topInset: 80 };
    assert.deepEqual(foldCardRegion(FOLD, window, 200, false), { top: 503.5, bottom: 927, above: false });
    assert.deepEqual(foldCardRegion(FOLD, window, 500, false), { top: 88, bottom: 447.5, above: true });
    assert.equal(foldCardRegion(FOLD, window, 100, true)?.above, true);
    assert.equal(foldCardRegion(null, window, 100, false), null);
  });

  test('a card held to the band above (it measures that band) stays above instead of swapping back', () => {
    const window = { height: WINDOW.height, topInset: 80 };
    assert.equal(foldCardRegion(FOLD, window, 447.5 - 88, false, true)?.above, true);
    assert.equal(foldCardRegion(FOLD, window, 150, false, true)?.above, false);
  });
});

describe('a list running across the fold', () => {
  // A list's frame from below the header to above the home indicator: upper window 100-455.5, band 455.5-495.5,
  // lower window 495.5-931.
  const FRAME = { top: 100, bottom: 931 };
  const UPPER = FOLD.top - FRAME.top;
  const LOWER = FRAME.bottom - FOLD.bottom;
  const CONTENT = 2000;
  const across = foldListAcross(FOLD, FRAME, CONTENT, null);

  test('the frame splits at the band: the list above it, its copy below it', () => {
    assert.deepEqual(across, { upper: UPPER, band: FOLD.bottom - FOLD.top, lower: LOWER });
  });

  test('the band is not counted: the scroll range is the content less both windows, and at its end the copy shows the last point', () => {
    assert.ok(across !== null);
    const insets = foldListInsets(across);
    // iOS: the farthest offset is the content height plus the bottom inset less the visible height.
    const range = CONTENT + insets.list.bottom - across.upper;
    assert.equal(range, CONTENT - UPPER - LOWER);
    assert.equal(foldCopyOffset(range, across) + across.lower, CONTENT);
    // The copy's top inset keeps it from scrolling above the point where the upper window ends.
    assert.equal(-insets.copy.top, foldCopyOffset(0, across));
  });

  test('the copy continues where the upper window ends, with no gap and no overlap, and back again', () => {
    assert.ok(across !== null);
    for (const offset of [0, 1, 300, CONTENT - UPPER - LOWER]) {
      // What the upper window shows last is what the lower window shows first.
      assert.equal(foldCopyOffset(offset, across), offset + UPPER);
      // A drag on the copy moves the list to the matching offset.
      assert.equal(foldListOffset(foldCopyOffset(offset, across), across), offset);
    }
    assert.equal(foldListOffset(900, across), 900 - UPPER);
  });

  test('no copy for content that fits above the fold, while the keyboard is up, or outside the laptop pose', () => {
    const fits = FOLD.top - 8 - FRAME.top;
    assert.equal(foldListAcross(FOLD, FRAME, fits, null), null);
    assert.notEqual(foldListAcross(FOLD, FRAME, fits + 1, null), null);
    assert.equal(foldListAcross(FOLD, FRAME, CONTENT, KEYBOARD_TOP), null);
    assert.equal(foldListAcross(null, FRAME, CONTENT, null), null);
    assert.equal(foldListAcross(FOLD, FRAME, null, null), null);
  });

  test("no copy for a frame that starts below the fold's top or ends above its bottom", () => {
    assert.equal(foldListAcross(FOLD, { top: FOLD.top, bottom: 931 }, CONTENT, null), null);
    assert.equal(foldListAcross(FOLD, { top: 100, bottom: FOLD.bottom }, CONTENT, null), null);
  });
});
