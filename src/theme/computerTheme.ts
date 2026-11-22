/**
 * Reads a connected computer's theme settings for one-time copy to the phone (Q4466).
 *
 * Primary transport: `POST /api/readSharedSettings` over the computer's existing `chatMachineLink`.
 * Backwards-compatible fallback for older computers: SSH CLI (`ghostex settings list --json`, and
 * only if `list` itself is unsupported by an older CLI, per-key `ghostex settings get <key> --json`).
 *
 * Local phone tweaks stay independent and this module never writes anything to the computer.
 */

import { chatMachineLink } from '../chat/rust/machine-link';
import { settingsGetCommand, settingsListCommand } from '../commands/ghostexCli';
import { GhostexCliFailure, runGhostexCli } from '../components/sessions/cli';
import type { MachineConnectionTarget } from '../machines/credentials';
import { machineNameById } from '../machines/store';
import {
  defaultSettings,
  TERMINAL_BACKGROUND_MODES,
  type GhostexSettings,
  type TerminalBackgroundMode,
} from '../settings/store';
import { THEME_PRESETS } from './presets';
import {
  clampDarkThemeDepth,
  clampLightThemeDepth,
  CONTENT_COLOR_SCHEMES,
  DARK_THEME_PRESETS,
  DEFAULT_THEME_DEPTH,
  DEFAULT_THEME_TINT,
  LIGHT_THEME_PRESETS,
  normalizeHexColor,
  resolveThemeAreas,
  roundThemeContrastPoints,
  SIDEBAR_THEME_OPTIONS,
  themeSquares,
  type ContentColorScheme,
  type DarkThemePreset,
  type LightThemePreset,
  type SidebarThemeSetting,
  type ThemeColourSettings,
} from './sidebarAppearance';
import { artworkById, isKnownArtworkId, sanitizeWindowArt } from './artworks';
import { ALL_THEME_LOOKS, liveGradientForStyle, themeLookMatches } from './themeLooks';
import {
  resolveRoleOverBase,
  rolesForAppearance,
  sanitizeThemeRoles,
  STAGE1_PRESET_TINTS,
  type ThemeRoleMap,
} from './themeRoles';

const READ_TIMEOUT_MS = 10_000;
const SSH_LIST_TIMEOUT_MS = 14_000;
const SSH_GET_TIMEOUT_MS = 6_000;

/** Desktop built-in default dark `themeRoles` (`defaults.rs` at 5ce4a5f7d / 67eb86437: Polar Night). */
const DESKTOP_DEFAULT_DARK_ROLES: ThemeRoleMap = {
  accent: '#5581a9',
  focusRing: '#5581a9',
  border: '8%',
  divider: '6%',
  text: '#e6e4de',
  mutedText: '#8c95a3',
  userMessage: 'base+12%',
  chatBox: 'base+6%/80%',
  surface: 'base+8%/80%',
  control: 'base+10%/80%',
  menu: 'base+6%/95%',
  selection: '9%',
  hover: '5%',
  success: '#a3c48e',
  warning: '#dcbd7a',
  danger: '#d9827c',
};

const DESKTOP_DEFAULT_LIGHT_ROLES: ThemeRoleMap = {
  text: '#5c6a72',
  mutedText: '#939f91',
  accent: '#8da101',
  focusRing: '#8da101',
  link: '#3a94c5',
  success: '#8da101',
  warning: '#dfa000',
  danger: '#f85552',
  userMessage: '#efebd4',
  codeBlock: '#f4f0d9',
  selection: '#eaedc8',
};

const DESKTOP_DEFAULT_DARK_TINT = '#404e78';
const DESKTOP_DEFAULT_LIGHT_TINT = '#fcf3da';

