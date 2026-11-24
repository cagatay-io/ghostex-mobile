/**
 * App settings store. Group/row order mirrors the legacy Android Settings page
 * (artifacts/001-mobile-settings-report/report.md): Terminal behavior, Extra
 * keys, Font size, Scrollback, Cursor, Alerts and hardware keys, then the
 * appended SSH connection group. Persisted to AsyncStorage under settings.v1
 * (new fields sanitize to their defaults for existing installs; the colour
 * keys are derived from the earlier tint and contrast, see `themeSettingsFromRecord`).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { logAppEvent } from '../app/appLog';
import { useCrashPromptStore } from '../app/crashReports';
import { keepingCrashReports, setKeepingCrashReports } from '../feedback/crashReports';
import type { AttentionAlertsFor } from '../notifications/attentionAlerts';
import { Platform } from 'react-native';
import { create } from 'zustand';

import type { CursorStyle } from '../../modules/ghostex-native/src/GhostexNative.types';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  sanitizeNotificationSettings,
  type NotificationSettings,
} from '../notifications/settings';
import {
  clampDarkThemeDepth,
  clampLightThemeDepth,
  CONTENT_COLOR_SCHEMES,
  DARK_THEME_PRESETS,
  DEFAULT_THEME_DEPTH,
  DEFAULT_THEME_TINT,
  LIGHT_THEME_PRESETS,
  normalizeHexColor,
  roundThemeContrastPoints,
  SIDEBAR_THEME_OPTIONS,
  type ContentColorScheme,
  type DarkThemePreset,
  type LightThemePreset,
  type SidebarThemeSetting,
  type ThemeColourSettings,
} from '../theme/sidebarAppearance';
import {
  DEFAULT_COMMAND_PAD_KEYS,
  sanitizeCommandPadKeys,
  sanitizeCommandPadPosition,
  type CommandPadPositions,
} from './commandPad';
import { DEFAULT_TERMINAL_PALETTE, LEGACY_DEFAULT_TERMINAL_PALETTE } from '../theme/terminalPalettes';
import { sanitizeImportedTerminalPalettes, type ImportedTerminalPalette } from '../theme/importGhostty';
import { sanitizeWindowArt } from '../theme/artworks';
import { defaultThemeRoles, sanitizeThemeRoles, type ThemeRolesByAppearance } from '../theme/themeRoles';

const SETTINGS_STORAGE_KEY = 'settings.v1';

/** This phone's own Quiet View (gx-chat-core `QuietViewSettings`), set by Settings › Experience's Chat row. */
export type PhoneQuietView = { coordinators: boolean; chats: boolean; expandLast: boolean; calm: boolean };

