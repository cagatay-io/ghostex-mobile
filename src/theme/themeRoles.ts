/**
 * Theme roles: named colours of the app's look (borders, dividers, text, accent, relative surface fills)
 * matching desktop Stage 1 (`packages/settings-catalog/src/theme_roles.rs` and `preset_roles.rs`).
 *
 * Values accept:
 * - ink opacity: `"8%"` (white in dark mode, black in light mode)
 * - explicit hex colour: `"#7dd3fc"`, `"#abc"`, or `"#7dd3fc80"` (with alpha)
 * - relative step off the appearance's work area base colour: `"base+7%"`, `"base-15%"`, `"base+4%/80%"`
 */

import { mixHexColors } from './palette';

export type ThemeRoleId =
  | 'border'
  | 'divider'
  | 'text'
  | 'mutedText'
  | 'accent'
  | 'link'
  | 'surface'
  | 'control'
  | 'menu'
  | 'selection'
  | 'hover'
  | 'focusRing'
  | 'userMessage'
  | 'chatBox'
  | 'codeBlock'
  | 'success'
  | 'warning'
  | 'danger';

export type ThemeRoleMap = Partial<Record<ThemeRoleId, string>>;

export type ThemeRolesByAppearance = {
  dark?: ThemeRoleMap;
  light?: ThemeRoleMap;
};

export type ThemeRoleDefinition = {
  readonly id: ThemeRoleId;
  readonly title: string;
  readonly about: string;
};

export const THEME_ROLES: readonly ThemeRoleDefinition[] = [
  { id: 'border', title: 'Borders', about: 'Outlines of cards, boxes, inputs, the chat box and your messages.' },
  { id: 'divider', title: 'Dividers', about: 'Lines between areas: under the header, between sections and rows.' },
  { id: 'text', title: 'Text', about: 'Main text: messages, titles and session names.' },
  { id: 'mutedText', title: 'Grey text', about: 'Secondary text: times, hints, labels and descriptions.' },
  { id: 'accent', title: 'Accent', about: 'Links, switches and sliders that are on, and other theme marks.' },
  { id: 'link', title: 'Links', about: 'Links in chat. Empty follows Accent, or Ghostex blue when unset.' },
  { id: 'surface', title: 'Cards', about: 'The fill of cards and panels.' },
  { id: 'control', title: 'Controls', about: 'The fill of inputs, buttons and other controls.' },
  { id: 'menu', title: 'Menus', about: 'The fill of menus and popovers.' },
  { id: 'selection', title: 'Selected row', about: 'The fill of the selected session or list row.' },
  { id: 'hover', title: 'Hover', about: 'The fill of a pressed or highlighted row.' },
  { id: 'focusRing', title: 'Focus ring', about: 'The ring around the input you are typing in.' },
  { id: 'userMessage', title: 'Your messages', about: 'The fill of your messages in chat.' },
  { id: 'chatBox', title: 'Chat box', about: 'The fill of the box you type in.' },
  { id: 'codeBlock', title: 'Code blocks', about: 'The fill behind code blocks in chat. Empty keeps Controls.' },
  { id: 'success', title: 'Success', about: 'Finished and passing marks, such as a tool check.' },
  { id: 'warning', title: 'Warning', about: 'Warnings and working indicators.' },
  { id: 'danger', title: 'Danger', about: 'Errors, and buttons that remove or delete.' },
];

const THEME_ROLE_ID_SET: ReadonlySet<string> = new Set(THEME_ROLES.map((role) => role.id));

export function isThemeRoleId(value: string): value is ThemeRoleId {
  return THEME_ROLE_ID_SET.has(value);
}

export type RoleValue =
  | { readonly kind: 'ink'; readonly alpha: number }
  | { readonly kind: 'colour'; readonly rgb: readonly [number, number, number]; readonly alpha: number }
  | { readonly kind: 'base'; readonly step: number; readonly alpha: number };

function parsePercent(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed.endsWith('%')) return null;
  const num = Number(trimmed.slice(0, -1).trim());
  if (!Number.isFinite(num) || num < 0 || num > 100) return null;
  return num / 100;
}

