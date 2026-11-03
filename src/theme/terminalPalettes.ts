/**
 * The terminal palettes the phone offers (Settings › Interface › Terminal palette in dark mode / light mode) and their
 * colours: the twenty preset palettes from `./presets/<id>.json` plus the Ghostty themes in `./ghosttyThemes.json`
 * (written by scripts/generate-ghostty-themes.ts from the desktop's embedded Ghostty themes, including the desktop's
 * defaults GitHub Dark and GitHub Light Default). Settings lists the names; the terminal reads the colours of the saved
 * name, and a saved name the phone does not carry keeps the fallback in terminalColours.ts.
 *
 * CDXC:Theming DECISION: only the Ghostty themes whose licence the app may pass
 * on ship, each covered by the third-party notices; the desktop is to apply the same selection.
 *
 * CDXC:Theming WHY: the phone copies the Mac app's theme functions. The Mac lists every palette in
 * both pickers, sorted by value byte for byte, and labels two of them differently from their values; both are kept.
 */

import ghosttyThemes from './ghosttyThemes.json';
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

/** The palette names in the Mac's order; with `mode`, only those whose background is that dark or light. */
export function terminalPaletteNames(mode?: 'dark' | 'light'): string[] {
  if (mode === undefined) return [...NAMES];
  return NAMES.filter((name) => isLightBackground(PALETTES.get(name)!.background) === (mode === 'light'));
}

/** The colours of palette `name`, or null for a name the phone does not carry. */
export function terminalPalette(name: string): TerminalPalette | null {
  return PALETTES.get(name) ?? null;
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
