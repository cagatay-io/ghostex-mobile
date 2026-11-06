/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. The Notifications screen's "…" menu (one list shared with the desktop bell, read
 * state on the computer) with the notifications design: its list-menu state (Mark All Read and Clear All, as
 * the head of the desktop list, standing under the "…" at the top right on every iPhone) and state clear-confirm
 * (Clear All asks first, "Clear all notifications?", because the rows also leave the bell on the computer; Cancel
 * keeps them). Accessibility: each command and a Close menu button are their own accessibility elements, none grouped
 * into an ancestor iOS would read as one element. The real screen, `AttentionList`, `ContextMenu`, `BottomSheet` and
 * stores; mocked are the boundaries only: navigation (a stand-in that draws the header button the screen sets), the
 * native module, expo-notifications, storage, the safe area and the computer's feed endpoint.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import { useMachinesStore, type MachineRecord } from '../machines/store';
import type { FeedRow } from '../notifications/feedContract';
import { updateAllAttentionFeeds, useAttentionFeedStore } from '../notifications/feedStore';
import { NotificationsCopy } from '../copy';
import { useSettingsStore } from '../settings/store';
import { destructiveButtonFills, GhostexPalette, neutralButtonFills } from '../theme/palette';
import { THEME_PRESETS, themePresetPatch } from '../theme/presets';
import AttentionListScreen from './AttentionListScreen';

jest.mock('../../modules/ghostex-native/src', () => ({ GhostexNative: {} }));
jest.mock('expo-notifications', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return { SafeAreaView: MockView, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
// `useAppearanceHeader` paints the header through `useNavigation`; native header painting is outside this test.
const mockHeaderNavigation = { setOptions: () => undefined };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockHeaderNavigation,
  useFocusEffect: () => undefined,
  useRoute: () => ({ key: 'attention', name: 'AttentionList' }),
}));
jest.mock('../notifications/feedStore', () => ({
  ...jest.requireActual('../notifications/feedStore'),
  updateAttentionFeed: jest.fn(() => Promise.resolve(true)),
  updateAllAttentionFeeds: jest.fn(() => Promise.resolve(true)),
  refreshAttentionFeeds: jest.fn(() => Promise.resolve()),
}));

const updateAll = jest.mocked(updateAllAttentionFeeds);

/** The native methods React Native's Jest preset gives every View (`measureInWindow` measures nothing). */
const mockNativeMethods = jest.requireActual<{ default: { measureInWindow: jest.Mock } }>(
  '@react-native/jest-preset/jest/MockNativeMethods',
).default;

const MACHINE: MachineRecord = {
  id: 'm1',
  name: 'Mac mini',
  host: 'mac-mini.local',
  username: 'owner',
  port: 22,
  savePassword: false,
  lastConnectedAt: null,
};

function feedRow(id: string, read: boolean): FeedRow {
  return {
    id,
    projectId: 'p1',
    sessionId: `s-${id}`,
    kind: 'finished',
    title: 'Session',
    subtitle: 'ghostex-mobile',
    agentName: 'codex',
    createdAt: '2026-10-29T10:00:00.000Z',
    read,
  };
}

/** The native stack's header as far as this screen uses it: the button it sets as `headerRight`. */
function Navigator() {
  const [headerRight, setHeaderRight] = useState<(() => ReactNode) | null>(null);
  const navigation = useMemo(
    () => ({
      setOptions: (options: { headerRight?: () => ReactNode }) => {
        if (options.headerRight !== undefined) setHeaderRight(() => options.headerRight ?? null);
      },
      navigate: () => undefined,
    }),
    [],
  );
  return (
    <>
      <View testID="header">{headerRight?.()}</View>
      <AttentionListScreen
        // The cast holds for what the screen calls on its navigation: `setOptions` and `navigate`, both above.
        navigation={navigation as unknown as Parameters<typeof AttentionListScreen>[0]['navigation']}
        route={{ key: 'attention', name: 'AttentionList', params: undefined }}
      />
    </>
  );
}

async function openMenu() {
  await fireEvent.press(within(screen.getByTestId('header')).getByRole('button', { name: 'Notifications' }));
}

/** A menu command: a button on iOS (React Native's `menuitem` has no role there; `ContextMenu.tsx`). */
const item = (name: string) => screen.getByRole('button', { name });

/** Ancestors iOS reads as one accessibility element together with `node` (React Native's `accessible`). */
function groupingAncestors(node: TestInstance) {
  const grouping: string[] = [];
  for (let parent = node.parent; parent !== null; parent = parent.parent) {
    if (parent.props.accessible === true) grouping.push(String(parent.props.accessibilityLabel ?? parent.type));
  }
  return grouping;
}

