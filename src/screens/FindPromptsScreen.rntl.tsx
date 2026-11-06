/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. Find's notice line as it is drawn: a history the computer could not read gives an
 * info notice whose detail runs on after the message, nested in the same line. The detail inherits the line's
 * secondary ink and keeps 4.5:1 (WCAG AA for normal-size text) on the notice's card in every preset, with any opacity
 * the detail itself applies taken into the measured colour (React Native iOS multiplies a text's foreground alpha by
 * its opacity). An error notice keeps 4.5:1 on its red wash over the page, and a result's highlighted match on the
 * row at rest (the page) and pressed. The real screen and stores; mocked are the boundaries only: navigation,
 * storage, the native module and the safe area.
 */

import { StyleSheet } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';

import { useFindPromptsStore } from '../find/findPromptsStore';
import type { FindPromptRow } from '../find/promptSearch';
import { useMachinesStore } from '../machines/store';
import { useSettingsStore } from '../settings/store';
import { THEME_PRESETS, themePresetPatch } from '../theme/presets';
import { resolveAppearance } from '../theme/useAppearance';
import FindPromptsScreen from './FindPromptsScreen';

jest.mock('../../modules/ghostex-native/src', () => ({ GhostexNative: {} }));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ setOptions: () => undefined }),
  useFocusEffect: () => undefined,
}));

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

const initialSettings = useSettingsStore.getState().settings;

beforeEach(() => {
  jest.useFakeTimers();
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
});

afterEach(async () => {
  jest.useRealTimers();
  await act(() => {
    useSettingsStore.setState({ settings: initialSettings });
  });
});

test.each(THEME_PRESETS.map((preset) => [preset.id, preset.mode] as const))(
  "%s (%s): an unreadable history's detail keeps 4.5:1 on the notice card",
  async (preset) => {
    const patch = themePresetPatch(preset, false);
    if (patch === undefined) throw new Error(`Unknown preset ${preset}`);
    useSettingsStore.getState().patchSettings(patch);
    useFindPromptsStore.setState({
      machineId: 'm1',
      loading: false,
      notice: { kind: 'info', message: 'opencode history could not be read.', detail: 'History is unavailable' },
    });
    await render(
      <FindPromptsScreen
        navigation={{ addListener: () => () => undefined, navigate: () => undefined } as never}
        route={{ params: { machineId: 'm1' } } as never}
      />,
    );
    const detail = screen.getByText('History is unavailable');
    const own = StyleSheet.flatten(detail.props.style) ?? {};
    // The ink the detail draws with: its own, else the line's it is nested in; the surface: the nearest painted one.
    let ink = own.color as string | undefined;
    let surface: string | undefined;
    for (let parent = detail.parent; parent !== null; parent = parent.parent) {
      const style = StyleSheet.flatten(parent.props.style) ?? {};
      if (ink === undefined && typeof style.color === 'string') ink = style.color;
      if (surface === undefined && typeof style.backgroundColor === 'string' && style.backgroundColor.startsWith('#')) {
        surface = style.backgroundColor;
      }
    }
    const painted = atAlpha(ink!, Number(own.opacity ?? 1), surface!);
    expect(contrast(painted, surface!)).toBeGreaterThanOrEqual(4.5);
  },
);

test.each(THEME_PRESETS.map((preset) => [preset.id, preset.mode] as const))(
  '%s (%s): an error notice and its detail keep 4.5:1 on the red wash over the page',
  async (preset) => {
    const patch = themePresetPatch(preset, false);
    if (patch === undefined) throw new Error(`Unknown preset ${preset}`);
    useSettingsStore.getState().patchSettings(patch);
    useFindPromptsStore.setState({
      machineId: 'm1',
      loading: false,
      notice: { kind: 'error', message: 'Search failed.', detail: 'The computer did not answer' },
    });
    await render(
      <FindPromptsScreen
        navigation={{ addListener: () => () => undefined, navigate: () => undefined } as never}
        route={{ params: { machineId: 'm1' } } as never}
      />,
    );
    const detail = screen.getByText('The computer did not answer');
    // The line the detail is nested in, the notice's wash, and the page that shows through it.
    let line = detail.parent;
    while (line !== null && StyleSheet.flatten(line.props.style)?.color === undefined) line = line.parent;
    let wash = line!.parent;
    while (wash !== null && StyleSheet.flatten(wash.props.style)?.backgroundColor === undefined) wash = wash.parent;
    let page = wash!.parent;
    while (page !== null && !String(StyleSheet.flatten(page.props.style)?.backgroundColor ?? '').startsWith('#')) {
      page = page.parent;
    }
    const fill = String(StyleSheet.flatten(wash!.props.style).backgroundColor);
    const [r, g, b, a] = fill.match(/[0-9.]+/g)!.map(Number);
    const surface = atAlpha(
      `#${[r!, g!, b!].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`,
      a!,
      String(StyleSheet.flatten(page!.props.style).backgroundColor),
    );
    const own = StyleSheet.flatten(detail.props.style) ?? {};
    const ink = String(own.color ?? StyleSheet.flatten(line!.props.style).color);
    expect(contrast(atAlpha(ink, Number(own.opacity ?? 1), surface), surface)).toBeGreaterThanOrEqual(4.5);
  },
);

/** One result whose first word matched the query (byte offsets of "Rewrite"). */
const MATCHED_ROW: FindPromptRow = {
  agent: 'claude',
  agentColor: '',
  dayKey: -1,
  favorite: false,
  highlights: [0, 1, 2, 3, 4, 5, 6],
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

test.each(THEME_PRESETS.map((preset) => [preset.id, preset.mode] as const))(
  '%s (%s): a highlighted match keeps 4.5:1 on its row, at rest and pressed',
  async (preset, mode) => {
    const patch = themePresetPatch(preset, false);
    if (patch === undefined) throw new Error(`Unknown preset ${preset}`);
    useSettingsStore.getState().patchSettings(patch);
    useFindPromptsStore.setState({
      machineId: 'm1',
      loading: false,
      query: 'rewrite',
      groupByDay: false,
      rows: [MATCHED_ROW],
      matched: 1,
      total: 1,
      notice: null,
    });
    await render(
      <FindPromptsScreen
        navigation={{ addListener: () => () => undefined, navigate: () => undefined } as never}
        route={{ params: { machineId: 'm1' } } as never}
      />,
    );
    const match = screen.getByText('Rewrite');
    const ink = String(StyleSheet.flatten(match.props.style).color);
    // At rest the row is unpainted, so the page shows under it; pressed it takes the pressed card.
    let page = match.parent;
    while (page !== null && !String(StyleSheet.flatten(page.props.style)?.backgroundColor ?? '').startsWith('#')) {
      page = page.parent;
    }
    const appearance = resolveAppearance(useSettingsStore.getState().settings, mode === 'light');
    const failures = [String(StyleSheet.flatten(page!.props.style).backgroundColor), appearance.cardActive]
      .map((surface) => ({ surface, ratio: contrast(ink, surface) }))
      .filter(({ ratio }) => ratio < 4.5)
      .map(({ surface, ratio }) => `${ink} on ${surface}: ${ratio.toFixed(2)}`);
    expect(failures).toEqual([]);
  },
);