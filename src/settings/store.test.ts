/**
 * Run with `bun test src`. A changed pad key survives a store reload (in-memory AsyncStorage);
 * the `commandPadKeys` fallback (absent or invalid = the default nine); a stored
 * `extraKeysToolbarVisible` keeps its meaning for the pad.
 * The pad position per layout (`commandPadPosition`; absent or invalid = the default position).
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
const { DEFAULT_COMMAND_PAD_KEYS } = await import('./commandPad');

async function reload(): Promise<void> {
  useSettingsStore.setState({ hydrated: false, settings: defaultSettings() });
  await useSettingsStore.getState().hydrate();
}

beforeEach(() => {
  memory.clear();
});

describe('the pad keys are stored as commandPadKeys', () => {
  test('the centre changed to Home still holds Home after a reload', async () => {
    await reload();
    const keys = [...useSettingsStore.getState().settings.commandPadKeys];
    keys[4] = 'key:home';
    useSettingsStore.getState().setSetting('commandPadKeys', keys);
    await reload();
    expect(useSettingsStore.getState().settings.commandPadKeys[4]).toBe('key:home');
    expect(JSON.parse(memory.get('settings.v1') ?? '{}').commandPadKeys).toHaveLength(9);
  });

  test('eight entries, or none, load as the default nine', async () => {
    memory.set('settings.v1', JSON.stringify({ commandPadKeys: DEFAULT_COMMAND_PAD_KEYS.slice(0, 8) }));
    await reload();
    expect(useSettingsStore.getState().settings.commandPadKeys).toEqual([...DEFAULT_COMMAND_PAD_KEYS]);
    memory.set('settings.v1', JSON.stringify({ fontSize: 12 }));
    await reload();
    expect(useSettingsStore.getState().settings.commandPadKeys).toEqual([...DEFAULT_COMMAND_PAD_KEYS]);
  });
});

describe('the stored switch keeps its meaning', () => {
  test('a stored extraKeysToolbarVisible false stays off (no pad)', async () => {
    memory.set('settings.v1', JSON.stringify({ extraKeysToolbarVisible: false }));
    await reload();
    expect(useSettingsStore.getState().settings.extraKeysToolbarVisible).toBe(false);
  });
});

describe('custom actions get a stable id, so pad positions can follow them', () => {
  test('a layout saved without ids gets them on load, and keeps them across reloads', async () => {
    const { useExtraKeysStore } = await import('./extraKeys');
    memory.set(
      'extraKeys.v1',
      JSON.stringify([
        [{ type: 'text', label: 'GS', text: 'git status', sendEnter: true }],
        [{ type: 'builtin', id: 'esc' }],
      ]),
    );
    useExtraKeysStore.setState({ hydrated: false });
    await useExtraKeysStore.getState().hydrate();
    const first = useExtraKeysStore.getState().layout[0][0];
    expect(first.type === 'text' && first.id.startsWith('custom-')).toBe(true);
    useExtraKeysStore.setState({ hydrated: false });
    await useExtraKeysStore.getState().hydrate();
    expect(useExtraKeysStore.getState().layout[0][0].id).toBe(first.id);
  });
});

describe('a failed id migration write loses nothing', () => {
  test('when saving the migrated ids fails, the next load gives the same ids, and the failure is handled', async () => {
    const { useExtraKeysStore } = await import('./extraKeys');
    const legacy = JSON.stringify([
      [{ type: 'shortcut', label: 'CC', key: 'c', ctrl: true }],
      [{ type: 'builtin', id: 'esc' }],
    ]);
    memory.set('extraKeys.v1', legacy);
    const warn = console.warn;
    const warnings: unknown[][] = [];
    console.warn = (...args: unknown[]) => warnings.push(args);
    const storage = (await import('@react-native-async-storage/async-storage')).default as {
      setItem: (key: string, value: string) => Promise<void>;
    };
    const setItem = storage.setItem;
    storage.setItem = () => Promise.reject(new Error('disk full'));
    try {
      useExtraKeysStore.setState({ hydrated: false });
      await useExtraKeysStore.getState().hydrate();
      const first = useExtraKeysStore.getState().layout[0][0].id;
      expect(memory.get('extraKeys.v1')).toBe(legacy);
      expect(warnings).toHaveLength(1);
      storage.setItem = setItem;
      useExtraKeysStore.setState({ hydrated: false });
      await useExtraKeysStore.getState().hydrate();
      expect(useExtraKeysStore.getState().layout[0][0].id).toBe(first);
    } finally {
      storage.setItem = setItem;
      console.warn = warn;
    }
  });
});

describe('the pad position is stored per layout as commandPadPosition', () => {
  test('a pad moved in the flat and in the laptop layout reloads with its own position for each', async () => {
    await reload();
    expect(useSettingsStore.getState().settings.commandPadPosition).toEqual({});
    useSettingsStore.getState().setSetting('commandPadPosition', { flat: { side: 'left', height: 0.25 } });
    useSettingsStore.getState().setSetting('commandPadPosition', {
      ...useSettingsStore.getState().settings.commandPadPosition,
      laptop: { side: 'right', height: 0 },
    });
    await reload();
    const both = { flat: { side: 'left', height: 0.25 }, laptop: { side: 'right', height: 0 } };
    expect(useSettingsStore.getState().settings.commandPadPosition).toEqual(both);
    expect(JSON.parse(memory.get('settings.v1') ?? '{}').commandPadPosition).toEqual(both);
  });

  test('an invalid stored position gives its layout the default position, the other layout keeps its own', async () => {
    memory.set(
      'settings.v1',
      JSON.stringify({
        commandPadPosition: { flat: { side: 'middle', height: 2 }, laptop: { side: 'left', height: 0.5 } },
      }),
    );
    await reload();
    expect(useSettingsStore.getState().settings.commandPadPosition).toEqual({ laptop: { side: 'left', height: 0.5 } });

    const invalid: unknown[] = [
      'left',
      null,
      [],
      { flat: { side: 'left' } },
      { flat: { side: 'left', height: -0.1 } },
      { flat: { side: 'right', height: 1.5 } },
      { flat: { side: 'left', height: null } },
      { flat: { side: 'left', height: '0.5' } },
      { flat: { side: 'left', height: 0.5, extra: true } },
      { sideways: { side: 'left', height: 0.5 } },
    ];
    for (const commandPadPosition of invalid) {
      memory.set('settings.v1', JSON.stringify({ commandPadPosition }));
      await reload();
      expect(useSettingsStore.getState().settings.commandPadPosition).toEqual({});
    }
  });
});
