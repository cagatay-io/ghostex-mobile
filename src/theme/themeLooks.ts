/**
 * Built-in Theme looks for Settings > Themes, in exact desktop order (`packages/settings-catalog/src/data/theme_gallery.rs`
 * at 67eb86437):
 *   Default, Moonwater, Polar, Glasshouse, Red Earth, Deep Current, Night Garden, Nocturne Canyon,
 *   Firefly Forest, Ember Forge, Synthwave '84, Inkstone, Orchid Dusk.
 *
 * Every built-in look after Default defaults to its still artwork (`windowArt`, downloaded on demand from
 * `ghostex-components` via `artworks.ts` so the OTA stays small). Polar sits third with crisp ice-blue
 * accents (`#7cb8f7` and `#7cb8f724` selection).
 */

import type { GhostexSettings } from '../settings/store';
import { THEME_CONTRAST_FULL_POINTS } from './sidebarAppearance';
import { DEFAULT_TERMINAL_PALETTE } from './terminalPalettes';
import { defaultThemeRoles, type ThemeRoleMap, type ThemeRolesByAppearance } from './themeRoles';

/** Static 3-stop gradient palette representing a legacy desktop Live shader style cleanly with zero GPU drain. */
export type LiveGradientSpec = {
  readonly id: string;
  readonly label: string;
  readonly stops: readonly [string, string, string];
  readonly accent: string;
};

export const LIVE_STYLE_GRADIENTS: Readonly<Record<string, LiveGradientSpec>> = {
  ink: { id: 'ink', label: 'Ink', stops: ['#14161c', '#1c202a', '#13151a'], accent: '#d8664f' },
  drift: { id: 'drift', label: 'Drift', stops: ['#161f19', '#1d2920', '#151b17'], accent: '#a9c46c' },
  nebula: { id: 'nebula', label: 'Nebula', stops: ['#1e1815', '#29201b', '#1a1513'], accent: '#d9824a' },
  mesh: { id: 'mesh', label: 'Mesh', stops: ['#1a1623', '#241e31', '#17141f'], accent: '#d77cc8' },
  aurora: { id: 'aurora', label: 'Aurora', stops: ['#131924', '#1a2333', '#121720'], accent: '#7cb8f7' },
  silk: { id: 'silk', label: 'Silk', stops: ['#1f171c', '#2a2027', '#1a1418'], accent: '#d69bb5' },
};

export function liveGradientForStyle(style: string | undefined, baseHex: string, accentHex: string): LiveGradientSpec | null {
  if (typeof style !== 'string') return null;
  const trimmed = style.trim().toLowerCase();
  if (trimmed === '' || trimmed === 'none') return null;
  const known = LIVE_STYLE_GRADIENTS[trimmed];
  if (known !== undefined) return known;
  return {
    id: trimmed,
    label: `${trimmed[0]!.toUpperCase()}${trimmed.slice(1)}`,
    stops: [baseHex, baseHex, baseHex],
    accent: accentHex,
  };
}

export type ThemeLookKind = 'default' | 'art' | 'look';

export type ThemeLook = {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly kind: ThemeLookKind;
  readonly badge: string;
  /** Default still artwork id (`windowArt`) for this theme, or null for Default. */
  readonly artId: string | null;
  /** Preview swatch colours for the gallery tile and live badge. */
  readonly preview: {
    readonly sidebar: string;
    readonly work: string;
    readonly accent: string;
    readonly gradient?: readonly [string, string, string];
  };
  /** Settings patch applied when tapping this look. */
  readonly patch: Partial<GhostexSettings>;
  /** Exact dark tint and accent for matching whether this look is active. */
  readonly matchTint: string | null;
  readonly matchAccent: string | null;
};

const ART_SHARED_ROLES: ThemeRoleMap = {
  border: '8%',
  divider: '6%',
  userMessage: 'base+7%',
  chatBox: 'base+3%/80%',
  surface: 'base+4%/80%',
  control: 'base+6%/80%',
  menu: 'base+4%/95%',
  selection: '9%',
  hover: '5%',
  success: '#9cbf8c',
  warning: '#d9b46a',
  danger: '#e06c75',
};

const STILL_ART_LOOK_SHARED_ROLES: ThemeRoleMap = {
  border: '8%',
  divider: '6%',
  userMessage: 'base+12%',
  chatBox: 'base+6%/80%',
  surface: 'base+8%/80%',
  control: 'base+10%/80%',
  menu: 'base+6%/95%',
  selection: '9%',
  hover: '5%',
};

