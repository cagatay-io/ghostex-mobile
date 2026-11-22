/**
 * Keys typed, and texts sent (the pad's text editor, a paste, an upload's link), into a terminal while its link to the
 * computer is replaced: the native terminal (iOS) cannot send them and does not keep them for later (an Enter that
 * arrives late could confirm something the user no longer sees), so it reports what went nowhere
 * (`onTerminalInputNotSent`: counts and upload titles only, never the characters) and, once a key or text is sent
 * again, that the sign can go (`onTerminalInputSent`). This store sums them per terminal for the card above the
 * keyboard (`NotSentSign.tsx`); the card goes with the next key or text that is sent, its close button, or the tab.
 * Android's terminal sends neither event, so nothing changes there.
 */

import { create } from 'zustand';

import { GhostexNative } from '../../modules/ghostex-native/src';
import type { NotSentKeyCounts } from '../copy/terminal';
import { useTerminalStore } from './sessions';

type NotSentKeysState = {
  /** By terminal session key; absent while nothing went unsent since the last key or text that was sent. */
  bySession: Readonly<Record<string, NotSentKeyCounts>>;
};

export const useNotSentKeysStore = create<NotSentKeysState>()(() => ({ bySession: {} }));

/** A count from a native event: a whole number, 0 for anything else. */
function keyCount(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0;
}

/** Upload titles from a native event: its non-empty strings, nothing for anything else. */
function linkTitles(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((title): title is string => typeof title === 'string' && title.length > 0)
    : [];
}

/** Adds what `sessionKey`'s terminal could not send to its sign. */
export function noteKeysNotSent(sessionKey: string, event: Partial<Record<keyof NotSentKeyCounts, unknown>>): void {
  const added = {
    keys: keyCount(event.keys),
    returns: keyCount(event.returns),
    backspaces: keyCount(event.backspaces),
    escapes: keyCount(event.escapes),
    texts: keyCount(event.texts),
    pastes: keyCount(event.pastes),
    links: linkTitles(event.links),
  };
  const countedNothing =
    added.keys + added.returns + added.backspaces + added.escapes + added.texts + added.pastes === 0;
  if (countedNothing && added.links.length === 0) return;
  const { bySession } = useNotSentKeysStore.getState();
  const shown = bySession[sessionKey];
  const total =
    shown === undefined
      ? added
      : {
          keys: shown.keys + added.keys,
          returns: shown.returns + added.returns,
          backspaces: shown.backspaces + added.backspaces,
          escapes: shown.escapes + added.escapes,
          texts: shown.texts + added.texts,
          pastes: shown.pastes + added.pastes,
          links: [...shown.links, ...added.links],
        };
  useNotSentKeysStore.setState({ bySession: { ...bySession, [sessionKey]: total } });
}

/** The next key or text went out, or the user closed the sign: `sessionKey`'s sign goes. */
export function clearKeysNotSent(sessionKey: string): void {
  const { bySession } = useNotSentKeysStore.getState();
  if (bySession[sessionKey] === undefined) return;
  const { [sessionKey]: _gone, ...rest } = bySession;
  useNotSentKeysStore.setState({ bySession: rest });
}

let installed = false;

/** Listens for the native terminal's reports once, at app start, beside `initTerminalEvents`. */
export function initNotSentKeys(): void {
  if (installed) return;
  installed = true;
  GhostexNative.addListener('onTerminalInputNotSent', (event) => noteKeysNotSent(event.sessionKey, event));
  GhostexNative.addListener('onTerminalInputSent', (event) => clearKeysNotSent(event.sessionKey));
  // A closed tab takes its sign along, so the same session opened later starts without one.
  useTerminalStore.subscribe((state, previous) => {
    if (state.tabs === previous.tabs) return;
    const open = new Set(state.tabs.map((tab) => tab.sessionKey));
    for (const sessionKey of Object.keys(useNotSentKeysStore.getState().bySession)) {
      if (!open.has(sessionKey)) clearKeysNotSent(sessionKey);
    }
  });
}
