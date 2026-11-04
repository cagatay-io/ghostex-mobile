/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. Add Project uses the app's model-coloured page: its error banner
 * (here for a computer that is gone) keeps the designed destructive red, which reads at 4.5:1 (WCAG AA for
 * normal-size text) on the banner's rose wash over that page. The real screen and banner; mocked are the boundaries
 * only: navigation, storage, the native module and the safe area.
 */

import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { AddProjectCopy } from '../copy';
import { useMachinesStore } from '../machines/store';
import { defaultSettings, useSettingsStore } from '../settings/store';
import AddProjectSourceScreen from './AddProjectSourceScreen';

jest.mock('../../modules/ghostex-native/src', () => ({ GhostexNative: {} }));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
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

/** `fill` (`#rrggbb` or `rgba(r,g,b,a)`) painted over the opaque `base`. */
function over(fill: string, base: string): string {
  if (fill.startsWith('#')) return fill;
  const [r, g, b, a] = fill.match(/[0-9.]+/g)!.map(Number);
  return `#${[r!, g!, b!]
    .map((channel, at) => Math.round(parseInt(base.slice(1 + 2 * at, 3 + 2 * at), 16) * (1 - a!) + channel * a!))
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}

test("a gone computer's error banner keeps the designed red at 4.5:1 on its wash over the fixed dark page", async () => {
  useSettingsStore.setState({ hydrated: true, settings: defaultSettings() });
  useMachinesStore.setState({ machines: [] });
  await render(
    <AddProjectSourceScreen
      navigation={{ navigate: () => undefined } as never}
      route={{ key: 'source', name: 'AddProjectSource', params: { machineId: 'gone' } } as never}
    />,
  );
  const text = screen.getByText(AddProjectCopy.machineMissing);
  const banner = text.parent!;
  let page = banner.parent;
  while (page !== null && !String(StyleSheet.flatten(page.props.style)?.backgroundColor ?? '').startsWith('#')) {
    page = page.parent;
  }
  const pageColour = String(StyleSheet.flatten(page!.props.style).backgroundColor);
  const ink = String(StyleSheet.flatten(text.props.style).color);
  const surface = over(String(StyleSheet.flatten(banner.props.style).backgroundColor), pageColour);
  expect(contrast(ink, surface)).toBeGreaterThanOrEqual(4.5);
});