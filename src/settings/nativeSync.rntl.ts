/// <reference types="jest" />
/**
 * Run with `bunx jest src/settings/nativeSync.rntl.ts`. The real settings store and sync: choosing a preset, the
 * Terminal background or the device appearance sends every native terminal (they all share these settings) the
 * colours themselves, once per change, without touching per-session font sizes. The native side applies them to
 * open and warm terminals and to new ones (GhosttyConfigTests, `setTerminalSettings` in GhostexNativeModule.swift).
 * Expected colours are the theme files' own (Ghostty's GitHub Dark / Light Default, Catppuccin Mocha / Latte).
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../../modules/ghostex-native/src', () => ({
  GhostexNative: {
    setTerminalSettings: jest.fn(() => Promise.resolve()),
    setFontSize: jest.fn(() => Promise.resolve()),
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';

import { GhostexNative } from '../../modules/ghostex-native/src';
import type { TerminalColors, TerminalRuntimeSettings } from '../../modules/ghostex-native/src/GhostexNative.types';
import { themePresetPatch } from '../theme/presets';
import { initSettingsNativeSync } from './nativeSync';
import { defaultSettings, useSettingsStore } from './store';

const setTerminalSettings = GhostexNative.setTerminalSettings as jest.Mock;
const setFontSize = GhostexNative.setFontSize as jest.Mock;

let deviceScheme: 'light' | 'dark' = 'dark';
let appearanceListener: (() => void) | null = null;

function sentColors(): TerminalColors {
  const call = setTerminalSettings.mock.calls.at(-1) as [TerminalRuntimeSettings] | undefined;
  if (call === undefined) throw new Error('nothing was sent');
  return call[0].colors;
}

beforeAll(async () => {
  jest.spyOn(Appearance, 'getColorScheme').mockImplementation(() => deviceScheme);
  jest.spyOn(Appearance, 'addChangeListener').mockImplementation((listener) => {
    appearanceListener = listener as () => void;
    return { remove: () => undefined };
  });
  useSettingsStore.setState({ hydrated: false, settings: defaultSettings() });
  await useSettingsStore.getState().hydrate();
  initSettingsNativeSync();
});

test('a fresh install sends GitHub Dark on black (the Mac’s defaults) once', () => {
  expect(setTerminalSettings).toHaveBeenCalledTimes(1);
  expect(sentColors()).toEqual({
    light: false,
    background: '#000000',
    foreground: '#8b949e',
    cursor: '#c9d1d9',
    cursorText: '#101216',
    selectionBackground: '#3b5070',
    palette: [
      '#000000',
      '#f78166',
      '#56d364',
      '#e3b341',
      '#6ca4f8',
      '#db61a2',
      '#2b7489',
      '#ffffff',
      '#4d4d4d',
      '#f78166',
      '#56d364',
      '#e3b341',
      '#6ca4f8',
      '#db61a2',
      '#2b7489',
      '#ffffff',
    ],
  });
});

test('Mocha, then Latte, then Mocha again: each sends its own colours, no font size is pushed', () => {
  setTerminalSettings.mockClear();
  useSettingsStore.getState().applyPatch(themePresetPatch('mocha', false)!);
  expect(sentColors()).toMatchObject({ light: false, background: '#1e1e2e', foreground: '#cdd6f4' });
  const mocha = sentColors();

  useSettingsStore.getState().applyPatch(themePresetPatch('latte', false)!);
  expect(sentColors()).toMatchObject({ light: true, background: '#eff1f5', foreground: '#4c4f69' });
  expect(sentColors().selectionBackground).toBeUndefined();

  useSettingsStore.getState().applyPatch(themePresetPatch('mocha', false)!);
  expect(sentColors()).toEqual(mocha);
  expect(setTerminalSettings).toHaveBeenCalledTimes(3);
  expect(setFontSize).not.toHaveBeenCalled();
});

test('the Terminal background reaches the terminal; an unrelated setting sends nothing', () => {
  setTerminalSettings.mockClear();
  useSettingsStore.getState().applyPatch({ terminalBackgroundMode: 'pure' });
  expect(sentColors().background).toBe('#000000');
  useSettingsStore.getState().applyPatch({ terminalBackgroundMode: 'custom', workspaceBackgroundColor: '#123456' });
  expect(sentColors().background).toBe('#123456');
  setTerminalSettings.mockClear();
  useSettingsStore.getState().applyPatch({ confirmTabClose: true });
  expect(setTerminalSettings).not.toHaveBeenCalled();
});

test('with the Terminal theme on System, a device appearance change recolours the terminals', () => {
  useSettingsStore.getState().applyPatch({ terminalColorScheme: 'system', terminalBackgroundMode: 'pure' });
  expect(sentColors()).toMatchObject({ light: false, background: '#000000' });
  setTerminalSettings.mockClear();
  deviceScheme = 'light';
  appearanceListener?.();
  expect(setTerminalSettings).toHaveBeenCalledTimes(1);
  // The light palette is still Latte's from the Mocha preset applied above.
  expect(sentColors()).toMatchObject({ light: true, background: '#ffffff', foreground: '#4c4f69' });
});

// An upgrade where both saved palettes are no longer shipped.
// CDXC:Theming DECISION: such a name takes the colours of that
// mode's default palette (GitHub Dark / GitHub Light Default); the saved names stay as they are.
test('both saved palettes no longer ship: the terminals take the default palettes, the saved names stay', async () => {
  deviceScheme = 'light';
  await AsyncStorage.setItem(
    'settings.v1',
    JSON.stringify({
      ...defaultSettings(),
      sidebarTheme: 'system',
      terminalColorScheme: 'system',
      terminalBackgroundMode: 'pure',
      terminalGhosttyTheme: 'Monokai Pro',
      terminalGhosttyLightTheme: 'Pro Light',
    }),
  );
  setTerminalSettings.mockClear();
  useSettingsStore.setState({ hydrated: false });
  await useSettingsStore.getState().hydrate();
  expect(useSettingsStore.getState().settings).toMatchObject({
    terminalGhosttyTheme: 'Monokai Pro',
    terminalGhosttyLightTheme: 'Pro Light',
  });
  // Ghostty's GitHub Light Default theme file; light terminals carry no selection colour.
  expect(sentColors()).toEqual({
    light: true,
    background: '#ffffff',
    foreground: '#1f2328',
    cursor: '#0969da',
    cursorText: '#3c9cff',
    palette: [
      '#24292f',
      '#cf222e',
      '#116329',
      '#4d2d00',
      '#0969da',
      '#8250df',
      '#1b7c83',
      '#6e7781',
      '#57606a',
      '#a40e26',
      '#1a7f37',
      '#633c01',
      '#218bff',
      '#a475f9',
      '#3192aa',
      '#8c959f',
    ],
  });
  expect(sentColors().foreground).not.toBe(sentColors().background);

  deviceScheme = 'dark';
  appearanceListener?.();
  // Ghostty's GitHub Dark theme file.
  expect(sentColors()).toMatchObject({ light: false, background: '#000000', foreground: '#8b949e', cursor: '#c9d1d9' });
});