function parseBaseValue(text: string): RoleValue | null {
  const rest = text.slice(4).trim();
  const slashIndex = rest.indexOf('/');
  const stepPart = slashIndex >= 0 ? rest.slice(0, slashIndex).trim() : rest;
  const alphaPart = slashIndex >= 0 ? rest.slice(slashIndex + 1).trim() : null;
  let step = 0;
  if (stepPart.length > 0) {
    if (stepPart.startsWith('+')) {
      const parsed = parsePercent(stepPart.slice(1));
      if (parsed === null) return null;
      step = parsed;
    } else if (stepPart.startsWith('-')) {
      const parsed = parsePercent(stepPart.slice(1));
      if (parsed === null) return null;
      step = -parsed;
    } else {
      return null;
    }
  }
  let alpha = 1;
  if (alphaPart !== null) {
    const parsedAlpha = parsePercent(alphaPart);
    if (parsedAlpha === null) return null;
    alpha = parsedAlpha;
  }
  return { kind: 'base', step, alpha };
}

/** Parses `"8%"`, `"base+7%"`, `"base-15%"`, `"base+4%/80%"`, `"#rgb"`, `"#rrggbb"` or `"#rrggbbaa"`. */
export function parseRoleValue(raw: string): RoleValue | null {
  const text = raw.trim();
  if (text.length === 0) return null;
  if (text.length >= 4 && text.slice(0, 4).toLowerCase() === 'base') {
    return parseBaseValue(text);
  }
  if (text.endsWith('%')) {
    const alpha = parsePercent(text);
    return alpha === null ? null : { kind: 'ink', alpha };
  }
  if (!text.startsWith('#')) return null;
  const digits = text.slice(1);
  let expanded: string;
  if (digits.length === 3 && /^[0-9a-f]{3}$/iu.test(digits)) {
    expanded = `${digits[0]}${digits[0]}${digits[1]}${digits[1]}${digits[2]}${digits[2]}`;
  } else if ((digits.length === 6 || digits.length === 8) && /^[0-9a-f]+$/iu.test(digits)) {
    expanded = digits;
  } else {
    return null;
  }
  const r = Number.parseInt(expanded.slice(0, 2), 16);
  const g = Number.parseInt(expanded.slice(2, 4), 16);
  const b = Number.parseInt(expanded.slice(4, 6), 16);
  const alpha = expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1;
  return { kind: 'colour', rgb: [r, g, b], alpha };
}

function formatPercent(fraction: number): string {
  const percent = Math.round(fraction * 1000) / 10;
  return Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(1)}%`;
}

function hexByte(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, '0');
}

export function formatRoleValue(value: RoleValue): string {
  if (value.kind === 'ink') return formatPercent(value.alpha);
  if (value.kind === 'colour') {
    const [r, g, b] = value.rgb;
    if (value.alpha >= 1) return `#${hexByte(r)}${hexByte(g)}${hexByte(b)}`;
    return `#${hexByte(r)}${hexByte(g)}${hexByte(b)}${hexByte(value.alpha * 255)}`;
  }
  const sign = value.step < 0 ? '-' : '+';
  const magnitude = formatPercent(Math.abs(value.step));
  if (value.alpha >= 1) return `base${sign}${magnitude}`;
  return `base${sign}${magnitude}/${formatPercent(value.alpha)}`;
}

