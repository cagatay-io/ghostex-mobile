import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { useSettingsStore, type GhostexSettings } from '../settings/store';
import { GhostexPalette, mixHexColors, neutralButtonFills } from './palette';
import {
  appearanceIsLight,
  resolveThemeAreas,
  sidebarAppearanceFor,
  type SidebarAppearance,
  type ThemeColourSettings,
} from './sidebarAppearance';

/**
 * The sessions drawer's colors plus the few control tokens a form screen needs.
 * Every drawer token comes from `sidebarAppearanceFor` over the resolved sidebar colour.
 */
export type Appearance = SidebarAppearance & {
  /** The work area colour of the same appearance (chat, a theme-coloured terminal). */
  workArea: string;
  /** Text fields: one step above the page so the field edge reads. */
  input: string;
  /** Off-state switch tracks, radio rings and slider tracks. */
  control: string;
  /** Off-state switch thumb. */
  controlThumb: string;
  /** A light page (dark ink), for fills that flip with the theme such as `destructiveButtonFills`. */
  light: boolean;
  /** Secondary text buttons: the neutral fill at rest and pressed (`neutralButtonFills`, no border). */
  neutralFill: string;
  neutralFillPressed: string;
  /** Selected radios, switches and slider fills, and accent text: the sky accent, a deep blue-grey on a light page. */
  accent: string;
};

/** The desktop's light Settings accent (`settings_accent`: #262626 mixed half with #174564). */
const LIGHT_ACCENT = mixHexColors('#262626', '#174564', 50);

let lastResolved: { key: string; appearance: Appearance } | null = null;

/**
 * Resolves the colour settings for one appearance into page colors.
 * Equal inputs return the same object so per-appearance style caches stay warm.
 */
export function resolveAppearance(settings: ThemeColourSettings, light: boolean): Appearance {
  const key = JSON.stringify([
    light,
    settings.darkThemePreset,
    settings.lightThemePreset,
    settings.customSidebarTitlebarBackgroundTintColor,
    settings.customSidebarTitlebarLightBackgroundTintColor,
    settings.customSidebarTitlebarBackgroundDarknessPercent,
    settings.customSidebarTitlebarLightBackgroundLightnessPercent,
    settings.themeSidebarContrast,
    settings.themeWorkAreaContrast,
  ]);
  if (lastResolved !== null && lastResolved.key === key) return lastResolved.appearance;
  const areas = resolveThemeAreas(settings, light);
  const sidebar = sidebarAppearanceFor(areas.sidebar);
  const fills = neutralButtonFills(light);
  const appearance: Appearance = {
    ...sidebar,
    workArea: areas.workArea,
    input: mixHexColors(sidebar.foreground, sidebar.background, 3),
    control: mixHexColors(sidebar.foreground, sidebar.background, 22),
    controlThumb: mixHexColors(sidebar.foreground, sidebar.background, 75),
    light,
    neutralFill: fills.rest,
    neutralFillPressed: fills.pressed,
    accent: light ? LIGHT_ACCENT : GhostexPalette.ACCENT,
  };
  lastResolved = { key, appearance };
  return appearance;
}

/** The colour keys of the settings, for a shallow store selector (the drawer, Settings and the chat read the same). */
export function themeColourSettings(settings: GhostexSettings): ThemeColourSettings {
  return {
    darkThemePreset: settings.darkThemePreset,
    lightThemePreset: settings.lightThemePreset,
    customSidebarTitlebarBackgroundTintColor: settings.customSidebarTitlebarBackgroundTintColor,
    customSidebarTitlebarLightBackgroundTintColor: settings.customSidebarTitlebarLightBackgroundTintColor,
    customSidebarTitlebarBackgroundDarknessPercent: settings.customSidebarTitlebarBackgroundDarknessPercent,
    customSidebarTitlebarLightBackgroundLightnessPercent: settings.customSidebarTitlebarLightBackgroundLightnessPercent,
    themeSidebarContrast: settings.themeSidebarContrast,
    themeWorkAreaContrast: settings.themeWorkAreaContrast,
  };
}

/**
 * CDXC:Theming DECISION: the selected colours reach the settings screens. The theme colours paint every Settings page, the Extra Keys and Agent Hotkeys editors, their navigation headers and the sessions drawer with the same colors, and a change repaints the open page at once.
 *
 * CDXC:Theming WHY: The colours come from the desktop's model (the phone copies the Mac app's theme functions): the saved appearance (System follows the device) picks the dark or light colour settings, and the drawer reads this same hook instead of a second resolver.
 */
export function useAppearance(): Appearance {
  const theme = useSettingsStore(useShallow(({ settings }) => themeColourSettings(settings)));
  const light = useAppearanceIsLight();
  return useMemo(() => resolveAppearance(theme, light), [theme, light]);
}

/**
 * Whether the saved appearance is light (System follows the device): `useAppearance().light` without resolving the
 * colours, for the many Sessions list rows that only pick their ink by it (rows.tsx `useSidebarInk`).
 */
export function useAppearanceIsLight(): boolean {
  const sidebarTheme = useSettingsStore((state) => state.settings.sidebarTheme);
  return appearanceIsLight(sidebarTheme, useColorScheme() === 'light');
}
