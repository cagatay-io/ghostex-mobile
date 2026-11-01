/// <reference types="node" />
/**
 * Run with `bun test src/theme/terminalColours.test.ts`. The terminal's colours as the Mac resolves them
 * (apps/desktop/src/terminal_gpui_engine.rs `apply_color_scheme`, shared_settings/types.rs `grid_background_rgb`,
 * shared_settings/normalize.rs `terminal_background`, shared_settings/appearance.rs). Expected colours are the theme
 * files' own (Ghostty's GitHub Dark / GitHub Light Default, Catppuccin Mocha / Latte) and the host's preset work
 * areas (`every_theme_preset_paints_its_theme_background`), not output of the code under test.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { THEME_PRESETS, themePresetPatch } from './presets';
import { terminalBackground, terminalChrome, terminalColours, type TerminalColourSettings } from './terminalColours';
import { terminalPaletteNames } from './terminalPalettes';

/** A fresh install: the desktop's defaults (packages/settings-catalog/src/data/defaults.rs). */
const DEFAULTS: TerminalColourSettings = {
  sidebarTheme: 'system',
  darkThemePreset: 'gray',
  lightThemePreset: 'gray',
  customSidebarTitlebarBackgroundTintColor: '#808080',
  customSidebarTitlebarLightBackgroundTintColor: '#808080',
  customSidebarTitlebarBackgroundDarknessPercent: 90,
  customSidebarTitlebarLightBackgroundLightnessPercent: 90,
  themeSidebarContrast: 0,
  themeWorkAreaContrast: 0,
  terminalGhosttyTheme: 'GitHub Dark',
  terminalGhosttyLightTheme: 'GitHub Light Default',
  terminalBackgroundMode: 'pure',
  workspaceBackgroundColor: '',
  terminalColorScheme: 'app',
};

const withPreset = (id: string, extra: Partial<TerminalColourSettings> = {}): TerminalColourSettings => ({
  ...DEFAULTS,
  ...themePresetPatch(id, false),
  ...extra,
});

// Ghostty's theme files (ghostty-themes-release-20261019-151001-86a776d).
const GITHUB_DARK = {
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
};
const GITHUB_LIGHT_DEFAULT = {
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
};
// Catppuccin's own palettes (the presets' sources).
const MOCHA = {
  foreground: '#cdd6f4',
  cursor: '#f5e0dc',
  cursorText: '#11111b',
  selectionBackground: '#353749',
  palette: [
    '#45475a',
    '#f38ba8',
    '#a6e3a1',
    '#f9e2af',
    '#89b4fa',
    '#f5c2e7',
    '#94e2d5',
    '#a6adc8',
    '#585b70',
    '#f38ba8',
    '#a6e3a1',
    '#f9e2af',
    '#89b4fa',
    '#f5c2e7',
    '#94e2d5',
    '#bac2de',
  ],
};
const LATTE = {
  foreground: '#4c4f69',
  cursor: '#dc8a78',
  cursorText: '#eff1f5',
  palette: [
    '#5c5f77',
    '#d20f39',
    '#40a02b',
    '#df8e1d',
    '#1e66f5',
    '#ea76cb',
    '#179299',
    '#acb0be',
    '#6c6f85',
    '#d20f39',
    '#40a02b',
    '#df8e1d',
    '#1e66f5',
    '#ea76cb',
    '#179299',
    '#bcc0cc',
  ],
};

describe('a fresh install paints like the Mac: GitHub palettes on pure black / white', () => {
  test('a dark device: GitHub Dark on black, with its selection colour', () => {
    assert.deepEqual(terminalColours(DEFAULTS, false), { light: false, background: '#000000', ...GITHUB_DARK });
  });

  test('a light device (Appearance System): GitHub Light Default on white, no selection colour', () => {
    assert.deepEqual(terminalColours(DEFAULTS, true), { light: true, background: '#ffffff', ...GITHUB_LIGHT_DEFAULT });
  });
});

describe('the Terminal theme picks the palette', () => {
  test('Light over a dark app: the light palette', () => {
    const colors = terminalColours({ ...DEFAULTS, sidebarTheme: 'dark-2', terminalColorScheme: 'light' }, false);
    assert.equal(colors.light, true);
    assert.equal(colors.foreground, GITHUB_LIGHT_DEFAULT.foreground);
  });

  test('Follow app over a dark app: the dark palette, also on a light device', () => {
    const colors = terminalColours({ ...DEFAULTS, sidebarTheme: 'dark-2', terminalColorScheme: 'app' }, true);
    assert.equal(colors.light, false);
    assert.equal(colors.foreground, GITHUB_DARK.foreground);
  });

  test('Dark over a light app, and System following the device', () => {
    assert.equal(
      terminalColours({ ...DEFAULTS, sidebarTheme: 'plain-light', terminalColorScheme: 'dark' }, true).light,
      false,
    );
    assert.equal(
      terminalColours({ ...DEFAULTS, sidebarTheme: 'dark-2', terminalColorScheme: 'system' }, true).light,
      true,
    );
    assert.equal(
      terminalColours({ ...DEFAULTS, sidebarTheme: 'plain-light', terminalColorScheme: 'system' }, false).light,
      false,
    );
  });
});

