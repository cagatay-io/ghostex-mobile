/// <reference types="node" />
/**
 * Run with `bun test src/theme/presets.test.ts`. The expected presets are the desktop's: its table
 * (`THEME_PRESETS`, packages/settings-catalog/src/data/theme_presets.rs), its palette fixture
 * (`every_theme_preset_palette_reads_its_projects_colours`, apps/desktop/src/terminal_gpui_engine.rs, the theme
 * projects' own colours), the projects' `cursor-text` lines, its patch rule (`theme_preset_choice`) and its preset
 * tests (settings_modal/tabs/theme/presets.rs, helpers/titlebar/chrome_tints.rs). Nothing is copied from the files
 * under test.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import type { GhostexSettings } from '../settings/store';
import { THEME_PRESET_FAMILIES, THEME_PRESETS, themePresetMatches, themePresetPatch } from './presets';
import { resolveThemeAreas, type ThemeColourSettings } from './sidebarAppearance';

const PRESETS_DIR = fileURLToPath(new URL('./presets/', import.meta.url));

/** id, name, mode, partner, background, tintColor, terminalPalette, family, label: the desktop's table. */
const HOST_TABLE = [
  [
    'mocha',
    'Catppuccin Mocha',
    'dark',
    'latte',
    '#1e1e2e',
    '#1c1c2c',
    'Ghostex Catppuccin Mocha',
    'Catppuccin',
    'Mocha',
  ],
  [
    'macchiato',
    'Catppuccin Macchiato',
    'dark',
    'latte',
    '#24273a',
    '#222538',
    'Ghostex Catppuccin Macchiato',
    'Catppuccin',
    'Macchiato',
  ],
  [
    'frappe',
    'Catppuccin Frappé',
    'dark',
    'latte',
    '#303446',
    '#2e3244',
    'Ghostex Catppuccin Frappe',
    'Catppuccin',
    'Frappé',
  ],
  [
    'latte',
    'Catppuccin Latte',
    'light',
    'mocha',
    '#eff1f5',
    '#eaecf2',
    'Ghostex Catppuccin Latte',
    'Catppuccin',
    'Latte',
  ],
  ['dracula', 'Dracula', 'dark', 'alucard', '#282a36', '#262834', 'Ghostex Dracula', 'Dracula', 'Dracula'],
  ['alucard', 'Alucard', 'light', 'dracula', '#fffbeb', '#fffae4', 'Ghostex Alucard', 'Dracula', 'Alucard'],
  [
    'sol-dark',
    'Solarized Dark',
    'dark',
    'sol-light',
    '#002b36',
    '#002934',
    'Ghostex Solarized Dark',
    'Solarized',
    'Solarized Dark',
  ],
  [
    'sol-light',
    'Solarized Light',
    'light',
    'sol-dark',
    '#fdf6e3',
    '#fcf3da',
    'Ghostex Solarized Light',
    'Solarized',
    'Solarized Light',
  ],
  [
    'tn-night',
    'Tokyo Night Night',
    'dark',
    'tn-day',
    '#1a1b26',
    '#181924',
    'Ghostex Tokyo Night Night',
    'Tokyo Night',
    'Night',
  ],
  [
    'tn-storm',
    'Tokyo Night Storm',
    'dark',
    'tn-day',
    '#24283b',
    '#222639',
    'Ghostex Tokyo Night Storm',
    'Tokyo Night',
    'Storm',
  ],
  [
    'tn-moon',
    'Tokyo Night Moon',
    'dark',
    'tn-day',
    '#222436',
    '#202234',
    'Ghostex Tokyo Night Moon',
    'Tokyo Night',
    'Moon',
  ],
  [
    'tn-day',
    'Tokyo Night Day',
    'light',
    'tn-night',
    '#e1e2e7',
    '#d7d8df',
    'Ghostex Tokyo Night Day',
    'Tokyo Night',
    'Day',
  ],
  ['nord', 'Nord', 'dark', null, '#2e3440', '#2c323e', 'Ghostex Nord', 'Nord', 'Nord'],
  ['kg-wave', 'Kanagawa Wave', 'dark', 'kg-lotus', '#1f1f28', '#1d1d26', 'Ghostex Kanagawa Wave', 'Kanagawa', 'Wave'],
  [
    'kg-dragon',
    'Kanagawa Dragon',
    'dark',
    'kg-lotus',
    '#181616',
    '#161414',
    'Ghostex Kanagawa Dragon',
    'Kanagawa',
    'Dragon',
  ],
  [
    'kg-lotus',
    'Kanagawa Lotus',
    'light',
    'kg-wave',
    '#f2ecbc',
    '#eee6a6',
    'Ghostex Kanagawa Lotus',
    'Kanagawa',
    'Lotus',
  ],
  [
    'ef-dark',
    'Everforest Dark',
    'dark',
    'ef-light',
    '#2d353b',
    '#2b3339',
    'Ghostex Everforest Dark',
    'Everforest',
    'Everforest Dark',
  ],
  [
    'ef-light',
    'Everforest Light',
    'light',
    'ef-dark',
    '#fdf6e3',
    '#fcf3da',
    'Ghostex Everforest Light',
    'Everforest',
    'Everforest Light',
  ],
  [
    'gm-dark',
    'Gruvbox Material Dark',
    'dark',
    'gm-light',
    '#282828',
    '#262626',
    'Ghostex Gruvbox Material Dark',
    'Gruvbox Material',
    'Gruvbox Material Dark',
  ],
  [
    'gm-light',
    'Gruvbox Material Light',
    'light',
    'gm-dark',
    '#fbf1c7',
    '#faecb4',
    'Ghostex Gruvbox Material Light',
    'Gruvbox Material',
    'Gruvbox Material Light',
  ],
] as const;