function artLook(config: {
  id: string;
  name: string;
  label: string;
  tint: string;
  work: string;
  accent: string;
  text: string;
  mutedText: string;
  terminalPalette: string;
}): ThemeLook {
  const darkRoles: ThemeRoleMap = {
    ...ART_SHARED_ROLES,
    accent: config.accent,
    focusRing: config.accent,
    text: config.text,
    mutedText: config.mutedText,
  };
  return {
    id: config.id,
    name: config.name,
    label: config.label,
    kind: 'art',
    badge: `${config.name} · Art`,
    artId: config.id,
    preview: {
      sidebar: config.tint,
      work: config.work,
      accent: config.accent,
    },
    matchTint: config.tint,
    matchAccent: config.accent,
    patch: {
      sidebarTheme: 'dark-2',
      darkThemePreset: 'custom',
      customSidebarTitlebarBackgroundTintColor: config.tint,
      customSidebarTitlebarBackgroundDarknessPercent: 85,
      themeSidebarContrast: THEME_CONTRAST_FULL_POINTS,
      themeWorkAreaContrast: THEME_CONTRAST_FULL_POINTS,
      terminalGhosttyTheme: config.terminalPalette,
      terminalBackgroundMode: 'theme',
      windowArt: config.id,
      windowArtDim: 45,
      windowLiveStyle: 'none',
      themeRoles: { dark: darkRoles },
    },
  };
}

/**
 * Polar Night and the five classic agent-made looks, updated in desktop commit 67eb86437 to default
 * to their own still artwork (`windowArt: config.id`, `windowArtDim: 45`).
 */
function stillArtLook(config: {
  id: string;
  name: string;
  label: string;
  kind: 'art' | 'look';
  tint: string;
  darkness: number;
  gradient: readonly [string, string, string];
  accent: string;
  focusRing?: string;
  selection?: string;
  text: string;
  mutedText: string;
  success: string;
  warning: string;
  danger: string;
  terminalPalette: string;
}): ThemeLook {
  const darkRoles: ThemeRoleMap = {
    ...STILL_ART_LOOK_SHARED_ROLES,
    accent: config.accent,
    focusRing: config.focusRing ?? config.accent,
    ...(config.selection !== undefined ? { selection: config.selection } : {}),
    text: config.text,
    mutedText: config.mutedText,
    success: config.success,
    warning: config.warning,
    danger: config.danger,
  };
  return {
    id: config.id,
    name: config.name,
    label: config.label,
    kind: config.kind,
    badge: `${config.name} · Art`,
    artId: config.id,
    preview: {
      sidebar: config.gradient[0],
      work: config.gradient[1],
      accent: config.accent,
      gradient: config.gradient,
    },
    matchTint: config.tint,
    matchAccent: config.accent,
    patch: {
      sidebarTheme: 'dark-2',
      darkThemePreset: 'custom',
      customSidebarTitlebarBackgroundTintColor: config.tint,
      customSidebarTitlebarBackgroundDarknessPercent: config.darkness,
      themeSidebarContrast: 0,
      themeWorkAreaContrast: 0,
      terminalGhosttyTheme: config.terminalPalette,
      terminalBackgroundMode: 'theme',
      windowArt: config.id,
      windowArtDim: 45,
      windowLiveStyle: 'none',
      themeRoles: { dark: darkRoles },
    },
  };
}

export const DEFAULT_THEME_LOOK: ThemeLook = {
  id: 'default',
  name: 'Default',
  label: 'Default',
  kind: 'default',
  badge: 'Default · Polar',
  artId: 'polar-night',
  preview: {
    sidebar: '#141c2e',
    work: '#1a2335',
    accent: '#5581a9',
    gradient: ['#141c2e', '#1f2d47', '#101624'],
  },
  matchTint: '#404e78',
  matchAccent: '#5581a9',
  patch: {
    sidebarTheme: 'dark-2',
    darkThemePreset: 'custom',
    lightThemePreset: 'custom',
    customSidebarTitlebarBackgroundTintColor: '#404e78',
    customSidebarTitlebarLightBackgroundTintColor: '#fcf3da',
    customSidebarTitlebarBackgroundDarknessPercent: 96,
    customSidebarTitlebarLightBackgroundLightnessPercent: 97,
    themeSidebarContrast: 0,
    themeWorkAreaContrast: 0,
    terminalGhosttyTheme: DEFAULT_TERMINAL_PALETTE.dark,
    terminalGhosttyLightTheme: DEFAULT_TERMINAL_PALETTE.light,
    terminalBackgroundMode: 'theme',
    workspaceBackgroundColor: '',
    sessionChatTheme: 'app',
    terminalColorScheme: 'app',
    windowArt: 'polar-night',
    windowArtLight: 'gm-light',
    windowArtDim: 45,
    windowLiveStyle: 'none',
    themeRoles: defaultThemeRoles(),
  },
};