/** Core theme keys queried one-by-one only if `ghostex settings list --json` is unsupported on an older CLI. */
const FALLBACK_THEME_KEYS: readonly string[] = [
  'sidebarTheme',
  'darkThemePreset',
  'lightThemePreset',
  'customSidebarTitlebarBackgroundTintColor',
  'customSidebarTitlebarLightBackgroundTintColor',
  'customSidebarTitlebarBackgroundDarknessPercent',
  'customSidebarTitlebarLightBackgroundLightnessPercent',
  'themeSidebarContrast',
  'themeWorkAreaContrast',
  'themeContrast',
  'themeRoles',
  'windowArt',
  'windowArtLight',
  'windowArtDim',
  'windowGlass',
  'windowGlassSource',
  'windowGlassLiveStyleDark',
  'sessionChatTheme',
  'terminalColorScheme',
  'terminalGhosttyTheme',
  'terminalGhosttyLightTheme',
  'terminalBackgroundMode',
  'workspaceBackgroundColor',
];

export type ComputerThemePreview = {
  /** Friendly detected name (e.g. "Moonwater", "Inkstone", "Catppuccin Mocha", "Slate", "Custom", "Default"). */
  readonly themeName: string;
  /** "System", "Dark", or "Light". */
  readonly modeLabel: string;
  /** Preview mode used to draw the computer's swatch. */
  readonly previewLight: boolean;
  readonly sidebar: string;
  readonly workArea: string;
  readonly accent: string;
  /** Short summary chips for the preview panel (e.g. ["Dark", "Tint #151b22", "Accent #b9d6e7"]). */
  readonly chips: readonly string[];
  /** One-time settings patch to apply locally on the phone. */
  readonly patch: Partial<GhostexSettings>;
  /** How the settings were fetched. */
  readonly source: 'rpc' | 'ssh';
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function oneOf<T extends string>(value: unknown, options: readonly T[]): T | undefined {
  return typeof value === 'string' && options.includes(value as T) ? (value as T) : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function extractSettingsMap(payload: unknown): Record<string, unknown> | null {
  if (!isRecord(payload)) return null;
  if (isRecord(payload.settings)) return payload.settings;
  // `ghostex settings list --json` returns `{ ok: true, settings: [{ key, current }, ...] }`.
  if (Array.isArray(payload.settings)) {
    const out: Record<string, unknown> = {};
    for (const entry of payload.settings) {
      if (!isRecord(entry) || typeof entry.key !== 'string') continue;
      if ('current' in entry) out[entry.key] = entry.current;
      else if ('value' in entry) out[entry.key] = entry.value;
    }
    return out;
  }
  if (
    'sidebarTheme' in payload ||
    'darkThemePreset' in payload ||
    'lightThemePreset' in payload ||
    'customSidebarTitlebarBackgroundTintColor' in payload ||
    'themeRoles' in payload
  ) {
    return payload;
  }
  return null;
}

/**
 * Safely parses raw desktop settings from `/api/readSharedSettings` (sparse overrides) or SSH CLI
 * (`ghostex settings list --json`, effective values) into a sanitized phone settings patch and live
 * swatch preview. Backfills desktop Stage 1 defaults (`defaults.rs` at `d5ac33b34`) whenever keys
 * are omitted in a sparse `/api/readSharedSettings` payload so both paths agree identically.
 */
export function parseComputerThemeSettings(
  raw: Record<string, unknown>,
  source: 'rpc' | 'ssh',
): ComputerThemePreview {
  const defaults = defaultSettings();

  const sidebarTheme: SidebarThemeSetting =
    oneOf(raw.sidebarTheme, SIDEBAR_THEME_OPTIONS) ?? defaults.sidebarTheme;

  // Desktop defaults (5ce4a5f7d / 67eb86437): darkThemePreset = "custom" (#404e78, depth 96),
  // lightThemePreset = "custom" (#fcf3da, depth 97), windowArt = "polar-night", windowArtLight = "gm-light".
  const rawDarkPreset = oneOf<DarkThemePreset>(raw.darkThemePreset, DARK_THEME_PRESETS);
  const rawLightPreset = oneOf<LightThemePreset>(raw.lightThemePreset, LIGHT_THEME_PRESETS);
  const darkThemePreset: DarkThemePreset = rawDarkPreset ?? 'custom';
  const lightThemePreset: LightThemePreset = rawLightPreset ?? 'custom';

  const darkTint = normalizeHexColor(
    raw.customSidebarTitlebarBackgroundTintColor,
    darkThemePreset === 'custom' ? DESKTOP_DEFAULT_DARK_TINT : DEFAULT_THEME_TINT,
  );
  const lightTint = normalizeHexColor(
    raw.customSidebarTitlebarLightBackgroundTintColor,
    lightThemePreset === 'custom' ? DESKTOP_DEFAULT_LIGHT_TINT : DEFAULT_THEME_TINT,
  );
  const darkDepth = clampDarkThemeDepth(
    parseNumber(raw.customSidebarTitlebarBackgroundDarknessPercent) ?? DEFAULT_THEME_DEPTH,
  );
  const lightDepth = clampLightThemeDepth(
    parseNumber(raw.customSidebarTitlebarLightBackgroundLightnessPercent) ??
      (lightThemePreset === 'custom' ? 97 : DEFAULT_THEME_DEPTH),
  );

  // Respect legacy `themeContrast` (-2..2) when `themeSidebarContrast` / `themeWorkAreaContrast` are absent.
  const legacyContrastStep = parseNumber(raw.themeContrast);
  const legacyContrastPoints =
    legacyContrastStep === undefined
      ? 0
      : ({ '-2': -8, '-1': -4, '0': 0, '1': 2, '2': 4 } as Record<string, number>)[
          String(Math.max(-2, Math.min(2, Math.round(legacyContrastStep))))
        ] ?? 0;

  const themeSidebarContrast = roundThemeContrastPoints(parseNumber(raw.themeSidebarContrast) ?? legacyContrastPoints);
  const themeWorkAreaContrast = roundThemeContrastPoints(
    parseNumber(raw.themeWorkAreaContrast) ?? legacyContrastPoints,
  );

  // Desktop `theme_roles.rs` falls back to catalog default `themeRoles` when `themeRoles` is absent.
  const themeRoles = Object.prototype.hasOwnProperty.call(raw, 'themeRoles')
    ? sanitizeThemeRoles(raw.themeRoles)
    : { dark: { ...DESKTOP_DEFAULT_DARK_ROLES }, light: { ...DESKTOP_DEFAULT_LIGHT_ROLES } };

  const windowArt = Object.prototype.hasOwnProperty.call(raw, 'windowArt')
    ? sanitizeWindowArt(raw.windowArt, 'none')
    : 'polar-night';
  const windowArtLight = Object.prototype.hasOwnProperty.call(raw, 'windowArtLight')
    ? sanitizeWindowArt(raw.windowArtLight, 'none')
    : 'gm-light';
  const windowArtDim = Math.max(0, Math.min(100, Math.round(parseNumber(raw.windowArtDim) ?? 45)));

  // Desktop Live fallback only when no still artwork is active.
  const rawWindowGlass = nonEmptyString(raw.windowGlass)?.toLowerCase();
  const glassOpaque = rawWindowGlass === 'opaque';
  const rawGlassSource = nonEmptyString(raw.windowGlassSource)?.toLowerCase() ?? (glassOpaque ? 'none' : 'live');
  const rawLiveStyle = nonEmptyString(raw.windowGlassLiveStyleDark)?.toLowerCase() ?? 'aurora';
  const windowLiveStyle =
    windowArt === 'none' && !glassOpaque && rawGlassSource === 'live' && rawLiveStyle !== 'none'
      ? rawLiveStyle
      : 'none';

  const sessionChatTheme: ContentColorScheme =
    oneOf(raw.sessionChatTheme, CONTENT_COLOR_SCHEMES) ?? defaults.sessionChatTheme;
  const terminalColorScheme: ContentColorScheme =
    oneOf(raw.terminalColorScheme, CONTENT_COLOR_SCHEMES) ?? defaults.terminalColorScheme;
  const terminalBackgroundMode: TerminalBackgroundMode =
    oneOf(raw.terminalBackgroundMode, TERMINAL_BACKGROUND_MODES) ?? defaults.terminalBackgroundMode;
  const workspaceBackgroundColor = normalizeHexColor(raw.workspaceBackgroundColor, '');
  const terminalGhosttyTheme = nonEmptyString(raw.terminalGhosttyTheme);
  const terminalGhosttyLightTheme = nonEmptyString(raw.terminalGhosttyLightTheme);

  const patch: Partial<GhostexSettings> = {
    sidebarTheme,
    darkThemePreset,
    lightThemePreset,
    customSidebarTitlebarBackgroundTintColor: darkTint,
    customSidebarTitlebarLightBackgroundTintColor: lightTint,
    customSidebarTitlebarBackgroundDarknessPercent: darkDepth,
    customSidebarTitlebarLightBackgroundLightnessPercent: lightDepth,
    themeSidebarContrast,
    themeWorkAreaContrast,
    themeRoles,
    windowArt,
    windowArtLight,
    windowArtDim,
    windowLiveStyle,
    sessionChatTheme,
    terminalColorScheme,
    terminalBackgroundMode,
    ...(workspaceBackgroundColor !== '' ? { workspaceBackgroundColor } : {}),
    ...(terminalGhosttyTheme !== undefined ? { terminalGhosttyTheme } : {}),
    ...(terminalGhosttyLightTheme !== undefined ? { terminalGhosttyLightTheme } : {}),
  };

  const previewLight = sidebarTheme === 'plain-light';
  const colourInput: ThemeColourSettings = {
    darkThemePreset,
    lightThemePreset,
    customSidebarTitlebarBackgroundTintColor: darkTint,
    customSidebarTitlebarLightBackgroundTintColor: lightTint,
    customSidebarTitlebarBackgroundDarknessPercent: darkDepth,
    customSidebarTitlebarLightBackgroundLightnessPercent: lightDepth,
    themeSidebarContrast,
    themeWorkAreaContrast,
    themeRoles,
  };
  const areas = resolveThemeAreas(colourInput, previewLight);
  const activeRoles = rolesForAppearance(themeRoles, previewLight);
  const accent =
    resolveRoleOverBase(activeRoles.accent, previewLight, areas.workArea) ??
    (previewLight ? '#1d4f73' : '#7dd3fc');

  // Detect a friendly theme name from built-in looks, named presets, or squares.
  const lookProbe = {
    darkThemePreset,
    lightThemePreset,
    customSidebarTitlebarBackgroundTintColor: darkTint,
    themeSidebarContrast,
    themeWorkAreaContrast,
    windowArt,
    windowArtLight,
    windowLiveStyle,
    themeRoles,
  };
  const matchedLook = ALL_THEME_LOOKS.find((look) => look.kind !== 'default' && themeLookMatches(lookProbe, look));
  let themeName = matchedLook?.name;

  if (themeName === undefined) {
    const activeTint = (previewLight ? lightTint : darkTint).toLowerCase();
    const matchedPreset = THEME_PRESETS.find((preset) => {
      if ((preset.mode === 'light') !== previewLight) return false;
      const stage1Tint = STAGE1_PRESET_TINTS[preset.id]?.tintColor.toLowerCase();
      return activeTint === preset.tintColor.toLowerCase() || (stage1Tint !== undefined && activeTint === stage1Tint);
    });
    if (matchedPreset !== undefined && (previewLight ? lightThemePreset : darkThemePreset) === 'custom') {
      themeName = matchedPreset.name;
    }
  }

  if (themeName === undefined) {
    const activeSquareId = previewLight ? lightThemePreset : darkThemePreset;
    if (activeSquareId === 'custom') {
      themeName = darkTint.toLowerCase() === DESKTOP_DEFAULT_DARK_TINT && !previewLight ? 'Polar Night' : 'Custom';
    } else if (activeSquareId === 'gray' && themeSidebarContrast === 0 && themeWorkAreaContrast === 0) {
      themeName = 'Default';
    } else {
      const sq = themeSquares(previewLight).find((item) => item.id === activeSquareId);
      themeName = sq?.label ?? 'Custom';
    }
  }

  const modeLabel = sidebarTheme === 'plain-light' ? 'Light' : sidebarTheme === 'dark-2' ? 'Dark' : 'System';
  const chips: string[] = [modeLabel, `Tint ${areas.sidebar}`, `Accent ${accent}`];
  const previewArtId = previewLight ? windowArtLight : windowArt;
  if (isKnownArtworkId(previewArtId)) {
    const art = artworkById(previewArtId);
    chips.push(`Art: ${art?.name ?? previewArtId}`);
  } else if (!previewLight) {
    const live = liveGradientForStyle(windowLiveStyle, areas.sidebar, accent);
    if (live !== null) chips.push(`Live: ${live.label}`);
  }

  return {
    themeName,
    modeLabel,
    previewLight,
    sidebar: areas.sidebar,
    workArea: areas.workArea,
    accent,
    chips,
    patch,
    source,
  };
}

/** Whether a CLI failure indicates an older CLI without `settings list` rather than a dead/unreachable SSH link. */
function isUnsupportedListCommandError(error: unknown): boolean {
  const raw = error instanceof GhostexCliFailure ? error.raw : error instanceof Error ? error.message : String(error);
  return /unknown settings command|unknown command|unrecognized subcommand|invalid subcommand|usage:/iu.test(raw);
}

/** Fallback for older computers without `POST /api/readSharedSettings`. */
async function readSettingsViaSshFallback(
  machine: MachineConnectionTarget,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  if (signal?.aborted) throw new Error('Cancelled');

  // 1. Single-shot `ghostex settings list --json` returns every key and its effective value.
  try {
    const listed = await runGhostexCli(machine, settingsListCommand(), {
      timeoutMs: SSH_LIST_TIMEOUT_MS,
    });
    const parsed = extractSettingsMap(listed.json);
    if (parsed !== null) return parsed;
  } catch (error) {
    if (signal?.aborted || !isUnsupportedListCommandError(error)) {
      throw error;
    }
  }

  // 2. Older CLI without `settings list`: fetch core theme keys via `ghostex settings get <key> --json`,
  // bailing early on abort or transport failure.
  const collected: Record<string, unknown> = {};
  let succeeded = 0;
  let consecutiveFailures = 0;
  for (const key of FALLBACK_THEME_KEYS) {
    if (signal?.aborted) throw new Error('Cancelled');
    try {
      const res = await runGhostexCli(machine, settingsGetCommand(key), {
        timeoutMs: SSH_GET_TIMEOUT_MS,
      });
      consecutiveFailures = 0;
      if (res.json !== null && 'current' in res.json) {
        collected[key] = res.json.current;
        succeeded += 1;
      }
    } catch (error) {
      consecutiveFailures += 1;
      const raw = error instanceof GhostexCliFailure ? error.raw : error instanceof Error ? error.message : '';
      const unknownKey = /unknown setting|not found|unknown key/iu.test(raw);
      if (!unknownKey && consecutiveFailures >= 2) {
        throw error;
      }
    }
  }
  if (succeeded === 0) {
    throw new Error(`Could not read theme settings from ${machineNameById(machine.id)}.`);
  }
  return collected;
}

/**
 * Fetches one computer's theme settings via `POST /api/readSharedSettings` over `chatMachineLink`,
 * falling back cleanly to SSH `ghostex settings list --json` / `get <key> --json` on older computers.
 */
export async function fetchComputerTheme(
  machine: MachineConnectionTarget,
  signal?: AbortSignal,
): Promise<ComputerThemePreview> {
  if (signal?.aborted) throw new Error('Cancelled');
  const link = chatMachineLink(machine);
  const route = await link.route();
  if (signal?.aborted) throw new Error('Cancelled');
  if (route === 'socket') {
    const answer = await link.rpc('readSharedSettings', {}, READ_TIMEOUT_MS);
    if (signal?.aborted) throw new Error('Cancelled');
    if (answer.error === null) {
      const parsed = extractSettingsMap(answer.result);
      if (parsed !== null) {
        return parseComputerThemeSettings(parsed, 'rpc');
      }
    }
  }

  const raw = await readSettingsViaSshFallback(machine, signal);
  return parseComputerThemeSettings(raw, 'ssh');
}