describe('a preset paints its terminal in the theme background', () => {
  test('Mocha: the Mocha palette on its own background', () => {
    assert.deepEqual(terminalColours(withPreset('mocha'), false), { light: false, background: '#1e1e2e', ...MOCHA });
  });

  test('Latte: a light terminal, the Latte palette on its background, no selection colour', () => {
    assert.deepEqual(terminalColours(withPreset('latte'), false), { light: true, background: '#eff1f5', ...LATTE });
  });

  test('Solarized Dark paints the Mac work area #032b36, not the palette background #002b36', () => {
    assert.equal(terminalColours(withPreset('sol-dark'), false).background, '#032b36');
  });

  test('switching Mocha → Latte → Mocha gives Mocha’s colours again', () => {
    const first = terminalColours(withPreset('mocha'), false);
    terminalColours(withPreset('latte'), false);
    assert.deepEqual(terminalColours(withPreset('mocha'), false), first);
  });
});

describe('Terminal background', () => {
  const mocha = withPreset('mocha');

  test('Black / white follows the terminal appearance', () => {
    assert.equal(terminalBackground({ ...mocha, terminalBackgroundMode: 'pure' }, false), '#000000');
    assert.equal(terminalBackground({ ...mocha, terminalBackgroundMode: 'pure' }, true), '#ffffff');
  });

  test('Custom paints its colour in both appearances', () => {
    const custom = { ...mocha, terminalBackgroundMode: 'custom' as const, workspaceBackgroundColor: '#123456' };
    assert.equal(terminalBackground(custom, false), '#123456');
    assert.equal(terminalBackground(custom, true), '#123456');
  });

  test('Custom without a colour, or with the retired #010101, follows the theme', () => {
    for (const unset of ['', '#010101', '#010101'.toUpperCase(), 'red']) {
      const custom = { ...mocha, terminalBackgroundMode: 'custom' as const, workspaceBackgroundColor: unset };
      assert.equal(terminalBackground(custom, false), '#1e1e2e', unset);
    }
  });
});

describe('names the phone does not carry', () => {
  test('an unknown dark palette leaves everything but the background to Ghostty', () => {
    assert.deepEqual(terminalColours({ ...DEFAULTS, terminalGhosttyTheme: 'No Such Theme' }, false), {
      light: false,
      background: '#000000',
      palette: [],
    });
  });

  test('an unknown light palette keeps the dark palette’s colours, without its selection colour', () => {
    const colors = terminalColours({ ...DEFAULTS, terminalGhosttyLightTheme: 'No Such Theme' }, true);
    assert.equal(colors.foreground, GITHUB_DARK.foreground);
    assert.deepEqual(colors.palette, GITHUB_DARK.palette);
    assert.equal(colors.selectionBackground, undefined);
  });
});

describe('every offered palette gives the terminal complete colours', () => {
  const HEX = /^#[0-9a-f]{6}$/;
  const names = terminalPaletteNames();

  test('the Mac’s list: 486 Ghostty themes and the twenty preset palettes', () => {
    assert.equal(names.length, 506);
    assert.equal(names.filter((name) => name.startsWith('Ghostex ')).length, 20);
  });

  test('background, foreground and sixteen ANSI colours, as #rrggbb, dark and light', () => {
    for (const name of names) {
      for (const light of [false, true]) {
        const colors = terminalColours(
          { ...DEFAULTS, terminalGhosttyTheme: name, terminalGhosttyLightTheme: name, terminalBackgroundMode: 'theme' },
          light,
        );
        assert.match(colors.background, HEX, name);
        assert.match(colors.foreground ?? '', HEX, name);
        assert.equal(colors.palette.length, 16, name);
        for (const color of colors.palette) assert.match(color, HEX, name);
        for (const role of [colors.cursor, colors.cursorText, colors.selectionBackground]) {
          if (role !== undefined) assert.match(role, HEX, name);
        }
      }
    }
  });
});

describe('the terminal screen’s chrome reads on its background', () => {
  test('dark backgrounds keep the light ink; light ones (the seven light presets) get dark ink', () => {
    assert.deepEqual(terminalChrome('#000000'), {
      background: '#000000',
      light: false,
      foreground: '#FAFAFA',
      muted: '#B5B5B5',
      ink: '#ffffff',
    });
    for (const id of ['latte', 'alucard', 'sol-light', 'tn-day', 'kg-lotus', 'ef-light', 'gm-light']) {
      const chrome = terminalChrome(terminalColours(withPreset(id), false).background);
      assert.equal(chrome.light, true, id);
      assert.equal(chrome.ink, '#000000', id);
      assert.equal(chrome.foreground, '#262626', id);
    }
  });

  test('secondary text keeps 4.5:1 on the background and on the 8% pill wash, for every preset and Black / white', () => {
    const channels = (hex: string): number[] => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
    const luminance = (hex: string): number =>
      channels(hex)
        .map((value) => value / 255)
        .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
        .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0);
    const contrast = (a: string, b: string): number => {
      const [x, y] = [luminance(a), luminance(b)];
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    const washed = (background: string, ink: string): string =>
      `#${channels(background)
        .map((value, index) => Math.round(channels(ink)[index]! * 0.08 + value * 0.92))
        .map((value) => value.toString(16).padStart(2, '0'))
        .join('')}`;
    const backgrounds = [
      '#000000',
      '#ffffff',
      ...THEME_PRESETS.map((preset) => terminalColours(withPreset(preset.id), false).background),
    ];
    for (const background of backgrounds) {
      const chrome = terminalChrome(background);
      for (const surface of [background, washed(background, chrome.ink)]) {
        assert.ok(contrast(chrome.muted, surface) >= 4.5, `${background}: ${chrome.muted} on ${surface}`);
      }
    }
  });
});
