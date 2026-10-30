/**
 * Run with `bun test src/settings/store.test.ts`. REQ-FILES-007 AC3: on a fresh install (empty in-memory
 * AsyncStorage) the project file browser's hidden-files switch `showHiddenFiles` reads false; switched on, it
 * stays on across a store reload; settings stored before it existed read it as off (FL-STA-03).
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';

const memory = new Map<string, string>();
mock.module('react-native', () => ({ Platform: { OS: 'ios' } }));
mock.module('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (key: string) => Promise.resolve(memory.get(key) ?? null),
    setItem: (key: string, value: string) => {
      memory.set(key, value);
      return Promise.resolve();
    },
  },
}));

// Imported after the mocks above are registered: the store reads react-native and AsyncStorage at load.
const { defaultSettings, useSettingsStore } = await import('./store');

async function reload(): Promise<void> {
  useSettingsStore.setState({ hydrated: false, settings: defaultSettings() });
  await useSettingsStore.getState().hydrate();
}

beforeEach(() => {
  memory.clear();
});

describe('REQ-FILES-007: hidden files sit behind a switch that is off by default', () => {
  test('REQ-FILES-007 AC3: a fresh install reads showHiddenFiles as false', async () => {
    await reload();
    expect(useSettingsStore.getState().settings.showHiddenFiles).toBe(false);
  });

  test('REQ-FILES-007 AC2: switched on, it is still on after a reload', async () => {
    await reload();
    useSettingsStore.getState().setSetting('showHiddenFiles', true);
    await reload();
    expect(useSettingsStore.getState().settings.showHiddenFiles).toBe(true);
  });

  test('REQ-FILES-007 AC3: settings saved before the switch existed read it as off', async () => {
    memory.set('settings.v1', JSON.stringify({ fontSize: 12, autoReconnect: false }));
    await reload();
    expect(useSettingsStore.getState().settings.showHiddenFiles).toBe(false);
    expect(useSettingsStore.getState().settings.autoReconnect).toBe(false);
  });
});
