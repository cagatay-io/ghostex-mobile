/**
 * The colours a native terminal paints with, resolved from the theme settings the way the Mac resolves them, and the
 * terminal screen's chrome over those colours. Pure (no React Native), so `bun test` reaches it.
 *
 * CDXC:Theming 2026-11-01 WHY: User (2026-11-01): copy the Mac app's theme functions. The terminal takes the palette
 * of its own appearance (Terminal theme: Follow app, System, Light, Dark), the Terminal background choice behind its
 * cells (Black / white, Follow theme = the theme's work area, Custom colour in both appearances) and, in light mode,
 * no palette selection colour (the Mac's adaptive selection). The phone has no Ghostty themes folder, so the native
 * side receives the colours themselves, not a theme name.
 * SEE-ALSO: apps/desktop/src/terminal_gpui_engine.rs (`apply_ghostty_theme`, `apply_color_scheme`),
 * apps/desktop/src/shared_settings/types.rs (`grid_background_rgb`), shared_settings/normalize.rs
 * (`terminal_background`), modules/ghostex-native/ios/GhosttyTerminal/Ghostty.ConfigBuilder.swift (the config lines).
 */

import type { TerminalColors } from '../../modules/ghostex-native/src/GhostexNative.types';
import type { GhostexSettings } from '../settings/store';
import { GhostexPalette, mixHexColors } from './palette';
import {
  contentIsLight,
  isLightBackground,
  relativeLuminance,
  resolveThemeAreas,
  sidebarAppearanceFor,
} from './sidebarAppearance';
import { terminalPalette } from './terminalPalettes';

/** The settings the terminal's colours depend on. */
export type TerminalColourSettings = Pick<
  GhostexSettings,
  | 'darkThemePreset'
  | 'lightThemePreset'
  | 'customSidebarTitlebarBackgroundTintColor'
  | 'customSidebarTitlebarLightBackgroundTintColor'
  | 'customSidebarTitlebarBackgroundDarknessPercent'
  | 'customSidebarTitlebarLightBackgroundLightnessPercent'
  | 'themeSidebarContrast'
  | 'themeWorkAreaContrast'
  | 'sidebarTheme'
  | 'terminalColorScheme'
  | 'terminalGhosttyTheme'
  | 'terminalGhosttyLightTheme'
  | 'terminalBackgroundMode'
  | 'workspaceBackgroundColor'
>;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
/** The retired default every desktop settings file carried; it means no custom colour (`normalize.rs`). */
const RETIRED_DEFAULT_BACKGROUND = '#010101';

/** The Custom colour, or null while none is set (empty, `#010101` or not a colour). */
function customBackground(value: string): string | null {
  const color = value.trim().toLowerCase();
  return HEX_COLOR.test(color) && color !== RETIRED_DEFAULT_BACKGROUND ? color : null;
}

/**
 * The colour behind a terminal of appearance `light` (`grid_background_rgb`): pure black or white, the theme's work
 * area, or the Custom colour in both appearances; Custom without a colour follows the theme.
 */
export function terminalBackground(settings: TerminalColourSettings, light: boolean): string {
  if (settings.terminalBackgroundMode === 'pure') return light ? '#ffffff' : '#000000';
  if (settings.terminalBackgroundMode === 'custom') {
    const custom = customBackground(settings.workspaceBackgroundColor);
    if (custom !== null) return custom;
  }
  return resolveThemeAreas(settings, light).workArea;
}

/**
 * Everything a terminal paints with. A light terminal whose light palette the phone does not carry keeps the dark
 * palette's colours (the Mac applies the dark palette first and the light one only when it resolves); a palette it
 * does not carry at all leaves foreground, cursor and ANSI colours to Ghostty's defaults.
 */
export function terminalColours(settings: TerminalColourSettings, systemIsLight: boolean): TerminalColors {
  const light = contentIsLight(settings, 'terminalColorScheme', systemIsLight);
  const dark = terminalPalette(settings.terminalGhosttyTheme);
  const palette = light ? (terminalPalette(settings.terminalGhosttyLightTheme) ?? dark) : dark;
  const colors: TerminalColors = { light, background: terminalBackground(settings, light), palette: [] };
  if (palette === null) return colors;
  colors.foreground = palette.foreground;
  colors.palette = [...palette.ansi];
  if (palette.cursor !== undefined) colors.cursor = palette.cursor;
  if (palette.cursorText !== undefined) colors.cursorText = palette.cursorText;
  if (!light && palette.selectionBackground !== undefined) colors.selectionBackground = palette.selectionBackground;
  return colors;
}

/** The terminal screen's header, tabs, state overlay and key bar over a background. */
export type TerminalChrome = {
  background: string;
  /** A light background: dark ink, dark status bar text. */
  light: boolean;
  foreground: string;
  muted: string;
  /** The washes' base (track, pills, separators): white over dark backgrounds, black over light ones. */
  ink: '#ffffff' | '#000000';
};

/** WCAG AA for normal-size text: the key labels (9 pt), captions and hints are all normal-size. */
const SECONDARY_TEXT_CONTRAST = 4.5;
/** Secondary text sits on the background itself and on the key pills and the editor: the ink's 8% wash over it. */
const SECONDARY_TEXT_WASH_PERCENT = 8;

function contrastRatio(a: string, b: string): number {
  const [x, y] = [a, b].map((hex) => {
    const value = parseInt(hex.slice(1), 16);
    return relativeLuminance([(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]);
  }) as [number, number];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * The designed secondary colour (`muted`), moved toward the foreground just as far as it takes to keep 4.5:1 on the
 * background and on the washed pills; a colour that already does is kept as it is.
 */
function readableMuted(muted: string, foreground: string, background: string, ink: string): string {
  const surfaces = [background, mixHexColors(ink, background, SECONDARY_TEXT_WASH_PERCENT)];
  const readable = (color: string): boolean =>
    surfaces.every((surface) => contrastRatio(color, surface) >= SECONDARY_TEXT_CONTRAST);
  if (readable(muted)) return muted;
  for (let toward = 1; toward < 100; toward += 1) {
    const candidate = mixHexColors(foreground, muted, toward);
    if (readable(candidate)) return candidate;
  }
  return foreground;
}

/**
 * The chrome over `background`: the screen's dark tokens over a dark background (its earlier look), the drawer's ink
 * over a light one (`sidebarAppearanceFor`), split as the desktop splits light and dark chrome. Secondary text keeps
 * 4.5:1 on the surfaces it is drawn on (`readableMuted`): the drawer's muted ink is too faint for the key labels and
 * captions on the light presets' backgrounds.
 */
export function terminalChrome(background: string): TerminalChrome {
  const light = isLightBackground(background);
  const foreground = light ? sidebarAppearanceFor(background).foreground : GhostexPalette.FOREGROUND;
  const designed = light ? sidebarAppearanceFor(background).muted : GhostexPalette.MUTED;
  const ink = light ? '#000000' : '#ffffff';
  return { background, light, foreground, muted: readableMuted(designed, foreground, background, ink), ink };
}
