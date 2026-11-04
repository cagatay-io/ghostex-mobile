/// <reference types="jest" />
/**
 * The settings store's colour keys: an upgraded phone's stored `settings.v1` keeps its earlier values and look, the
 * derived keys win once saved, a preset is one save, and no preset id is stored.
 *
 * Run with `bunx jest src/settings/store.rntl.ts` (the store imports React Native, which `bun test` cannot load).
 * The earlier colours below are what the base commit's resolver painted at Background Contrast 90 (its calibrated
 * table, src/theme/sidebarAppearance.ts before this change) and at 85/88/95 by its linear scale.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';

import { importGhosttyTheme } from '../theme/importGhostty';
import { themePresetPatch } from '../theme/presets';
import { resolveThemeAreas } from '../theme/sidebarAppearance';
import { defaultSettings, useSettingsStore, type GhostexSettings } from './store';

const KEY = 'settings.v1';

async function load(stored: object | null): Promise<GhostexSettings> {
  await AsyncStorage.clear();
  if (stored !== null) await AsyncStorage.setItem(KEY, JSON.stringify(stored));
  useSettingsStore.setState({ hydrated: false, settings: defaultSettings() });
  await useSettingsStore.getState().hydrate();
  return useSettingsStore.getState().settings;
}

async function saved(): Promise<Record<string, unknown>> {
  return JSON.parse((await AsyncStorage.getItem(KEY)) ?? 'null') as Record<string, unknown>;
}

/** A record the previous version stored: every key it had, with the theme set away from the defaults. */
function legacyRecord(overrides: object): Record<string, unknown> {
  const { sidebarBackgroundContrast, sidebarBackgroundTint, fontSize, scrollbackRows } = {
    ...defaultSettings(),
    fontSize: 14,
    scrollbackRows: 5_000,
  };
  return {
    sidebarBackgroundContrast,
    sidebarBackgroundTint,
    // The previous version knew only Dark and Light, and saved its default Dark.
    sessionChatTheme: 'dark',
    fontSize,
    scrollbackRows,
    keepAliveIntervalSec: 60,
    ...overrides,
  };
}