function sanitizePhoneQuietView(value: unknown): PhoneQuietView | null {
  if (value === null || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const flag = (key: string, fallback: boolean) => (typeof record[key] === 'boolean' ? (record[key] as boolean) : fallback);
  return {
    coordinators: flag('coordinators', true),
    chats: flag('chats', true),
    expandLast: flag('expandLast', true),
    calm: flag('calm', false),
  };
}

export type BellBehavior = 'vibrate' | 'beep' | 'ignore';
/** Terminal background (desktop `terminalBackgroundMode`): pure black/white, the theme's work area, or a custom colour. */
export type TerminalBackgroundMode = 'pure' | 'theme' | 'custom';
export const TERMINAL_BACKGROUND_MODES: readonly TerminalBackgroundMode[] = ['pure', 'theme', 'custom'];
/** The colour choosing Custom terminal background seeds while none is set (desktop `TERMINAL_BACKGROUND_STARTING_COLOR`). */
export const TERMINAL_BACKGROUND_STARTING_COLOR = '#111111';
/**
 * How the chat colours the sections an agent marks: the desktop's `markedHandoversStyle` values, plus
 * `plain` because the phone cannot see whether the computer's Marked handovers is on.
 */
export type MarkedHandoversStyle = 'labels' | 'rule' | 'badge' | 'plain';
/** Same value space as the desktop app's global Default Agent View setting. */
export type PreferredAgentInterface = 'terminal' | 'chat';
/** How the phone draws its sessions list: the desktop's Unified sidebar, or the Project list per computer. */
export type SessionsListLayout = 'unified' | 'project';
/** How the Sessions list draws its sessions where it offers the choice (the unfolded iPhone Duo): rows or tiles. */
export type SessionListView = 'list' | 'tiles';

export type GhostexSettings = ThemeColourSettings & {
  // Terminal behavior (legacy Android row order).
  autoScroll: boolean;
  /** The Befehlspad's toggle in terminals (the key bar's switch before the pad replaced the bar; same meaning). */
  extraKeysToolbarVisible: boolean;
  softKeyboardEnabled: boolean;
  keepScreenOn: boolean;
  refreshButtonVisible: boolean;
  fileUploadButtonVisible: boolean;
  keyboardButtonVisible: boolean;
  doneNotificationSound: boolean;
  /** This phone carries settings sync between the computers it connects to (src/settingsSync/). */
  settingsSyncThroughPhone: boolean;
  /**
   * The automatic Live Activity: off ends a
   * running one and starts no other. iOS only.
   */
  liveActivityEnabled: boolean;
  /**
   * Rows of the Live Activity and of the Home Screen widgets lead with the session's name, as the Sessions list
   * shows it, instead of the agent's name. iOS only.
   *
   * CDXC:Notifications 2026-11-12 DECISION: On by default (it was off since 11.4.0, CDXC:Notifications 2026-11-10, which kept the earlier promise that no session title shows on a locked phone). User: wants session names by default, so the rows of several sessions of one agent in one project can be told apart without a visit to Settings. Settings saved by a build before this one hold `false` for it whether or not the user chose it (the store saves its whole object), so such a `false` reads as the old default and becomes on, once; see `liveActivitySessionNamesDefaultedOn`. A `false` saved by this build or later is the user's own and stays.
   */
  liveActivitySessionNames: boolean;
  /**
   * Marker, always true: only a build that has `liveActivitySessionNames` on by default saves it (the store saves its
   * whole object). A saved `liveActivitySessionNames: false` without it is the old default, not a choice.
   */
  liveActivitySessionNamesDefaultedOn: boolean;
  /**
   * While the phone is locked, one computer keeps the Live Activity current through Ghostex's push relay
   * (`notifications/liveActivityPush.ts`). Off, the Live Activity updates only while the app runs, as before.
   * iOS only.
   *
   * CDXC:Notifications 2026-11-11 DECISION: Off by default. An independent review of the push path before 11.4.0:
   * "do not ship it switched on by default; switched off by default is safe." No iPhone had run the pushes before
   * this release; off, nothing is registered with any computer and the Live Activity behaves as before.
   */
  liveActivityLockedUpdates: boolean;
  hideKeyboardOnStartup: boolean;
  openUrlsOnTap: boolean;
  confirmTabClose: boolean;
  /** Haptic tick on pad and layer key presses + lock-in buzz on held modifiers. */
  keyBarHapticsEnabled: boolean;
  /** The Befehlspad's nine keys, row by row from the top left (`settings/commandPad.ts`). */
  commandPadKeys: string[];
  /** Where the user moved the Befehlspad, per layout (`settings/commandPad.ts`); `{}` = the default position. */
  commandPadPosition: CommandPadPositions;
  /** Terminal font size in pt (iOS) / sp (Android). Range 4-32. */
  fontSize: number;
  /** Scrollback rows for newly created terminal buffers. */
  scrollbackRows: number;
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
  bellBehavior: BellBehavior;
  /**
   * Retained data from the phone's earlier colour model (Background Contrast 85-100, reference 90, and Background
   * Tint). Nothing paints from them any more: when the colour keys below are missing, the store derives them from
   * these once, and the two values stay stored unchanged.
   */
  sidebarBackgroundContrast: number;
  sidebarBackgroundTint: string;
  /** The app's appearance (desktop `sidebarTheme`): `system`, `plain-light` or `dark-2`. The colour keys come from
   * `ThemeColourSettings` (the desktop's names and ranges).
   */
  sidebarTheme: SidebarThemeSetting;
  /** Per-appearance theme colour role overrides (`themeRoles`). */
  themeRoles: ThemeRolesByAppearance;
  /** Dark-mode still artwork id (`polar-night`, `moonwater`, etc.), `'yourImage'`, or `'none'`. */
  windowArt: string;
  /** Light-mode still artwork id (`gm-light`, `latte`, etc.), `'yourImage'`, or `'none'`. */
  windowArtLight: string;
  /** Dimming strength (0 to 100, default 45) for the still artwork backdrop. */
  windowArtDim: number;
  /** Legacy desktop Live shader style name (`ink`, `drift`, `nebula`, etc.) mapped to a static header tint gradient, or `'none'`. */
  windowLiveStyle: string;
  /** Show the still artwork backdrop behind the phone's screens (local phone switch). */
  showHeaderArtworkBackdrop: boolean;
  /**
   * Marker, always true once saved by a build whose default theme is Polar Night / Everforest Light
   * (Ghostex 5ce4a5f7d). Lets an upgrade recognise a saved `settings.v1` where the user never changed
   * any theme setting from the earlier Graphite/System defaults without touching customised themes.
   */
  polarDefaultThemeApplied: boolean;
  /**
   * Marker, true once saved after the 2026-11-24 default theme accent update (`#5581a9` -> `#95d7f6`
   * dark, `#8da101` -> `#0c74a6` light) so existing default-theme phones migrate once without
   * overriding later manual colour picks.
   */
  defaultAccentBlueMigrated: boolean;
  /** The terminal palettes per appearance (desktop `terminalGhosttyTheme` / `terminalGhosttyLightTheme`). */
  terminalGhosttyTheme: string;
  terminalGhosttyLightTheme: string;
  /** Private local imports; absent on phones that have never imported a terminal palette. */
  importedTerminalPalettes?: ImportedTerminalPalette[];
  terminalBackgroundMode: TerminalBackgroundMode;
  /**
   * The Custom terminal background (desktop `workspaceBackgroundColor`): `#rrggbb`, or `''` while none is set. The
   * terminal treats `''` and `#010101` as unset, so Custom without a colour paints as Follow theme.
   */
  workspaceBackgroundColor: string;
  /** The terminal's own appearance override (desktop `terminalColorScheme`). */
  terminalColorScheme: ContentColorScheme;
  /** Opacity percentage for sidebar collection-panel backgrounds and borders. */
  sidebarGroupsOpacityPercent: number;
  /**
   * Bold coordinator title (Settings > Advanced > Sessions list, off by default): a coordinator's title in the
   * Sessions list is drawn bold. Off, coordinators and their threads stand apart by icon, colour and dimmer thread
   * text only (CDXC:Coordinators 2026-11-15, issue #618 Q3275: the user dislikes bold text).
   */
  sessionsBoldCoordinatorTitle: boolean;
  /**
   * Which view chat-capable agent sessions open in when the user has not
   * flipped that session's own toggle yet (desktop-parity Default Agent View).
   */
  preferredAgentInterface: PreferredAgentInterface;
  /** The chat's own appearance (desktop `sessionChatTheme`): Follow app by default, or Light, Dark or System. */
  sessionChatTheme: ContentColorScheme;
  /** Whether the transcript uses a custom width instead of the composer column. */
  sessionChatCustomTranscriptWidthEnabled: boolean;
  /** Width of the message transcript; the prompt composer keeps its full width. */
  sessionChatTranscriptWidthPercent: number;
  /**
   * Default to Detailed view: new chats open Detailed instead of Normal (desktop
   * `sessionChatDetailedView`; each chat's More actions > View picks its own level).
   */
  sessionChatDetailedView: boolean;
  /**
   * The session links sheet's folded groups (`open`, `finished`, `suggested`, `removed`), one
   * choice per group for every session; the desktop's `sessionLinksFoldedGroups`
   * (SessionLinksSheet.tsx).
   */
  sessionLinksFoldedGroups: string[];
  sessionChatFileEditPreviews: boolean;
  /** Grey thinking: the agent's thinking in the muted tone, its replies in the full foreground. */
  sessionChatMutedThinking: boolean;
  /** Tool call lines (experimental): each run of tool calls as one quiet line with its calls as rows under it (desktop `chatToolCallLines`). */
  chatToolCallLines: boolean;
  /**
   * The chat box row switches Settings › Experience sets on this phone (desktop `chatComposerModePicker`,
   * `chatComposerTerminalButton`, `chatComposerContextRing`; gx-chat-core `composer/row.rs`). On by default.
   */
  chatComposerModePicker: boolean;
  chatComposerTerminalButton: boolean;
  chatComposerContextRing: boolean;
  /**
   * This phone's own Quiet View, set by Settings › Experience's Chat row; `null` (the default) draws each chat with
   * its computer's (gx-chat-core `quiet_view.rs`).
   */
  chatQuietView: PhoneQuietView | null;
  /**
   * What the Sessions list's rows show, set by Settings › Experience (desktop Card details: project icons, agent
   * icon, last active time). On by default, today's rows.
   */
  sessionsShowProjectIcons: boolean;
  sessionsShowAgentIcons: boolean;
  sessionsShowLastActive: boolean;
  /**
   * The first-run Experience card was answered or skipped (src/screens/sessions-screen/ExperienceCard.tsx). An install
   * that saved settings before the card existed counts as asked: existing users are not moved (Q3287).
   */
  experienceAsked: boolean;
  markedHandoversStyle: MarkedHandoversStyle;
  /** Show the marker emoji in coloured marked sections (desktop `markedHandoversEmoji`, off by default). */
  markedHandoversEmoji: boolean;
  /**
   * Read aloud's voice on this phone: a voice name of the phone's text-to-speech engine, or `''`
   * for its default. The phone's own, never the computer's `readAloudVoice` (spec 6.4).
   */
  readAloudVoice: string;
  /** Read aloud's speed on this phone, a multiple of the engine's normal rate ({@link READ_ALOUD_RATES}). */
  readAloudRate: number;
  /**
   * What this phone picked for Unified or Project before Sidebar organization sync reached the phone (the old Settings
   * › Sessions list, Q933): kept, with the three switches below, for computers without the sync, where it still
   * decides; a synced value always wins (settingsSync/sidebarOrganization.ts). Nothing sets it any more.
   *
   * CDXC:Sidebar 2026-11-12 DECISION:
   * User: "I want my phone sessions list to be just kind my macbook sessions list exactly pls add all the settings and stuff we need and add sync for this please". Supersedes Q933: the phone follows the synced Sidebar organization of the computers (Settings › Sidebar & Sessions on the phone edits it).
   */
  sessionsListLayout: SessionsListLayout | null;
  /** Settings › Notifications › Alert me for (`attentionAlerts` in src/notifications/attentionAlerts.ts). */
  attentionAlertsFor: AttentionAlertsFor;
  /** Unified only: one group per project, kept from before Sidebar organization sync (see `sessionsListLayout`). */
  sessionsListGroupByProject: boolean;
  /** Unified only: the Moving section, kept from before Sidebar organization sync (see `sessionsListLayout`). */
  sessionsListWorkingSection: boolean;
  /**
   * Project list only: Hide projects without sessions as this phone set it before Sidebar organization sync (see
   * `sessionsListLayout`); `null` when never set here. A synced value always wins.
   *
   * CDXC:Sidebar 2026-11-09 WHY:
   * The contributor (sebastianarena, PR #540) chose this: the phone gets its own Hide projects without sessions switch with the desktop's rule. Since 2026-11-12 the switch is the synced `sidebarHideProjectsWithoutSessions` (CDXC:Sidebar 2026-11-12 above), and this value only stands in for computers without the sync.
   */
  sessionsListHideProjectsWithoutSessions: boolean | null;
  /**
   * Show the "Tailscale isn't connected" notice on Sessions when Tailscale is off on this phone and
   * the computer cannot be reached (Settings > Connection; the notice's close button turns it off).
   */
  tailscaleReminder: boolean;
  /**
   * The project file browser lists hidden files and folders (names starting with a dot): its Files menu's
   * Show Hidden Files, off until switched on.
   */
  showHiddenFiles: boolean;
  /**
   * The Sessions list as rows or as tiles with live thumbnails, chosen with its list/tiles switch on the unfolded
   * iPhone Duo; kept while folded, where the list always shows rows.
   */
  sessionListView: SessionListView;
  /**
   * The short replies the folded triage offers on a waiting session (Settings › Short Replies), in their order on the
   * cards; a tap sends the text to that session. Only non-empty entries are kept.
   */
  shortReplies: string[];
  // SSH connection (appended group).
  autoReconnect: boolean;
  keepAliveEnabled: boolean;
  /** Keep-alive interval in seconds, 10-120 in 10-second steps. */
  keepAliveIntervalSec: number;
  /** Agent notifications: master, finished, waiting, error and when the one-time ask was answered. */
  notifications: NotificationSettings;
  /**
   * Ended sessions the user removed from this phone's attention list, as `machineId\nsessionId`: kept on this phone
   * only, never sent to a computer.
   */
  attentionRemovedSessions: string[];
};

export const TERMINAL_FONT_SIZE_MIN = 4;
export const TERMINAL_FONT_SIZE_MAX = 32;

export const SCROLLBACK_ROWS_MIN = 500;
export const SCROLLBACK_ROWS_MAX = 20_000;
export const SCROLLBACK_ROWS_STEP = 500;
export const CURSOR_STYLE_OPTIONS: CursorStyle[] = ['block', 'underline', 'bar'];
export const BELL_BEHAVIOR_OPTIONS: BellBehavior[] = ['vibrate', 'beep', 'ignore'];

export const KEEP_ALIVE_INTERVAL_MIN_SEC = 10;
export const KEEP_ALIVE_INTERVAL_MAX_SEC = 120;
export const KEEP_ALIVE_INTERVAL_STEP_SEC = 10;

/** The Speed choices, the same as the desktop's `readAloudRate` row. */
export const READ_ALOUD_RATES = [0.75, 1, 1.25, 1.5, 2] as const;

export const SIDEBAR_SURFACE_OPACITY_MIN = 0;
export const SIDEBAR_SURFACE_OPACITY_MAX = 100;

/** The earlier Background Contrast default, kept for the retained `sidebarBackgroundContrast`. */
const LEGACY_DEFAULT_CONTRAST = 90;

export const MIN_SESSION_CHAT_TRANSCRIPT_WIDTH_PERCENT = 50;
export const MAX_SESSION_CHAT_TRANSCRIPT_WIDTH_PERCENT = 100;
export const SESSION_CHAT_TRANSCRIPT_WIDTH_PERCENT_STEP = 5;
export const DEFAULT_SESSION_CHAT_TRANSCRIPT_WIDTH_PERCENT = 100;

export function clampSessionChatTranscriptWidthPercent(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SESSION_CHAT_TRANSCRIPT_WIDTH_PERCENT;
  const clamped = Math.min(
    MAX_SESSION_CHAT_TRANSCRIPT_WIDTH_PERCENT,
    Math.max(MIN_SESSION_CHAT_TRANSCRIPT_WIDTH_PERCENT, value),
  );
  return Math.round(clamped / SESSION_CHAT_TRANSCRIPT_WIDTH_PERCENT_STEP) * SESSION_CHAT_TRANSCRIPT_WIDTH_PERCENT_STEP;
}

export function defaultFontSize(): number {
  return Platform.OS === 'ios' ? 10 : 13;
}

export function defaultSettings(): GhostexSettings {
  return {
    autoScroll: true,
    extraKeysToolbarVisible: true,
    softKeyboardEnabled: true,
    keepScreenOn: false,
    refreshButtonVisible: false,
    fileUploadButtonVisible: true,
    keyboardButtonVisible: false,
    doneNotificationSound: true,
    settingsSyncThroughPhone: true,
    liveActivityEnabled: true,
    liveActivitySessionNames: true,
    liveActivitySessionNamesDefaultedOn: true,
    liveActivityLockedUpdates: false,
    hideKeyboardOnStartup: true,
    openUrlsOnTap: true,
    confirmTabClose: false,
    keyBarHapticsEnabled: true,
    commandPadKeys: [...DEFAULT_COMMAND_PAD_KEYS],
    commandPadPosition: {},
    fontSize: defaultFontSize(),
    scrollbackRows: 2_000,
    cursorStyle: 'bar',
    cursorBlink: true,
    bellBehavior: 'vibrate',
    sidebarBackgroundContrast: LEGACY_DEFAULT_CONTRAST,
    sidebarBackgroundTint: DEFAULT_THEME_TINT,
    // The desktop's built-in default theme (packages/settings-catalog/src/data/defaults.rs at 5ce4a5f7d):
    // Dark mode with Polar Night colours & artwork, Everforest Light colours & Gruvbox Material Light artwork
    // in light mode, Ghostex Nord / Ghostex Everforest Light terminal palettes and Follow theme terminal background.
    sidebarTheme: 'dark-2',
    darkThemePreset: 'custom',
    lightThemePreset: 'custom',
    customSidebarTitlebarBackgroundTintColor: '#404e78',
    customSidebarTitlebarLightBackgroundTintColor: '#fcf3da',
    customSidebarTitlebarBackgroundDarknessPercent: 96,
    customSidebarTitlebarLightBackgroundLightnessPercent: 97,
    themeSidebarContrast: 0,
    themeWorkAreaContrast: 0,
    themeRoles: defaultThemeRoles(),
    windowArt: 'polar-night',
    windowArtLight: 'gm-light',
    windowArtDim: 45,
    windowLiveStyle: 'none',
    showHeaderArtworkBackdrop: true,
    polarDefaultThemeApplied: true,
    defaultAccentBlueMigrated: true,
    terminalGhosttyTheme: DEFAULT_TERMINAL_PALETTE.dark,
    terminalGhosttyLightTheme: DEFAULT_TERMINAL_PALETTE.light,
    terminalBackgroundMode: 'theme',
    workspaceBackgroundColor: '',
    terminalColorScheme: 'app',
    sidebarGroupsOpacityPercent: SIDEBAR_SURFACE_OPACITY_MIN,
    sessionsBoldCoordinatorTitle: false,
    preferredAgentInterface: 'chat',
    sessionChatTheme: 'app',
    sessionChatCustomTranscriptWidthEnabled: false,
    sessionChatTranscriptWidthPercent: DEFAULT_SESSION_CHAT_TRANSCRIPT_WIDTH_PERCENT,
    sessionChatDetailedView: false,
    sessionLinksFoldedGroups: ['finished', 'removed'],
    sessionChatFileEditPreviews: false,
    sessionChatMutedThinking: false,
    chatToolCallLines: false,
    chatComposerModePicker: true,
    chatComposerTerminalButton: true,
    chatComposerContextRing: true,
    chatQuietView: null,
    sessionsShowProjectIcons: true,
    sessionsShowAgentIcons: true,
    sessionsShowLastActive: true,
    experienceAsked: false,
    markedHandoversStyle: 'labels',
    markedHandoversEmoji: false,
    readAloudVoice: '',
    readAloudRate: 1,
    sessionsListLayout: null,
    attentionAlertsFor: 'all',
    sessionsListGroupByProject: false,
    sessionsListWorkingSection: true,
    sessionsListHideProjectsWithoutSessions: null,
    tailscaleReminder: true,
    showHiddenFiles: false,
    sessionListView: 'list',
    shortReplies: [...DEFAULT_SHORT_REPLIES],
    autoReconnect: true,
    keepAliveEnabled: true,
    keepAliveIntervalSec: 30,
    notifications: { ...DEFAULT_NOTIFICATION_SETTINGS },
    attentionRemovedSessions: [],
  };
}

function clampKeepAliveInterval(value: number): number {
  const stepped = Math.round(value / KEEP_ALIVE_INTERVAL_STEP_SEC) * KEEP_ALIVE_INTERVAL_STEP_SEC;
  return Math.min(KEEP_ALIVE_INTERVAL_MAX_SEC, Math.max(KEEP_ALIVE_INTERVAL_MIN_SEC, stepped));
}

function clampSidebarSurfaceOpacity(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(SIDEBAR_SURFACE_OPACITY_MAX, Math.max(SIDEBAR_SURFACE_OPACITY_MIN, Math.round(value)));
}

export function clampScrollbackRows(value: number): number {
  const stepped = Math.round(value / SCROLLBACK_ROWS_STEP) * SCROLLBACK_ROWS_STEP;
  return Math.min(SCROLLBACK_ROWS_MAX, Math.max(SCROLLBACK_ROWS_MIN, stepped));
}

/** The short replies of a fresh install. */
export const DEFAULT_SHORT_REPLIES: readonly string[] = ['continue', 'yes'];

/** The entries as they are kept: text only, trimmed, empty ones dropped. */
export function keptShortReplies(entries: readonly unknown[]): string[] {
  return entries.flatMap((entry) => (typeof entry === 'string' && entry.trim().length > 0 ? [entry.trim()] : []));
}

/** The keys the colour model added to the stored settings; `themeSettingsFromRecord` derives each missing one. */
type ColourModelKey =
  | Exclude<keyof ThemeColourSettings, 'themeRoles'>
  | 'themeRoles'
  | 'windowArt'
  | 'windowArtLight'
  | 'windowArtDim'
  | 'windowLiveStyle'
  | 'showHeaderArtworkBackdrop'
  | 'polarDefaultThemeApplied'
  | 'defaultAccentBlueMigrated'
  | 'sidebarTheme'
  | 'terminalGhosttyTheme'
  | 'terminalGhosttyLightTheme'
  | 'terminalBackgroundMode'
  | 'workspaceBackgroundColor'
  | 'terminalColorScheme';

/**
 * Every key only the colour model stores: its colour keys, and the private palette list. The store saves its whole
 * settings object, so every save since the colour model writes all colour keys; the earlier app stored none of them.
 */
const COLOUR_MODEL_STORED_KEYS = Object.keys({
  sidebarTheme: true,
  darkThemePreset: true,
  lightThemePreset: true,
  customSidebarTitlebarBackgroundTintColor: true,
  customSidebarTitlebarLightBackgroundTintColor: true,
  customSidebarTitlebarBackgroundDarknessPercent: true,
  customSidebarTitlebarLightBackgroundLightnessPercent: true,
  themeSidebarContrast: true,
  themeWorkAreaContrast: true,
  themeRoles: true,
  windowArt: true,
  windowArtLight: true,
  windowArtDim: true,
  windowLiveStyle: true,
  showHeaderArtworkBackdrop: true,
  polarDefaultThemeApplied: true,
  defaultAccentBlueMigrated: true,
  terminalGhosttyTheme: true,
  terminalGhosttyLightTheme: true,
  terminalBackgroundMode: true,
  workspaceBackgroundColor: true,
  terminalColorScheme: true,
  importedTerminalPalettes: true,
} satisfies Record<ColourModelKey | 'importedTerminalPalettes', true>);

/**
 * The colour keys of a stored settings object: each saved valid key as it is, each missing one derived from the
 * retained earlier values, so the derivation runs only until the first save and never over saved keys.
 *
 * CDXC:Theming WHY: An upgraded phone keeps its look and its values (the phone keeps its own values,
 * never the computer's). The earlier tint becomes the custom dark colour. Its contrast (85-100) is the same depth
 * number for every calibrated colour and Black; White and Neutral Gray drew `#0b0b0b` at 90 from a different base,
 * so their depth is `100 - (100 - c) * 11/28` to the half point (90 -> 96).
 * Both areas' Colourfulness is `depth - 96`, where the desktop's Colourfulness slider writes that depth. The
 * phone was dark only, so its appearance stays Dark. A desktop default (Graphite at 96) stays the `gray` square.
 */
/**
 * True when an upgraded `settings.v1` (saved before `polarDefaultThemeApplied` existed) still holds only
 * the earlier untouched theme defaults, meaning the user never changed theme settings on this phone.
 */
function isUntouchedPrePolarTheme(
  record: Record<string, unknown>,
  legacyTint: string,
  legacyContrast: number,
): boolean {
  if (Object.hasOwn(record, 'polarDefaultThemeApplied')) return false;
  const hasAnyColourKey = COLOUR_MODEL_STORED_KEYS.some((key) => Object.hasOwn(record, key));
  if (!hasAnyColourKey) {
    return (legacyTint === '#ffffff' || legacyTint === DEFAULT_THEME_TINT) && legacyContrast === LEGACY_DEFAULT_CONTRAST;
  }
  const roles = sanitizeThemeRoles(record.themeRoles);
  const rolesEmpty =
    Object.keys(roles.dark ?? {}).length === 0 && Object.keys(roles.light ?? {}).length === 0;
  const strOr = (key: string, fallback: string) =>
    typeof record[key] === 'string' && record[key].trim() !== '' ? record[key].trim() : fallback;
  const numOr = (key: string, fallback: number) =>
    typeof record[key] === 'number' && Number.isFinite(record[key]) ? record[key] : fallback;
  const tintMatchesLegacy = (key: string) =>
    !Object.hasOwn(record, key) || normalizeHexColor(record[key], DEFAULT_THEME_TINT) === DEFAULT_THEME_TINT;
  return (
    (!Object.hasOwn(record, 'sidebarTheme') || record.sidebarTheme === 'system') &&
    (!Object.hasOwn(record, 'darkThemePreset') || record.darkThemePreset === 'gray') &&
    (!Object.hasOwn(record, 'lightThemePreset') || record.lightThemePreset === 'gray') &&
    tintMatchesLegacy('customSidebarTitlebarBackgroundTintColor') &&
    tintMatchesLegacy('customSidebarTitlebarLightBackgroundTintColor') &&
    numOr('customSidebarTitlebarBackgroundDarknessPercent', DEFAULT_THEME_DEPTH) === DEFAULT_THEME_DEPTH &&
    numOr('customSidebarTitlebarLightBackgroundLightnessPercent', DEFAULT_THEME_DEPTH) === DEFAULT_THEME_DEPTH &&
    numOr('themeSidebarContrast', 0) === 0 &&
    numOr('themeWorkAreaContrast', 0) === 0 &&
    rolesEmpty &&
    sanitizeWindowArt(record.windowArt, 'none') === 'none' &&
    sanitizeWindowArt(record.windowArtLight, 'none') === 'none' &&
    strOr('windowLiveStyle', 'none').toLowerCase() === 'none' &&
    strOr('terminalGhosttyTheme', LEGACY_DEFAULT_TERMINAL_PALETTE.dark) === LEGACY_DEFAULT_TERMINAL_PALETTE.dark &&
    strOr('terminalGhosttyLightTheme', LEGACY_DEFAULT_TERMINAL_PALETTE.light) === LEGACY_DEFAULT_TERMINAL_PALETTE.light &&
    (!Object.hasOwn(record, 'terminalBackgroundMode') || record.terminalBackgroundMode === 'pure') &&
    (!Object.hasOwn(record, 'workspaceBackgroundColor') ||
      record.workspaceBackgroundColor === '' ||
      record.workspaceBackgroundColor === '#010101') &&
    (!Object.hasOwn(record, 'terminalColorScheme') || record.terminalColorScheme === 'app') &&
    (!Object.hasOwn(record, 'sessionChatTheme') || record.sessionChatTheme === 'app')
  );
}

function themeSettingsFromRecord(
  record: Record<string, unknown>,
  legacyTint: string,
  legacyContrast: number,
  defaults: GhostexSettings,
): Pick<GhostexSettings, ColourModelKey> {
  if (isUntouchedPrePolarTheme(record, legacyTint, legacyContrast)) {
    return {
      sidebarTheme: defaults.sidebarTheme,
      darkThemePreset: defaults.darkThemePreset,
      lightThemePreset: defaults.lightThemePreset,
      customSidebarTitlebarBackgroundTintColor: defaults.customSidebarTitlebarBackgroundTintColor,
      customSidebarTitlebarLightBackgroundTintColor: defaults.customSidebarTitlebarLightBackgroundTintColor,
      customSidebarTitlebarBackgroundDarknessPercent: defaults.customSidebarTitlebarBackgroundDarknessPercent,
      customSidebarTitlebarLightBackgroundLightnessPercent: defaults.customSidebarTitlebarLightBackgroundLightnessPercent,
      themeSidebarContrast: defaults.themeSidebarContrast,
      themeWorkAreaContrast: defaults.themeWorkAreaContrast,
      themeRoles: defaultThemeRoles(),
      windowArt: defaults.windowArt,
      windowArtLight: defaults.windowArtLight,
      windowArtDim: defaults.windowArtDim,
      windowLiveStyle: defaults.windowLiveStyle,
      showHeaderArtworkBackdrop:
        typeof record.showHeaderArtworkBackdrop === 'boolean'
          ? record.showHeaderArtworkBackdrop
          : defaults.showHeaderArtworkBackdrop,
      polarDefaultThemeApplied: true,
      defaultAccentBlueMigrated: true,
      terminalGhosttyTheme: defaults.terminalGhosttyTheme,
      terminalGhosttyLightTheme: defaults.terminalGhosttyLightTheme,
      terminalBackgroundMode: defaults.terminalBackgroundMode,
      workspaceBackgroundColor: defaults.workspaceBackgroundColor,
      terminalColorScheme: defaults.terminalColorScheme,
    };
  }
  const number = (key: string): number | undefined => {
    const value = record[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  };
  const oneOf = <T extends string>(key: string, options: readonly T[]): T | undefined =>
    options.includes(record[key] as T) ? (record[key] as T) : undefined;
  const name = (key: string, fallback: string): string => {
    const value = record[key];
    return typeof value === 'string' && value.trim() !== '' ? value : fallback;
  };
  const neutral = legacyTint === '#ffffff' || legacyTint === DEFAULT_THEME_TINT;
  const legacyDepth = clampDarkThemeDepth(neutral ? 100 - ((100 - legacyContrast) * 11) / 28 : legacyContrast);
  const darkTint = normalizeHexColor(record.customSidebarTitlebarBackgroundTintColor, legacyTint);
  const darkDepth = clampDarkThemeDepth(number('customSidebarTitlebarBackgroundDarknessPercent') ?? legacyDepth);
  const contrast = (key: string): number => {
    const value = number(key);
    return value === undefined ? legacyDepth - DEFAULT_THEME_DEPTH : roundThemeContrastPoints(value);
  };
  // For an existing customised theme saved before newer keys existed, absent keys fall back to neutral
  // values rather than injecting Polar Night art or roles on top of the user's saved theme.
  const darkDefault = darkDepth === DEFAULT_THEME_DEPTH && darkTint === DEFAULT_THEME_TINT;
  const resolvedDarkPreset =
    oneOf<DarkThemePreset>('darkThemePreset', DARK_THEME_PRESETS) ?? (darkDefault ? 'gray' : 'custom');
  const resolvedLightPreset = oneOf<LightThemePreset>('lightThemePreset', LIGHT_THEME_PRESETS) ?? 'gray';
  const resolvedLightTint = normalizeHexColor(
    record.customSidebarTitlebarLightBackgroundTintColor,
    DEFAULT_THEME_TINT,
  );
  let resolvedRoles = sanitizeThemeRoles(record.themeRoles);
  if (record.defaultAccentBlueMigrated !== true) {
    const darkIsDefault =
      resolvedDarkPreset === 'custom' && darkTint.toLowerCase() === '#404e78';
    const lightIsDefault =
      resolvedLightPreset === 'custom' && resolvedLightTint.toLowerCase() === '#fcf3da';
    if (darkIsDefault && resolvedRoles.dark?.accent?.trim().toLowerCase() === '#5581a9') {
      resolvedRoles = {
        ...resolvedRoles,
        dark: { ...resolvedRoles.dark, accent: '#95d7f6' },
      };
    }
    if (lightIsDefault && resolvedRoles.light?.accent?.trim().toLowerCase() === '#8da101') {
      resolvedRoles = {
        ...resolvedRoles,
        light: { ...resolvedRoles.light, accent: '#0c74a6' },
      };
    }
  }
  return {
    sidebarTheme: oneOf('sidebarTheme', SIDEBAR_THEME_OPTIONS) ?? 'dark-2',
    darkThemePreset: resolvedDarkPreset,
    lightThemePreset: resolvedLightPreset,
    customSidebarTitlebarBackgroundTintColor: darkTint,
    customSidebarTitlebarLightBackgroundTintColor: resolvedLightTint,
    customSidebarTitlebarBackgroundDarknessPercent: darkDepth,
    customSidebarTitlebarLightBackgroundLightnessPercent: clampLightThemeDepth(
      number('customSidebarTitlebarLightBackgroundLightnessPercent') ?? DEFAULT_THEME_DEPTH,
    ),
    themeSidebarContrast: contrast('themeSidebarContrast'),
    themeWorkAreaContrast: contrast('themeWorkAreaContrast'),
    themeRoles: resolvedRoles,
    windowArt: sanitizeWindowArt(record.windowArt, 'none'),
    windowArtLight: sanitizeWindowArt(record.windowArtLight, 'none'),
    windowArtDim: Math.min(100, Math.max(0, Math.round(number('windowArtDim') ?? defaults.windowArtDim))),
    windowLiveStyle: name('windowLiveStyle', 'none').trim().toLowerCase(),
    showHeaderArtworkBackdrop:
      typeof record.showHeaderArtworkBackdrop === 'boolean'
        ? record.showHeaderArtworkBackdrop
        : defaults.showHeaderArtworkBackdrop,
    polarDefaultThemeApplied: true,
    defaultAccentBlueMigrated: true,
    terminalGhosttyTheme: name('terminalGhosttyTheme', LEGACY_DEFAULT_TERMINAL_PALETTE.dark),
    terminalGhosttyLightTheme: name('terminalGhosttyLightTheme', LEGACY_DEFAULT_TERMINAL_PALETTE.light),
    terminalBackgroundMode: oneOf('terminalBackgroundMode', TERMINAL_BACKGROUND_MODES) ?? 'pure',
    workspaceBackgroundColor: normalizeHexColor(record.workspaceBackgroundColor, defaults.workspaceBackgroundColor),
    terminalColorScheme: oneOf('terminalColorScheme', CONTENT_COLOR_SCHEMES) ?? defaults.terminalColorScheme,
  };
}

function sanitizeSettings(value: unknown): GhostexSettings {
  const defaults = defaultSettings();
  if (typeof value !== 'object' || value === null) return defaults;
  const record = value as Record<string, unknown>;
  const bool = (key: keyof GhostexSettings, fallback: boolean): boolean =>
    typeof record[key] === 'boolean' ? (record[key] as boolean) : fallback;
  const fontSize =
    typeof record.fontSize === 'number' && Number.isFinite(record.fontSize)
      ? Math.min(TERMINAL_FONT_SIZE_MAX, Math.max(TERMINAL_FONT_SIZE_MIN, Math.round(record.fontSize)))
      : defaults.fontSize;
  const scrollbackRows =
    typeof record.scrollbackRows === 'number' && Number.isFinite(record.scrollbackRows)
      ? clampScrollbackRows(record.scrollbackRows)
      : defaults.scrollbackRows;
  const cursorStyle = CURSOR_STYLE_OPTIONS.includes(record.cursorStyle as CursorStyle)
    ? (record.cursorStyle as CursorStyle)
    : defaults.cursorStyle;
  const bellBehavior = BELL_BEHAVIOR_OPTIONS.includes(record.bellBehavior as BellBehavior)
    ? (record.bellBehavior as BellBehavior)
    : defaults.bellBehavior;
  const keepAliveIntervalSec =
    typeof record.keepAliveIntervalSec === 'number' && Number.isFinite(record.keepAliveIntervalSec)
      ? clampKeepAliveInterval(record.keepAliveIntervalSec)
      : defaults.keepAliveIntervalSec;
  // The earlier contrast and tint keep the earlier normalization: whole numbers 85-100, `#rrggbb`.
  const sidebarBackgroundContrast =
    typeof record.sidebarBackgroundContrast === 'number' && Number.isFinite(record.sidebarBackgroundContrast)
      ? Math.min(100, Math.max(85, Math.round(record.sidebarBackgroundContrast)))
      : defaults.sidebarBackgroundContrast;
  const storedTint =
    typeof record.sidebarBackgroundTint === 'string' ? record.sidebarBackgroundTint.trim().toLowerCase() : '';
  const sidebarBackgroundTint = /^#[0-9a-f]{6}$/u.test(storedTint) ? storedTint : defaults.sidebarBackgroundTint;
  const sidebarGroupsOpacityPercent =
    typeof record.sidebarGroupsOpacityPercent === 'number'
      ? clampSidebarSurfaceOpacity(record.sidebarGroupsOpacityPercent, defaults.sidebarGroupsOpacityPercent)
      : defaults.sidebarGroupsOpacityPercent;
  const preferredAgentInterface =
    record.preferredAgentInterface === 'terminal' || record.preferredAgentInterface === 'chat'
      ? record.preferredAgentInterface
      : defaults.preferredAgentInterface;
  // A saved Dark or Light stays the chat's own appearance; a missing or unknown value follows the app.
  const storedChatTheme = CONTENT_COLOR_SCHEMES.includes(record.sessionChatTheme as ContentColorScheme)
    ? (record.sessionChatTheme as ContentColorScheme)
    : defaults.sessionChatTheme;
  // Except a Dark the earlier app stored, recognisable by none of the keys only the colour model stores: that app
  // was dark only and saved Dark as everyone's default, so it looked as Follow app does now. It follows the app;
  // the next save writes the colour keys, so from then on a Dark is the user's own and stays.
  const sessionChatTheme =
    storedChatTheme === 'dark' && !COLOUR_MODEL_STORED_KEYS.some((key) => Object.hasOwn(record, key))
      ? 'app'
      : storedChatTheme;
  const sessionChatTranscriptWidthPercent =
    typeof record.sessionChatTranscriptWidthPercent === 'number'
      ? clampSessionChatTranscriptWidthPercent(record.sessionChatTranscriptWidthPercent)
      : defaults.sessionChatTranscriptWidthPercent;
  const importedTerminalPalettes = sanitizeImportedTerminalPalettes(record.importedTerminalPalettes);
  return {
    autoScroll: bool('autoScroll', defaults.autoScroll),
    extraKeysToolbarVisible: bool('extraKeysToolbarVisible', defaults.extraKeysToolbarVisible),
    softKeyboardEnabled: bool('softKeyboardEnabled', defaults.softKeyboardEnabled),
    keepScreenOn: bool('keepScreenOn', defaults.keepScreenOn),
    refreshButtonVisible: bool('refreshButtonVisible', defaults.refreshButtonVisible),
    fileUploadButtonVisible: bool('fileUploadButtonVisible', defaults.fileUploadButtonVisible),
    keyboardButtonVisible: bool('keyboardButtonVisible', defaults.keyboardButtonVisible),
    doneNotificationSound: bool('doneNotificationSound', defaults.doneNotificationSound),
    settingsSyncThroughPhone: bool('settingsSyncThroughPhone', defaults.settingsSyncThroughPhone),
    liveActivityEnabled: bool('liveActivityEnabled', defaults.liveActivityEnabled),
    // A `false` saved without the marker is the old default (off), not a choice: it becomes on. The next save writes
    // the marker, so from then on an off is the user's own and stays.
    liveActivitySessionNames: Object.hasOwn(record, 'liveActivitySessionNamesDefaultedOn')
      ? bool('liveActivitySessionNames', defaults.liveActivitySessionNames)
      : true,
    liveActivitySessionNamesDefaultedOn: true,
    liveActivityLockedUpdates: bool('liveActivityLockedUpdates', defaults.liveActivityLockedUpdates),
    hideKeyboardOnStartup: bool('hideKeyboardOnStartup', defaults.hideKeyboardOnStartup),
    openUrlsOnTap: bool('openUrlsOnTap', defaults.openUrlsOnTap),
    confirmTabClose: bool('confirmTabClose', defaults.confirmTabClose),
    keyBarHapticsEnabled: bool('keyBarHapticsEnabled', defaults.keyBarHapticsEnabled),
    commandPadKeys: sanitizeCommandPadKeys(record.commandPadKeys) ?? defaults.commandPadKeys,
    commandPadPosition: sanitizeCommandPadPosition(record.commandPadPosition),
    fontSize,
    scrollbackRows,
    cursorStyle,
    cursorBlink: bool('cursorBlink', defaults.cursorBlink),
    bellBehavior,
    sidebarBackgroundContrast,
    sidebarBackgroundTint,
    ...themeSettingsFromRecord(record, sidebarBackgroundTint, sidebarBackgroundContrast, defaults),
    ...(importedTerminalPalettes === undefined ? {} : { importedTerminalPalettes }),
    sidebarGroupsOpacityPercent,
    sessionsBoldCoordinatorTitle: bool('sessionsBoldCoordinatorTitle', defaults.sessionsBoldCoordinatorTitle),
    preferredAgentInterface,
    sessionChatTheme,
    sessionChatCustomTranscriptWidthEnabled: bool(
      'sessionChatCustomTranscriptWidthEnabled',
      defaults.sessionChatCustomTranscriptWidthEnabled,
    ),
    sessionChatTranscriptWidthPercent,
    sessionChatFileEditPreviews: bool('sessionChatFileEditPreviews', defaults.sessionChatFileEditPreviews),
    sessionChatMutedThinking: bool('sessionChatMutedThinking', defaults.sessionChatMutedThinking),
    chatToolCallLines: bool('chatToolCallLines', defaults.chatToolCallLines),
    chatComposerModePicker: bool('chatComposerModePicker', defaults.chatComposerModePicker),
    chatComposerTerminalButton: bool('chatComposerTerminalButton', defaults.chatComposerTerminalButton),
    chatComposerContextRing: bool('chatComposerContextRing', defaults.chatComposerContextRing),
    chatQuietView: sanitizePhoneQuietView(record.chatQuietView),
    sessionsShowProjectIcons: bool('sessionsShowProjectIcons', defaults.sessionsShowProjectIcons),
    sessionsShowAgentIcons: bool('sessionsShowAgentIcons', defaults.sessionsShowAgentIcons),
    sessionsShowLastActive: bool('sessionsShowLastActive', defaults.sessionsShowLastActive),
    experienceAsked: Object.hasOwn(record, 'experienceAsked')
      ? bool('experienceAsked', defaults.experienceAsked)
      : Object.keys(record).length > 0,
    // The retired Simple mode off or Verbose Mode on opened chats in more detail, which is Detailed
    // now (desktop settings catalog `migrate_chat_view_default`).
    sessionChatDetailedView: bool(
      'sessionChatDetailedView',
      record.sessionChatVerboseMode === true || record.sessionChatSimpleMode === false,
    ),
    sessionLinksFoldedGroups: Array.isArray(record.sessionLinksFoldedGroups)
      ? record.sessionLinksFoldedGroups.filter((group): group is string => typeof group === 'string')
      : defaults.sessionLinksFoldedGroups,
    markedHandoversStyle:
      record.markedHandoversStyle === 'labels' ||
      record.markedHandoversStyle === 'rule' ||
      record.markedHandoversStyle === 'badge' ||
      record.markedHandoversStyle === 'plain'
        ? record.markedHandoversStyle
        : defaults.markedHandoversStyle,
    markedHandoversEmoji: bool('markedHandoversEmoji', defaults.markedHandoversEmoji),
    readAloudVoice: typeof record.readAloudVoice === 'string' ? record.readAloudVoice : defaults.readAloudVoice,
    readAloudRate: (READ_ALOUD_RATES as readonly number[]).includes(record.readAloudRate as number)
      ? (record.readAloudRate as number)
      : defaults.readAloudRate,
    sessionsListLayout:
      record.sessionsListLayout === 'unified' || record.sessionsListLayout === 'project'
        ? record.sessionsListLayout
        : defaults.sessionsListLayout,
    attentionAlertsFor: record.attentionAlertsFor === 'needsYou' ? 'needsYou' : defaults.attentionAlertsFor,
    sessionsListGroupByProject: bool('sessionsListGroupByProject', defaults.sessionsListGroupByProject),
    sessionsListWorkingSection: bool('sessionsListWorkingSection', defaults.sessionsListWorkingSection),
    sessionsListHideProjectsWithoutSessions:
      typeof record.sessionsListHideProjectsWithoutSessions === 'boolean'
        ? record.sessionsListHideProjectsWithoutSessions
        : defaults.sessionsListHideProjectsWithoutSessions,
    tailscaleReminder: bool('tailscaleReminder', defaults.tailscaleReminder),
    showHiddenFiles: bool('showHiddenFiles', defaults.showHiddenFiles),
    sessionListView: record.sessionListView === 'tiles' ? 'tiles' : defaults.sessionListView,
    shortReplies: Array.isArray(record.shortReplies) ? keptShortReplies(record.shortReplies) : defaults.shortReplies,
    autoReconnect: bool('autoReconnect', defaults.autoReconnect),
    keepAliveEnabled: bool('keepAliveEnabled', defaults.keepAliveEnabled),
    keepAliveIntervalSec,
    notifications: sanitizeNotificationSettings(record.notifications),
    attentionRemovedSessions: Array.isArray(record.attentionRemovedSessions)
      ? record.attentionRemovedSessions.filter((key): key is string => typeof key === 'string' && key.includes('\n'))
      : defaults.attentionRemovedSessions,
  };
}

type SettingsState = {
  hydrated: boolean;
  settings: GhostexSettings;
  /**
   * Keeping crash reports on the phone. Not part of `settings` (settings.v1): the phone's native crash reporter holds it,
   * since it writes before JavaScript runs. `null` where the installed app cannot turn it off (see `keepingCrashReports`).
   */
  crashReportsKept: boolean | null;
  hydrate: () => Promise<void>;
  setSetting: <K extends keyof GhostexSettings>(key: K, value: GhostexSettings[K]) => void;
  /** Several settings in one change: one publish and one save (a theme preset, a Colourfulness position). */
  patchSettings: (patch: Partial<GhostexSettings>) => void;
  /** Turns keeping crash reports on or off; off deletes the stored reports. Throws when that did not fully happen. */
  setCrashReportsKept: (keep: boolean) => Promise<void>;
};

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  hydrated: false,
  settings: defaultSettings(),
  crashReportsKept: null,

  hydrate: async () => {
    if (get().hydrated) return;
    let settings = defaultSettings();
    try {
      const raw = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw !== null) settings = sanitizeSettings(JSON.parse(raw));
    } catch {
      // Corrupt persisted settings fall back to defaults.
    }
    set({ hydrated: true, settings, crashReportsKept: keepingCrashReports() });
  },

  setSetting: (key, value) => {
    get().patchSettings({ [key]: value });
  },

  patchSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    void (async () => {
      try {
        await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
      } catch {
        // The change holds for this run only; the log says so instead of losing it silently.
        logAppEvent('Settings: a change was not saved; it holds until Ghostex closes');
      }
    })();
  },

  setCrashReportsKept: async (keep) => {
    try {
      await setKeepingCrashReports(keep);
    } finally {
      // What the phone holds now, also after a failure halfway; and no prompt for a report turning it off deleted.
      // Only a build with the switch (iOS) can be off; elsewhere nothing changes.
      const kept = keepingCrashReports();
      set({ crashReportsKept: kept });
      if (kept === false) useCrashPromptStore.setState({ pending: null });
    }
  },
}));
