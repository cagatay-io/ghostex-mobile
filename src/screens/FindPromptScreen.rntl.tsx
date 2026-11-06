/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. A Find result in full: when an action fails, the status line says so in the error
 * ink, and the message and its detail keep 4.5:1 (WCAG AA for normal-size text) on the page in every preset. The real
 * screen and stores; mocked are the boundaries only: navigation, storage, the native module, the safe area and the
 * clipboard (which refuses).
 */

import { StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { useFindPromptsStore } from '../find/findPromptsStore';
import type { FindPromptRow } from '../find/promptSearch';
import { useMachinesStore } from '../machines/store';
import { useSettingsStore } from '../settings/store';
import { THEME_PRESETS, themePresetPatch } from '../theme/presets';
import FindPromptScreen from './FindPromptScreen';

jest.mock('../../modules/ghostex-native/src', () => ({ GhostexNative: {} }));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ setOptions: () => undefined }),
  useFocusEffect: () => undefined,
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: () => Promise.reject(new Error('clipboard refused')) }));

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

/** `ink` drawn at `alpha` over the opaque `base`. */
function atAlpha(ink: string, alpha: number, base: string): string {
  return `#${[1, 3, 5]
    .map((at) =>
      Math.round(parseInt(ink.slice(at, at + 2), 16) * alpha + parseInt(base.slice(at, at + 2), 16) * (1 - alpha)),
    )
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}

const ROW: FindPromptRow = {
  agent: 'claude',
  agentColor: '',
  dayKey: -1,
  favorite: false,
  highlights: [],
  key: 'p1',
  meta: {
    model: '',
    plan: '',
    provider: '',
    thinking: '',
    usage: { cacheRead: 0, cacheWrite: 0, contextWindow: 0, cost: 0, input: 0, output: 0, ratePercent: 0, total: 0 },
  },
  project: '/repo/ghostex',
  projectName: 'ghostex',
  sessionId: 's1',
  text: 'Rewrite the contrast notes',
  title: 'Contrast',
  truncated: false,
  ts: 0,
};

const initialSettings = useSettingsStore.getState().settings;

beforeEach(() => {
  useMachinesStore.setState({
    machines: [
      {
        id: 'm1',
        name: 'Mac mini',
        host: 'mac-mini.local',
        username: 'owner',
        port: 22,
        savePassword: false,
        lastConnectedAt: null,
      },
    ],
  });
  useFindPromptsStore.setState({ machineId: 'm1', rows: [ROW], fullText: {} });
});

afterEach(async () => {
  await act(() => {
    useSettingsStore.setState({ settings: initialSettings });
  });
});

test.each(THEME_PRESETS.map((preset) => [preset.id, preset.mode] as const))(
  '%s (%s): a failed copy says so, message and detail at 4.5:1 on the page',
  async (preset) => {
    const patch = themePresetPatch(preset, false);
    if (patch === undefined) throw new Error(`Unknown preset ${preset}`);
    useSettingsStore.getState().patchSettings(patch);
    await render(
      <FindPromptScreen
        navigation={{ dispatch: () => undefined, pop: () => undefined } as never}
        route={{ params: { machineId: 'm1', promptKey: 'p1' } } as never}
      />,
    );
    await fireEvent.press(screen.getByText('Copy'));
    await act(async () => undefined);
    const detail = screen.getByText('clipboard refused');
    const line = detail.parent!;
    const lineStyle = StyleSheet.flatten(line.props.style) ?? {};
    const own = StyleSheet.flatten(detail.props.style) ?? {};
    let page = line.parent;
    while (page !== null && !String(StyleSheet.flatten(page.props.style)?.backgroundColor ?? '').startsWith('#')) {
      page = page.parent;
    }
    const surface = String(StyleSheet.flatten(page!.props.style).backgroundColor);
    const failures: string[] = [];
    for (const [name, ink, opacity] of [
      ['message', String(lineStyle.color), Number(lineStyle.opacity ?? 1)],
      ['detail', String(own.color ?? lineStyle.color), Number(lineStyle.opacity ?? 1) * Number(own.opacity ?? 1)],
    ] as const) {
      const ratio = contrast(atAlpha(ink, opacity, surface), surface);
      if (ratio < 4.5) failures.push(`${name} ${ink} × ${opacity} on ${surface}: ${ratio.toFixed(2)}`);
    }
    expect(failures).toEqual([]);
  },
);