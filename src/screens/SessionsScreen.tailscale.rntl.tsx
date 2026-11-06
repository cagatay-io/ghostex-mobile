/// <reference types="jest" />
/**
 * Run with `bunx jest src/screens/SessionsScreen.tailscale.rntl.tsx`. The Sessions screen's "• Tailscale" indicator,
 * shown while the phone's Tailscale is connected, keeps 4.5:1 (WCAG AA for normal-size text) on the drawer page in
 * every preset; on every light preset the notice shown while it is not connected keeps its title and line at 4.5:1 and
 * its close glyph at 3:1 (WCAG AA for a control's glyph) on the notice's wash. The real `SessionsScreen` with its real
 * stores; mocked are the boundaries only: the native module (Tailscale reports connected, or not), storage, haptics,
 * navigation focus (a focus effect runs once, as on arrival) and the voice button.
 */

import { act, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { TestInstance } from 'test-renderer';

import { CloseIcon } from '../components/terminal/icons';
import { emptyMachineInventory, useInventoryStore } from '../inventory/store';
import { useMachinesStore, type MachineRecord } from '../machines/store';
import { defaultSettings, useSettingsStore } from '../settings/store';
import { THEME_PRESETS, themePresetPatch } from '../theme/presets';
import SessionsScreen from './SessionsScreen';

/** What the phone's Tailscale reports. */
let mockTailscaleConnected = true;

jest.mock('../../modules/ghostex-native/src', () => {
  // Tailscale reports `mockTailscaleConnected`; every other native call resolves to nothing; listeners can be removed.
  const call = () => Promise.resolve(undefined);
  const native = new Proxy(
    {},
    {
      get: (_target, key) =>
        key === 'addListener'
          ? () => ({ remove: () => undefined })
          : key === 'isTailscaleConnected'
            ? () => Promise.resolve(mockTailscaleConnected)
            : call,
    },
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
jest.mock('@react-navigation/native', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    ...jest.requireActual('@react-navigation/native'),
    useIsFocused: () => true,
    // The screen is in front: each focus effect runs once, as when it comes into view.
    useFocusEffect: (effect: () => undefined | (() => void)) => useEffect(effect, [effect]),
    useNavigation: () => ({ navigate: () => undefined }),
  };
});
// The Unified list's swipe-to-reveal row runs on Reanimated, whose worklets runtime does not load under Jest; this
// test draws the project list, where no row reveals actions.
jest.mock('./machines-screen/SwipeRevealRow', () => ({
  __esModule: true,
  SWIPE_REVEAL_WIDTH: 176,
  default: ({ children }: { children: unknown }) => children,
}));
jest.mock('../voice/VoiceButton', () => ({ VoiceButton: () => null }));

const MACHINE: MachineRecord = {
  id: 'm1',
  name: 'Studio',
  host: 'studio.local',
  username: 'me',
  port: 22,
  savePassword: false,
  lastConnectedAt: null,
};

/** WCAG contrast of two `#rrggbb` colours. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5]
      .map((at) => parseInt(hex.slice(at, at + 2), 16) / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** `fill` (`#rrggbb` or `rgba(r,g,b,a)`) painted over the opaque `base`. */
function over(fill: string, base: string): string {
  if (fill.startsWith('#')) return fill;
  const [r, g, b, a] = fill.match(/[0-9.]+/g)!.map(Number);
  return `#${[r!, g!, b!]
    .map((channel, at) => Math.round(parseInt(base.slice(1 + 2 * at, 3 + 2 * at), 16) * (1 - a!) + channel * a!))
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}

afterEach(async () => {
  mockTailscaleConnected = true;
  await act(() => {
    useSettingsStore.setState({ settings: defaultSettings() });
  });
});

/** The real Sessions screen in `preset`, its computer not answering (no list read yet). */
async function renderSessions(preset: string): Promise<void> {
  useSettingsStore.setState({
    hydrated: true,
    settings: { ...defaultSettings(), ...themePresetPatch(preset, false), tailscaleReminder: true },
  });
  useMachinesStore.setState({ hydrated: true, machines: [MACHINE], selectedMachineId: MACHINE.id });
  useInventoryStore.setState({ inventoriesByMachineId: { [MACHINE.id]: emptyMachineInventory() } });
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

/** What is drawn behind `node`: the washes of its ancestors over the first opaque one. */
function surfaceBehind(node: TestInstance): string {
  const washes: string[] = [];
  let base: string | null = null;
  for (let at = node.parent; at !== null && base === null; at = at.parent) {
    const fill = StyleSheet.flatten(at.props.style)?.backgroundColor;
    if (typeof fill !== 'string' || fill === 'transparent') continue;
    if (fill.startsWith('#')) base = fill;
    else washes.push(fill);
  }
  return washes.reverse().reduce((under, wash) => over(wash, under), base!);
}

/** The props of the first `type` component inside `node`, through React's fiber (the test renderer keeps host views). */
function componentProps(node: TestInstance, type: unknown): Record<string, unknown> | null {
  const pending = [node.unstable_fiber?.child ?? null];
  while (pending.length > 0) {
    const fiber = pending.pop();
    if (fiber === null || fiber === undefined) continue;
    if (fiber.type === type) return fiber.memoizedProps as Record<string, unknown>;
    pending.push(fiber.sibling, fiber.child);
  }
  return null;
}

test.each(THEME_PRESETS.map((preset) => [preset.id, preset.mode] as const))(
  '%s (%s): the connected Tailscale indicator keeps 4.5:1 on the drawer page',
  async (preset) => {
    await renderSessions(preset);
    const label = screen.getByText('• Tailscale');
    const ink = String(StyleSheet.flatten(label.props.style).color);
    expect(contrast(ink, surfaceBehind(label))).toBeGreaterThanOrEqual(4.5);
  },
);

test.each(THEME_PRESETS.filter((preset) => preset.mode === 'light').map((preset) => [preset.id] as const))(
  '%s (light): the not-connected notice keeps its words at 4.5:1 and its close glyph at 3:1 on its wash',
  async (preset) => {
    mockTailscaleConnected = false;
    await renderSessions(preset);
    for (const words of ['Tailscale isn’t connected', 'Tap to open Tailscale and reconnect.']) {
      const text = screen.getByText(words);
      expect(contrast(String(StyleSheet.flatten(text.props.style).color), surfaceBehind(text))).toBeGreaterThanOrEqual(
        4.5,
      );
    }
    // The close button's glyph: the colour the screen hands its icon, on the notice's wash.
    const close = screen.getByLabelText('Hide the Tailscale notice');
    const color = String(componentProps(close, CloseIcon)?.color);
    expect(contrast(color, surfaceBehind(close))).toBeGreaterThanOrEqual(3);
  },
);
