/// <reference types="jest" />
/**
 * Run with `bunx jest src/screens/SessionsScreen.rntl.tsx`. The Sessions list stays readable under a light theme
 * preset, as the desktop sidebar does: its ink follows the appearance (`chrome_color(dark, light)` in
 * apps/desktop/src/app/native_sidebar), so a light list draws dark text, and a dark list keeps the desktop's dark ink.
 *
 * The real `SessionsScreen` with its real stores (settings, machines, inventory, terminal) and a summary parsed by
 * the real parser; mocked are the boundaries only: the native module, storage, haptics, navigation focus and the voice
 * button. Every visible text of the rendered screen is measured against what is drawn behind it (the background
 * colours of its ancestors composed over the page, its colour faded by their opacity), with WCAG's contrast ratio.
 *
 * The readability rule comes from the dark design the desktop ships, rendered from the same summary: text the dark
 * list draws at body strength (WCAG AA, 4.5:1 or more) must reach at least 3:1 under a light preset (WCAG's floor for
 * large text and UI parts); text the dark list itself draws as a faint caption (a section's caps at 34%, a sleeping
 * session's time) must stay visible, at least 1.8:1 (a chosen floor: a caption that drops to about 1:1 is gone).
 *
 * Not shown here: icons and lines (measured as text only), the device's rendering, VoiceOver.
 */

import { act, render, screen } from '@testing-library/react-native';
import { StyleSheet, type TextStyle } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { TestInstance } from 'test-renderer';

import { parseMobileSummary } from '../contract/mobileSummary';
import { emptyMachineInventory, useInventoryStore } from '../inventory/store';
import { useMachinesStore, type MachineRecord } from '../machines/store';
import { useCollapseStore } from '../components/sessions/collapseStore';
import { defaultSettings, useSettingsStore, type GhostexSettings } from '../settings/store';
import { useTerminalStore } from '../terminal/sessions';
import { THEME_PRESETS, themePresetPatch } from '../theme/presets';
import SessionsScreen from './SessionsScreen';

jest.mock('../../modules/ghostex-native/src', () => {
  // Every native call resolves to nothing; listeners can be removed.
  const call = () => Promise.resolve(undefined);
  const native = new Proxy(
    {},
    { get: (_target, key) => (key === 'addListener' ? () => ({ remove: () => undefined }) : call) },
  );
  return { GhostexNative: native, GhostexTerminalView: () => null };
});
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-haptics', () => ({
  impactAsync: () => Promise.resolve(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
  useFocusEffect: () => undefined,
  useNavigation: () => ({ navigate: () => undefined }),
}));
jest.mock('../voice/VoiceButton', () => ({ VoiceButton: () => null }));

// The Unified list's swipe-to-reveal row runs on Reanimated, whose worklets runtime does not load under Jest; the
// row's own content is what is measured, the actions it reveals on a swipe are not drawn at rest.
jest.mock('./machines-screen/SwipeRevealRow', () => ({
  __esModule: true,
  SWIPE_REVEAL_WIDTH: 176,
  default: ({ children }: { children: unknown }) => children,
}));

const MACHINE: MachineRecord = {
  id: 'm1',
  name: 'Studio',
  host: 'studio.local',
  username: 'me',
  port: 22,
  savePassword: false,
  lastConnectedAt: null,
};

const minutesAgo = (minutes: number): string => new Date(Date.now() - minutes * 60_000).toISOString();

function session(sessionId: string, title: string, projectId: string, overrides: object = {}): object {
  return {
    sessionId,
    projectId,
    title,
    status: 'idle',
    activity: 'idle',
    isLive: true,
    provider: 'zmx',
    agent: 'claude',
    lastInteractionAt: minutesAgo(90),
    createdAt: minutesAgo(600),
    ...overrides,
  };
}

