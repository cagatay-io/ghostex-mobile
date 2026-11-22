/**
 * Appearance settings sync between computers and this phone (`appearance/setting/<key>`, mirroring
 * `packages/gx-core/src/settings_sync/settings_keys.rs`).
 *
 * Only cross-platform theme settings sync here (`windowArt`, `windowArtLight`, `windowArtDim`,
 * `themeRoles`, colours, colourfulness and chat/terminal theme choices). Desktop-only window
 * transparency settings (`windowGlass`, `windowGlassSource`, blur, opacity) and per-computer
 * `windowArtImage` paths are never written by the phone, so picking a theme or artwork on the phone
 * never disturbs a computer's window transparency, and older desktops/servers that do not recognize
 * newer keys ignore them cleanly.
 */

import {
  TERMINAL_BACKGROUND_MODES,
  type GhostexSettings,
  type TerminalBackgroundMode,
} from '../settings/store';
import { sanitizeWindowArt } from '../theme/artworks';
import {
  clampDarkThemeDepth,
  clampLightThemeDepth,
  CONTENT_COLOR_SCHEMES,
  DARK_THEME_PRESETS,
  LIGHT_THEME_PRESETS,
  normalizeHexColor,
  roundThemeContrastPoints,
  SIDEBAR_THEME_OPTIONS,
  type ContentColorScheme,
  type DarkThemePreset,
  type LightThemePreset,
  type SidebarThemeSetting,
} from '../theme/sidebarAppearance';
import { sanitizeThemeRoles } from '../theme/themeRoles';

/** Prefix of an Appearance setting's synced key on gxserver. */
export const APPEARANCE_SYNC_PREFIX = 'appearance/setting/';

/**
 * The Appearance settings shared between computers and the phone.
 * Desktop-only window glass/transparency keys and phone-only keys (`showHeaderArtworkBackdrop`,
 * `windowLiveStyle`) are deliberately excluded.
 */
export const APPEARANCE_SYNC_KEYS = [
  'sidebarTheme',
  'darkThemePreset',
  'lightThemePreset',
  'customSidebarTitlebarBackgroundTintColor',
  'customSidebarTitlebarLightBackgroundTintColor',
  'customSidebarTitlebarBackgroundDarknessPercent',
  'customSidebarTitlebarLightBackgroundLightnessPercent',
  'themeSidebarContrast',
  'themeWorkAreaContrast',
  'themeRoles',
  'windowArt',
  'windowArtLight',
  'windowArtDim',
  'sessionChatTheme',
  'terminalColorScheme',
  'terminalGhosttyTheme',
  'terminalGhosttyLightTheme',
  'terminalBackgroundMode',
  'workspaceBackgroundColor',
] as const;

export type AppearanceSyncKey = (typeof APPEARANCE_SYNC_KEYS)[number];

const APPEARANCE_SYNC_KEY_SET: ReadonlySet<string> = new Set(APPEARANCE_SYNC_KEYS);

export type AppearanceSyncEntryLike = {
  key: string;
  value?: unknown;
  hlc: string;
};

/** Whether at least one paired computer syncs Appearance (or synced appearance entries are already held). */
export function isAppearanceSyncActive(
  categoriesByMachine: Record<string, string[]>,
  values: Record<string, unknown>,
): boolean {
  if (Object.values(categoriesByMachine).some((categories) => categories.includes('appearance'))) {
    return true;
  }
  return Object.keys(values).some((key) => key.startsWith(APPEARANCE_SYNC_PREFIX));
}

