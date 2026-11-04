/**
 * The terminal palettes the phone offers (Settings › Interface › Terminal palette in dark mode / light mode) and their
 * colours: the twenty preset palettes from `./presets/<id>.json` plus the Ghostty themes in `./ghosttyThemes.json`
 * (written by scripts/generate-ghostty-themes.ts from the desktop's embedded Ghostty themes, including the desktop's
 * defaults GitHub Dark and GitHub Light Default). Settings lists the names; the terminal reads the colours of the saved
 * name, and a saved name the phone does not carry keeps the fallback in terminalColours.ts. The caller also supplies
 * any private palettes imported on this phone, stored separately from the bundled data in settings.v1.
 *
 * CDXC:Theming DECISION: only the Ghostty themes whose licence the app may pass
 * on ship, each covered by the third-party notices; the desktop is to apply the same selection.
 *
 * CDXC:Theming WHY: the phone copies the Mac app's theme functions. The Mac lists every palette in
 * both pickers, sorted by value byte for byte, and labels two of them differently from their values; both are kept.
 */

import ghosttyThemes from './ghosttyThemes.json';
import type { ImportedTerminalPalette } from './importGhostty';
import { THEME_PRESETS } from './presets';
import { isLightBackground } from './sidebarAppearance';

/** One palette, `#rrggbb` colours; `ansi` holds the sixteen ANSI colours 0-15. */
export type TerminalPalette = {
  background: string;
  foreground: string;
  cursor?: string;
  cursorText?: string;
  selectionBackground?: string;
  selectionForeground?: string;
  ansi: string[];
};

/**
 * The desktop's default palettes (packages/settings-catalog/src/data/defaults.rs). A name the phone does not carry
 * takes the colours of its mode's default (terminalColours.ts).
 */
export const DEFAULT_TERMINAL_PALETTE = { dark: 'GitHub Dark', light: 'GitHub Light Default' } as const;

const PALETTES: ReadonlyMap<string, TerminalPalette> = new Map<string, TerminalPalette>([
  ...Object.entries(ghosttyThemes as Record<string, TerminalPalette>),
  ...THEME_PRESETS.map((preset): [string, TerminalPalette] => [preset.terminalPalette, preset.palette]),
]);

/** Byte order, as the Mac sorts its list (every name is ASCII, so UTF-16 order is the same). */
const NAMES: readonly string[] = [...PALETTES.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/** Bundled and private palette names, sorted by value; `mode` filters by their background colour. */
export function terminalPaletteNames(
  mode?: 'dark' | 'light',
  imported?: readonly ImportedTerminalPalette[],
): string[] {
  const names = imported?.length
    ? [...NAMES, ...imported.map((entry) => entry.name)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    : [...NAMES];
  if (mode === undefined) return names;
  return names.filter((name) => isLightBackground(terminalPalette(name, imported)!.background) === (mode === 'light'));
}

/** The colours of a bundled or privately imported palette, or null for a name the phone does not carry. */
export function terminalPalette(name: string, imported?: readonly ImportedTerminalPalette[]): TerminalPalette | null {
  const bundled = PALETTES.get(name);
  if (bundled !== undefined) return bundled;
  const palette = imported?.find((entry) => entry.name === name)?.palette;
  return palette === undefined
    ? null
    : {
        background: palette.background,
        foreground: palette.foreground,
        cursor: palette.cursor,
        selectionBackground: palette.selectionBackground,
        selectionForeground: palette.selectionForeground,
        ansi: palette.palette,
      };
}

/** The Mac's labels that differ from their values (`GHOSTTY_THEME_SETTING_OPTIONS`). */
const LABELS: Record<string, string> = {
  'Ghostex Catppuccin Frappe': 'Ghostex Catppuccin Frappé',
  'GitHub Light Default': 'GitHub Light',
};

/** How Settings names palette `name`. */
export function terminalPaletteLabel(name: string): string {
  return Object.hasOwn(LABELS, name) ? LABELS[name]! : name;
}