beforeEach(() => {
  updateAll.mockClear();
  // The "…" button in the header of an iPhone 17 (402 pt wide), measured for the menu it opens.
  mockNativeMethods.measureInWindow.mockImplementation(
    (onFrame: (x: number, y: number, width: number, height: number) => void) => onFrame(350, 62, 36, 36),
  );
  useMachinesStore.setState({ machines: [MACHINE] });
  useAttentionFeedStore.setState({
    feeds: { m1: { status: 'ready', rows: [feedRow('n1', false), feedRow('n2', true)] } },
    permission: 'granted',
  });
});

afterEach(() => {
  mockNativeMethods.measureInWindow.mockReset();
});

test('the "…" menu offers Mark All Read and Clear All; Mark All Read marks every row read on the computer', async () => {
  await render(<Navigator />);
  await openMenu();
  expect(screen.getByText('Shared with the bell on your computer')).toBeTruthy();
  expect(item('Mark All Read').props.accessibilityState).toMatchObject({ disabled: false });
  expect(item('Clear All').props.accessibilityState).toMatchObject({ disabled: false });

  await fireEvent.press(item('Mark All Read'));
  expect(updateAll.mock.calls).toEqual([['markAllRead']]);
  expect(screen.queryByRole('button', { name: 'Close menu' })).toBeNull();
});

test('Mark All Read and Clear All are separate accessibility elements with their state; Close menu closes', async () => {
  useAttentionFeedStore.setState({ feeds: { m1: { status: 'ready', rows: [feedRow('n2', true)] } } });
  await render(<Navigator />);
  await openMenu();
  expect(item('Mark All Read').props.accessibilityRole).toBe('button');
  expect(item('Mark All Read').props.accessibilityState).toEqual({ disabled: true, selected: false });
  expect(item('Clear All').props.accessibilityState).toEqual({ disabled: false, selected: false });
  expect(groupingAncestors(item('Mark All Read'))).toEqual([]);
  expect(groupingAncestors(item('Clear All'))).toEqual([]);

  const close = screen.getByRole('button', { name: 'Close menu' });
  expect(groupingAncestors(close)).toEqual([]);
  await fireEvent.press(close);
  expect(screen.queryByRole('button', { name: 'Close menu' })).toBeNull();
  expect(updateAll).not.toHaveBeenCalled();
});

test('Clear All asks first; Cancel keeps the rows, Clear All clears them on the computer', async () => {
  await render(<Navigator />);
  await openMenu();
  await fireEvent.press(item('Clear All'));

  // Nothing is cleared yet: the sheet asks and says the rows also leave the computer's bell.
  expect(updateAll).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Close menu' })).toBeNull();
  expect(screen.getByRole('header', { name: 'Clear all notifications?' })).toBeTruthy();
  expect(
    screen.getByText('They also disappear from the bell on your computer. Your sessions stay as they are.'),
  ).toBeTruthy();

  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(updateAll).not.toHaveBeenCalled();
  expect(screen.queryByRole('header', { name: 'Clear all notifications?' })).toBeNull();

  await openMenu();
  await fireEvent.press(item('Clear All'));
  await fireEvent.press(screen.getByRole('button', { name: 'Clear All' }));
  expect(updateAll.mock.calls).toEqual([['clearAll']]);
  expect(screen.queryByRole('header', { name: 'Clear all notifications?' })).toBeNull();
});

test.each([
  { name: 'nothing unread', rows: [feedRow('n2', true)], markAllRead: true, clearAll: false },
  { name: 'no rows', rows: [], markAllRead: true, clearAll: true },
])('with $name, Mark All Read off: $markAllRead, Clear All off: $clearAll', async (state) => {
  useAttentionFeedStore.setState({ feeds: { m1: { status: 'ready', rows: state.rows } } });
  await render(<Navigator />);
  await openMenu();
  expect(item('Mark All Read').props.accessibilityState).toMatchObject({ disabled: state.markAllRead });
  expect(item('Clear All').props.accessibilityState).toMatchObject({ disabled: state.clearAll });
});