/**
 * Primary Art themes in desktop order (`theme_gallery.rs` at 67eb86437):
 * Moonwater, Polar (with crisp ice-blue accents), Glasshouse, Red Earth, Deep Current, Night Garden, Nocturne Canyon.
 */
export const ART_THEME_LOOKS: readonly ThemeLook[] = [
  artLook({
    id: 'moonwater',
    name: 'Moonwater',
    label: 'Moonwater',
    tint: '#151b22',
    work: '#181f27',
    accent: '#b9d6e7',
    text: '#e5eaf0',
    mutedText: '#a0adbd',
    terminalPalette: 'Ghostex Nord',
  }),
  stillArtLook({
    id: 'polar-night',
    name: 'Polar Night',
    label: 'Polar',
    kind: 'art',
    tint: '#404e78',
    darkness: 96,
    gradient: ['#141c2e', '#1f2d47', '#101624'],
    accent: '#7cb8f7',
    focusRing: '#7cb8f7',
    selection: '#7cb8f724',
    text: '#e6e4de',
    mutedText: '#8c95a3',
    success: '#a3c48e',
    warning: '#dcbd7a',
    danger: '#d9827c',
    terminalPalette: 'Ghostex Nord',
  }),
  artLook({
    id: 'glasshouse',
    name: 'Glasshouse',
    label: 'Glasshouse',
    tint: '#141d18',
    work: '#17211b',
    accent: '#b3c98c',
    text: '#e9ebdb',
    mutedText: '#a4b0a0',
    terminalPalette: 'Ghostex Everforest Dark',
  }),
  artLook({
    id: 'red-earth',
    name: 'Red Earth',
    label: 'Earth',
    tint: '#21171b',
    work: '#251a1f',
    accent: '#e2a68d',
    text: '#f0e4da',
    mutedText: '#b4a19b',
    terminalPalette: 'Ghostex Gruvbox Material Dark',
  }),
  artLook({
    id: 'deep-current',
    name: 'Deep Current',
    label: 'Current',
    tint: '#111d1f',
    work: '#142124',
    accent: '#7ecdc5',
    text: '#e0ecea',
    mutedText: '#95adaa',
    terminalPalette: 'Ghostex Kanagawa Wave',
  }),
  artLook({
    id: 'night-garden',
    name: 'Night Garden',
    label: 'Garden',
    tint: '#1e1820',
    work: '#221b24',
    accent: '#d8a8ce',
    text: '#eee4ec',
    mutedText: '#b2a2b1',
    terminalPalette: 'Rose Pine',
  }),
  artLook({
    id: 'nocturne-canyon',
    name: 'Nocturne Canyon',
    label: 'Canyon',
    tint: '#201913',
    work: '#241c16',
    accent: '#ddb985',
    text: '#f0e7d9',
    mutedText: '#b5a898',
    terminalPalette: 'Ghostex Gruvbox Material Dark',
  }),
];

/** Desktop `theme_gallery.rs` (67eb86437) remaining looks, each defaulting to its still artwork. */
export const AGENT_THEME_LOOKS: readonly ThemeLook[] = [
  stillArtLook({
    id: 'firefly-forest',
    name: 'Firefly Forest',
    label: 'Firefly',
    kind: 'look',
    tint: '#4a5f4f',
    darkness: 96,
    gradient: ['#161f19', '#1d2920', '#151b17'],
    accent: '#a9c46c',
    text: '#e8e6d6',
    mutedText: '#979c8b',
    success: '#9cc48c',
    warning: '#d9b46a',
    danger: '#e06c75',
    terminalPalette: 'Ghostex Everforest Dark',
  }),
  stillArtLook({
    id: 'ember-forge',
    name: 'Ember Forge',
    label: 'Ember',
    kind: 'look',
    tint: '#5e4a40',
    darkness: 96,
    gradient: ['#1e1815', '#29201b', '#1a1513'],
    accent: '#d9824a',
    text: '#efe3d4',
    mutedText: '#a3958a',
    success: '#a8bf7c',
    warning: '#ddb36a',
    danger: '#e06c6c',
    terminalPalette: 'Ghostex Gruvbox Material Dark',
  }),
  stillArtLook({
    id: 'synthwave-84',
    name: "Synthwave '84",
    label: 'Synthwave',
    kind: 'look',
    tint: '#4f4468',
    darkness: 97,
    gradient: ['#1a1623', '#241e31', '#17141f'],
    accent: '#d77cc8',
    focusRing: '#6fc6c4',
    text: '#ece4ea',
    mutedText: '#a094a6',
    success: '#8fcfae',
    warning: '#e0c47a',
    danger: '#e6707a',
    terminalPalette: 'Ghostex Dracula',
  }),
  stillArtLook({
    id: 'inkstone',
    name: 'Inkstone',
    label: 'Inkstone',
    kind: 'look',
    tint: '#46506a',
    darkness: 96,
    gradient: ['#14161c', '#1c202a', '#13151a'],
    accent: '#d8664f',
    text: '#ece4d6',
    mutedText: '#9b968d',
    success: '#9cbf8c',
    warning: '#d9b46a',
    danger: '#e06c75',
    terminalPalette: 'Ghostex Kanagawa Dragon',
  }),
  stillArtLook({
    id: 'orchid-dusk',
    name: 'Orchid Dusk',
    label: 'Orchid',
    kind: 'look',
    tint: '#725868',
    darkness: 96,
    gradient: ['#1f171c', '#2a2027', '#1a1418'],
    accent: '#d69bb5',
    text: '#ece4df',
    mutedText: '#9e939c',
    success: '#9cc49a',
    warning: '#e0bd84',
    danger: '#e2727a',
    terminalPalette: 'Rose Pine',
  }),
];