describe('settings store colour keys', () => {
  test('a fresh install starts on the desktop defaults', async () => {
    const settings = await load(null);
    expect(settings).toMatchObject({
      sidebarTheme: 'system',
      darkThemePreset: 'gray',
      lightThemePreset: 'gray',
      themeSidebarContrast: 0,
      themeWorkAreaContrast: 0,
      customSidebarTitlebarBackgroundDarknessPercent: 96,
      customSidebarTitlebarLightBackgroundLightnessPercent: 96,
      terminalGhosttyTheme: 'GitHub Dark',
      terminalGhosttyLightTheme: 'GitHub Light Default',
      terminalBackgroundMode: 'pure',
      terminalColorScheme: 'app',
    });
    expect(resolveThemeAreas(settings, false).sidebar).toBe('#0b0b0b');
  });

  test('an upgraded phone keeps its three earlier values and every unrelated value', async () => {
    const record = legacyRecord({
      sidebarBackgroundTint: '#336699',
      sidebarBackgroundContrast: 92,
      sessionChatTheme: 'light',
    });
    const settings = await load(record);
    expect(settings).toMatchObject({
      sidebarBackgroundTint: '#336699',
      sidebarBackgroundContrast: 92,
      sessionChatTheme: 'light',
      fontSize: 14,
      scrollbackRows: 5_000,
      keepAliveIntervalSec: 60,
    });
    expect(settings).toMatchObject({
      sidebarTheme: 'dark-2',
      darkThemePreset: 'custom',
      customSidebarTitlebarBackgroundTintColor: '#336699',
      customSidebarTitlebarBackgroundDarknessPercent: 92,
      themeSidebarContrast: -4,
      themeWorkAreaContrast: -4,
      lightThemePreset: 'gray',
    });
  });

  test.each([
    ['#884444', 90, '#1a000a'],
    ['#336699', 90, '#181c22'],
    ['#336699', 95, '#0c0e11'],
    ['#000000', 90, '#000000'],
    ['#808080', 90, '#0b0b0b'],
    ['#808080', 85, '#111111'],
    ['#ffffff', 88, '#0d0d0d'],
  ])('earlier tint %s at contrast %d still paints %s', async (tint, contrast, colour) => {
    const settings = await load(legacyRecord({ sidebarBackgroundTint: tint, sidebarBackgroundContrast: contrast }));
    const areas = resolveThemeAreas(settings, false);
    expect(areas.sidebar).toBe(colour);
    expect(areas.workChrome).toBe(colour);
  });

  test('an untouched earlier default lands on the Graphite square', async () => {
    const settings = await load(legacyRecord({}));
    expect(settings.darkThemePreset).toBe('gray');
    expect([settings.themeSidebarContrast, settings.customSidebarTitlebarBackgroundDarknessPercent]).toEqual([0, 96]);
  });

  test('a preset is one save; saved keys win on the next load; the earlier values stay; no preset id', async () => {
    await load(legacyRecord({ sidebarBackgroundTint: '#336699', sidebarBackgroundContrast: 92 }));
    const setItem = jest.spyOn(AsyncStorage, 'setItem');
    // The storage mock's setItem is itself a mock that counted the setup's writes.
    setItem.mockClear();
    const published = jest.fn();
    const unsubscribe = useSettingsStore.subscribe(published);
    useSettingsStore.getState().patchSettings(themePresetPatch('mocha', false)!);
    unsubscribe();
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(published).toHaveBeenCalledTimes(1);

    const record = await saved();
    expect(Object.keys(record).sort()).toEqual(Object.keys(defaultSettings()).sort());
    expect(Object.values(record)).not.toContain('mocha');
    expect(record).toMatchObject({ sidebarBackgroundTint: '#336699', sidebarBackgroundContrast: 92, fontSize: 14 });

    useSettingsStore.setState({ hydrated: false, settings: defaultSettings() });
    await useSettingsStore.getState().hydrate();
    const reloaded = useSettingsStore.getState().settings;
    expect(reloaded).toMatchObject({
      sidebarTheme: 'dark-2',
      darkThemePreset: 'custom',
      customSidebarTitlebarBackgroundTintColor: '#1c1c2c',
      lightThemePreset: 'custom',
      customSidebarTitlebarLightBackgroundTintColor: '#eaecf2',
      terminalGhosttyTheme: 'Ghostex Catppuccin Mocha',
      themeSidebarContrast: -24,
      themeWorkAreaContrast: -24,
      customSidebarTitlebarBackgroundDarknessPercent: 85,
      customSidebarTitlebarLightBackgroundLightnessPercent: 84,
      terminalBackgroundMode: 'theme',
      sidebarBackgroundTint: '#336699',
      sidebarBackgroundContrast: 92,
      fontSize: 14,
    });
    expect(resolveThemeAreas(reloaded, false).workArea).toBe('#1e1e2e');
  });

  test('invalid stored colour keys fall back without dropping the earlier values', async () => {
    const settings = await load(
      legacyRecord({
        sidebarBackgroundTint: '#884444',
        sidebarBackgroundContrast: 90,
        sidebarTheme: 'neon',
        darkThemePreset: 'bogus',
        lightThemePreset: 7,
        themeSidebarContrast: 'x',
        customSidebarTitlebarBackgroundTintColor: 'red',
        terminalBackgroundMode: 'image',
        terminalColorScheme: null,
        terminalGhosttyTheme: '',
      }),
    );
    expect(settings).toMatchObject({
      sidebarBackgroundTint: '#884444',
      sidebarBackgroundContrast: 90,
      sidebarTheme: 'dark-2',
      darkThemePreset: 'custom',
      lightThemePreset: 'gray',
      themeSidebarContrast: -6,
      customSidebarTitlebarBackgroundTintColor: '#884444',
      terminalBackgroundMode: 'pure',
      terminalColorScheme: 'app',
      terminalGhosttyTheme: 'GitHub Dark',
    });
  });

  test('chat theme: a saved Dark or Light stays, a new install follows the app, unknown values follow the app', async () => {
    expect((await load(legacyRecord({}))).sessionChatTheme).toBe('dark');
    expect((await load(legacyRecord({ sessionChatTheme: 'light' }))).sessionChatTheme).toBe('light');
    expect((await load(legacyRecord({ sessionChatTheme: 'system' }))).sessionChatTheme).toBe('system');
    expect((await load(legacyRecord({ sessionChatTheme: 'sepia' }))).sessionChatTheme).toBe('app');
    expect((await load(null)).sessionChatTheme).toBe('app');
  });

  test('the custom terminal background colour keeps a valid hex and is unset otherwise', async () => {
    expect((await load(null)).workspaceBackgroundColor).toBe('');
    expect((await load(legacyRecord({ workspaceBackgroundColor: '336699' }))).workspaceBackgroundColor).toBe('#336699');
    expect((await load(legacyRecord({ workspaceBackgroundColor: '#010101' }))).workspaceBackgroundColor).toBe(
      '#010101',
    );
    expect((await load(legacyRecord({ workspaceBackgroundColor: 'teal' }))).workspaceBackgroundColor).toBe('');
  });
});

test('the optional private palette list leaves old settings unchanged and loads valid stored imports', async () => {
  const old = { ...defaultSettings(), fontSize: 18 };
  expect(await load(old)).toEqual(old);
  expect(Object.hasOwn(useSettingsStore.getState().settings, 'importedTerminalPalettes')).toBe(false);
  const text = ['background=#000000', 'foreground=#ffffff',
    ...Array.from({ length: 16 }, (_, index) => `palette=${index}=#aaaaaa`)].join('\n');
  const imported = importGhosttyTheme(old, text, 'Private');
  expect(await load(imported)).toEqual(imported);
  const invalid = { ...imported.importedTerminalPalettes[0], schemaVersion: 2 };
  const recovered = await load({ ...imported, importedTerminalPalettes: [invalid] });
  expect(recovered).toEqual({ ...old, importedTerminalPalettes: [] });
});