test('on a regular iPhone the menu stands under its "…", at the window\'s trailing edge', async () => {
  // An iPhone 17 window (402x874), the header placed on top (no status band, no side bar). Test-only: the
  // window React Native reports, read by the menu through `useWindowDimensions`.
  await act(() => {
    Dimensions.set({
      window: { width: 402, height: 874, scale: 3, fontScale: 1 },
      screen: { width: 402, height: 874, scale: 3, fontScale: 1 },
    });
  });
  await render(<Navigator />);
  await openMenu();
  let card = item('Clear All').parent;
  while (card !== null && StyleSheet.flatten(card.props.style)?.maxHeight === undefined) card = card.parent;
  if (card === null) throw new Error('no menu card');
  // Shown once its height is known (the test renderer lays nothing out).
  await fireEvent(card, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 150 } } });
  card = item('Clear All').parent;
  while (card !== null && StyleSheet.flatten(card.props.style)?.maxHeight === undefined) card = card.parent;
  const style = StyleSheet.flatten(card?.props.style);
  // The "…" is measured at (350, 62), 36 pt: 8 pt under it; 320 pt wide, ending 8 pt from the window's edge.
  expect({
    position: style?.position,
    top: style?.top,
    left: style?.left,
    width: style?.width,
    opacity: style?.opacity,
  }).toEqual({
    position: 'absolute',
    top: 62 + 36 + 8,
    left: 402 - 8 - 320,
    width: 320,
    opacity: 1,
  });
});

/** WCAG contrast of two opaque RGB colours. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r = 0, g = 0, blue = 0] = [1, 3, 5]
      .map((at) => parseInt(hex.slice(at, at + 2), 16) / 255)
      .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * blue;
  };
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** A translucent button fill composited over the sheet it actually stands on. */
function over(fill: string, base: string): string {
  if (fill.startsWith('#')) return fill;
  const channels = fill.match(/[0-9.]+/g)?.map(Number);
  if (channels?.length !== 4) throw new Error(`Unsupported fill ${fill}`);
  const [r = 0, g = 0, b = 0, alpha = 0] = channels;
  return `#${[r, g, b]
    .map((channel, at) => Math.round(parseInt(base.slice(1 + 2 * at, 3 + 2 * at), 16) * (1 - alpha) + channel * alpha))
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}

describe('colour readability on the model surfaces', () => {
  const initialSettings = useSettingsStore.getState().settings;
  afterEach(async () => {
    await act(() => useSettingsStore.setState({ settings: initialSettings }));
  });

  test.each(['mocha', ...THEME_PRESETS.filter((preset) => preset.mode === 'light').map((preset) => preset.id)])(
    '%s: title, explanation, Cancel and destructive Clear All read on the actual sheet',
    async (preset) => {
      const patch = themePresetPatch(preset, false);
      if (patch === undefined) throw new Error(`Unknown preset ${preset}`);
      useSettingsStore.getState().patchSettings(patch);
      await render(<Navigator />);
      await openMenu();
      await fireEvent.press(item('Clear All'));
      const flat = (node: TestInstance) => StyleSheet.flatten(node.props.style) ?? {};
      const panel = String(flat(screen.getByTestId('sheet-panel')).backgroundColor);
      for (const text of [
        screen.getByRole('header', { name: 'Clear all notifications?' }),
        screen.getByText('They also disappear from the bell on your computer. Your sessions stay as they are.'),
      ]) {
        expect(contrast(String(flat(text).color), panel)).toBeGreaterThanOrEqual(4.5);
      }
      const light = THEME_PRESETS.find((entry) => entry.id === preset)?.mode === 'light';
      for (const [name, fills] of [
        ['Cancel', neutralButtonFills(light)],
        ['Clear All', destructiveButtonFills(GhostexPalette.DANGER, light)],
      ] as const) {
        const button = screen.getByRole('button', { name });
        expect(flat(button).backgroundColor).toBe(fills.rest);
        const ink = String(flat(within(button).getByText(name)).color);
        for (const fill of [fills.rest, fills.pressed]) {
          expect(contrast(ink, over(fill, panel))).toBeGreaterThanOrEqual(4.5);
        }
      }
      // Cancelling and clearing remain exercised by the original confirmation test above.
      expect(updateAll).not.toHaveBeenCalled();
    },
  );

  test.each(THEME_PRESETS.map((preset) => [preset.id, preset.mode] as const))(
    '%s (%s): the line for a change the computer did not take keeps 4.5:1 on the page',
    async (preset) => {
      const patch = themePresetPatch(preset, false);
      if (patch === undefined) throw new Error(`Unknown preset ${preset}`);
      useSettingsStore.getState().patchSettings(patch);
      updateAll.mockResolvedValueOnce(false);
      await render(<Navigator />);
      await openMenu();
      await fireEvent.press(item('Mark All Read'));
      await act(async () => undefined);
      const line = screen.getByText(NotificationsCopy.actionFailed);
      let page = line.parent;
      while (page !== null && !String(StyleSheet.flatten(page.props.style)?.backgroundColor ?? '').startsWith('#')) {
        page = page.parent;
      }
      if (page === null) throw new Error('No painted page under the failure line');
      const surface = String(StyleSheet.flatten(page.props.style).backgroundColor);
      expect(contrast(String(StyleSheet.flatten(line.props.style).color), surface)).toBeGreaterThanOrEqual(4.5);
    },
  );
});
