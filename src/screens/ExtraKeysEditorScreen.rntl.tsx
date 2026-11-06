/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. Settings > Keyboard > Extra keys: a custom action's text fields wash the modal card
 * white, and their placeholders keep 4.5:1 (WCAG AA for normal-size text) on that wash in every preset. The Remove
 * label keeps 4.5:1 on its destructive fill over the page, at rest and pressed, and the labels on the accent fill (the
 * selected chip, Save keys) on that fill. The real editor and settings store; mocked are the boundaries only:
 * navigation, storage, the native module, the safe area and the Settings columns frame and scroll view (layout chrome).
 */

import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import { useSettingsStore } from '../settings/store';
import { defaultExtraKeysLayout, storedItemLabel } from '../settings/extraKeys';
import { destructiveButtonFills } from '../theme/palette';
import { THEME_PRESETS, themePresetPatch } from '../theme/presets';
import ExtraKeysEditorScreen from './ExtraKeysEditorScreen';

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

const flat = (node: TestInstance) => StyleSheet.flatten(node.props.style) ?? {};

/** The nearest ancestor of `node` painted in an opaque colour: the modal card. */
function cardUnder(node: TestInstance): string {
  for (let parent = node.parent; parent !== null; parent = parent.parent) {
    const fill = flat(parent).backgroundColor;
    if (typeof fill === 'string' && fill.startsWith('#')) return fill;
  }
  throw new Error('no opaque surface under the field');
}

const initialSettings = useSettingsStore.getState().settings;

afterEach(async () => {
  await act(() => {
    useSettingsStore.setState({ settings: initialSettings });
  });
});

test.each(THEME_PRESETS.map((preset) => [preset.id, preset.mode] as const))(
  "%s (%s): a custom shortcut's field placeholders read on the field's wash over the modal card",
  async (preset) => {
    const patch = themePresetPatch(preset, false);
    if (patch === undefined) throw new Error(`Unknown preset ${preset}`);
    useSettingsStore.getState().patchSettings(patch);
    await render(<ExtraKeysEditorScreen />);
    await fireEvent.press(screen.getByLabelText('Add key to row 1'));
    await fireEvent.press(screen.getByText('Shortcut with modifiers…'));
    const failures: string[] = [];
    for (const placeholder of ['e.g. GITST', 'e.g. c, escape, f5']) {
      const field = screen.getByPlaceholderText(placeholder);
      const surface = over(String(flat(field).backgroundColor), cardUnder(field));
      const ratio = contrast(String(field.props.placeholderTextColor), surface);
      if (ratio < 4.5) {
        failures.push(`${placeholder} ${field.props.placeholderTextColor} on ${surface}: ${ratio.toFixed(2)}`);
      }
    }
    expect(failures).toEqual([]);
  },
);

/** `#rrggbb` of an `rgba(r,g,b,a)` fill's colour, without its alpha. */
function hexOf(fill: string): string {
  const [r, g, b] = fill.match(/[0-9.]+/g)!.map(Number);
  return `#${[r!, g!, b!].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

/** The first key of the default layout, as its chip names it. */
const FIRST_KEY = storedItemLabel(defaultExtraKeysLayout()[0]![0]!);

test.each(THEME_PRESETS.map((preset) => [preset.id, preset.mode] as const))(
  '%s (%s): Remove keeps 4.5:1 on its destructive fill over the page, at rest and pressed',
  async (preset, mode) => {
    const patch = themePresetPatch(preset, false);
    if (patch === undefined) throw new Error(`Unknown preset ${preset}`);
    useSettingsStore.getState().patchSettings(patch);
    await render(<ExtraKeysEditorScreen />);
    await fireEvent.press(screen.getByText(FIRST_KEY));
    const label = screen.getByText('Remove');
    const button = label.parent!;
    const page = cardUnder(button);
    const rest = String(flat(button).backgroundColor);
    // The pressed fill is the same destructive colour at the pressed strength (`destructiveButtonFills`).
    const pressed = destructiveButtonFills(hexOf(rest), mode === 'light').pressed;
    const failures: string[] = [];
    for (const surface of [over(rest, page), over(pressed, page)]) {
      const ratio = contrast(String(flat(label).color), surface);
      if (ratio < 4.5) failures.push(`${flat(label).color} on ${surface}: ${ratio.toFixed(2)}`);
    }
    expect(failures).toEqual([]);
  },
);

test.each(THEME_PRESETS.map((preset) => [preset.id, preset.mode] as const))(
  '%s (%s): the selected chip and Save keys keep 4.5:1 on the accent fill',
  async (preset) => {
    const patch = themePresetPatch(preset, false);
    if (patch === undefined) throw new Error(`Unknown preset ${preset}`);
    useSettingsStore.getState().patchSettings(patch);
    await render(<ExtraKeysEditorScreen />);
    await fireEvent.press(screen.getByText(FIRST_KEY));
    // Moving the key leaves it selected and makes the draft unsaved, so Save keys stands at full strength.
    await fireEvent.press(screen.getByText('Move ▶'));
    const failures: string[] = [];
    for (const label of [screen.getByText(FIRST_KEY), screen.getByText('Save keys')]) {
      const fill = String(flat(label.parent!).backgroundColor);
      const ratio = contrast(String(flat(label).color), fill);
      if (ratio < 4.5) failures.push(`${label.props.children} ${flat(label).color} on ${fill}: ${ratio.toFixed(2)}`);
    }
    expect(failures).toEqual([]);
  },
);