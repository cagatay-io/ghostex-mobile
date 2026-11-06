/// <reference types="node" />
/**
 * Run with `bun test src/panes/resolve.test.ts`. What the pane host shows: the active pane is the one tapped last and
 * takes the keyboard, the pad and the editor, so it holds the selected session; a session is shown in one pane at
 * most; without pane slots (folded, other iPhones), for a shell tab or while a question opened from the attention list
 * stands full screen there is one content area and the stored layout waits; a stored layout this build cannot show
 * leaves one pane; the chooser over a session pane names that pane's session until a pick replaces it. Which session
 * pane shows its chat view (`paneChatAfter`): one at most, chosen per pane, never stored.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { PaneLayout } from './layout';
import { paneChatAfter, resolvePanes, type PaneChatInput, type PaneResolveInput } from './resolve';

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
    const layout: PaneLayout = { ...STACKED, second: { paneType: 'usage' } };
    assert.deepEqual(resolvePanes(input({ layout })), { display: { kind: 'single' }, store: null });
  });
});

describe('one content area', () => {
  test('without pane slots, for a shell tab or behind a question from the attention list (not offered): the layout waits', () => {
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

describe('the chooser over a session pane beside another', () => {
  test('it names the session it stands over; nothing is stored until a pick, which replaces that session', () => {
    const second = { arrangement: 'stacked', firstSessionKey: A, slot: 1 } as const;
    assert.deepEqual(resolvePanes(input({ chooser: second })), {
      display: {
        kind: 'panes',
        slots: [
          { kind: 'session', sessionKey: A },
          { kind: 'chooser', over: B },
        ],
        active: 0,
      },
      store: null,
    });
    assert.deepEqual(resolvePanes(input({ chooser: second, selectedSessionKey: C })), {
      display: { kind: 'panes', slots: sessions(A, C), active: 1 },
      store: [A, C],
    });
    const first = { arrangement: 'stacked', firstSessionKey: B, slot: 0 } as const;
    assert.deepEqual(resolvePanes(input({ chooser: first, selectedSessionKey: B })), {
      display: {
        kind: 'panes',
        slots: [
          { kind: 'chooser', over: A },
          { kind: 'session', sessionKey: B },
        ],
        active: 1,
      },
      store: null,
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

describe('which pane shows its chat view', () => {
  /** The session panes on screen, each with whether its saved view is its chat. */
  const views = (...entries: [string, boolean][]) => new Map(entries);
  const chatInput = (partial: Partial<PaneChatInput>): PaneChatInput => ({
    before: null,
    now: views([A, false], [B, false]),
    selectedSessionKey: A,
    chatSession: null,
    picked: null,
    ...partial,
  });

  test('the panes appear from the chat view: the selected session keeps its chat in its slot', () => {
    assert.equal(paneChatAfter(chatInput({ now: views([A, true]) })), A);
    assert.equal(paneChatAfter(chatInput({ now: views([A, true], [B, true]) })), A);
  });

  test('the panes appear from the terminal view: terminals only', () => {
    assert.equal(paneChatAfter(chatInput({ now: views([A, false], [B, true]) })), null);
  });

  test('a pane pick opens its terminal, whatever its saved view', () => {
    const before = views([A, true]);
    assert.equal(
      paneChatAfter(
        chatInput({ before, now: views([A, true], [B, true]), selectedSessionKey: B, chatSession: A, picked: B }),
      ),
      A,
    );
  });

  test('a session selected from outside the panes comes in with its saved view; its chat is the one chat', () => {
    const before = views([A, true], [B, false]);
    const after = (now: Map<string, boolean>) =>
      paneChatAfter(chatInput({ before, now, selectedSessionKey: C, chatSession: A }));
    assert.equal(after(views([A, true], [C, true])), C);
    assert.equal(after(views([A, true], [C, false])), A);
  });

  test('the pane-scoped choice holds while its sessions stay on screen', () => {
    const now = views([A, true], [B, false]);
    assert.equal(paneChatAfter(chatInput({ before: now, now, selectedSessionKey: B, chatSession: B })), B);
    assert.equal(paneChatAfter(chatInput({ before: now, now, selectedSessionKey: A, chatSession: null })), null);
  });

  test('a saved view changed while its session stands in a pane takes effect there', () => {
    const before = views([A, false], [B, false]);
    assert.equal(paneChatAfter(chatInput({ before, now: views([A, false], [B, true]), chatSession: null })), B);
    const chatting = views([A, true], [B, false]);
    assert.equal(
      paneChatAfter(chatInput({ before: chatting, now: views([A, false], [B, false]), chatSession: A })),
      null,
    );
  });

  test('a chat whose session left the panes is no longer the chat', () => {
    assert.equal(
      paneChatAfter(
        chatInput({ before: views([A, false], [B, false]), now: views([A, false], [C, false]), chatSession: B }),
      ),
      null,
    );
  });

  test('a session coming in beside the selected one shows its terminal, also when it was the chat before', () => {
    assert.equal(paneChatAfter(chatInput({ before: null, now: views([A, false], [B, true]), chatSession: B })), null);
  });

  test('one content area: the value waits', () => {
    assert.equal(paneChatAfter(chatInput({ now: null, chatSession: B })), B);
  });

  test('a pane pick of the session already shown as chat turns its pane to the terminal (review K-10)', () => {
    const now = views([A, true], [B, false]);
    assert.equal(
      paneChatAfter(chatInput({ before: now, now, selectedSessionKey: A, chatSession: A, picked: A })),
      null,
    );
  });

  test('a pick only counts once it is the selection: a pick not yet selected leaves the chat alone', () => {
    const now = views([A, true], [B, false]);
    assert.equal(paneChatAfter(chatInput({ before: now, now, selectedSessionKey: B, chatSession: A, picked: A })), A);
  });
});
