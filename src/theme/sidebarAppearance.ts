import { mixHexColors } from './palette';

/**
 * The phone's colour model: a port of the desktop's chrome resolver (apps/desktop/src/app/helpers/titlebar/chrome_tints.rs,
 * packages/settings-catalog/src/dark_chrome.rs) and its Colourfulness patch (settings_modal/tabs/theme/colours.rs).
 * The phone keeps its own copy and its own values (no sync with the computer); the desktop's parity test reads the
 * phone's preset files.
 *
 * CDXC:Theming 2026-11-01 DECISION: User (2026-11-01): "die funktionen der mac app kopieren. dort haben wir die presets
 * nun bereits" (copy the Mac app's theme functions, presets included). This model replaces the phone's earlier tint and
 * 85-100 depth slider (reference 90): one resolver for the whole app, the desktop's numbers. The desktop paints in
 * 32-bit floats and rounds half away from zero where it calls `round()`; both are reproduced below so the phone paints
 * the same `#rrggbb` (`f32`, `roundAway`).
 */

export type SidebarThemeSetting = 'system' | 'plain-light' | 'dark-2';
export const SIDEBAR_THEME_OPTIONS: readonly SidebarThemeSetting[] = ['system', 'plain-light', 'dark-2'];

/** The sixteen colour squares per appearance (`DARK_THEME_PRESET_CONTROLS` / `LIGHT_THEME_PRESET_CONTROLS`). */
const DARK_SQUARES = [
  ['gray', 96, 0x808080],
  ['black', 100, 0x000000],
  ['slate', 94, 0x4a6a8a],
  ['midnight', 94, 0x1f3a8a],
  ['blue', 96, 0x336699],
  ['indigo', 94, 0x4b4fa6],
  ['teal', 94, 0x2f7f7f],
  ['green', 96, 0x3f7a5f],
  ['forest', 94, 0x2e6a3a],
  ['olive', 94, 0x6b6b35],
  ['amber', 94, 0x8a6a2a],
  ['orange', 96, 0x8a5330],
  ['red', 96, 0x884444],
  ['rose', 94, 0x8a4a5c],
  ['pink', 96, 0x854f7a],
  ['purple', 96, 0x6c4f8f],
] as const;
const LIGHT_SQUARES = [
  ['gray', 96, 0x808080],
  ['white', 100, 0xffffff],
  ['slate', 95, 0x4a6a8a],
  ['midnight', 94, 0x1f3a8a],
  ['blue', 95, 0x336699],
  ['indigo', 95, 0x4b4fa6],
  ['teal', 95, 0x2f7f7f],
  ['green', 95, 0x3f7a5f],
  ['forest', 94, 0x2e6a3a],
  ['olive', 95, 0x6b6b35],
  ['amber', 95, 0x8a6a2a],
  ['orange', 95, 0x8a5330],
  ['red', 95, 0x884444],
  ['rose', 95, 0x8a4a5c],
  ['pink', 95, 0x854f7a],
  ['purple', 95, 0x6c4f8f],
] as const;

export type DarkThemeSquare = (typeof DARK_SQUARES)[number][0];
export type LightThemeSquare = (typeof LIGHT_SQUARES)[number][0];
export type DarkThemePreset = DarkThemeSquare | 'custom';
export type LightThemePreset = LightThemeSquare | 'custom';
export const DARK_THEME_PRESETS: readonly DarkThemePreset[] = [...DARK_SQUARES.map(([id]) => id), 'custom'];
export const LIGHT_THEME_PRESETS: readonly LightThemePreset[] = [...LIGHT_SQUARES.map(([id]) => id), 'custom'];

