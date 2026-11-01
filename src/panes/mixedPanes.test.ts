/// <reference types="node" />
/**
 * Run with `bun test src/panes/mixedPanes.test.ts`. A session pane beside a browser, files or Git changes pane: the
 * stored layout (version 1) keeps a files or Git changes pane's origin session in `sessionKey`, the browser none; the
 * resolver keeps the selected session in the session pane, leaves the other pane's content alone when sessions are
 * selected (files and Git changes keep their project), keeps a non-terminal pane tapped last active, and
 * shows the chooser in a slot of a stored layout. Half folded like a book, the controls of a pane's body (a browser's
 * toolbar, the Files search, the Changes scope, the chooser) keep off the fold wherever the divider stands.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { paneGeometry, type PaneGeometryInput } from './geometry';
import { parsePaneLayoutDocument, SINGLE_PANE_DOCUMENT, type PaneLayout } from './layout';
import { resolvePanes, type PaneResolveInput } from './resolve';

const A = 'm1:a';
const B = 'm1:b';
const C = 'm1:c';

function input(layout: PaneLayout | undefined, partial: Partial<PaneResolveInput> = {}): PaneResolveInput {
  return {
    offered: true,
    arrangement: 'stacked',
    selectedSessionKey: A,
    layout,
    chooser: null,
    carried: null,
    activeSlot: null,
    isOpen: () => true,
    isKnown: () => true,
    ...partial,
  };
}

const WITH_BROWSER: PaneLayout = {
  first: { paneType: 'session', sessionKey: A },
  second: { paneType: 'browser' },
  dividerRatio: 0.5,
};
const WITH_FILES: PaneLayout = {
  first: { paneType: 'session', sessionKey: A },
  second: { paneType: 'files', sessionKey: A },
  dividerRatio: 0.5,
};

describe('the stored layout (version 1) with browser, files and Git changes panes', () => {
  test('a session pane and a files pane from the same session are valid; two session panes on it are not', () => {
    const document = { schemaVersion: 1, layouts: { stacked: WITH_FILES } };
    assert.deepEqual(parsePaneLayoutDocument(document), document);
    const twice = { ...WITH_FILES, second: { paneType: 'session', sessionKey: A } };
    assert.deepEqual(parsePaneLayoutDocument({ schemaVersion: 1, layouts: { stacked: twice } }), SINGLE_PANE_DOCUMENT);
  });
});

describe('a session pane beside another pane type', () => {
  test('the browser, files and Git changes panes show; the selected session is in the session pane', () => {
    for (const second of [
      { paneType: 'browser' },
      { paneType: 'files', sessionKey: A },
      { paneType: 'git', sessionKey: B },
    ] as const) {
      const resolution = resolvePanes(input({ ...WITH_BROWSER, second }));
      assert.equal(resolution.display.kind, 'panes');
      assert.equal(resolution.display.kind === 'panes' ? resolution.display.active : -1, 0);
      assert.equal(resolution.store, null);
    }
  });

  test('another session selected goes into the session pane; the files pane keeps its origin', () => {
    assert.deepEqual(resolvePanes(input(WITH_FILES, { selectedSessionKey: C, activeSlot: 1 })), {
      display: {
        kind: 'panes',
        slots: [
          { kind: 'session', sessionKey: C },
          { kind: 'files', origin: A },
        ],
        active: 0,
      },
      store: [C, { paneType: 'files', sessionKey: A }],
    });
  });

  test('a browser pane tapped last stays active while the selection stays beside it', () => {
    const resolution = resolvePanes(input(WITH_BROWSER, { activeSlot: 1 }));
    assert.equal(resolution.display.kind === 'panes' ? resolution.display.active : -1, 1);
  });

  test('without its origin, with its computer gone, or without a session pane: one pane', () => {
    assert.deepEqual(resolvePanes(input({ ...WITH_FILES, second: { paneType: 'files' } })).display, { kind: 'single' });
    assert.deepEqual(resolvePanes(input(WITH_FILES, { isKnown: (key) => key !== A, isOpen: () => true })).display, {
      kind: 'single',
    });
    const noSession: PaneLayout = {
      first: { paneType: 'browser' },
      second: { paneType: 'git', sessionKey: A },
      dividerRatio: 0.5,
    };
    assert.deepEqual(resolvePanes(input(noSession)).display, { kind: 'single' });
  });

  test('the chooser in a stored pane’s slot, beside the session; the session selected next fills it', () => {
    const chooser = { arrangement: 'stacked', firstSessionKey: A, slot: 1 } as const;
    assert.deepEqual(resolvePanes(input(WITH_BROWSER, { chooser })), {
      display: { kind: 'panes', slots: [{ kind: 'session', sessionKey: A }, { kind: 'chooser' }], active: 0 },
      store: null,
    });
    assert.deepEqual(resolvePanes(input(WITH_BROWSER, { chooser, selectedSessionKey: B })), {
      display: {
        kind: 'panes',
        slots: [
          { kind: 'session', sessionKey: A },
          { kind: 'session', sessionKey: B },
        ],
        active: 1,
      },
      store: [A, B],
    });
  });

  test('turned into a shape with nothing stored, a session and a Git changes pane come along and are stored', () => {
    const carried = [A, { paneType: 'git', sessionKey: A }] as const;
    assert.deepEqual(resolvePanes(input(undefined, { arrangement: 'sideBySide', carried })).store, carried);
  });
});

describe('half folded like a book: a body’s controls keep off the fold', () => {
  /** The fold's 40 pt division down the middle of the turned inner display, in container points. */
  const DIVISION = { start: 455.5, end: 495.5 };
  const ACROSS = { arrangement: 'sideBySide', width: 951, height: 520 } as const;
  const geometry = (input: Partial<PaneGeometryInput>) =>
    paneGeometry({ ...ACROSS, ratio: 0.5, active: 0, coverTop: null, editorTop: null, end: null, ...input });
  // Every whole percent the divider can stand at.
  const RATIOS = Array.from({ length: 51 }, (_, index) => (25 + index) / 100);

  test('across the divider range the stretch left to a body’s controls never meets the fold and is not empty', () => {
    for (const ratio of RATIOS) {
      for (const active of [0, 1] as const) {
        const { cards, bodyInsets, controlInsets } = geometry({ ratio, active, division: DIVISION });
        for (const index of [0, 1] as const) {
          const from = cards[index].x + bodyInsets[index].left + controlInsets[index].left;
          const to = cards[index].x + cards[index].width - bodyInsets[index].right - controlInsets[index].right;
          assert.ok(to <= DIVISION.start || from >= DIVISION.end, `body ${index} at ${ratio}: ${from}-${to}`);
          assert.ok(to - from > 0, `body ${index} at ${ratio} keeps room for its controls`);
        }
      }
    }
  });

  test('a body the fold does not reach keeps all of its width', () => {
    // At the middle the fold lies in the gap and the handle's reach: neither body is on it.
    assert.deepEqual(geometry({ ratio: 0.5, division: DIVISION }).controlInsets, [
      { left: 0, right: 0 },
      { left: 0, right: 0 },
    ]);
    // Divider well left of the fold: only the second body has the fold, in its leading part.
    const left = geometry({ ratio: 0.3, division: DIVISION });
    assert.deepEqual(left.controlInsets[0], { left: 0, right: 0 });
    assert.ok(left.controlInsets[1].left > 0 && left.controlInsets[1].right === 0);
    // Divider well right of it: only the first body, in its trailing part.
    const right = geometry({ ratio: 0.7, division: DIVISION });
    assert.ok(right.controlInsets[0].right > 0 && right.controlInsets[0].left === 0);
    assert.deepEqual(right.controlInsets[1], { left: 0, right: 0 });
  });

  test('the cards, the divider and the terminals stay where they are without the fold', () => {
    for (const ratio of RATIOS) {
      const flat = geometry({ ratio });
      const book = geometry({ ratio, division: DIVISION });
      assert.deepEqual(
        [book.slots, book.cards, book.divider, book.views, book.bodyInsets],
        [flat.slots, flat.cards, flat.divider, flat.views, flat.bodyInsets],
      );
    }
  });

  test('flat, half folded like a laptop and upright: no body gives up any width', () => {
    const none = [
      { left: 0, right: 0 },
      { left: 0, right: 0 },
    ];
    for (const ratio of RATIOS) {
      assert.deepEqual(geometry({ ratio }).controlInsets, none, `flat at ${ratio}`);
      assert.deepEqual(geometry({ ratio, end: 300 }).controlInsets, none, `laptop at ${ratio}`);
      const upright = paneGeometry({
        arrangement: 'stacked',
        width: 669,
        height: 800,
        ratio,
        active: 0,
        coverTop: null,
        editorTop: null,
        end: null,
      });
      assert.deepEqual(upright.controlInsets, none, `upright at ${ratio}`);
    }
  });
});
