/// <reference types="node" />
/**
 * Run with `bun test src/panes/infoPanes.test.ts`. The agents, attention list and usage panes beside a session: the
 * stored layout (version 1) names them as `{paneType: "agents"}`, `{paneType: "attention"}` and
 * `{paneType: "usage", sessionKey: <the session it was opened from>}`; the resolver shows them beside the session
 * pane, leaves them alone when sessions are selected (the usage pane keeps its computer), and leaves one pane for a
 * usage pane without its origin or whose computer the app no longer knows.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { parsePaneLayoutDocument, type PaneLayout } from './layout';
import { paneContentOf, paneEntryOf, resolvePanes, type PaneResolveInput } from './resolve';

const A = 'm1:a';
const C = 'm2:c';

function input(layout: PaneLayout | undefined, partial: Partial<PaneResolveInput> = {}): PaneResolveInput {
  return {
    offered: true,
    arrangement: 'stacked',
    selectedSessionKey: A,
    layout,
    chooser: null,
    turned: false,
    carried: null,
    activeSlot: null,
    isOpen: () => true,
    isKnown: () => true,
    ...partial,
  };
}

const beside = (second: PaneLayout['second']): PaneLayout => ({
  first: { paneType: 'session', sessionKey: A },
  second,
  dividerRatio: 0.4,
});

describe('the stored layout (version 1)', () => {
  test('agents, attention and usage with its origin session are valid documents and read back as written', () => {
    for (const second of [
      { paneType: 'agents' },
      { paneType: 'attention' },
      { paneType: 'usage', sessionKey: A },
    ] as const) {
      const document = { schemaVersion: 1, layouts: { stacked: beside(second) } };
      assert.deepEqual(parsePaneLayoutDocument(document), document);
    }
  });

  test('each slot’s content is stored as that slot, and read back as the same content', () => {
    for (const content of [{ kind: 'agents' }, { kind: 'attention' }, { kind: 'usage', origin: A }] as const) {
      const entry = paneEntryOf(content);
      assert.notEqual(entry, null);
      assert.deepEqual(paneContentOf(entry ?? A), content);
    }
    assert.deepEqual(paneEntryOf({ kind: 'usage', origin: A }), { paneType: 'usage', sessionKey: A });
    assert.deepEqual(paneEntryOf({ kind: 'agents' }), { paneType: 'agents' });
  });
});

describe('beside a session pane', () => {
  test('each shows; the session pane holds the selected session; nothing new is stored', () => {
    for (const [second, content] of [
      [{ paneType: 'agents' }, { kind: 'agents' }],
      [{ paneType: 'attention' }, { kind: 'attention' }],
      [
        { paneType: 'usage', sessionKey: A },
        { kind: 'usage', origin: A },
      ],
    ] as const) {
      assert.deepEqual(resolvePanes(input(beside(second))), {
        display: { kind: 'panes', slots: [{ kind: 'session', sessionKey: A }, content], active: 0 },
        store: null,
      });
    }
  });

  test('another session selected, also on another computer, goes into the session pane; usage keeps its computer', () => {
    assert.deepEqual(
      resolvePanes(input(beside({ paneType: 'usage', sessionKey: A }), { selectedSessionKey: C, activeSlot: 1 })),
      {
        display: {
          kind: 'panes',
          slots: [
            { kind: 'session', sessionKey: C },
            { kind: 'usage', origin: A },
          ],
          active: 0,
        },
        store: [C, { paneType: 'usage', sessionKey: A }],
      },
    );
    assert.deepEqual(resolvePanes(input(beside({ paneType: 'agents' }), { selectedSessionKey: C })).store, [
      C,
      { paneType: 'agents' },
    ]);
  });

  test('tapped last, the pane stays the active one while the selection stays in the session pane', () => {
    const resolution = resolvePanes(input(beside({ paneType: 'attention' }), { activeSlot: 1 }));
    assert.equal(resolution.display.kind === 'panes' ? resolution.display.active : -1, 1);
  });

  test('usage without its origin, or whose computer is no longer known: one pane', () => {
    assert.deepEqual(resolvePanes(input(beside({ paneType: 'usage' }))).display, { kind: 'single' });
    const gone = input(beside({ paneType: 'usage', sessionKey: 'm9:x' }), { isKnown: (key) => !key.startsWith('m9:') });
    assert.deepEqual(resolvePanes(gone).display, { kind: 'single' });
  });

  test('agents and attention with a session key they do not use still show (the key binds nothing for them)', () => {
    const display = resolvePanes(input(beside({ paneType: 'attention', sessionKey: 'm9:x' }))).display;
    assert.deepEqual(display.kind === 'panes' ? display.slots[1] : null, { kind: 'attention' });
  });

  test('turned into a shape with nothing stored, the two panes come along and are stored', () => {
    const carried = [{ paneType: 'usage', sessionKey: A }, A] as const;
    assert.deepEqual(
      resolvePanes(input(undefined, { arrangement: 'sideBySide', turned: true, carried })).store,
      carried,
    );
  });
});