/** Calibrated dark chrome per tint at depth 95 (`CUSTOM_SIDEBAR_TITLEBAR_BACKGROUND_DARK_TINTS`). */
const DARK_TINTS: ReadonlyMap<number, number> = new Map([
  [0x000000, 0x000000],
  [0xffffff, 0x0e0e0e],
  [0x808080, 0x0e0e0e],
  [0x88d7ff, 0x0a0f12],
  [0x4f6672, 0x0c0e10],
  [0x884444, 0x0d0005],
  [0x8a5330, 0x100502],
  [0x8a6a2f, 0x110a02],
  [0x657a3f, 0x0c1005],
  [0x3f7a5f, 0x031006],
  [0x2f7d66, 0x03100c],
  [0x287c7f, 0x031011],
  [0x336699, 0x0c0e11],
  [0x4f5f96, 0x080912],
  [0x6c4f8f, 0x0a0611],
  [0x854f7a, 0x100611],
  [0x8a4f5f, 0x100409],
  [0x4a6a8a, 0x070d14],
  [0x1f3a8a, 0x02061a],
  [0x4b4fa6, 0x08081c],
  [0x2f7f7f, 0x021213],
  [0x2e6a3a, 0x031205],
  [0x6b6b35, 0x0e0f03],
  [0x8a6a2a, 0x130c02],
  [0x8a4a5c, 0x12040b],
]);

/** Calibrated light chrome per tint at depth 95 (`CUSTOM_SIDEBAR_TITLEBAR_BACKGROUND_LIGHT_TINTS`). */
const LIGHT_TINTS: ReadonlyMap<number, number> = new Map([
  [0x000000, 0xf1f1f2],
  [0xffffff, 0xf1f1f2],
  [0x808080, 0xf1f1f2],
  [0x88d7ff, 0xedf4fa],
  [0x4f6672, 0xeef1f3],
  [0x884444, 0xf7ecec],
  [0x8a5330, 0xf8f0e9],
  [0x8a6a2f, 0xf7f3e8],
  [0x657a3f, 0xf1f5ea],
  [0x3f7a5f, 0xecf4ee],
  [0x2f7d66, 0xeaf4f0],
  [0x287c7f, 0xeaf4f4],
  [0x336699, 0xecf1f7],
  [0x4f5f96, 0xeff0f7],
  [0x6c4f8f, 0xf2edf7],
  [0x854f7a, 0xf7ecf3],
  [0x8a4f5f, 0xf7ecef],
  [0x4a6a8a, 0xebf1f8],
  [0x1f3a8a, 0xedeff8],
  [0x4b4fa6, 0xeeeef8],
  [0x2f7f7f, 0xebf4f5],
  [0x2e6a3a, 0xedf7f0],
  [0x6b6b35, 0xf4f4ec],
  [0x8a6a2a, 0xf6f2ec],
  [0x8a4a5c, 0xf7edf0],
]);

const DARK_CALIBRATION = 0x040607;
/** An uncalibrated neutral grey draws as Graphite (`CUSTOM_SIDEBAR_TITLEBAR_BACKGROUND_NEUTRAL_RGB`). */
const DARK_NEUTRAL = 0x0e0e0e;
const LIGHT_CALIBRATION = 0xf1f1f2;
const SCALE_REFERENCE_DEPTH = 95;

export const DEFAULT_THEME_TINT = '#808080';
export const DEFAULT_THEME_DEPTH = 96;
export const MIN_DARK_THEME_DEPTH = 85;
export const MIN_LIGHT_THEME_DEPTH = 60;
export const MAX_THEME_DEPTH = 100;
/** A custom light colour is drawn one point deeper than its saved depth (`CUSTOM_LIGHT_THEME_DEPTH_SHIFT`). */
const CUSTOM_LIGHT_DEPTH_SHIFT = -1;

/** Colourfulness points: Subtle +4, Soft 0, Balanced -4, Rich -8, Vivid -12 (where depth stops), Full -24. */
export const THEME_CONTRAST_MAX_POINTS = 4;
export const THEME_CONTRAST_VIVID_POINTS = -12;
export const THEME_CONTRAST_FULL_POINTS = -24;
const FULL_COLOUR_MAX_LUMINANCE = 0.04;
const LIGHT_FULL_COLOUR_MIN_LUMINANCE = 0.62;