function parseHexRgb(hex: string): [number, number, number] {
  const clean = hex.trim().replace(/^#/u, '');
  if (!/^[0-9a-f]{6}$/iu.test(clean)) return [13, 13, 13];
  const parsed = Number.parseInt(clean, 16);
  return [(parsed >> 16) & 0xff, (parsed >> 8) & 0xff, parsed & 0xff];
}

export function resolveRoleRgba(
  value: RoleValue,
  light: boolean,
  baseHex: string,
): { r: number; g: number; b: number; alpha: number } {
  if (value.kind === 'ink') {
    const ink = light ? 0 : 255;
    return { r: ink, g: ink, b: ink, alpha: Math.max(0, Math.min(1, value.alpha)) };
  }
  if (value.kind === 'colour') {
    return {
      r: value.rgb[0],
      g: value.rgb[1],
      b: value.rgb[2],
      alpha: Math.max(0, Math.min(1, value.alpha)),
    };
  }
  const [br, bg, bb] = parseHexRgb(baseHex);
  const target = value.step >= 0 ? (light ? 0 : 255) : light ? 255 : 0;
  const amount = Math.max(0, Math.min(1, Math.abs(value.step)));
  return {
    r: Math.round(br + (target - br) * amount),
    g: Math.round(bg + (target - bg) * amount),
    b: Math.round(bb + (target - bb) * amount),
    alpha: Math.max(0, Math.min(1, value.alpha)),
  };
}

/** Resolves a role string into `#rrggbb` (when opaque) or `rgba(r,g,b,a)`. */
export function resolveRoleCss(raw: string | undefined, light: boolean, baseHex: string): string | null {
  if (typeof raw !== 'string') return null;
  const parsed = parseRoleValue(raw);
  if (parsed === null) return null;
  const { r, g, b, alpha } = resolveRoleRgba(parsed, light, baseHex);
  if (alpha >= 0.999) return `#${hexByte(r)}${hexByte(g)}${hexByte(b)}`;
  return `rgba(${r},${g},${b},${Number(alpha.toFixed(3))})`;
}

/** Resolves a role string and composites any alpha over `baseHex`, returning an opaque `#rrggbb`. */
export function resolveRoleOverBase(raw: string | undefined, light: boolean, baseHex: string): string | null {
  if (typeof raw !== 'string') return null;
  const parsed = parseRoleValue(raw);
  if (parsed === null) return null;
  const { r, g, b, alpha } = resolveRoleRgba(parsed, light, baseHex);
  const solid = `#${hexByte(r)}${hexByte(g)}${hexByte(b)}`;
  if (alpha >= 0.999) return solid;
  return mixHexColors(solid, baseHex, Math.round(alpha * 100));
}

/** Sanitizes a `themeRoles` object from storage or a remote computer, keeping only valid role entries. */
export function sanitizeThemeRoles(value: unknown): ThemeRolesByAppearance {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const result: ThemeRolesByAppearance = {};
  for (const mode of ['dark', 'light'] as const) {
    const rawMap = record[mode];
    if (rawMap === null || typeof rawMap !== 'object' || Array.isArray(rawMap)) continue;
    const clean: ThemeRoleMap = {};
    let count = 0;
    for (const [key, entry] of Object.entries(rawMap as Record<string, unknown>)) {
      if (!isThemeRoleId(key) || typeof entry !== 'string') continue;
      const trimmed = entry.trim();
      if (trimmed.toLowerCase() === 'default' || trimmed.length === 0) continue;
      if (parseRoleValue(trimmed) !== null) {
        clean[key] = trimmed;
        count += 1;
      }
    }
    if (count > 0) result[mode] = clean;
  }
  return result;
}

export function rolesForAppearance(roles: ThemeRolesByAppearance | undefined, light: boolean): ThemeRoleMap {
  if (roles === undefined) return {};
  return (light ? roles.light : roles.dark) ?? {};
}

export function setThemeRole(
  roles: ThemeRolesByAppearance,
  light: boolean,
  role: ThemeRoleId,
  value: string | null,
): ThemeRolesByAppearance {
  const mode = light ? 'light' : 'dark';
  const current = { ...(roles[mode] ?? {}) };
  if (value === null || value.trim() === '' || value.trim().toLowerCase() === 'default') {
    delete current[role];
  } else {
    current[role] = value.trim();
  }
  const next: ThemeRolesByAppearance = { ...roles };
  if (Object.keys(current).length === 0) {
    delete next[mode];
  } else {
    next[mode] = current;
  }
  return next;
}

export function countThemeRoleOverrides(roles: ThemeRolesByAppearance | undefined, light: boolean): number {
  return Object.keys(rolesForAppearance(roles, light)).length;
}

/**
 * Built-in default dark `themeRoles` matching desktop `packages/settings-catalog/src/data/defaults.rs`
 * (5ce4a5f7d / 67eb86437: Polar Night).
 */
export const DEFAULT_DARK_THEME_ROLES: ThemeRoleMap = {
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

/**
 * Built-in default light `themeRoles` matching desktop `packages/settings-catalog/src/data/defaults.rs`
 * (5ce4a5f7d: Everforest Light).
 */
export const DEFAULT_LIGHT_THEME_ROLES: ThemeRoleMap = {
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

/** Fresh copy of Ghostex's built-in default `themeRoles` for dark (Polar Night) and light (Everforest Light). */
export function defaultThemeRoles(): ThemeRolesByAppearance {
  return {
    dark: { ...DEFAULT_DARK_THEME_ROLES },
    light: { ...DEFAULT_LIGHT_THEME_ROLES },
  };
}

/**
 * Desktop Stage 1 (`packages/settings-catalog/src/data/preset_roles.rs`):
 * per-preset text, accent, semantic, and relative fill (`base+N%` / `base-N%`) role maps.
 */
export const PRESET_ROLES: Readonly<Record<string, ThemeRoleMap>> = {
  mocha: {
    text: '#cdd6f4',
    mutedText: '#a6adc8',
    accent: '#cba6f7',
    focusRing: '#cba6f7',
    link: '#89b4fa',
    success: '#a6e3a1',
    warning: '#f9e2af',
    danger: '#f38ba8',
    userMessage: 'base+9%',
    codeBlock: 'base-15%',
    selection: 'base+14%',
  },
  macchiato: {
    text: '#cad3f5',
    mutedText: '#a5adcb',
    accent: '#c6a0f6',
    focusRing: '#c6a0f6',
    link: '#8aadf4',
    success: '#a6da95',
    warning: '#eed49f',
    danger: '#ed8796',
    userMessage: 'base+9%',
    codeBlock: 'base-15%',
    selection: 'base+14%',
  },
  frappe: {
    text: '#c6d0f5',
    mutedText: '#a5adce',
    accent: '#ca9ee6',
    focusRing: '#ca9ee6',
    link: '#8caaee',
    success: '#a6d189',
    warning: '#e5c890',
    danger: '#e78284',
    userMessage: 'base+9%',
    codeBlock: 'base-15%',
    selection: 'base+14%',
  },
  latte: {
    text: '#4c4f69',
    mutedText: '#6c6f85',
    accent: '#8839ef',
    focusRing: '#8839ef',
    link: '#1e66f5',
    success: '#40a02b',
    warning: '#df8e1d',
    danger: '#d20f39',
    userMessage: 'base+12%',
    codeBlock: 'base+4%',
    selection: 'base+16%',
  },
  dracula: {
    text: '#f8f8f2',
    mutedText: '#6272a4',
    accent: '#bd93f9',
    focusRing: '#bd93f9',
    link: '#8be9fd',
    success: '#50fa7b',
    warning: '#f1fa8c',
    danger: '#ff5555',
    userMessage: 'base+11%',
    codeBlock: 'base-15%',
    selection: 'base+11%',
  },
  alucard: {
    text: '#1f1f1f',
    mutedText: '#6c664b',
    accent: '#644ac9',
    focusRing: '#644ac9',
    link: '#036a96',
    success: '#14710a',
    warning: '#846e15',
    danger: '#cb3a2a',
    userMessage: 'base+12%',
    codeBlock: 'base+5%',
    selection: 'base+12%',
  },
  'sol-dark': {
    text: '#93a1a1',
    mutedText: '#839496',
    accent: '#268bd2',
    focusRing: '#268bd2',
    link: '#2aa198',
    success: '#859900',
    warning: '#b58900',
    danger: '#dc322f',
    userMessage: 'base+6%',
    codeBlock: 'base+5%',
    selection: 'base+6%',
  },
  'sol-light': {
    text: '#586e75',
    mutedText: '#839496',
    accent: '#268bd2',
    focusRing: '#268bd2',
    link: '#2aa198',
    success: '#859900',
    warning: '#b58900',
    danger: '#dc322f',
    userMessage: 'base+4%',
    codeBlock: 'base+4%',
    selection: 'base+4%',
  },
  'tn-night': {
    text: '#c0caf5',
    mutedText: '#a9b1d6',
    accent: '#7aa2f7',
    focusRing: '#7aa2f7',
    link: '#7dcfff',
    success: '#9ece6a',
    warning: '#e0af68',
    danger: '#f7768e',
    userMessage: 'base+8%',
    codeBlock: 'base-15%',
    selection: 'base+12%',
  },
  'tn-storm': {
    text: '#c0caf5',
    mutedText: '#a9b1d6',
    accent: '#7aa2f7',
    focusRing: '#7aa2f7',
    link: '#7dcfff',
    success: '#9ece6a',
    warning: '#e0af68',
    danger: '#f7768e',
    userMessage: 'base+8%',
    codeBlock: 'base-15%',
    selection: 'base+12%',
  },
  'tn-moon': {
    text: '#c8d3f5',
    mutedText: '#828bb8',
    accent: '#82aaff',
    focusRing: '#82aaff',
    link: '#86e1fc',
    success: '#c3e88d',
    warning: '#ffc777',
    danger: '#ff757f',
    userMessage: 'base+8%',
    codeBlock: 'base-15%',
    selection: 'base+12%',
  },
  'tn-day': {
    text: '#3760bf',
    mutedText: '#6172b0',
    accent: '#2e7de9',
    focusRing: '#2e7de9',
    link: '#007197',
    success: '#587539',
    warning: '#8c6c3e',
    danger: '#f52a65',
    userMessage: 'base+6%',
    codeBlock: 'base+4%',
    selection: 'base+8%',
  },
  nord: {
    text: '#eceff4',
    mutedText: '#d8dee9b3',
    accent: '#88c0d0',
    focusRing: '#88c0d0',
    link: '#81a1c1',
    success: '#a3be8c',
    warning: '#ebcb8b',
    danger: '#bf616a',
    userMessage: 'base+7%',
    codeBlock: 'base+6%',
    selection: 'base+11%',
  },
  'kg-wave': {
    text: '#dcd7ba',
    mutedText: '#727169',
    accent: '#7e9cd8',
    focusRing: '#7e9cd8',
    link: '#7fb4ca',
    success: '#98bb6c',
    warning: '#e6c384',
    danger: '#e46876',
    userMessage: 'base+7%',
    codeBlock: 'base-15%',
    selection: 'base+12%',
  },
  'kg-dragon': {
    text: '#c5c9c5',
    mutedText: '#a6a69c',
    accent: '#8ba4b0',
    focusRing: '#8ba4b0',
    link: '#8ea4a2',
    success: '#8a9a7b',
    warning: '#c4b28a',
    danger: '#c4746e',
    userMessage: 'base+7%',
    codeBlock: 'base-15%',
    selection: 'base+12%',
  },
  'kg-lotus': {
    text: '#545464',
    mutedText: '#8a8980',
    accent: '#4d699b',
    focusRing: '#4d699b',
    link: '#4e8ca2',
    success: '#6f894e',
    warning: '#77713f',
    danger: '#c84053',
    userMessage: 'base+7%',
    codeBlock: 'base+4%',
    selection: 'base+10%',
  },
  'ef-dark': {
    text: '#d3c6aa',
    mutedText: '#859289',
    accent: '#a7c080',
    focusRing: '#a7c080',
    link: '#7fbbb3',
    success: '#a7c080',
    warning: '#dbbc7f',
    danger: '#e67e80',
    userMessage: 'base+7%',
    codeBlock: 'base-15%',
    selection: 'base+11%',
  },
  'ef-light': {
    text: '#5c6a72',
    mutedText: '#939f91',
    accent: '#8da101',
    focusRing: '#8da101',
    link: '#3a94c5',
    success: '#8da101',
    warning: '#dfa000',
    danger: '#f85552',
    userMessage: 'base+5%',
    codeBlock: 'base+4%',
    selection: 'base+6%',
  },
  'gm-dark': {
    text: '#d4be98',
    mutedText: '#928374',
    accent: '#d8a657',
    focusRing: '#d8a657',
    link: '#7daea3',
    success: '#a9b665',
    warning: '#d8a657',
    danger: '#ea6962',
    userMessage: 'base+8%',
    codeBlock: 'base-15%',
    selection: 'base+12%',
  },
  'gm-light': {
    text: '#654735',
    mutedText: '#928374',
    accent: '#b47109',
    focusRing: '#b47109',
    link: '#45707a',
    success: '#6c782e',
    warning: '#b47109',
    danger: '#c14a4a',
    userMessage: 'base+5%',
    codeBlock: 'base+4%',
    selection: 'base+7%',
  },
};

/** Stage 1 desktop subtle tint overrides for the 20 named presets (`theme_presets.rs` d5ac33b34). */
export const STAGE1_PRESET_TINTS: Readonly<Record<string, { tintColor: string; background: string }>> = {
  mocha: { tintColor: '#181921', background: '#1a1b23' },
  macchiato: { tintColor: '#181a23', background: '#1a1c25' },
  frappe: { tintColor: '#1a1b22', background: '#1c1d24' },
  latte: { tintColor: '#eaecf2', background: '#eff1f5' },
  dracula: { tintColor: '#191a22', background: '#1b1c24' },
  alucard: { tintColor: '#fdfaeb', background: '#fefbf0' },
  'sol-dark': { tintColor: '#121d20', background: '#141f22' },
  'sol-light': { tintColor: '#f8f3e5', background: '#faf6ec' },
  'tn-night': { tintColor: '#171820', background: '#191a22' },
  'tn-storm': { tintColor: '#171a23', background: '#191c25' },
  'tn-moon': { tintColor: '#181a22', background: '#1a1c24' },
  'tn-day': { tintColor: '#d7d8df', background: '#e1e2e7' },
  nord: { tintColor: '#171b23', background: '#191d25' },
  'kg-wave': { tintColor: '#1a1a22', background: '#1c1c24' },
  'kg-dragon': { tintColor: '#161414', background: '#181616' },
  'kg-lotus': { tintColor: '#e6e4d6', background: '#ecebe0' },
  'ef-dark': { tintColor: '#141c21', background: '#161e23' },
  'ef-light': { tintColor: '#f8f3e5', background: '#faf6ec' },
  'gm-dark': { tintColor: '#1a1a1a', background: '#1c1c1c' },
  'gm-light': { tintColor: '#efecde', background: '#f3f1e6' },
};