/** Background, foreground, cursor, selection background, ANSI 0-15: the desktop's palette fixture. */
const HOST_PALETTES: Record<string, string> = {
  'Ghostex Catppuccin Mocha':
    '1e1e2e cdd6f4 f5e0dc 353749 45475a f38ba8 a6e3a1 f9e2af 89b4fa f5c2e7 94e2d5 a6adc8 585b70 f38ba8 a6e3a1 f9e2af 89b4fa f5c2e7 94e2d5 bac2de',
  'Ghostex Catppuccin Macchiato':
    '24273a cad3f5 f4dbd6 3a3e53 494d64 ed8796 a6da95 eed49f 8aadf4 f5bde6 8bd5ca a5adcb 5b6078 ed8796 a6da95 eed49f 8aadf4 f5bde6 8bd5ca b8c0e0',
  'Ghostex Catppuccin Frappe':
    '303446 c6d0f5 f2d5cf 44495d 51576d e78284 a6d189 e5c890 8caaee f4b8e4 81c8be a5adce 626880 e78284 a6d189 e5c890 8caaee f4b8e4 81c8be b5bfe2',
  'Ghostex Catppuccin Latte':
    'eff1f5 4c4f69 dc8a78 d8dae1 5c5f77 d20f39 40a02b df8e1d 1e66f5 ea76cb 179299 acb0be 6c6f85 d20f39 40a02b df8e1d 1e66f5 ea76cb 179299 bcc0cc',
  'Ghostex Dracula':
    '282a36 f8f8f2 f8f8f2 44475a 21222c ff5555 50fa7b f1fa8c bd93f9 ff79c6 8be9fd f8f8f2 6272a4 ff6e6e 69ff94 ffffa5 d6acff ff92df a4ffff ffffff',
  'Ghostex Alucard':
    'fffbeb 1f1f1f 1f1f1f cfcfde fffbeb cb3a2a 14710a 846e15 644ac9 a3144d 036a96 1f1f1f 6c664b d74c3d 198d0c 9e841a 7862d0 bf185a 047fb4 2c2b31',
  'Ghostex Solarized Dark':
    '002b36 839496 839496 073642 073642 dc322f 859900 b58900 268bd2 d33682 2aa198 eee8d5 002b36 cb4b16 586e75 657b83 839496 6c71c4 93a1a1 fdf6e3',
  'Ghostex Solarized Light':
    'fdf6e3 657b83 657b83 eee8d5 073642 dc322f 859900 b58900 268bd2 d33682 2aa198 eee8d5 002b36 cb4b16 586e75 657b83 839496 6c71c4 93a1a1 fdf6e3',
  'Ghostex Tokyo Night Night':
    '1a1b26 c0caf5 c0caf5 283457 15161e f7768e 9ece6a e0af68 7aa2f7 bb9af7 7dcfff a9b1d6 414868 ff899d 9fe044 faba4a 8db0ff c7a9ff a4daff c0caf5',
  'Ghostex Tokyo Night Storm':
    '24283b c0caf5 c0caf5 2e3c64 1d202f f7768e 9ece6a e0af68 7aa2f7 bb9af7 7dcfff a9b1d6 414868 ff899d 9fe044 faba4a 8db0ff c7a9ff a4daff c0caf5',
  'Ghostex Tokyo Night Moon':
    '222436 c8d3f5 c8d3f5 2d3f76 1b1d2b ff757f c3e88d ffc777 82aaff c099ff 86e1fc 828bb8 444a73 ff8d94 c7fb6d ffd8ab 9ab8ff caabff b2ebff c8d3f5',
  'Ghostex Tokyo Night Day':
    'e1e2e7 3760bf 3760bf b7c1e3 b4b5b9 f52a65 587539 8c6c3e 2e7de9 9854f1 007197 6172b0 a1a6c5 ff4774 5c8524 a27629 358aff a463ff 007ea8 3760bf',
  'Ghostex Nord':
    '2e3440 d8dee9 d8dee9 4c566a 3b4252 bf616a a3be8c ebcb8b 81a1c1 b48ead 88c0d0 e5e9f0 4c566a bf616a a3be8c ebcb8b 81a1c1 b48ead 8fbcbb eceff4',
  'Ghostex Kanagawa Wave':
    '1f1f28 dcd7ba c8c093 2d4f67 16161d c34043 76946a c0a36e 7e9cd8 957fb8 6a9589 c8c093 727169 e82424 98bb6c e6c384 7fb4ca 938aa9 7aa89f dcd7ba',
  'Ghostex Kanagawa Dragon':
    '181616 c5c9c5 c8c093 2d4f67 0d0c0c c4746e 8a9a7b c4b28a 8ba4b0 a292a3 8ea4a2 c8c093 a6a69c e46876 87a987 e6c384 7fb4ca 938aa9 7aa89f c5c9c5',
  'Ghostex Kanagawa Lotus':
    'f2ecbc 545464 43436c c9cbd1 1f1f28 c84053 6f894e 77713f 4d699b b35b79 597b75 545464 8a8980 d7474b 6e915f 836f4a 6693bf 624c83 5e857a 43436c',
  'Ghostex Everforest Dark':
    '2d353b d3c6aa d3c6aa 543a48 475258 e67e80 a7c080 dbbc7f 7fbbb3 d699b6 83c092 d3c6aa 475258 e67e80 a7c080 dbbc7f 7fbbb3 d699b6 83c092 d3c6aa',
  'Ghostex Everforest Light':
    'fdf6e3 5c6a72 5c6a72 eaedc8 5c6a72 f85552 8da101 dfa000 3a94c5 df69ba 35a77c e6e2cc 5c6a72 f85552 8da101 dfa000 3a94c5 df69ba 35a77c e6e2cc',
  'Ghostex Gruvbox Material Dark':
    '282828 d4be98 d4be98 45403d 5a524c ea6962 a9b665 d8a657 7daea3 d3869b 89b482 d4be98 5a524c ea6962 a9b665 d8a657 7daea3 d3869b 89b482 d4be98',
  'Ghostex Gruvbox Material Light':
    'fbf1c7 654735 654735 eee0b7 654735 c14a4a 6c782e b47109 45707a 945e80 4c7a5d ddccab 654735 c14a4a 6c782e b47109 45707a 945e80 4c7a5d ddccab',
};