/** The last Colourfulness position: 0 is Subtle (+4), 32 Vivid (-12), 56 Full (-24), half a point apart. */
export const COLOURFULNESS_LAST_POSITION = 56;

/** The colour settings the resolver reads, already normalized by the settings store. */
export type ThemeColourSettings = {
  darkThemePreset: DarkThemePreset;
  lightThemePreset: LightThemePreset;
  customSidebarTitlebarBackgroundTintColor: string;
  customSidebarTitlebarLightBackgroundTintColor: string;
  customSidebarTitlebarBackgroundDarknessPercent: number;
  customSidebarTitlebarLightBackgroundLightnessPercent: number;
  themeSidebarContrast: number;
  themeWorkAreaContrast: number;
};

type Channels = [number, number, number];
const f32 = Math.fround;

/** Rust `f64::round`: half away from zero (JS `Math.round` rounds half toward +infinity). */
function roundAway(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** `#rrggbb` (or `rrggbb`, as the desktop reads it) as lower-case `#rrggbb`, else `fallback`. */
export function normalizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().toLowerCase();
  const hex = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  return /^[0-9a-f]{6}$/u.test(hex) ? `#${hex}` : fallback;
}

function rgbOf(hex: string): number {
  return Number.parseInt(normalizeHexColor(hex, DEFAULT_THEME_TINT).slice(1), 16);
}

function hexOf(rgb: number): string {
  return `#${rgb.toString(16).padStart(6, '0')}`;
}

