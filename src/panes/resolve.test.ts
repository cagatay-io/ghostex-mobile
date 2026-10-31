/// <reference types="node" />
/**
 * Run with `bun test src/panes/resolve.test.ts`. What the pane host shows: the active pane is the one tapped last and
 * takes the keyboard, the pad and the editor, so it holds the selected session; a session is shown in one pane at
 * most; without pane slots (folded, other iPhones), in the chat view or for a shell tab there is one content area and
 * the stored layout waits; a stored layout this build cannot show leaves one pane.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { PaneLayout } from './layout';
import { resolvePanes, type PaneResolveInput } from './resolve';

const A = 'm1:a';
const B = 'm1:b';
const C = 'm1:c';

const STACKED: PaneLayout = {
  first: { paneType: 'session', sessionKey: A },
  second: { paneType: 'session', sessionKey: B },
  dividerRatio: 0.5,
};

function input(partial: Partial<PaneResolveInput>): PaneResolveInput {
  return {
    offered: true,
    arrangement: 'stacked',
    selectedSessionKey: A,
    layout: STACKED,
    chooser: null,
    carried: null,
    activeSlot: 0,
    isOpen: () => true,
    isKnown: () => true,
    ...partial,
  };
}

const sessions = (first: string, second: string) => [
  { kind: 'session', sessionKey: first },
  { kind: 'session', sessionKey: second },
];

describe('two session panes', () => {
  test('the selected session is the active pane', () => {
    assert.deepEqual(resolvePanes(input({ selectedSessionKey: A })), {
      display: { kind: 'panes', slots: sessions(A, B), active: 0 },
      store: null,
    });
    assert.deepEqual(resolvePanes(input({ selectedSessionKey: B })), {
      display: { kind: 'panes', slots: sessions(A, B), active: 1 },
      store: null,
    });
  });

  test('selecting another session puts it into the active pane; the other pane keeps its session', () => {
    assert.deepEqual(resolvePanes(input({ selectedSessionKey: C, activeSlot: 0 })), {
      display: { kind: 'panes', slots: sessions(C, B), active: 0 },
      store: [C, B],
    });
    assert.deepEqual(resolvePanes(input({ selectedSessionKey: C, activeSlot: 1 })), {
      display: { kind: 'panes', slots: sessions(A, C), active: 1 },
      store: [A, C],
    });
  });

  test('a stored session without a tab still shows when its computer is known (it is attached again)', () => {
    const resolution = resolvePanes(input({ isOpen: (key) => key === A, isKnown: () => true }));
    assert.deepEqual(resolution.display, { kind: 'panes', slots: sessions(A, B), active: 0 });
  });

  test('a stored session whose computer is gone leaves one pane', () => {
    const resolution = resolvePanes(input({ isOpen: (key) => key === A, isKnown: () => false }));
    assert.deepEqual(resolution, { display: { kind: 'single' }, store: null });
  });

  test('a stored pane type this build cannot show leaves one pane', () => {
    const layout: PaneLayout = { ...STACKED, second: { paneType: 'browser' } };
    assert.deepEqual(resolvePanes(input({ layout })), { display: { kind: 'single' }, store: null });
  });
});

describe('one content area', () => {
  test('without pane slots, in the chat view or for a shell tab (not offered): the layout waits', () => {
    assert.deepEqual(resolvePanes(input({ offered: false })), { display: { kind: 'single' }, store: null });
  });

  test('nothing stored for the window shape', () => {
    assert.deepEqual(resolvePanes(input({ layout: undefined })), { display: { kind: 'single' }, store: null });
  });

  test('nothing selected', () => {
    assert.deepEqual(resolvePanes(input({ selectedSessionKey: null })), { display: { kind: 'single' }, store: null });
  });
});

describe('the chooser in the second slot', () => {
  const chooser = { arrangement: 'stacked', firstSessionKey: A } as const;

  test('beside the session that was on screen, which stays active', () => {
    assert.deepEqual(resolvePanes(input({ layout: undefined, chooser })), {
      display: { kind: 'panes', slots: [{ kind: 'session', sessionKey: A }, { kind: 'chooser' }], active: 0 },
      store: null,
    });
  });

  test('the session selected next fills it and is active; the two are stored', () => {
    assert.deepEqual(resolvePanes(input({ layout: undefined, chooser, selectedSessionKey: C })), {
      display: { kind: 'panes', slots: sessions(A, C), active: 1 },
      store: [A, C],
    });
  });

  test('only in the window shape it was opened for, and only while the first session is open', () => {
    assert.deepEqual(resolvePanes(input({ layout: undefined, chooser, arrangement: 'sideBySide' })).display, {
      kind: 'single',
    });
    assert.deepEqual(resolvePanes(input({ layout: undefined, chooser, isOpen: () => false })).display, {
      kind: 'single',
    });
  });
});

describe('the window turning into a shape with nothing stored', () => {
  // The two panes on screen before the window turned stay, in the new shape's slots and with the divider in the middle.
  test('the panes on screen come along, the selected one active, and are stored for the new shape', () => {
    assert.deepEqual(
      resolvePanes(input({ arrangement: 'sideBySide', layout: undefined, carried: [A, B], selectedSessionKey: B })),
      { display: { kind: 'panes', slots: sessions(A, B), active: 1 }, store: [A, B] },
    );
  });

  test('a session selected outside them goes into the active pane, as with a stored layout', () => {
    assert.deepEqual(
      resolvePanes(
        input({ arrangement: 'sideBySide', layout: undefined, carried: [A, B], selectedSessionKey: C, activeSlot: 1 }),
      ),
      { display: { kind: 'panes', slots: sessions(A, C), active: 1 }, store: [A, C] },
    );
  });

  test('a layout stored for the new shape wins over what came along', () => {
    assert.deepEqual(resolvePanes(input({ layout: STACKED, carried: [C, A], selectedSessionKey: A })), {
      display: { kind: 'panes', slots: sessions(A, B), active: 0 },
      store: null,
    });
  });

  test('a pane that came along but can no longer be attached leaves one pane', () => {
    assert.deepEqual(
      resolvePanes(input({ layout: undefined, carried: [A, B], isOpen: (key) => key === A, isKnown: () => false })),
      { display: { kind: 'single' }, store: null },
    );
  });

  test('nothing came along (one pane before): one pane', () => {
    assert.deepEqual(resolvePanes(input({ layout: undefined, carried: null })), {
      display: { kind: 'single' },
      store: null,
    });
  });
});