/** One computer's summary: an open project with a pinned, an open, a plain and a sleeping session, and a second project. */
function summary(extra: object = {}) {
  const parsed = parseMobileSummary(
    JSON.stringify({
      ok: true,
      projects: [
        { projectId: 'P1', name: 'Ghostex', path: '/repo/ghostex' },
        { projectId: 'P2', name: 'Website', path: '/repo/website' },
      ],
      sessions: [
        session('s1', 'Pinned plan', 'P1', { isPinned: true, lastInteractionAt: minutesAgo(70) }),
        session('s2', 'Open session', 'P1', { lastInteractionAt: minutesAgo(5) }),
        session('s3', 'Plain session', 'P1'),
        // Its own time, so the lists' recency order cannot depend on when each render built the summary.
        session('s4', 'Sleeping session', 'P1', {
          status: 'sleep',
          isSleeping: true,
          isLive: false,
          lastInteractionAt: minutesAgo(180),
        }),
        session('s5', 'Site work', 'P2', { activity: 'working', status: 'working' }),
      ],
      ...extra,
    }),
  );
  if (parsed === null) throw new Error('the summary did not parse');
  return parsed;
}

async function renderSessions(settings: GhostexSettings, extra: object = {}): Promise<void> {
  const parsed = summary(extra);
  useSettingsStore.setState({ hydrated: true, settings });
  useMachinesStore.setState({ hydrated: true, machines: [MACHINE], selectedMachineId: MACHINE.id });
  useInventoryStore.setState({
    inventoriesByMachineId: {
      [MACHINE.id]: { ...emptyMachineInventory(), summary: parsed, serverSummary: parsed, hasLoaded: true },
    },
  });
  useTerminalStore.setState({ selectedSessionKey: `${MACHINE.id}:s2` });
  // Ghostex is open (a project starts closed); Website stays closed, so its header shows its counts.
  useCollapseStore.setState({ expandedProjectsByMachine: { [MACHINE.id]: ['id:P1'] } });
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 402, height: 874 },
        insets: { top: 59, left: 0, right: 0, bottom: 34 },
      }}
    >
      <SessionsScreen
        navigation={{ navigate: () => undefined } as never}
        route={{ key: 'sessions', name: 'Sessions' } as never}
      />
    </SafeAreaProvider>,
  );
  await act(async () => undefined);
}

// ---------------------------------------------------------------------------
// Colour and contrast (WCAG 2.x relative luminance).
// ---------------------------------------------------------------------------

type Rgba = { r: number; g: number; b: number; a: number };

function parseColour(value: unknown): Rgba | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().toLowerCase();
  if (text === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const hex = /^#([0-9a-f]{3,8})$/.exec(text);
  if (hex !== null) {
    const digits = hex[1];
    const full = digits.length <= 4 ? [...digits].map((digit) => digit + digit).join('') : digits;
    const channel = (index: number) => parseInt(full.slice(index * 2, index * 2 + 2), 16);
    return { r: channel(0), g: channel(1), b: channel(2), a: full.length === 8 ? channel(3) / 255 : 1 };
  }
  const rgb = /^rgba?\(([^)]+)\)$/.exec(text);
  if (rgb !== null) {
    const [r, g, b, a = '1'] = rgb[1].split(',').map((part) => part.trim());
    return { r: Number(r), g: Number(g), b: Number(b), a: Number(a) };
  }
  throw new Error(`unparsed colour ${text}`);
}

function over(top: Rgba, bottom: Rgba, alpha = top.a): Rgba {
  return {
    r: top.r * alpha + bottom.r * (1 - alpha),
    g: top.g * alpha + bottom.g * (1 - alpha),
    b: top.b * alpha + bottom.b * (1 - alpha),
    a: 1,
  };
}

