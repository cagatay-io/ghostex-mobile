/**
 * Run with `bun test src/panes/store.test.ts`. Closing the panes on the real pane store (in-memory AsyncStorage): they
 * stay closed in every window shape, upright and side by side (across and half folded like a laptop share the
 * side-by-side layout), also after a restart, and the next open brings back that shape's stored pane types and divider
 * but no session shown before: the session on screen stands in the first session pane's place, the chooser in a second
 * one's, and so it is when the window then turns into a shape with a stored layout.
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

/** What the pane host shows in `arrangement` with `selected` selected. */
function display(arrangement: PaneArrangement, selected = A) {
  const { document, shown, chooser, activeSlot } = usePaneStore.getState();
  return resolvePanes({
    offered: true,
    arrangement,
    selectedSessionKey: selected,
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
  test('stored side by side, closed upright: no shape opens panes by itself; the next open brings the types and divider back, the chooser for a session', async () => {
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

    // Opened again side by side: the session on screen in the first slot, the chooser where the second session was;
    // the panes stay closed until a pick, which keeps the divider.
    usePaneStore.getState().openPanes('sideBySide', A);
    expect(display('sideBySide')).toEqual({
      kind: 'panes',
      slots: [{ kind: 'session', sessionKey: A }, { kind: 'chooser' }],
      active: 0,
    });
    expect(usePaneStore.getState().document.closed).toBe(true);
    // B picked there again.
    usePaneStore.getState().showSessions('sideBySide', A, B);
    expect(usePaneStore.getState().document.layouts.sideBySide).toEqual({
      first: { paneType: 'session', sessionKey: A },
      second: { paneType: 'session', sessionKey: B },
      dividerRatio: 0.4,
    });
    expect(usePaneStore.getState().document.closed).toBeUndefined();
    // Open again means open in every shape: turned upright, that shape opens the same way; its stored C does not
    // come back.
    usePaneStore.getState().setShown({ arrangement: 'sideBySide', slots: [A, B] });
    expect(display('stacked')).toEqual({
      kind: 'panes',
      slots: [{ kind: 'session', sessionKey: A }, { kind: 'chooser' }],
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

describe('opening the panes again brings back the stored pane types and divider, never a session shown before', () => {
  const D = 'm1:delta';
  const files = { paneType: 'files', sessionKey: A } as const;

  test('a session shown in the second slot, closed, opened from another session: that session and the chooser', async () => {
    const store = usePaneStore.getState();
    store.showSessions('stacked', A, B);
    store.setDividerRatio('stacked', 0.35);
    store.closePanes();

    usePaneStore.getState().openPanes('stacked', C);
    expect(display('stacked', C)).toEqual({
      kind: 'panes',
      slots: [{ kind: 'session', sessionKey: C }, { kind: 'chooser' }],
      active: 0,
    });
    // Nothing is stored until a pick: the panes stay closed, the stored layout as it was.
    expect(usePaneStore.getState().document.closed).toBe(true);
    expect(usePaneStore.getState().document.layouts.stacked?.second).toEqual({ paneType: 'session', sessionKey: B });
    // Closed again from the chooser: one pane, and the next open shows the chooser again, not B.
    usePaneStore.getState().closeChooser();
    expect(display('stacked', C)).toEqual({ kind: 'single' });
    usePaneStore.getState().openPanes('stacked', C);
    expect(display('stacked', C)).toEqual({
      kind: 'panes',
      slots: [{ kind: 'session', sessionKey: C }, { kind: 'chooser' }],
      active: 0,
    });
    // A pick opens the panes with the stored divider.
    expect(display('stacked', D)).toEqual({
      kind: 'panes',
      slots: [
        { kind: 'session', sessionKey: C },
        { kind: 'session', sessionKey: D },
      ],
      active: 1,
    });
    usePaneStore.getState().showSessions('stacked', C, D);
    expect(usePaneStore.getState().document).toEqual({
      schemaVersion: 1,
      layouts: {
        stacked: {
          first: { paneType: 'session', sessionKey: C },
          second: { paneType: 'session', sessionKey: D },
          dividerRatio: 0.35,
        },
      },
    });
  });

  test('Files in the second slot: Files again beside the session on screen, with the divider', async () => {
    const store = usePaneStore.getState();
    store.showSlots('stacked', A, files);
    store.setDividerRatio('stacked', 0.65);
    store.closePanes();

    usePaneStore.getState().openPanes('stacked', C);
    expect(display('stacked', C)).toEqual({
      kind: 'panes',
      slots: [
        { kind: 'session', sessionKey: C },
        { kind: 'files', origin: A },
      ],
      active: 0,
    });
    expect(usePaneStore.getState().document).toEqual({
      schemaVersion: 1,
      layouts: { stacked: { first: { paneType: 'session', sessionKey: C }, second: files, dividerRatio: 0.65 } },
    });
  });

  test('swapped, Files first: Files stays first, the session on screen takes the second slot', async () => {
    const store = usePaneStore.getState();
    store.showSlots('sideBySide', A, files);
    store.swap('sideBySide');
    store.closePanes();

    usePaneStore.getState().openPanes('sideBySide', C);
    expect(display('sideBySide', C)).toEqual({
      kind: 'panes',
      slots: [
        { kind: 'files', origin: A },
        { kind: 'session', sessionKey: C },
      ],
      active: 1,
    });
    expect(usePaneStore.getState().document.layouts.sideBySide).toEqual({
      first: files,
      second: { paneType: 'session', sessionKey: C },
      dividerRatio: 0.5,
    });
  });

  test('the window turning into a shape with Files stored: Files again, the session on screen beside it', async () => {
    const store = usePaneStore.getState();
    store.showSlots('stacked', files, B);
    store.setDividerRatio('stacked', 0.3);
    store.showSessions('sideBySide', C, D);
    // On screen across, then turned upright.
    store.setShown({ arrangement: 'sideBySide', slots: [C, D] });
    expect(display('stacked', C)).toEqual({
      kind: 'panes',
      slots: [
        { kind: 'files', origin: A },
        { kind: 'session', sessionKey: C },
      ],
      active: 1,
    });
  });
});
