/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. The Actions… entry's last-run mark, per computer and project, names the action by
 * its list (scope) and commandId, since a project action and a Global Action can share an id. A project action's
 * mark is stored exactly as before (the bare commandId), so marks saved by an earlier version still apply.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { lastActionKey, useLauncherStore } from './launcherStore';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const STORAGE_KEY = 'drawer.launcher.v1';

/** What the store last wrote. */
function lastWrite(): unknown {
  const calls = (AsyncStorage.setItem as jest.Mock).mock.calls.filter(([key]) => key === STORAGE_KEY);
  const last = calls.at(-1);
  return last === undefined ? null : JSON.parse(last[1] as string);
}

beforeEach(async () => {
  await AsyncStorage.clear();
  (AsyncStorage.setItem as jest.Mock).mockClear();
  useLauncherStore.setState({ hydrated: false, primaryAgentId: '', lastActionByProject: {} });
});

test('a mark saved by an earlier version reads as the project action', async () => {
  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ primaryAgentId: 'claude', lastActionByProject: { 'm1:P1': 'c1' } }),
  );
  await useLauncherStore.getState().hydrate();
  expect(useLauncherStore.getState().lastActionByProject).toEqual({ 'm1:P1': { scope: 'project', commandId: 'c1' } });
  expect(useLauncherStore.getState().primaryAgentId).toBe('claude');
});

test('a project action is stored as before; a Global Action with its scope', async () => {
  const store = useLauncherStore.getState();
  store.setLastAction('m1', 'P1', { scope: 'project', commandId: 'c1' });
  store.setLastAction('m1', 'P2', { scope: 'global', commandId: 'c1' });
  expect(lastWrite()).toEqual({
    primaryAgentId: '',
    agentByProject: {},
    agentBySpace: {},
    lastActionByProject: { 'm1:P1': 'c1', 'm1:P2': { scope: 'global', commandId: 'c1' } },
  });
  expect(useLauncherStore.getState().lastActionByProject[lastActionKey('m1', 'P2')]).toEqual({
    scope: 'global',
    commandId: 'c1',
  });
});

test('both kinds of mark read back after a restart; unreadable ones are skipped', async () => {
  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      lastActionByProject: {
        'm1:P1': 'c1',
        'm1:P2': { scope: 'global', commandId: 'g1' },
        'm1:P3': { scope: 'other', commandId: 'g1' },
        'm1:P4': { scope: 'global' },
        'm1:P5': 7,
      },
    }),
  );
  await useLauncherStore.getState().hydrate();
  expect(useLauncherStore.getState().lastActionByProject).toEqual({
    'm1:P1': { scope: 'project', commandId: 'c1' },
    'm1:P2': { scope: 'global', commandId: 'g1' },
  });
});