function luminance({ r, g, b }: Rgba): number {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(first: Rgba, second: Rgba): number {
  const [high, low] = [luminance(first), luminance(second)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/** The string a host Text shows, its nested Texts included. */
function textOf(node: TestInstance): string {
  return node.children.map((child) => (typeof child === 'string' ? child : textOf(child))).join('');
}

type Measured = { text: string; colour: string; ratio: number };

/** Every visible text of the screen with its contrast against what is drawn behind it. */
function measureTexts(): Measured[] {
  const texts = screen.container.queryAll((node) => node.type === 'Text' && node.parent?.type !== 'Text');
  const measured: Measured[] = [];
  for (const node of texts) {
    const text = textOf(node).trim();
    if (text.length === 0) continue;
    let colour: Rgba | null = null;
    let opacity = 1;
    const layers: Rgba[] = [];
    for (let at: TestInstance | null = node; at !== null; at = at.parent) {
      const style: TextStyle = StyleSheet.flatten(at.props.style as TextStyle) ?? {};
      if (colour === null && at.type === 'Text') colour = parseColour(style.color);
      if (typeof style.opacity === 'number') opacity *= style.opacity;
      const background = parseColour(style.backgroundColor);
      if (background !== null && background.a > 0) layers.push(background);
    }
    if (opacity === 0) continue;
    // The page under everything: the outermost background is opaque (the screen's own colour).
    const behind = layers.reverse().reduce<Rgba>((base, layer) => over(layer, base), { r: 255, g: 255, b: 255, a: 1 });
    const ink = colour ?? { r: 0, g: 0, b: 0, a: 1 };
    const shown = `rgba(${ink.r},${ink.g},${ink.b},${ink.a})`;
    measured.push({ text, colour: shown, ratio: contrast(over(ink, behind, ink.a * opacity), behind) });
  }
  return measured;
}

const BODY_TEXT = 4.5;
const LIGHT_BODY_FLOOR = 3;
const FAINT_CAPTION_FLOOR = 1.8;

// The desktop's dark appearance (`dark-2`) with the default colours: the dark design the light one is measured against.
const DARK: GhostexSettings = { ...defaultSettings(), sidebarTheme: 'dark-2' };
const LIGHT_CASES: [string, GhostexSettings][] = [
  ['the Light appearance with the default colours', { ...defaultSettings(), sidebarTheme: 'plain-light' }],
  ...THEME_PRESETS.filter((preset) => preset.mode === 'light').map((preset): [string, GhostexSettings] => [
    preset.name,
    { ...defaultSettings(), ...themePresetPatch(preset.id, false) },
  ]),
];

/** sessions.rs / appearance.rs, dark: a row's title #b4b8c0, the open session's #d8d8d8. */
const DESKTOP_DARK_INK = {
  'Plain session': 'rgba(180,184,192,1)',
  'Open session': 'rgba(216,216,216,1)',
};

describe.each([
  ['project list', {}],
  ['Unified list', { sidebarView: 'unified' }],
])('the %s', (_name, extra) => {
  let dark: Measured[] = [];
  beforeAll(async () => {
    await renderSessions(DARK, extra);
    dark = measureTexts();
    screen.unmount();
  });

  test('draws the sessions it is given, in the desktop dark ink under the dark appearance', () => {
    const shown = dark.map((entry) => entry.text);
    expect(shown).toEqual(expect.arrayContaining(['Open session', 'Plain session', 'Sleeping session']));
    for (const [text, colour] of Object.entries(DESKTOP_DARK_INK)) {
      expect(dark.find((entry) => entry.text === text)?.colour).toBe(colour);
    }
  });

  test.each(LIGHT_CASES)('stays readable under %s', async (_label, settings) => {
    await renderSessions(settings, extra);
    const light = measureTexts();
    expect(light.map((entry) => entry.text)).toEqual(dark.map((entry) => entry.text));
    const unreadable = light
      .map((entry, index) => {
        const floor = dark[index].ratio >= BODY_TEXT ? LIGHT_BODY_FLOOR : FAINT_CAPTION_FLOOR;
        return { text: entry.text, ratio: Math.round(entry.ratio * 100) / 100, floor };
      })
      .filter((entry) => entry.ratio < entry.floor);
    expect(unreadable).toEqual([]);
  });
});