/** `cursor-text` as the projects' own Ghostty files write it (Catppuccin x4, Dracula); the other palettes have none. */
const HOST_CURSOR_TEXT: Record<string, string> = {
  'Ghostex Catppuccin Mocha': '#11111b',
  'Ghostex Catppuccin Macchiato': '#181926',
  'Ghostex Catppuccin Frappe': '#232634',
  'Ghostex Catppuccin Latte': '#eff1f5',
  'Ghostex Dracula': '#282a36',
};

/** The work area each preset paints at Full (desktop `PRESET_WORK_AREA`): Solarized Dark keeps red 3. */
const HOST_WORK_AREA: Record<string, string> = {
  mocha: '#1e1e2e',
  macchiato: '#24273a',
  frappe: '#303446',
  latte: '#eff1f5',
  dracula: '#282a36',
  alucard: '#fffbeb',
  'sol-dark': '#032b36',
  'sol-light': '#fdf6e3',
  'tn-night': '#1a1b26',
  'tn-storm': '#24283b',
  'tn-moon': '#222436',
  'tn-day': '#e1e2e7',
  nord: '#2e3440',
  'kg-wave': '#1f1f28',
  'kg-dragon': '#181616',
  'kg-lotus': '#f2ecbc',
  'ef-dark': '#2d353b',
  'ef-light': '#fdf6e3',
  'gm-dark': '#282828',
  'gm-light': '#fbf1c7',
};