function parseFiniteNumber(value: unknown): number | undefined {
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

/** Validates a single synced Appearance value, returning `undefined` when it should be skipped safely. */
export function sanitizeSyncedAppearanceValue<K extends AppearanceSyncKey>(
  key: K,
  raw: unknown,
): GhostexSettings[K] | undefined {
  if (raw === undefined || raw === null) return undefined;
  switch (key) {
    case 'sidebarTheme':
      return oneOf<SidebarThemeSetting>(raw, SIDEBAR_THEME_OPTIONS) as GhostexSettings[K] | undefined;
    case 'darkThemePreset':
      return oneOf<DarkThemePreset>(raw, DARK_THEME_PRESETS) as GhostexSettings[K] | undefined;
    case 'lightThemePreset':
      return oneOf<LightThemePreset>(raw, LIGHT_THEME_PRESETS) as GhostexSettings[K] | undefined;
    case 'customSidebarTitlebarBackgroundTintColor':
    case 'customSidebarTitlebarLightBackgroundTintColor': {
      const normalized = normalizeHexColor(raw, '');
      return (normalized !== '' ? normalized : undefined) as GhostexSettings[K] | undefined;
    }
    case 'customSidebarTitlebarBackgroundDarknessPercent': {
      const n = parseFiniteNumber(raw);
      return (n !== undefined ? clampDarkThemeDepth(n) : undefined) as GhostexSettings[K] | undefined;
    }
    case 'customSidebarTitlebarLightBackgroundLightnessPercent': {
      const n = parseFiniteNumber(raw);
      return (n !== undefined ? clampLightThemeDepth(n) : undefined) as GhostexSettings[K] | undefined;
    }
    case 'themeSidebarContrast':
    case 'themeWorkAreaContrast': {
      const n = parseFiniteNumber(raw);
      return (n !== undefined ? roundThemeContrastPoints(n) : undefined) as GhostexSettings[K] | undefined;
    }
    case 'themeRoles': {
      if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;
      return sanitizeThemeRoles(raw) as GhostexSettings[K];
    }
    case 'windowArt':
    case 'windowArtLight': {
      if (typeof raw !== 'string') return undefined;
      return sanitizeWindowArt(raw, 'none') as GhostexSettings[K];
    }
    case 'windowArtDim': {
      const n = parseFiniteNumber(raw);
      return (n !== undefined ? Math.min(100, Math.max(0, Math.round(n))) : undefined) as
        | GhostexSettings[K]
        | undefined;
    }
    case 'sessionChatTheme':
    case 'terminalColorScheme':
      return oneOf<ContentColorScheme>(raw, CONTENT_COLOR_SCHEMES) as GhostexSettings[K] | undefined;
    case 'terminalGhosttyTheme':
    case 'terminalGhosttyLightTheme': {
      if (typeof raw !== 'string') return undefined;
      const trimmed = raw.trim();
      return (trimmed !== '' ? trimmed : undefined) as GhostexSettings[K] | undefined;
    }
    case 'terminalBackgroundMode':
      return oneOf<TerminalBackgroundMode>(raw, TERMINAL_BACKGROUND_MODES) as GhostexSettings[K] | undefined;
    case 'workspaceBackgroundColor': {
      if (typeof raw !== 'string') return undefined;
      if (raw.trim() === '') return '' as GhostexSettings[K];
      const normalized = normalizeHexColor(raw, '');
      return (normalized !== '' ? normalized : undefined) as GhostexSettings[K] | undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Extracts a local settings patch for any synced Appearance entries whose HLC changed since the
 * phone last applied them. Returns the patch and the updated HLC map.
 */
export function extractSyncedAppearancePatch(
  entries: Record<string, AppearanceSyncEntryLike>,
  appliedHlcs: Record<string, string>,
): { patch: Partial<GhostexSettings>; nextAppliedHlcs: Record<string, string>; changed: boolean } {
  const patch: Partial<Record<AppearanceSyncKey, unknown>> = {};
  const nextAppliedHlcs: Record<string, string> = { ...appliedHlcs };
  let changed = false;

  for (const settingKey of APPEARANCE_SYNC_KEYS) {
    const syncKey = `${APPEARANCE_SYNC_PREFIX}${settingKey}`;
    const entry = entries[syncKey];
    if (entry === undefined) continue;
    if (appliedHlcs[syncKey] === entry.hlc) continue;
    nextAppliedHlcs[syncKey] = entry.hlc;
    changed = true;
    const sanitized = sanitizeSyncedAppearanceValue(settingKey, entry.value);
    if (sanitized !== undefined) {
      patch[settingKey] = sanitized;
    }
  }

  return {
    patch: patch as Partial<GhostexSettings>,
    nextAppliedHlcs,
    changed,
  };
}

/** Filters a local settings patch down to the Appearance keys that belong in Settings Sync. */
export function pickAppearanceSyncUpdates(patch: Partial<GhostexSettings>): Array<[string, unknown]> {
  const updates: Array<[string, unknown]> = [];
  for (const [key, value] of Object.entries(patch)) {
    if (!APPEARANCE_SYNC_KEY_SET.has(key) || value === undefined) continue;
    updates.push([`${APPEARANCE_SYNC_PREFIX}${key}`, value]);
  }
  return updates;
}