function channels(rgb: number): Channels {
  return [(rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff];
}

/** `sidebar_titlebar_pack_rgb`: `floor(x + 0.5)` in f32, clamped to a byte, per channel. */
function pack(values: Channels): number {
  return values.reduce((rgb, value) => (rgb << 8) | clamp(Math.floor(f32(f32(value) + 0.5)), 0, 255), 0);
}

/** `sidebar_titlebar_tint_direction`: the channels' deviation from their mean, over its largest magnitude. */
function tintDirection(base: Channels): Channels {
  const average = f32(f32(f32(base[0] + base[1]) + base[2]) / 3);
  const direction = base.map((value) => f32(value - average)) as Channels;
  const magnitude = Math.max(...direction.map(Math.abs));
  if (magnitude < 0.5) return [0, 0, 0];
  return direction.map((value) => f32(value / magnitude)) as Channels;
}

/** A grey without a hue to keep: its channels lie less than one step apart. */
function isNeutral(color: Channels): boolean {
  return Math.max(...color) - Math.min(...color) < 1;
}

/** Depth to the half point, rounding halves up (`clamp_sidebar_titlebar_background_darkness_percent`). */
function clampDepth(value: number, min: number): number {
  if (!Number.isFinite(value)) return DEFAULT_THEME_DEPTH;
  return clamp(Math.floor(value * 2 + 0.5) / 2, min, MAX_THEME_DEPTH);
}

export function clampDarkThemeDepth(value: number): number {
  return clampDepth(value, MIN_DARK_THEME_DEPTH);
}

export function clampLightThemeDepth(value: number): number {
  return clampDepth(value, MIN_LIGHT_THEME_DEPTH);
}

/** Contrast points over the whole slider, Subtle to Full (`round_theme_contrast_points`). */
export function roundThemeContrastPoints(points: number): number {
  return clamp(roundAway(points * 2) / 2, THEME_CONTRAST_FULL_POINTS, THEME_CONTRAST_MAX_POINTS);
}

/** The depth part of one area's contrast: Subtle to Vivid (`theme_contrast_points`). */
function depthPoints(points: number): number {
  return clamp(roundAway(points * 2) / 2, THEME_CONTRAST_VIVID_POINTS, THEME_CONTRAST_MAX_POINTS);
}

/** How far past Vivid an area's points sit: 0 at Vivid and above, 1 at Full (`full_colour_fade`). */
function fullColourFade(points: number): number {
  if (!Number.isFinite(points)) return 0;
  const rounded = roundThemeContrastPoints(points);
  return clamp(
    (THEME_CONTRAST_VIVID_POINTS - rounded) / (THEME_CONTRAST_VIVID_POINTS - THEME_CONTRAST_FULL_POINTS),
    0,
    1,
  );
}

function linear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of 0-255 channels. */
export function relativeLuminance(rgb: readonly number[]): number {
  return 0.2126 * linear(rgb[0]!) + 0.7152 * linear(rgb[1]!) + 0.0722 * linear(rgb[2]!);
}

/** Dark Full: the picked colour, or its channels scaled down until it is as deep as the 0.04 cap. */
function fullColourTarget(picked: Channels): Channels {
  if (relativeLuminance(picked) <= FULL_COLOUR_MAX_LUMINANCE) return picked;
  let low = 0;
  let high = 1;
  for (let step = 0; step < 40; step += 1) {
    const middle = (low + high) / 2;
    if (relativeLuminance(picked.map((value) => value * middle)) <= FULL_COLOUR_MAX_LUMINANCE) low = middle;
    else high = middle;
  }
  return picked.map((value) => value * low) as Channels;
}

/**
 * Light Full: the picked colour, or the least step toward white whose painted (rounded) colour still reaches the 0.62
 * minimum (`light_full_colour_target`).
 */
function lightFullColourTarget(picked: Channels): Channels {
  if (relativeLuminance(picked) >= LIGHT_FULL_COLOUR_MIN_LUMINANCE) return picked;
  const towardWhite = (amount: number): Channels => picked.map((value) => value + (255 - value) * amount) as Channels;
  let low = 0;
  let high = 1;
  for (let step = 0; step < 40; step += 1) {
    const middle = (low + high) / 2;
    const painted = towardWhite(middle).map((value) => Math.floor(value + 0.5));
    if (relativeLuminance(painted) >= LIGHT_FULL_COLOUR_MIN_LUMINANCE) high = middle;
    else low = middle;
  }
  return towardWhite(high);
}

/** `sidebar_titlebar_background_for_darkness`: the calibrated dark chrome scaled by depth (100 is black). */
function darkChrome(depth: number, tint: number): number {
  const darkness = clampDarkThemeDepth(depth);
  const calibrated = DARK_TINTS.get(tint);
  let base: Channels;
  if (calibrated !== undefined) {
    base = channels(calibrated);
  } else if (isNeutral(channels(tint))) {
    base = channels(DARK_NEUTRAL);
  } else {
    const direction = tintDirection(channels(tint));
    base = channels(DARK_CALIBRATION).map((value, index) => f32(value + f32(direction[index]! * 4))) as Channels;
  }
  if (darkness === MAX_THEME_DEPTH) return 0x000000;
  const scale = f32((MAX_THEME_DEPTH - darkness) / (MAX_THEME_DEPTH - SCALE_REFERENCE_DEPTH));
  return pack(base.map((value) => f32(value * scale)) as Channels);
}

/** `sidebar_titlebar_light_background_for_lightness`: the calibrated light chrome scaled by depth (100 is white). */
function lightChrome(depth: number, tint: number): number {
  const lightness = clampLightThemeDepth(depth);
  if (lightness === MAX_THEME_DEPTH) return 0xffffff;
  const calibrated = LIGHT_TINTS.get(tint);
  let base: Channels;
  if (calibrated !== undefined) {
    base = channels(calibrated);
  } else if (isNeutral(channels(tint))) {
    base = channels(LIGHT_CALIBRATION);
  } else {
    const direction = tintDirection(channels(tint));
    base = channels(LIGHT_CALIBRATION).map((value, index) => f32(value + f32(direction[index]! * 6))) as Channels;
  }
  const scale = f32((MAX_THEME_DEPTH - lightness) / (MAX_THEME_DEPTH - SCALE_REFERENCE_DEPTH));
  return pack(base.map((value) => f32(255 - f32(f32(255 - value) * scale))) as Channels);
}

/** The chrome at `depth`, faded `fade` of the way toward the picked colour's Full end (both appearances). */
function chromeTowardFull(light: boolean, depth: number, tint: number, fade: number): number {
  const vivid = light ? lightChrome(depth, tint) : darkChrome(depth, tint);
  if (fade <= 0) return vivid;
  const from = channels(vivid);
  const target = light ? lightFullColourTarget(channels(tint)) : fullColourTarget(channels(tint));
  const amount = Math.min(fade, 1);
  return pack(from.map((value, index) => f32(value + (target[index]! - value) * amount)) as Channels);
}

/**
 * One appearance's chrome controls before the final clamp (`dark_chrome_raw_controls` / `light_chrome_raw_controls`):
 * a square's depth plus the sidebar contrast, or the custom colour's saved depth (light: one point deeper).
 */
function rawControls(settings: ThemeColourSettings, light: boolean): { depth: number; tint: number } {
  if (light) {
    if (settings.lightThemePreset === 'custom') {
      return {
        depth:
          clampLightThemeDepth(settings.customSidebarTitlebarLightBackgroundLightnessPercent) +
          CUSTOM_LIGHT_DEPTH_SHIFT,
        tint: rgbOf(settings.customSidebarTitlebarLightBackgroundTintColor),
      };
    }
    const square = LIGHT_SQUARES.find(([id]) => id === settings.lightThemePreset) ?? LIGHT_SQUARES[0];
    return { depth: square[1] + depthPoints(settings.themeSidebarContrast), tint: square[2] };
  }
  if (settings.darkThemePreset === 'custom') {
    return {
      depth: clampDarkThemeDepth(settings.customSidebarTitlebarBackgroundDarknessPercent),
      tint: rgbOf(settings.customSidebarTitlebarBackgroundTintColor),
    };
  }
  const square = DARK_SQUARES.find(([id]) => id === settings.darkThemePreset) ?? DARK_SQUARES[0];
  return { depth: square[1] + depthPoints(settings.themeSidebarContrast), tint: square[2] };
}

/**
 * Each channel `amount` of the way to `target` (255 white, 0 black) in the host's f32, packed
 * (`sidebar_titlebar_blend_toward_white` toward white).
 */
function stepToward(rgb: number, target: 0 | 255, amount: number): number {
  const step = f32(amount);
  return pack(channels(rgb).map((value) => f32(value + f32(f32(target - value) * step))) as Channels);
}

/** `toward` in the desktop's chat appearance (`ChatAppearance::resolve`): `color` stepped toward white or black. */
export function stepTowardHex(color: string, toWhite: boolean, amount: number): string {
  return hexOf(stepToward(rgbOf(color), toWhite ? 255 : 0, amount));
}

/** The desktop's light/dark split on encoded RGB (`sidebar_titlebar_background_is_light`). */
function chromeIsLight(rgb: number): boolean {
  const [red, green, blue] = channels(rgb);
  return f32(f32(f32(f32(0.2126) * red) + f32(f32(0.7152) * green)) + f32(f32(0.0722) * blue)) / 255 > 0.54;
}

export type ThemeAreaColours = {
  /** The sidebar chrome (drawer, Settings pages). */
  sidebar: string;
  /** The chrome the work area derives from: the sidebar's with the work area contrast in its place. */
  workChrome: string;
  /** The work area itself (chat, a theme-coloured terminal): the work chrome a fixed step toward white. */
  workArea: string;
  /** Menus: 5% toward white off dark sidebar chrome, 70% off light. */
  menu: string;
};

/**
 * Every area colour of one appearance (`resolved_custom_sidebar_titlebar_background_for_variant`,
 * `resolved_work_area_chrome_for_variant`, `work_area_background_for_variant`,
 * `sidebar_titlebar_menu_background_for_chrome`). The work area adds its contrast difference to the unclamped depth
 * and clamps once.
 */
export function resolveThemeAreas(settings: ThemeColourSettings, light: boolean): ThemeAreaColours {
  const { depth, tint } = rawControls(settings, light);
  const clampArea = light ? clampLightThemeDepth : clampDarkThemeDepth;
  const delta = depthPoints(settings.themeWorkAreaContrast) - depthPoints(settings.themeSidebarContrast);
  const sidebar = chromeTowardFull(light, clampArea(depth), tint, fullColourFade(settings.themeSidebarContrast));
  const workChrome = chromeTowardFull(
    light,
    clampArea(depth + delta),
    tint,
    fullColourFade(settings.themeWorkAreaContrast),
  );
  return {
    sidebar: hexOf(sidebar),
    workChrome: hexOf(workChrome),
    workArea: hexOf(stepToward(workChrome, 255, chromeIsLight(workChrome) ? 0.25 : 0.01)),
    menu: hexOf(stepToward(sidebar, 255, chromeIsLight(sidebar) ? 0.7 : 0.05)),
  };
}

/** Whether the app draws its light appearance (`sidebar_uses_light_theme`): System follows the device. */
export function appearanceIsLight(sidebarTheme: SidebarThemeSetting, systemIsLight: boolean): boolean {
  if (sidebarTheme === 'system') return systemIsLight;
  return sidebarTheme === 'plain-light';
}

/** A content area's own appearance (desktop `sessionChatTheme`, `terminalColorScheme`): follow the app, or its own. */
export type ContentColorScheme = 'app' | 'light' | 'dark' | 'system';
/** In the desktop's order (`SESSION_CHAT_THEME_OPTIONS`). */
export const CONTENT_COLOR_SCHEMES: readonly ContentColorScheme[] = ['app', 'system', 'light', 'dark'];
export type ContentColorSchemeKey = 'sessionChatTheme' | 'terminalColorScheme';

/**
 * `effective_content_color_scheme` (apps/desktop/src/shared_settings/appearance.rs): the area's own Light, Dark or
 * System, or under Follow app the app's appearance (System stays System).
 */
export function effectiveContentColorScheme<K extends ContentColorSchemeKey>(
  settings: { sidebarTheme: SidebarThemeSetting } & Record<K, ContentColorScheme>,
  key: K,
): 'light' | 'dark' | 'system' {
  const own = settings[key];
  if (own !== 'app') return own;
  if (settings.sidebarTheme === 'plain-light') return 'light';
  return settings.sidebarTheme === 'system' ? 'system' : 'dark';
}

/** Whether a content area draws light (`gpui_session_chat_uses_light_theme`): System follows the device. */
export function contentIsLight<K extends ContentColorSchemeKey>(
  settings: { sidebarTheme: SidebarThemeSetting } & Record<K, ContentColorScheme>,
  key: K,
  systemIsLight: boolean,
): boolean {
  const scheme = effectiveContentColorScheme(settings, key);
  return scheme === 'system' ? systemIsLight : scheme === 'light';
}

export type ThemeSquare = { id: DarkThemeSquare | LightThemeSquare; label: string; tint: string };

/** The sixteen squares of one appearance as Settings offers them (`DARK_THEME_PRESET_OPTIONS` / `LIGHT_...`). */
export function themeSquares(light: boolean): readonly ThemeSquare[] {
  return (light ? LIGHT_SQUARES : DARK_SQUARES).map(([id, , tint]) => ({
    id,
    label: id === 'gray' ? 'Graphite' : `${id[0]!.toUpperCase()}${id.slice(1)}`,
    tint: hexOf(tint),
  }));
}

/** `paired_preset`: the matching square in the other appearance (Black and White swap); Custom has none. */
export function pairedThemeSquare(fromDark: boolean, preset: string): string | null {
  if (preset === 'custom') return null;
  if (fromDark && preset === 'black') return 'white';
  if (!fromDark && preset === 'white') return 'black';
  return preset;
}

/** Whether the other appearance still shows the matching square of this one's. */
export function themeColoursPaired(settings: ThemeColourSettings, dark: boolean): boolean {
  const own = dark ? settings.darkThemePreset : settings.lightThemePreset;
  const other = dark ? settings.lightThemePreset : settings.darkThemePreset;
  return own !== 'custom' && pairedThemeSquare(dark, own) === other;
}

/**
 * `select_preset`: picking `preset` (a square or `custom`) for one appearance, and the matching square for the other
 * while it still follows: it matched, and its colour was not picked on purpose on the page (`otherPicked`).
 */
export function themeColourPatch(
  settings: ThemeColourSettings,
  dark: boolean,
  preset: DarkThemePreset | LightThemePreset,
  otherPicked: boolean,
): Pick<Partial<ThemeColourSettings>, 'darkThemePreset' | 'lightThemePreset'> {
  const follow = !otherPicked && themeColoursPaired(settings, dark) ? pairedThemeSquare(dark, preset) : null;
  if (dark) {
    return {
      darkThemePreset: preset as DarkThemePreset,
      ...(follow !== null ? { lightThemePreset: follow as LightThemePreset } : {}),
    };
  }
  return {
    lightThemePreset: preset as LightThemePreset,
    ...(follow !== null ? { darkThemePreset: follow as DarkThemePreset } : {}),
  };
}

/** The contrast points Colourfulness position `position` sets (0 Subtle ... 56 Full). */
export function colourfulnessPoints(position: number): number {
  return THEME_CONTRAST_MAX_POINTS - clamp(Math.round(position), 0, COLOURFULNESS_LAST_POSITION) * 0.5;
}

/** `colourfulnessStepForPoints`: the position that sets exactly `points`, if any. */
export function colourfulnessStepForPoints(points: number): number | null {
  const position = (THEME_CONTRAST_MAX_POINTS - points) / 0.5;
  return Number.isInteger(position) && position >= 0 && position <= COLOURFULNESS_LAST_POSITION ? position : null;
}

/** `colourfulnessDisplayStep`: the position nearest to `points`. */
export function colourfulnessDisplayStep(points: number): number {
  if (!Number.isFinite(points)) return colourfulnessDisplayStep(0);
  return clamp(roundAway((THEME_CONTRAST_MAX_POINTS - points) / 0.5), 0, COLOURFULNESS_LAST_POSITION);
}

/** `colourfulnessStepIndex`: the one position both areas share, or null once they are set apart. */
export function colourfulnessStepIndex(settings: ThemeColourSettings): number | null {
  if (settings.themeSidebarContrast !== settings.themeWorkAreaContrast) return null;
  return colourfulnessStepForPoints(settings.themeSidebarContrast);
}

/** The named points (`COLOURFULNESS`). */
const COLOURFULNESS_NAMES: ReadonlyArray<readonly [string, number]> = [
  ['Subtle', 4],
  ['Soft', 0],
  ['Balanced', -4],
  ['Rich', -8],
  ['Vivid', -12],
  ['Full', THEME_CONTRAST_FULL_POINTS],
];

/** `colourfulness_name`: the named point nearest to `points` (the first of two equally near). */
export function colourfulnessName(points: number): string {
  let best = COLOURFULNESS_NAMES[0]!;
  for (const entry of COLOURFULNESS_NAMES) {
    if (Math.abs(entry[1] - points) < Math.abs(best[1] - points)) best = entry;
  }
  return best[0];
}

export type ColourfulnessPatch = {
  themeSidebarContrast?: number;
  themeWorkAreaContrast?: number;
  customSidebarTitlebarBackgroundDarknessPercent?: number;
  customSidebarTitlebarLightBackgroundLightnessPercent?: number;
};

/** `colourfulness_patch`: both contrasts, and both custom depths moved in step from the default 96 (Vivid at most). */
export function colourfulnessPatch(position: number): Required<ColourfulnessPatch> {
  const points = colourfulnessPoints(position);
  const step = depthPoints(points);
  const half = (value: number, min: number): number => clamp(roundAway(value * 2) / 2, min, MAX_THEME_DEPTH);
  return {
    themeSidebarContrast: points,
    themeWorkAreaContrast: points,
    customSidebarTitlebarBackgroundDarknessPercent: half(DEFAULT_THEME_DEPTH + step, MIN_DARK_THEME_DEPTH),
    customSidebarTitlebarLightBackgroundLightnessPercent: half(DEFAULT_THEME_DEPTH + step, MIN_LIGHT_THEME_DEPTH),
  };
}

/**
 * `area_colourfulness_patch`, the two separate sliders: the sidebar's writes its contrast and both custom depths, the
 * work area's only its contrast. Joining them again writes `colourfulnessPatch`.
 */
export function areaColourfulnessPatch(
  key: 'themeSidebarContrast' | 'themeWorkAreaContrast',
  position: number,
): ColourfulnessPatch {
  if (key === 'themeWorkAreaContrast') return { themeWorkAreaContrast: colourfulnessPoints(position) };
  const { themeWorkAreaContrast: _work, ...sidebar } = colourfulnessPatch(position);
  return sidebar;
}

const LIGHT_FOREGROUND = '#D8D8D8';
const DARK_FOREGROUND = '#262626';

export type SidebarAppearance = {
  background: string;
  foreground: string;
  muted: string;
  /** The original muted tone for glyphs; secondary text is contrast-adjusted independently. */
  mutedGlyph: string;
  card: string;
  cardActive: string;
  border: string;
  projectCard: string;
  projectBorder: string;
};

/**
 * Whether `background` takes dark ink: the desktop's split on encoded RGB (`getSidebarTitlebarForegroundForBackground`),
 * which the drawer's text, the preset cards and the terminal palettes' light/dark grouping share.
 */
export function isLightBackground(background: string): boolean {
  const [red, green, blue] = channels(rgbOf(background));
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255 > 0.54;
}

function hexWithAlpha(color: string, alpha: number): string {
  const [red, green, blue] = channels(rgbOf(color));
  return `rgba(${red},${green},${blue},${alpha})`;
}

/** Moves a text ink toward the foreground until every surface reaches 4.5:1, or returns the foreground. */
export function readableSecondaryText(designed: string, foreground: string, surfaces: readonly string[]): string {
  const luminance = (hex: string): number => {
    const { red, green, blue } = parseHex(hex);
    const linear = (channel: number): number => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
  };
  const backgrounds = surfaces.map(luminance);
  const readable = (color: string): boolean => {
    const ink = luminance(color);
    return backgrounds.every(
      (background) => (Math.max(ink, background) + 0.05) / (Math.min(ink, background) + 0.05) >= 4.5,
    );
  };
  if (readable(designed)) return designed;
  for (let toward = 1; toward < 100; toward += 1) {
    const candidate = mixHexColors(foreground, designed, toward);
    if (readable(candidate)) return candidate;
  }
  return foreground;
}

/** The drawer's tokens over a resolved sidebar colour. */
export function sidebarAppearanceFor(background: string): SidebarAppearance {
  const foreground = isLightBackground(background) ? DARK_FOREGROUND : LIGHT_FOREGROUND;
  const mutedGlyph = mixHexColors(foreground, background, 56);
  const card = mixHexColors(foreground, background, 4);
  const cardActive = mixHexColors(foreground, background, 7);
  return {
    background,
    foreground,
    muted: readableSecondaryText(mutedGlyph, foreground, [background, card, cardActive]),
    mutedGlyph,
    card,
    cardActive,
    border: hexWithAlpha(foreground, 0.12),
    projectCard: hexWithAlpha(foreground, 0.045),
    projectBorder: hexWithAlpha(foreground, 0.13),
  };
}