/** Every built-in look in desktop gallery order: Default, Moonwater, Polar, the remaining Art themes and looks. */
export const ALL_THEME_LOOKS: readonly ThemeLook[] = [
  DEFAULT_THEME_LOOK,
  ...ART_THEME_LOOKS,
  ...AGENT_THEME_LOOKS,
];

export function themeLookById(id: string): ThemeLook | undefined {
  return ALL_THEME_LOOKS.find((look) => look.id === id);
}

/** Whether `settings` currently matches a built-in ThemeLook (even if the user switched artwork afterwards). */
export function themeLookMatches(
  settings: Pick<
    GhostexSettings,
    | 'darkThemePreset'
    | 'lightThemePreset'
    | 'customSidebarTitlebarBackgroundTintColor'
    | 'themeSidebarContrast'
    | 'themeWorkAreaContrast'
    | 'windowArt'
    | 'windowArtLight'
    | 'windowLiveStyle'
    | 'themeRoles'
  >,
  look: ThemeLook,
): boolean {
  if (look.kind === 'default') {
    const accent = settings.themeRoles?.dark?.accent?.trim().toLowerCase();
    return (
      settings.darkThemePreset === 'custom' &&
      settings.customSidebarTitlebarBackgroundTintColor.trim().toLowerCase() === '#404e78' &&
      settings.themeSidebarContrast === 0 &&
      settings.themeWorkAreaContrast === 0 &&
      accent === '#5581a9'
    );
  }
  const tintMatches =
    settings.darkThemePreset === 'custom' &&
    settings.customSidebarTitlebarBackgroundTintColor.trim().toLowerCase() === look.matchTint;
  if (!tintMatches) return false;
  const accent = settings.themeRoles?.dark?.accent?.trim().toLowerCase();
  if (look.id === 'polar-night') {
    return accent === look.matchAccent;
  }
  return accent === look.matchAccent || settings.windowArt === look.artId;
}

/** Builds a clean patch that applies `look` while preserving any light-mode role overrides. */
export function themeLookPatch(look: ThemeLook, currentRoles: ThemeRolesByAppearance): Partial<GhostexSettings> {
  if (look.kind === 'default') {
    return { ...look.patch, themeRoles: defaultThemeRoles() };
  }
  const nextRoles: ThemeRolesByAppearance = {
    ...(currentRoles.light !== undefined && Object.keys(currentRoles.light).length > 0
      ? { light: { ...currentRoles.light } }
      : {}),
    ...(look.patch.themeRoles?.dark !== undefined ? { dark: { ...look.patch.themeRoles.dark } } : {}),
  };
  return {
    ...look.patch,
    themeRoles: nextRoles,
  };
}

/** Resets every theme-related phone setting back to Ghostex's built-in default without touching SSH/connection/chat behaviour. */
export function resetThemeToDefaultPatch(): Partial<GhostexSettings> {
  return {
    ...DEFAULT_THEME_LOOK.patch,
    themeRoles: defaultThemeRoles(),
    showHeaderArtworkBackdrop: true,
  };
}

/** Quick-pick accent dots shown in the Fine-tune section (matching desktop muted accents + Polar ice blue). */
export const QUICK_ACCENT_SWATCHES: ReadonlyArray<{ readonly label: string; readonly hex: string }> = [
  { label: 'Polar', hex: '#7cb8f7' },
  { label: 'Sky', hex: '#7dd3fc' },
  { label: 'Moon', hex: '#b9d6e7' },
  { label: 'Sage', hex: '#b3c98c' },
  { label: 'Clay', hex: '#e2a68d' },
  { label: 'Cinnabar', hex: '#d8664f' },
  { label: 'Teal', hex: '#7ecdc5' },
  { label: 'Plum', hex: '#d8a8ce' },
  { label: 'Sand', hex: '#ddb985' },
];
