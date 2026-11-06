/// <reference types="node" />
/**
 * Run with `bun test src/panes/geometry.test.ts`. Where the two panes stand in the pane container (the area below the
 * header they share), from the panes design's geometry: the two slots meet at the divider, each pane card
 * stands 6 pt off it (a 12 pt gap), every pane has a 44 pt title bar, and the body side facing the divider keeps
 * clear of the 44 pt handle (16 pt). Expectations are the rules for the two panes:
 * - portrait one above the other at the same x, landscape side by side at the same y;
 * - a manual divider ratio clamps to 25-75 % of the container, measured on the slots;
 * - portrait, keyboard up, top pane active: both stay in their slots, the bottom pane shrinks to the room above the
 *   keyboard, down to its title bar; a top pane that does not fit shrinks so the bottom title bar stays above it;
 * - portrait, keyboard up, bottom pane active: the divider moves up so the bottom pane keeps at least 240 pt;
 * - the keyboard gone, the divider stands where the user put it;
 * - landscape, keyboard up: both panes end above the keyboard;
 * - half folded like a laptop: both side by side above the fold, whatever the keyboard does below it;
 * - half folded like a book: the panes and their terminals as without the fold, but the handle and the title bars off
 *   it (the handle beside it in the title bars' row, never over a terminal);
 * - the terminals keep their size with the keyboard (their grid stays); what the cover hides they slide over.
 * Frames of the iPhone Duo's inner display with the header taken off: a 669 x 800 pt container upright, 951 x 520 pt
 * across.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  PANE_GAP,
  PANE_HANDLE_REACH,
  PANE_MIN_USABLE_HEIGHT,
  PANE_TITLE_HEIGHT,
  paneGeometry,
  type PaneGeometryInput,
} from './geometry';

const PORTRAIT = { width: 669, height: 800 };
const LANDSCAPE = { width: 951, height: 520 };

function stacked(input: Partial<PaneGeometryInput> = {}) {
  return paneGeometry({
    arrangement: 'stacked',
    ...PORTRAIT,
    ratio: 0.5,
    active: 0,
    coverTop: null,
    editorTop: null,
    end: null,
    ...input,
  });
}

function sideBySide(input: Partial<PaneGeometryInput> = {}) {
  return paneGeometry({
    arrangement: 'sideBySide',
    ...LANDSCAPE,
    ratio: 0.5,
    active: 0,
    coverTop: null,
    editorTop: null,
    end: null,
    ...input,
  });
}

const bottomOf = (rect: { y: number; height: number }) => rect.y + rect.height;
const rightOf = (rect: { x: number; width: number }) => rect.x + rect.width;

describe('two slots per window shape', () => {
  test('upright: the second pane is below the first, at the same x', () => {
    const { cards } = stacked();
    assert.ok(cards[1].y >= bottomOf(cards[0]));
    assert.equal(cards[1].x, cards[0].x);
  });

  test('across: the second pane is right of the first, at the same y', () => {
    const { cards } = sideBySide();
    assert.ok(cards[1].x >= rightOf(cards[0]));
    assert.equal(cards[1].y, cards[0].y);
  });

  test('the slots meet at the divider and fill the container; each card keeps 6 pt off the divider', () => {
    const { slots, cards, divider } = stacked();
    assert.deepEqual(slots, [
      { x: 0, y: 0, width: 669, height: 400 },
      { x: 0, y: 400, width: 669, height: 400 },
    ]);
    assert.deepEqual(cards, [
      { x: 0, y: 0, width: 669, height: 394 },
      { x: 0, y: 406, width: 669, height: 394 },
    ]);
    assert.deepEqual(divider, { x: 0, y: 394, width: 669, height: PANE_GAP });
  });
});

describe('the divider without the keyboard', () => {
  test('a ratio beyond the bounds leaves the smaller slot a quarter of the container', () => {
    for (const ratio of [0.9, 1]) {
      const { slots } = stacked({ ratio });
      assert.ok(Math.abs(slots[1].height - 0.25 * PORTRAIT.height) <= 1);
    }
    for (const ratio of [0.1, 0]) {
      const { slots } = sideBySide({ ratio });
      assert.ok(Math.abs(slots[0].width - 0.25 * LANDSCAPE.width) <= 1);
    }
  });

  test('moving the divider by 100 pt grows one pane and shrinks the other by the same amount', () => {
    const before = stacked({ ratio: 0.5 });
    const after = stacked({ ratio: 0.5 + 100 / PORTRAIT.height });
    assert.equal(after.cards[0].height - before.cards[0].height, 100);
    assert.equal(before.cards[1].height - after.cards[1].height, 100);
  });

  test('its handle is there to drag', () => {
    assert.equal(stacked().handleShown, true);
    assert.equal(sideBySide().handleShown, true);
  });
});

describe('upright, the keyboard up, the top pane active', () => {
  const KEYBOARD_TOP = 500;

  test('both panes keep their slots; the bottom one ends at the keyboard', () => {
    const before = stacked();
    const after = stacked({ coverTop: KEYBOARD_TOP });
    assert.deepEqual(after.cards[0], before.cards[0]);
    assert.equal(after.cards[1].y, before.cards[1].y);
    assert.ok(bottomOf(after.cards[1]) <= KEYBOARD_TOP);
    assert.equal(bottomOf(after.cards[1]), KEYBOARD_TOP);
  });

  test('a keyboard over more than the bottom pane leaves the bottom pane its title bar, above the keyboard', () => {
    const keyboardTop = 430;
    const { cards, collapsed } = stacked({ coverTop: keyboardTop });
    assert.equal(cards[1].height, PANE_TITLE_HEIGHT);
    assert.ok(bottomOf(cards[1]) <= keyboardTop);
    assert.deepEqual(collapsed, [false, true]);
  });

  test('a top pane that does not fit above the keyboard ends above it, with the bottom title bar between', () => {
    const keyboardTop = 300;
    const { cards } = stacked({ ratio: 0.6, coverTop: keyboardTop });
    assert.ok(bottomOf(cards[0]) <= keyboardTop);
    assert.equal(cards[1].height, PANE_TITLE_HEIGHT);
    assert.equal(bottomOf(cards[1]), keyboardTop);
  });

  test('the handle is hidden: the keyboard-time layout follows the rules and is not dragged', () => {
    assert.equal(stacked({ coverTop: KEYBOARD_TOP }).handleShown, false);
  });
});

describe('upright, the keyboard up, the bottom pane active', () => {
  const KEYBOARD_TOP = 500;

  test('the divider moves up so the bottom pane keeps at least 240 pt above the keyboard', () => {
    const before = stacked({ active: 1 });
    const after = stacked({ active: 1, coverTop: KEYBOARD_TOP });
    assert.equal(PANE_MIN_USABLE_HEIGHT, 240);
    assert.ok(after.cards[1].height >= PANE_MIN_USABLE_HEIGHT);
    assert.ok(bottomOf(after.cards[1]) <= KEYBOARD_TOP);
    assert.ok(after.divider.y < before.divider.y);
  });

  test('a bottom pane that already has the room keeps the divider where it is', () => {
    const before = stacked({ active: 1, ratio: 0.25 });
    const after = stacked({ active: 1, ratio: 0.25, coverTop: 650 });
    assert.equal(after.divider.y, before.divider.y);
    assert.ok(after.cards[1].height >= PANE_MIN_USABLE_HEIGHT);
  });
});

describe('the keyboard gone', () => {
  test('the divider returns to where the user put it: the keyboard layout depends on nothing stored', () => {
    for (const active of [0, 1] as const) {
      const before = stacked({ active, ratio: 0.62 });
      assert.notDeepEqual(stacked({ active, ratio: 0.62, coverTop: 420 }).divider, before.divider);
      assert.deepEqual(stacked({ active, ratio: 0.62 }), before);
    }
  });
});

describe('across, the keyboard up', () => {
  test('both panes end at the keyboard, at the same y and height', () => {
    const keyboardTop = 300;
    const { cards } = sideBySide({ coverTop: keyboardTop });
    assert.equal(bottomOf(cards[0]), keyboardTop);
    assert.equal(bottomOf(cards[1]), keyboardTop);
    assert.equal(cards[0].y, cards[1].y);
  });

  test('the text editor on the keyboard covers only the active pane', () => {
    const { covered } = sideBySide({ active: 1, coverTop: 300, editorTop: 244 });
    assert.equal(covered[1] - sideBySide({ active: 1, coverTop: 300 }).covered[1], 56);
    assert.equal(covered[0], sideBySide({ active: 1, coverTop: 300 }).covered[0]);
  });
});

describe('half folded like a laptop', () => {
  const FOLD_END = 367;

  test('both panes stand side by side above the fold, with and without the keyboard below it', () => {
    for (const coverTop of [null, 380]) {
      const { cards } = paneGeometry({
        arrangement: 'sideBySide',
        ...PORTRAIT,
        ratio: 0.5,
        active: 0,
        coverTop,
        editorTop: null,
        end: FOLD_END,
      });
      assert.ok(bottomOf(cards[0]) <= FOLD_END);
      assert.ok(bottomOf(cards[1]) <= FOLD_END);
      assert.equal(cards[0].y, cards[1].y);
      assert.ok(cards[1].x >= rightOf(cards[0]));
    }
  });

  test('the text editor above the fold covers the active pane only', () => {
    const input: PaneGeometryInput = {
      arrangement: 'sideBySide',
      ...PORTRAIT,
      ratio: 0.5,
      active: 0,
      coverTop: null,
      editorTop: null,
      end: FOLD_END,
    };
    const without = paneGeometry(input);
    const withEditor = paneGeometry({ ...input, editorTop: FOLD_END - 56 });
    assert.equal(withEditor.covered[0] - without.covered[0], 56);
    assert.equal(withEditor.covered[1], without.covered[1]);
  });
});

describe('half folded like a book: the fold down the container, no layout of its own', () => {
  /** The fold's 40 pt division down the middle of the turned inner display, in container points. */
  const DIVISION = { start: 455.5, end: 495.5 };
  const onDivision = (from: number, to: number) => to > DIVISION.start && from < DIVISION.end;
  const RATIOS = [0.25, 0.3, 0.45, 0.5, 0.55, 0.7, 0.75];

  test('the slots, cards, terminals and what the keyboard covers are those without the fold', () => {
    for (const ratio of RATIOS) {
      for (const coverTop of [null, 300]) {
        const flat = sideBySide({ ratio, coverTop });
        const book = sideBySide({ ratio, coverTop, division: DIVISION });
        assert.deepEqual(
          [book.slots, book.cards, book.divider, book.views, book.covered, book.bodyInsets],
          [flat.slots, flat.cards, flat.divider, flat.views, flat.covered, flat.bodyInsets],
        );
      }
    }
  });

  test('the handle and the title bars keep off the division; the handle keeps off both bodies', () => {
    for (const ratio of RATIOS) {
      const { handle, cards, barInsets } = sideBySide({ ratio, division: DIVISION });
      assert.equal(onDivision(handle.x, rightOf(handle)), false, `handle at ${ratio}`);
      for (const index of [0, 1] as const) {
        const card = cards[index];
        const bar = { from: card.x + barInsets[index].left, to: rightOf(card) - barInsets[index].right };
        assert.equal(onDivision(bar.from, bar.to), false, `title bar ${index} at ${ratio}`);
        // The bars' row is where the handle may stand beside the fold: it takes no title bar's place.
        if (handle.y < PANE_TITLE_HEIGHT) assert.ok(rightOf(handle) <= bar.from || handle.x >= bar.to);
        // Below the title bars, the bodies (the terminals) keep clear of the handle.
        const bodyFrom = card.x + PANE_HANDLE_REACH * (index === 1 ? 1 : 0);
        const bodyTo = rightOf(card) - PANE_HANDLE_REACH * (index === 0 ? 1 : 0);
        const inBodyRow = bottomOf(handle) > card.y + PANE_TITLE_HEIGHT;
        assert.ok(!inBodyRow || rightOf(handle) <= bodyFrom || handle.x >= bodyTo, `body ${index} at ${ratio}`);
      }
    }
  });

  test('a divider on the fold: the handle stands beside the fold, in the title bars’ row, on the divider’s side', () => {
    const left = sideBySide({ ratio: 0.49, division: DIVISION }).handle;
    assert.deepEqual(left, { x: DIVISION.start - 44, y: 0, width: 44, height: 44 });
    const right = sideBySide({ ratio: 0.51, division: DIVISION }).handle;
    assert.deepEqual(right, { x: DIVISION.end, y: 0, width: 44, height: 44 });
  });

  test('a divider away from the fold keeps its handle in the middle of the gap', () => {
    assert.deepEqual(sideBySide({ ratio: 0.3, division: DIVISION }).handle, sideBySide({ ratio: 0.3 }).handle);
  });

  test('without an active division down the container (flat, laptop, upright) nothing moves', () => {
    const across = sideBySide();
    assert.deepEqual(across.handle, { x: Math.round(951 / 2) - 22, y: (520 - 44) / 2, width: 44, height: 44 });
    assert.deepEqual(across.barInsets, [
      { left: 0, right: 0 },
      { left: 0, right: 0 },
    ]);
    const upright = stacked();
    assert.deepEqual(upright.handle, { x: (669 - 44) / 2, y: 400 - 22, width: 44, height: 44 });
    assert.deepEqual(upright.barInsets, across.barInsets);
  });
});