type HostRow = (typeof HOST_TABLE)[number];

/** `theme_preset_patch` with Colourfulness Full (`colourfulness_patch(56)`: -24, -24, 85, 84). */
function hostPatch(row: HostRow, partner: HostRow | undefined): Record<string, unknown> {
  const patch: Record<string, unknown> = { sidebarTheme: row[2] === 'dark' ? 'dark-2' : 'plain-light' };
  for (const mode of partner ? [row, partner] : [row]) {
    const dark = mode[2] === 'dark';
    patch[dark ? 'darkThemePreset' : 'lightThemePreset'] = 'custom';
    patch[dark ? 'customSidebarTitlebarBackgroundTintColor' : 'customSidebarTitlebarLightBackgroundTintColor'] =
      mode[5];
    patch[dark ? 'terminalGhosttyTheme' : 'terminalGhosttyLightTheme'] = mode[6];
  }
  return {
    ...patch,
    themeSidebarContrast: -24,
    themeWorkAreaContrast: -24,
    customSidebarTitlebarBackgroundDarknessPercent: 85,
    customSidebarTitlebarLightBackgroundLightnessPercent: 84,
    terminalBackgroundMode: 'theme',
  };
}

/** `theme_preset_choice`: a light preset always brings its partner, a dark one only while light follows. */
function hostChoice(row: HostRow, lightPicked: boolean): Record<string, unknown> {
  const partner = HOST_TABLE.find((other) => other[0] === row[3]);
  return hostPatch(row, row[2] === 'light' || !lightPicked ? partner : undefined);
}

/** The object the desktop's parity test expects for one preset file. */
function hostExpected(row: HostRow): unknown {
  const [background, foreground, cursor, selection, ...ansi] = HOST_PALETTES[row[6]]!.split(' ').map(
    (hex) => `#${hex}`,
  );
  const cursorText = HOST_CURSOR_TEXT[row[6]];
  return {
    id: row[0],
    name: row[1],
    mode: row[2],
    partner: row[3],
    background: row[4],
    tintColor: row[5],
    terminalPalette: row[6],
    palette: {
      background,
      foreground,
      cursor,
      selectionBackground: selection,
      ...(cursorText ? { cursorText } : {}),
      ansi,
    },
    patches: { lightFollows: hostChoice(row, false), lightPickedOnPurpose: hostChoice(row, true) },
  };
}

/** The parity comparison itself: whole-object equality, key order free. */
function equalsHost(file: unknown, row: HostRow): boolean {
  try {
    assert.deepStrictEqual(file, hostExpected(row));
    return true;
  } catch {
    return false;
  }
}

const readFile = (id: string): unknown => JSON.parse(readFileSync(`${PRESETS_DIR}${id}.json`, 'utf8'));

