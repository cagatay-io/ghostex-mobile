/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. Settings > Keyboard > Agent hotkeys: the coloured labels keep 4.5:1 (WCAG AA for
 * normal-size text) on what they are drawn on in every preset: a hotkey's remove "×" on the neutral fill over its row
 * card, Restore defaults on its destructive fill over the page (both at rest and pressed), and Add hotkey on the accent
 * fill. The real editor and hotkeys store; mocked are the boundaries only: navigation, storage, the native module, the
 * safe area and the Settings columns frame and scroll view (layout chrome).
 */

import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import { useSettingsStore } from '../settings/store';
import { destructiveButtonFills, neutralButtonFills } from '../theme/palette';
import { THEME_PRESETS, themePresetPatch } from '../theme/presets';
import AgentHotkeysEditorScreen from './AgentHotkeysEditorScreen';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ setOptions: () => undefined, goBack: () => undefined }),
  // The header's status bar style (`useAppearanceHeader` → `useStatusBarStyle`) runs on focus; no navigator here.
  useFocusEffect: () => undefined,
}));
jest.mock('../../modules/ghostex-native/src', () => ({ GhostexNative: {} }));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return { SafeAreaView: MockView, useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }) };
});
jest.mock('./settings/SettingsColumns', () => ({
  SettingsColumnsFrame: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('./settings/SettingsControls', () => {
  const { ScrollView: MockScrollView } = jest.requireActual('react-native');
  return { SettingsPageScrollView: MockScrollView };
});

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

/** `fill` (`#rrggbb` or `rgba(r,g,b,a)`) as it shows painted over the opaque `base`. */
function over(fill: string, base: string): string {
  if (fill.startsWith('#')) return fill;
  const [r, g, b, a] = fill.match(/[0-9.]+/g)!.map(Number);
  return `#${[r!, g!, b!]
    .map((channel, at) => Math.round(parseInt(base.slice(1 + 2 * at, 3 + 2 * at), 16) * (1 - a!) + channel * a!))
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}

/** `#rrggbb` of an `rgba(r,g,b,a)` fill's colour, without its alpha. */
function hexOf(fill: string): string {
  const [r, g, b] = fill.match(/[0-9.]+/g)!.map(Number);
  return `#${[r!, g!, b!].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

const flat = (node: TestInstance) => StyleSheet.flatten(node.props.style) ?? {};

/** The nearest ancestor of `node` painted in an opaque colour. */
function opaqueUnder(node: TestInstance): string {
  for (let parent = node.parent; parent !== null; parent = parent.parent) {
    const fill = flat(parent).backgroundColor;
    if (typeof fill === 'string' && fill.startsWith('#')) return fill;
  }
  throw new Error('no opaque surface under the button');
}

/** `label` against each fill of its button, painted over what the button stands on. */
function shortfalls(name: string, label: TestInstance, fills: string[], base: string): string[] {
  const ink = String(flat(label).color);
  return fills
    .map((fill) => over(fill, base))
    .map((surface) => ({ surface, ratio: contrast(ink, surface) }))
    .filter(({ ratio }) => ratio < 4.5)
    .map(({ surface, ratio }) => `${name} ${ink} on ${surface}: ${ratio.toFixed(2)}`);
}

const initialSettings = useSettingsStore.getState().settings;

afterEach(async () => {
  await act(() => {
    useSettingsStore.setState({ settings: initialSettings });
  });
});

test.each(THEME_PRESETS.map((preset) => [preset.id, preset.mode] as const))(
  '%s (%s): remove, Restore defaults and Add hotkey keep 4.5:1 on their fills',
  async (preset, mode) => {
    const patch = themePresetPatch(preset, false);
    if (patch === undefined) throw new Error(`Unknown preset ${preset}`);
    useSettingsStore.getState().patchSettings(patch);
    await render(<AgentHotkeysEditorScreen />);
    const light = mode === 'light';
    const failures: string[] = [];

    // A hotkey's remove "×": the neutral fill over the row's card.
    const remove = screen.getAllByLabelText(/^Remove /)[0]!;
    const removeFill = String(flat(remove).backgroundColor);
    expect(removeFill).toBe(neutralButtonFills(light).rest);
    failures.push(
      ...shortfalls(
        'remove',
        screen.getAllByText('×')[0]!,
        [removeFill, neutralButtonFills(light).pressed],
        opaqueUnder(remove),
      ),
    );

    // Restore defaults: its destructive fill over the page, at rest and at the pressed strength.
    const restoreLabel = screen.getByText(/^Restore .* defaults$/);
    const restore = restoreLabel.parent!;
    const restFill = String(flat(restore).backgroundColor);
    const pressedFill = destructiveButtonFills(hexOf(restFill), light).pressed;
    failures.push(...shortfalls('restore', restoreLabel, [restFill, pressedFill], opaqueUnder(restore)));

    // Add hotkey: the accent fill (the section heading above the fields says the same words, on the page).
    const addLabel = screen
      .getAllByText('Add hotkey')
      .find((node) => flat(node.parent!).backgroundColor !== undefined)!;
    const addFill = String(flat(addLabel.parent!).backgroundColor);
    failures.push(...shortfalls('add', addLabel, [addFill], addFill));

    expect(failures).toEqual([]);
  },
);