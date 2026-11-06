/// <reference types="node" />
/**
 * The desktop rules behind Settings › Interface that the phone ports: content appearance overrides
 * (apps/desktop/src/shared_settings/appearance.rs), colour-square pairing (`paired_preset`, `select_preset` in
 * settings_modal/tabs/theme), the Colourfulness names and positions (colours.rs), and the terminal palette list
 * (GHOSTTY_THEME_SETTING_OPTIONS in packages/settings-catalog). Expectations are the desktop's rules and data.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { THEME_PRESETS } from './presets';
import {
  colourfulnessDisplayStep,
  colourfulnessName,
  colourfulnessStepForPoints,
  contentIsLight,
  effectiveContentColorScheme,
  isLightBackground,
  stepTowardHex,
  themeColourPatch,
  themeSquares,
  type ThemeColourSettings,
} from './sidebarAppearance';
import { terminalPalette, terminalPaletteLabel, terminalPaletteNames } from './terminalPalettes';

const colours = (dark: string, light: string): ThemeColourSettings => ({
  darkThemePreset: dark as ThemeColourSettings['darkThemePreset'],
  lightThemePreset: light as ThemeColourSettings['lightThemePreset'],
  customSidebarTitlebarBackgroundTintColor: '#808080',
  customSidebarTitlebarLightBackgroundTintColor: '#808080',
  customSidebarTitlebarBackgroundDarknessPercent: 96,
  customSidebarTitlebarLightBackgroundLightnessPercent: 96,
  themeSidebarContrast: 0,
  themeWorkAreaContrast: 0,
});

describe('content appearance (effective_content_color_scheme)', () => {
  test('Follow app takes the app appearance; System stays System; an own choice wins', () => {
    const scheme = (sidebarTheme: 'system' | 'plain-light' | 'dark-2', own: 'app' | 'light' | 'dark' | 'system') =>
      effectiveContentColorScheme({ sidebarTheme, sessionChatTheme: own }, 'sessionChatTheme');
    assert.strictEqual(scheme('plain-light', 'app'), 'light');
    assert.strictEqual(scheme('dark-2', 'app'), 'dark');
    assert.strictEqual(scheme('system', 'app'), 'system');
    assert.strictEqual(scheme('plain-light', 'dark'), 'dark');
    assert.strictEqual(scheme('dark-2', 'system'), 'system');
  });

  test('System follows the device', () => {
    const settings = { sidebarTheme: 'dark-2' as const, terminalColorScheme: 'system' as const };
    assert.strictEqual(contentIsLight(settings, 'terminalColorScheme', true), true);
    assert.strictEqual(contentIsLight(settings, 'terminalColorScheme', false), false);
  });
});

describe('colour squares (select_preset)', () => {
  test('sixteen squares per appearance with the desktop labels, Black and White swapping', () => {
    assert.deepStrictEqual(
      themeSquares(false).map((square) => square.label),
      [
        'Graphite',
        'Black',
        'Slate',
        'Midnight',
        'Blue',
        'Indigo',
        'Teal',
        'Green',
        'Forest',
        'Olive',
        'Amber',
        'Orange',
        'Red',
        'Rose',
        'Pink',
        'Purple',
      ],
    );
    assert.deepStrictEqual(themeSquares(true)[1], { id: 'white', label: 'White', tint: '#ffffff' });
    assert.deepStrictEqual(themeColourPatch(colours('gray', 'gray'), true, 'black', false), {
      darkThemePreset: 'black',
      lightThemePreset: 'white',
    });
  });

  test('the other appearance follows only while it matched and was not picked on purpose', () => {
    assert.deepStrictEqual(themeColourPatch(colours('gray', 'gray'), true, 'teal', true), { darkThemePreset: 'teal' });
    assert.deepStrictEqual(themeColourPatch(colours('gray', 'blue'), true, 'teal', false), { darkThemePreset: 'teal' });
    assert.deepStrictEqual(themeColourPatch(colours('custom', 'gray'), true, 'teal', false), {
      darkThemePreset: 'teal',
    });
    assert.deepStrictEqual(themeColourPatch(colours('red', 'red'), false, 'custom', false), {
      lightThemePreset: 'custom',
    });
  });
});

describe('Colourfulness positions and names (colours.rs)', () => {
  test('named points and the positions in between', () => {
    assert.deepStrictEqual([4, 0, -4, -8, -12, -24].map(colourfulnessName), [
      'Subtle',
      'Soft',
      'Balanced',
      'Rich',
      'Vivid',
      'Full',
    ]);
    assert.strictEqual(colourfulnessName(-18), 'Vivid');
    assert.strictEqual(colourfulnessStepForPoints(-24), 56);
    assert.strictEqual(colourfulnessStepForPoints(-3.25), null);
    assert.strictEqual(colourfulnessDisplayStep(-3.25), 15);
    assert.strictEqual(colourfulnessDisplayStep(Number.NaN), 8);
  });
});

describe('chat surfaces step off the work area (ChatAppearance::resolve)', () => {
  test('over the former fixed backgrounds the steps give the former fixed values', () => {
    assert.deepStrictEqual(
      ['#151515', '#1d1d1d', '#212121', '#161616', '#121212', '#141414'],
      [0.03, 0.062, 0.08, 0.035, 0.015, 0.025].map((amount) => stepTowardHex('#0e0e0e', true, amount)),
    );
    assert.strictEqual(stepTowardHex('#fdfdfd', false, 0.032), '#f5f5f5');
    assert.strictEqual(stepTowardHex('#fdfdfd', false, 0.095), '#e5e5e5');
    assert.strictEqual(stepTowardHex('#fdfdfd', false, 0.067), '#ececec');
  });
});

describe('terminal palettes', () => {
  test('the twenty preset palettes and the desktop defaults, in byte order, with the desktop labels', () => {
    const names = terminalPaletteNames();
    for (const preset of THEME_PRESETS) assert.ok(names.includes(preset.terminalPalette));
    assert.ok(names.includes('GitHub Dark'));
    assert.ok(names.includes('GitHub Light Default'));
    assert.deepStrictEqual(
      [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
      names,
    );
    assert.strictEqual(terminalPaletteLabel('GitHub Light Default'), 'GitHub Light');
    assert.strictEqual(terminalPaletteLabel('Ghostex Catppuccin Frappe'), 'Ghostex Catppuccin Frappé');
    assert.strictEqual(terminalPaletteLabel('Ghostex Nord'), 'Ghostex Nord');
    assert.strictEqual(terminalPalette('No Such Theme'), null);
  });

  test('colours come from the theme files (GitHub Dark from the desktop’s pinned Ghostty theme)', () => {
    const github = terminalPalette('GitHub Dark')!;
    assert.strictEqual(github.background, '#101216');
    assert.strictEqual(github.ansi.length, 16);
    assert.strictEqual(github.ansi[1], '#f78166');
    assert.deepStrictEqual(terminalPalette('Ghostex Catppuccin Mocha'), THEME_PRESETS[0]!.palette);
  });

  test('mode groups by background', () => {
    assert.ok(terminalPaletteNames('light').includes('GitHub Light Default'));
    assert.ok(!terminalPaletteNames('light').includes('GitHub Dark'));
    for (const name of terminalPaletteNames('dark'))
      assert.strictEqual(isLightBackground(terminalPalette(name)!.background), false);
  });
});