describe('preset files', () => {
  test('exactly the twenty desktop presets, 13 dark and 7 light', () => {
    const files = readdirSync(PRESETS_DIR).sort();
    assert.deepEqual(files, HOST_TABLE.map(([id]) => `${id}.json`).sort());
    assert.equal(HOST_TABLE.filter((row) => row[2] === 'dark').length, 13);
  });

  test('every file equals the desktop data and both of its patches', () => {
    for (const row of HOST_TABLE) assert.ok(equalsHost(readFile(row[0]), row), row[0]);
  });

  test('the comparison fails for a wrong palette or a wrong patch', () => {
    // The file shape is checked by the positive test above; this copy is only tampered with.
    type PresetCopy = { palette: { ansi: string[] }; patches: { lightFollows: object; lightPickedOnPurpose: object } };
    const mocha = readFile('mocha') as PresetCopy;
    const latteRow = HOST_TABLE.find((row) => row[0] === 'latte')!;
    const mochaRow = HOST_TABLE.find((row) => row[0] === 'mocha')!;
    // Another preset's file under Mocha's row.
    assert.equal(equalsHost(readFile('macchiato'), mochaRow), false);
    // One ANSI colour off.
    const wrongColour = structuredClone(mocha);
    wrongColour.palette.ansi[1] = '#ed8796';
    assert.equal(equalsHost(wrongColour, mochaRow), false);
    // Light mode not brought along when it follows.
    const wrongPatch = structuredClone(mocha);
    wrongPatch.patches.lightFollows = mocha.patches.lightPickedOnPurpose;
    assert.equal(equalsHost(wrongPatch, mochaRow), false);
    assert.equal(equalsHost(readFile('latte'), latteRow), true);
  });

  test('Mocha with light following writes exactly the desktop example', () => {
    assert.deepStrictEqual(themePresetPatch('mocha', false), {
      sidebarTheme: 'dark-2',
      darkThemePreset: 'custom',
      customSidebarTitlebarBackgroundTintColor: '#1c1c2c',
      terminalGhosttyTheme: 'Ghostex Catppuccin Mocha',
      lightThemePreset: 'custom',
      customSidebarTitlebarLightBackgroundTintColor: '#eaecf2',
      terminalGhosttyLightTheme: 'Ghostex Catppuccin Latte',
      themeSidebarContrast: -24,
      themeWorkAreaContrast: -24,
      customSidebarTitlebarBackgroundDarknessPercent: 85,
      customSidebarTitlebarLightBackgroundLightnessPercent: 84,
      terminalBackgroundMode: 'theme',
    });
  });

  test('the other appearance follows like the colour squares; Nord has no partner', () => {
    const has = (id: string, lightPicked: boolean, key: string): boolean =>
      key in (themePresetPatch(id, lightPicked) ?? {});
    assert.ok(has('mocha', false, 'lightThemePreset'));
    assert.ok(!has('mocha', true, 'lightThemePreset'));
    assert.ok(has('latte', true, 'darkThemePreset'));
    assert.ok(has('latte', false, 'darkThemePreset'));
    assert.ok(!has('nord', false, 'lightThemePreset'));
    assert.ok(!has('nord', false, 'terminalGhosttyLightTheme'));
    assert.ok(!has('nord', false, 'customSidebarTitlebarLightBackgroundTintColor'));
    assert.equal(themePresetPatch('nord', false)?.customSidebarTitlebarLightBackgroundLightnessPercent, 84);
    assert.equal(themePresetPatch('no-such-preset', false), undefined);
  });

  test('cards: the desktop order, families, labels and ANSI 1-4 swatches', () => {
    assert.deepEqual(
      THEME_PRESETS.map((preset) => [preset.id, preset.family, preset.label]),
      HOST_TABLE.map((row) => [row[0], row[7], row[8]]),
    );
    assert.deepEqual(
      THEME_PRESET_FAMILIES.map(({ family, presets }) => [family, presets.length]),
      [
        ['Catppuccin', 4],
        ['Dracula', 2],
        ['Solarized', 2],
        ['Tokyo Night', 4],
        ['Nord', 1],
        ['Kanagawa', 3],
        ['Everforest', 2],
        ['Gruvbox Material', 2],
      ],
    );
    const mocha = THEME_PRESETS.find((preset) => preset.id === 'mocha')!;
    assert.deepEqual(mocha.swatch, ['#f38ba8', '#a6e3a1', '#f9e2af', '#89b4fa']);
  });
});

/** The desktop's defaults for the colour keys; a preset patch is applied over them. */
const BASE_COLOURS: ThemeColourSettings = {
  darkThemePreset: 'gray',
  lightThemePreset: 'gray',
  customSidebarTitlebarBackgroundTintColor: '#808080',
  customSidebarTitlebarLightBackgroundTintColor: '#808080',
  customSidebarTitlebarBackgroundDarknessPercent: 96,
  customSidebarTitlebarLightBackgroundLightnessPercent: 96,
  themeSidebarContrast: 0,
  themeWorkAreaContrast: 0,
};

