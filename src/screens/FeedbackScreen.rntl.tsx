/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. Send Bug / Feedback: a GitHub username that is not one gets the error caption under
 * the field, and that caption keeps 4.5:1 (WCAG AA for normal-size text) on the page in every preset. The screenshot
 * error under the screenshot buttons uses the same caption style. A send the relay refuses shows the error banner,
 * whose text keeps 4.5:1 on the banner's rose wash over the page. The real screen and settings store; mocked are the
 * boundaries only: navigation, storage, the native module, the safe area and the feedback relay's send (it refuses).
 */

import { StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { FeedbackCopy } from '../copy';
import { useSettingsStore } from '../settings/store';
import { THEME_PRESETS, themePresetPatch } from '../theme/presets';
import FeedbackScreen from './FeedbackScreen';

jest.mock('../../modules/ghostex-native/src', () => ({ GhostexNative: {} }));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ setOptions: () => undefined, goBack: () => undefined, navigate: () => undefined }),
  useRoute: () => ({ key: 'feedback', name: 'Feedback', params: undefined }),
  useFocusEffect: () => undefined,
}));
jest.mock('../feedback/feedbackRelay', () => ({
  ...jest.requireActual('../feedback/feedbackRelay'),
  sendFeedback: () => Promise.reject(new Error('The feedback relay did not answer')),
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

const initialSettings = useSettingsStore.getState().settings;

afterEach(async () => {
  await act(() => {
    useSettingsStore.setState({ settings: initialSettings });
  });
});

test.each(THEME_PRESETS.map((preset) => [preset.id, preset.mode] as const))(
  '%s (%s): the invalid-username caption keeps 4.5:1 on the page',
  async (preset) => {
    const patch = themePresetPatch(preset, false);
    if (patch === undefined) throw new Error(`Unknown preset ${preset}`);
    useSettingsStore.getState().patchSettings(patch);
    await render(<FeedbackScreen />);
    await fireEvent.changeText(screen.getByLabelText(FeedbackCopy.usernameLabel), 'not a name!');
    const caption = screen.getByText(FeedbackCopy.usernameInvalid);
    let page = caption.parent;
    while (page !== null && !String(StyleSheet.flatten(page.props.style)?.backgroundColor ?? '').startsWith('#')) {
      page = page.parent;
    }
    const surface = String(StyleSheet.flatten(page!.props.style).backgroundColor);
    const ink = String(StyleSheet.flatten(caption.props.style).color);
    expect(contrast(ink, surface)).toBeGreaterThanOrEqual(4.5);
  },
);

/** `fill` (`#rrggbb` or `rgba(r,g,b,a)`) painted over the opaque `base`. */
function over(fill: string, base: string): string {
  if (fill.startsWith('#')) return fill;
  const [r, g, b, a] = fill.match(/[0-9.]+/g)!.map(Number);
  return `#${[r!, g!, b!]
    .map((channel, at) => Math.round(parseInt(base.slice(1 + 2 * at, 3 + 2 * at), 16) * (1 - a!) + channel * a!))
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}

test.each(THEME_PRESETS.map((preset) => [preset.id, preset.mode] as const))(
  '%s (%s): the error banner of a refused send keeps 4.5:1 on its wash over the page',
  async (preset) => {
    const patch = themePresetPatch(preset, false);
    if (patch === undefined) throw new Error(`Unknown preset ${preset}`);
    useSettingsStore.getState().patchSettings(patch);
    await render(<FeedbackScreen />);
    await fireEvent.changeText(screen.getByLabelText(FeedbackCopy.usernameLabel), 'octocat');
    await fireEvent.changeText(screen.getByLabelText(FeedbackCopy.messageLabel), 'The banner is hard to read.');
    await fireEvent.press(screen.getByText(FeedbackCopy.review));
    await fireEvent.press(screen.getByText(FeedbackCopy.send));
    await act(async () => undefined);
    const text = screen.getByText('The feedback relay did not answer');
    const banner = text.parent!;
    let page = banner.parent;
    while (page !== null && !String(StyleSheet.flatten(page.props.style)?.backgroundColor ?? '').startsWith('#')) {
      page = page.parent;
    }
    const surface = over(
      String(StyleSheet.flatten(banner.props.style).backgroundColor),
      String(StyleSheet.flatten(page!.props.style).backgroundColor),
    );
    expect(contrast(String(StyleSheet.flatten(text.props.style).color), surface)).toBeGreaterThanOrEqual(4.5);
  },
);