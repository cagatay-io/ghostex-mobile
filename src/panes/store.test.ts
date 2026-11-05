/**
 * Run with `bun test src/panes/store.test.ts`. Closing the panes on the real pane store (in-memory AsyncStorage): they
 * stay closed in every window shape, upright and side by side (across and half folded like a laptop share the
 * side-by-side layout), also after a restart, and the next open brings back that shape's stored slots and divider.
 * What the pane host would show is read the way it reads it: `panesFrom` on the store, then `resolvePanes`.
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';

import type { PaneArrangement } from './layout';

const memory = new Map<string, string>();
mock.module('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (key: string) => Promise.resolve(memory.get(key) ?? null),
    setItem: (key: string, value: string) => {
      memory.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key: string) => {
      memory.delete(key);
      return Promise.resolve();
    },
  },
}));
// The store subscribes to the terminal store and waits for the saved computers only at startup (`initPaneLayouts`),
// which this file does not call.
mock.module('../terminal/sessions', () => ({ useTerminalStore: {} }));
mock.module('../machines/store', () => ({ useMachinesStore: {} }));

// Imported after the mocks above are registered: the store reads AsyncStorage at load.
const { PANE_LAYOUT_STORAGE_KEY, panesFrom, usePaneStore } = await import('./store');
const { SINGLE_PANE_DOCUMENT } = await import('./layout');
const { resolvePanes } = await import('./resolve');

const A = 'm1:alpha';
const B = 'm1:beta';
const C = 'm1:gamma';

/** What the pane host shows in `arrangement` with `A` selected. */
function display(arrangement: PaneArrangement) {
  const { document, shown, chooser, activeSlot } = usePaneStore.getState();
  return resolvePanes({
    offered: true,
    arrangement,
    selectedSessionKey: A,
    ...panesFrom(document, shown, arrangement),
    chooser,
    activeSlot,
    isOpen: () => true,
    isKnown: () => true,
  }).display;
}

async function restart(): Promise<void> {
  usePaneStore.setState({ hydrated: false, document: SINGLE_PANE_DOCUMENT, shown: null, chooser: null });
  await usePaneStore.getState().hydrate();
}

beforeEach(async () => {
  memory.clear();
  await restart();
});

describe('closing the panes applies to every window shape and keeps each shape’s layout', () => {
  test('stored side by side, closed upright: no shape opens panes by itself; the next open brings the slots and divider back', async () => {
    const store = usePaneStore.getState();
    store.showSessions('sideBySide', A, B);
    store.setDividerRatio('sideBySide', 0.4);
    store.showSessions('stacked', A, C);
    store.setDividerRatio('stacked', 0.6);
    // Upright on screen, then closed there.
    store.setShown({ arrangement: 'stacked', slots: [A, C] });
    store.closePanes();

    // Turned across, or half folded like a laptop: the same side-by-side layout, and no panes.
    expect(display('sideBySide')).toEqual({ kind: 'single' });
    expect(display('stacked')).toEqual({ kind: 'single' });
    // Nothing carries the panes last on screen into the other shape.
    expect(usePaneStore.getState().shown).toBeNull();

    // Closed is stored: a restart keeps every shape closed and each layout stored.
    await restart();
    expect(display('sideBySide')).toEqual({ kind: 'single' });
    expect(display('stacked')).toEqual({ kind: 'single' });
    expect(JSON.parse(memory.get(PANE_LAYOUT_STORAGE_KEY) ?? 'null')).toEqual({
      schemaVersion: 1,
      layouts: {
        stacked: {
          first: { paneType: 'session', sessionKey: A },
          second: { paneType: 'session', sessionKey: C },
          dividerRatio: 0.6,
        },
        sideBySide: {
          first: { paneType: 'session', sessionKey: A },
          second: { paneType: 'session', sessionKey: B },
          dividerRatio: 0.4,
        },
      },
      closed: true,
    });

    // Opened again side by side: that shape's slots and divider.
    usePaneStore.getState().openPanes('sideBySide', A);
    expect(display('sideBySide')).toEqual({
      kind: 'panes',
      slots: [
        { kind: 'session', sessionKey: A },
        { kind: 'session', sessionKey: B },
      ],
      active: 0,
    });
    expect(usePaneStore.getState().document.layouts.sideBySide?.dividerRatio).toBe(0.4);
    expect(usePaneStore.getState().document.closed).toBeUndefined();
    // Open again means open in every shape: upright shows its own stored layout.
    expect(display('stacked')).toEqual({
      kind: 'panes',
      slots: [
        { kind: 'session', sessionKey: A },
        { kind: 'session', sessionKey: C },
      ],
      active: 0,
    });
  });

  test('closed, then Panes in a shape with nothing stored: the chooser; the panes stay closed until a pick stores them', async () => {
    const store = usePaneStore.getState();
    store.showSessions('stacked', A, C);
    store.closePanes();

    usePaneStore.getState().openPanes('sideBySide', A);
    expect(display('sideBySide')).toEqual({
      kind: 'panes',
      slots: [{ kind: 'session', sessionKey: A }, { kind: 'chooser' }],
      active: 0,
    });
    expect(usePaneStore.getState().document.closed).toBe(true);
    // The chooser closed again: nothing opens anywhere.
    usePaneStore.getState().closeChooser();
    expect(display('stacked')).toEqual({ kind: 'single' });

    usePaneStore.getState().openPanes('sideBySide', A);
    usePaneStore.getState().showSessions('sideBySide', A, B);
    expect(usePaneStore.getState().document.closed).toBeUndefined();
    expect(display('stacked')).toEqual({
      kind: 'panes',
      slots: [
        { kind: 'session', sessionKey: A },
        { kind: 'session', sessionKey: C },
      ],
      active: 0,
    });
  });

  test('a value stored before closing was kept has no `closed` and reads as open', async () => {
    memory.set(
      PANE_LAYOUT_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        layouts: {
          stacked: {
            first: { paneType: 'session', sessionKey: A },
            second: { paneType: 'browser' },
            dividerRatio: 0.5,
          },
        },
      }),
    );
    await restart();
    expect(display('stacked')).toEqual({
      kind: 'panes',
      slots: [{ kind: 'session', sessionKey: A }, { kind: 'browser' }],
      active: 0,
    });
  });
});