describe('the terminals in the panes', () => {
  test('keep their size whatever the keyboard does (their grid stays)', () => {
    for (const active of [0, 1] as const) {
      const before = stacked({ active });
      for (const coverTop of [500, 430, 300]) {
        assert.deepEqual(stacked({ active, coverTop }).views, before.views);
      }
    }
    assert.deepEqual(sideBySide({ coverTop: 300 }).views, sideBySide().views);
  });

  test('fill the body: the card less the title bar and, on the divider side, the handle reach', () => {
    const { views, cards } = stacked();
    assert.equal(PANE_HANDLE_REACH, 16);
    assert.deepEqual(views[0], { width: 669, height: cards[0].height - PANE_TITLE_HEIGHT - PANE_HANDLE_REACH });
    assert.deepEqual(views[1], { width: 669, height: cards[1].height - PANE_TITLE_HEIGHT });
    const across = sideBySide();
    assert.deepEqual(across.views[0], {
      width: across.cards[0].width - PANE_HANDLE_REACH,
      height: across.cards[0].height - PANE_TITLE_HEIGHT,
    });
    assert.deepEqual(across.views[1], {
      width: across.cards[1].width - PANE_HANDLE_REACH,
      height: across.cards[1].height - PANE_TITLE_HEIGHT,
    });
  });

  test('nothing is covered without the keyboard', () => {
    assert.deepEqual(stacked().covered, [0, 0]);
    assert.deepEqual(sideBySide().covered, [0, 0]);
  });

  test('what the keyboard rules take from a pane is what its terminal slides over', () => {
    const { views, covered, cards } = stacked({ active: 1, coverTop: 500 });
    assert.equal(covered[0], views[0].height - (cards[0].height - PANE_TITLE_HEIGHT - PANE_HANDLE_REACH));
    assert.equal(covered[1], views[1].height - (cards[1].height - PANE_TITLE_HEIGHT));
    const collapsed = stacked({ coverTop: 430 });
    assert.equal(collapsed.covered[1], collapsed.views[1].height);
  });
});