const BASE_SETTINGS = {
  ...BASE_COLOURS,
  sidebarTheme: 'system',
  terminalGhosttyTheme: 'GitHub Dark',
  terminalGhosttyLightTheme: 'GitHub Light Default',
  terminalBackgroundMode: 'pure',
  terminalColorScheme: 'app',
  sessionChatTheme: 'light',
} as unknown as GhostexSettings;

describe('applied presets', () => {
  test('every preset paints its pick in the sidebar and the theme background in the work area', () => {
    for (const preset of THEME_PRESETS) {
      const settings = { ...BASE_COLOURS, ...themePresetPatch(preset.id, true) } as ThemeColourSettings;
      const areas = resolveThemeAreas(settings, preset.mode === 'light');
      assert.equal(areas.sidebar, preset.tintColor, preset.id);
      assert.equal(areas.workChrome, preset.tintColor, preset.id);
      assert.equal(areas.workArea, HOST_WORK_AREA[preset.id], preset.id);
    }
  });

  test('only Solarized Dark paints a work area other than its palette background', () => {
    const differing = THEME_PRESETS.filter((preset) => HOST_WORK_AREA[preset.id] !== preset.palette.background);
    assert.deepEqual(
      differing.map((preset) => [preset.id, preset.palette.background, HOST_WORK_AREA[preset.id]]),
      [['sol-dark', '#002b36', '#032b36']],
    );
  });

  test('a light preset brings its dark partner, and the appearance it sets shows its own colours', () => {
    const settings = { ...BASE_COLOURS, ...themePresetPatch('latte', false) } as ThemeColourSettings;
    assert.deepEqual(
      [resolveThemeAreas(settings, true).sidebar, resolveThemeAreas(settings, true).workArea],
      ['#eaecf2', '#eff1f5'],
    );
    assert.equal(resolveThemeAreas(settings, false).workArea, '#1e1e2e');
  });

  test('a preset keeps other settings and shows as picked until edited', () => {
    const values = {
      ...BASE_SETTINGS,
      lightThemePreset: 'slate',
      terminalColorScheme: 'dark',
      ...themePresetPatch('kg-wave', true),
    } as GhostexSettings;
    assert.equal(values.sessionChatTheme, 'light');
    assert.equal(values.terminalColorScheme, 'dark');
    assert.equal(values.lightThemePreset, 'slate');
    assert.deepEqual(
      THEME_PRESETS.filter((preset) => themePresetMatches(values, preset)).map((preset) => preset.id),
      ['kg-wave'],
    );
    const edited = { ...values, themeWorkAreaContrast: -20 };
    assert.ok(!THEME_PRESETS.some((preset) => themePresetMatches(edited, preset)));
  });

  test('any change to what a preset always writes unpicks it', () => {
    const changed: Record<string, unknown> = {
      terminalBackgroundMode: 'pure',
      sidebarTheme: 'system',
      darkThemePreset: 'gray',
      lightThemePreset: 'gray',
      themeSidebarContrast: -23.5,
      themeWorkAreaContrast: -23.5,
      customSidebarTitlebarBackgroundDarknessPercent: 90,
      customSidebarTitlebarLightBackgroundLightnessPercent: 90,
    };
    for (const preset of THEME_PRESETS) {
      // What the preset always writes: a dark one with light picked on purpose, a light one without its partner.
      const own: Record<string, unknown> = { ...themePresetPatch(preset.id, true) };
      if (preset.mode === 'light') {
        for (const key of ['darkThemePreset', 'customSidebarTitlebarBackgroundTintColor', 'terminalGhosttyTheme']) {
          delete own[key];
        }
      }
      const values = { ...BASE_SETTINGS, ...own } as GhostexSettings;
      assert.ok(themePresetMatches(values, preset), preset.id);
      for (const key of Object.keys(own)) {
        const edited = { ...values, [key]: changed[key] ?? '#123456' } as GhostexSettings;
        assert.ok(!themePresetMatches(edited, preset), `${preset.id}: ${key}`);
      }
    }
  });
});
