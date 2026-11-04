/**
 * The colours a native terminal paints with, resolved from the theme settings the way the Mac resolves them, and the
 * terminal screen's chrome over those colours. Pure (no React Native), so `bun test` reaches it.
 *
 * CDXC:Theming WHY: the phone copies the Mac app's theme functions. The terminal takes the palette
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
  readableSecondaryText,
  resolveThemeAreas,
  sidebarAppearanceFor,
} from './sidebarAppearance';
import { DEFAULT_TERMINAL_PALETTE, terminalPalette } from './terminalPalettes';

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
  | 'importedTerminalPalettes'
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
 * Everything a terminal paints with. A palette name the phone does not carry (one saved before it stopped shipping,
 * or any other) takes the colours of that mode's default palette, GitHub Dark or GitHub Light Default; the saved name
 * itself stays.
 *
 * CDXC:Theming DECISION: the Mac leaves an unknown name to
 * Ghostty's defaults (`apply_ghostty_theme` returns without colours), whose white text on the white light background
 * would be unreadable after the licence selection dropped palettes users had saved; the default palette keeps every terminal readable.
 */
export function terminalColours(settings: TerminalColourSettings, systemIsLight: boolean): TerminalColors {
  const light = contentIsLight(settings, 'terminalColorScheme', systemIsLight);
  const name = light ? settings.terminalGhosttyLightTheme : settings.terminalGhosttyTheme;
  const palette =
    terminalPalette(name, settings.importedTerminalPalettes) ??
    terminalPalette(light ? DEFAULT_TERMINAL_PALETTE.light : DEFAULT_TERMINAL_PALETTE.dark);
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

/** Secondary text sits on the background itself and on the key pills and the editor: the ink's 8% wash over it. */
const SECONDARY_TEXT_WASH_PERCENT = 8;

/**
 * The chrome over `background`: the screen's dark tokens over a dark background (its earlier look), the drawer's ink
 * over a light one (`sidebarAppearanceFor`), split as the desktop splits light and dark chrome. Secondary text is
 * adjusted for the background and washed pills. The helper retains its foreground fallback when that foreground
 * itself cannot meet 4.5:1, which can occur with unrestricted custom terminal backgrounds.
 */
export function terminalChrome(background: string): TerminalChrome {
  const light = isLightBackground(background);
  const drawer = light ? sidebarAppearanceFor(background) : null;
  const foreground = drawer?.foreground ?? GhostexPalette.FOREGROUND;
  const designed = drawer?.mutedGlyph ?? GhostexPalette.MUTED;
  const ink = light ? '#000000' : '#ffffff';
  const surfaces = [background, mixHexColors(ink, background, SECONDARY_TEXT_WASH_PERCENT)];
  return { background, light, foreground, muted: readableSecondaryText(designed, foreground, surfaces), ink };
}
