/**
 * The twenty theme presets: each sets the existing colour, Colourfulness, terminal palette and terminal background
 * settings in one change so the app looks like that theme. A preset is a one-time write, not a saved choice: nothing
 * records which one was picked, and the card that matches the current settings shows as selected.
 *
 * CDXC:Theming 2026-11-01 DECISION: User (2026-11-01): the phone copies the desktop's presets. The files in
 * `./presets/` are the desktop's data in the format its parity test (`theme_preset_parity_with_the_phone`,
 * apps/desktop/src/terminal_gpui_engine.rs) compares as whole JSON objects, so they carry no other fields; the
 * grouping lives here. Their palettes are the theme projects' own colours; each file's sources, commits and licence
 * texts are its entries in the third-party notices (`GENERATED_DATA_FILES` in scripts/notices/pinned.ts, which fails
 * on a file it does not list). Picking a preset applies one of the file's two patches through the settings store's
 * `patchSettings`.
 */

import type { GhostexSettings } from '../settings/store';
import { colourfulnessPatch, COLOURFULNESS_LAST_POSITION } from './sidebarAppearance';
import alucard from './presets/alucard.json';
import dracula from './presets/dracula.json';
import efDark from './presets/ef-dark.json';
import efLight from './presets/ef-light.json';
import frappe from './presets/frappe.json';
import gmDark from './presets/gm-dark.json';
import gmLight from './presets/gm-light.json';
import kgDragon from './presets/kg-dragon.json';
import kgLotus from './presets/kg-lotus.json';
import kgWave from './presets/kg-wave.json';
import latte from './presets/latte.json';
import macchiato from './presets/macchiato.json';
import mocha from './presets/mocha.json';
import nord from './presets/nord.json';
import solDark from './presets/sol-dark.json';
import solLight from './presets/sol-light.json';
import tnDay from './presets/tn-day.json';
import tnMoon from './presets/tn-moon.json';
import tnNight from './presets/tn-night.json';
import tnStorm from './presets/tn-storm.json';

/** Everything picking a preset writes, as one settings patch. */
export type ThemePresetPatch = Partial<GhostexSettings>;

/** One `./presets/<id>.json` file. */
export type ThemePresetFile = {
  id: string;
  name: string;
  mode: 'dark' | 'light';
  /** The same family's preset for the other appearance, written along while that appearance follows; Nord has none. */
  partner: string | null;
  /** The theme's own background, which the work area paints at Full (Solarized Dark: `#032b36`, see the tests). */
  background: string;
  /** The colour Colourfulness Full paints the sidebar with. */
  tintColor: string;
  terminalPalette: string;
  palette: {
    background: string;
    foreground: string;
    cursor: string;
    selectionBackground: string;
    cursorText?: string;
    ansi: string[];
  };
  patches: { lightFollows: ThemePresetPatch; lightPickedOnPurpose: ThemePresetPatch };
};

export type ThemePreset = ThemePresetFile & {
  /** How Settings groups and labels the card. */
  family: string;
  label: string;
  /** ANSI 1-4 of the palette, for the card's dots. */
  swatch: string[];
};

/** The desktop's order, family and card label per file (`THEME_PRESETS` in packages/settings-catalog). */
const ENTRIES: ReadonlyArray<readonly [unknown, string, string]> = [
  [mocha, 'Catppuccin', 'Mocha'],
  [macchiato, 'Catppuccin', 'Macchiato'],
  [frappe, 'Catppuccin', 'Frappé'],
  [latte, 'Catppuccin', 'Latte'],
  [dracula, 'Dracula', 'Dracula'],
  [alucard, 'Dracula', 'Alucard'],
  [solDark, 'Solarized', 'Solarized Dark'],
  [solLight, 'Solarized', 'Solarized Light'],
  [tnNight, 'Tokyo Night', 'Night'],
  [tnStorm, 'Tokyo Night', 'Storm'],
  [tnMoon, 'Tokyo Night', 'Moon'],
  [tnDay, 'Tokyo Night', 'Day'],
  [nord, 'Nord', 'Nord'],
  [kgWave, 'Kanagawa', 'Wave'],
  [kgDragon, 'Kanagawa', 'Dragon'],
  [kgLotus, 'Kanagawa', 'Lotus'],
  [efDark, 'Everforest', 'Everforest Dark'],
  [efLight, 'Everforest', 'Everforest Light'],
  [gmDark, 'Gruvbox Material', 'Gruvbox Material Dark'],
  [gmLight, 'Gruvbox Material', 'Gruvbox Material Light'],
];

export const THEME_PRESETS: readonly ThemePreset[] = ENTRIES.map(([file, family, label]) => {
  const preset = file as ThemePresetFile;
  return { ...preset, family, label, swatch: preset.palette.ansi.slice(1, 5) };
});

/** The families in order, each with its presets: the rows of the Presets group. */
export const THEME_PRESET_FAMILIES: ReadonlyArray<{ family: string; presets: ThemePreset[] }> = THEME_PRESETS.reduce<
  { family: string; presets: ThemePreset[] }[]
>((families, preset) => {
  const group = families.find((entry) => entry.family === preset.family);
  if (group) group.presets.push(preset);
  else families.push({ family: preset.family, presets: [preset] });
  return families;
}, []);

/**
 * The patch picking preset `id` applies (`theme_preset_choice`). `lightPicked`: light mode's colour was picked on
 * purpose on the page since it opened, so a dark preset leaves light mode alone; a light preset always brings its
 * dark partner.
 */
export function themePresetPatch(id: string, lightPicked: boolean): ThemePresetPatch | undefined {
  const preset = THEME_PRESETS.find((entry) => entry.id === id);
  return preset?.patches[lightPicked ? 'lightPickedOnPurpose' : 'lightFollows'];
}

/**
 * Whether the settings still hold everything `preset` always writes (`theme_preset_matches`): its appearance, its own
 * appearance's custom colour and palette, Colourfulness Full with both depths, and the theme terminal background. The
 * partner's keys are left out, because a preset does not always write them.
 */
export function themePresetMatches(settings: GhostexSettings, preset: ThemePreset): boolean {
  const dark = preset.mode === 'dark';
  const full = colourfulnessPatch(COLOURFULNESS_LAST_POSITION);
  return (
    settings.sidebarTheme === (dark ? 'dark-2' : 'plain-light') &&
    (dark ? settings.darkThemePreset : settings.lightThemePreset) === 'custom' &&
    (dark ? settings.customSidebarTitlebarBackgroundTintColor : settings.customSidebarTitlebarLightBackgroundTintColor)
      .trim()
      .toLowerCase() === preset.tintColor.toLowerCase() &&
    (dark ? settings.terminalGhosttyTheme : settings.terminalGhosttyLightTheme) === preset.terminalPalette &&
    settings.terminalBackgroundMode === 'theme' &&
    (Object.keys(full) as (keyof typeof full)[]).every((key) => settings[key] === full[key])
  );
}
