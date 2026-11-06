/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. Settings > Notifications (a master switch and one each for finished, waiting and
 * error; with the permission denied the page says notifications are blocked in iOS Settings) with the
 * the notifications design: its master-off state (the three stay visible with their
 * values, dimmed and not operable, while the master is off) and state settings-denied (the "Blocked in iOS
 * Settings" card with "Open iOS Settings"). The real page, settings store and attention store; mocked are
 * the boundaries only: navigation, the safe area, storage, the native module and expo-notifications.
 */

import { Linking, StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import { useMachinesStore, type MachineRecord } from '../../machines/store';
import { useAttentionFeedStore } from '../../notifications/feedStore';
import type { NotificationSettings } from '../../notifications/settings';
import { useSettingsStore } from '../../settings/store';
import NotificationsPage from './NotificationsPage';

jest.mock('../../../modules/ghostex-native/src', () => ({ GhostexNative: {} }));
jest.mock('expo-notifications', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
// The page reads the iOS permission when it comes into view; the tests set it in the store instead.
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ setOptions: () => undefined }),
  useFocusEffect: () => undefined,
  useIsFocused: () => true,
}));

const KINDS = ['Finished', 'Waiting for you', 'Ended with an error'];
const ASKED = '2026-10-29T09:00:00.000Z';

function seed(notifications: NotificationSettings, permission: 'granted' | 'denied' | 'undetermined') {
  useSettingsStore.setState((state) => ({ settings: { ...state.settings, notifications } }));
  useAttentionFeedStore.setState({ permission });
}

/** The switch a screen reader names: the whole row, which reports the switch's value and whether it is operable. */
const switchFor = (name: string) => screen.getByRole('switch', { name });
const valueOf = (name: string) => switchFor(name).props.accessibilityState?.checked;
const disabledOf = (name: string) => switchFor(name).props.accessibilityState?.disabled;

/** The row the switch stands in (the dimmed container). */
function rowOpacity(name: string): number | undefined {
  let node: TestInstance | null = switchFor(name);
  while (node !== null && StyleSheet.flatten(node.props.style)?.flexDirection !== 'row') node = node.parent;
  return StyleSheet.flatten(node?.props.style)?.opacity;
}

test('the page has the master switch and one switch each for finished, waiting and error', async () => {
  seed({ enabled: true, finished: true, waiting: true, error: true, askedAt: ASKED }, 'granted');
  await render(<NotificationsPage />);
  for (const name of ['Notifications', ...KINDS]) {
    expect(valueOf(name)).toBe(true);
    expect(disabledOf(name)).toBeFalsy();
    expect(rowOpacity(name)).toBeUndefined();
  }
  expect(screen.queryByText('Blocked in iOS Settings')).toBeNull();
});

test('with the master off the three keep their values, dimmed and not operable', async () => {
  seed({ enabled: true, finished: true, waiting: false, error: true, askedAt: ASKED }, 'granted');
  await render(<NotificationsPage />);
  await fireEvent(switchFor('Notifications'), 'valueChange', false);

  expect(useSettingsStore.getState().settings.notifications).toEqual({
    enabled: false,
    finished: true,
    waiting: false,
    error: true,
    askedAt: ASKED,
  });
  expect(valueOf('Notifications')).toBe(false);
  expect(disabledOf('Notifications')).toBeFalsy();
  expect(KINDS.map(valueOf)).toEqual([true, false, true]);
  for (const name of KINDS) {
    expect(disabledOf(name)).toBe(true);
    expect(rowOpacity(name)).toBe(0.5);
  }

  // Back on: the three are operable again with the values they kept.
  await fireEvent(switchFor('Notifications'), 'valueChange', true);
  for (const name of KINDS) {
    expect(disabledOf(name)).toBe(false);
    expect(rowOpacity(name)).toBeUndefined();
  }
  expect(KINDS.map(valueOf)).toEqual([true, false, true]);
});

test('a denied permission shows the blocked card that opens iOS Settings', async () => {
  const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
  seed({ enabled: false, finished: false, waiting: false, error: false, askedAt: ASKED }, 'denied');
  await render(<NotificationsPage />);
  expect(screen.getByText('Blocked in iOS Settings')).toBeTruthy();
  expect(screen.getByText(/iOS doesn’t allow Ghostex to notify you/)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Open iOS Settings' }));
  expect(openSettings).toHaveBeenCalledTimes(1);
  // The switches stay on the page under the card.
  for (const name of ['Notifications', ...KINDS]) expect(valueOf(name)).toBe(false);
  openSettings.mockRestore();
});

test.each(['granted', 'undetermined'] as const)('no blocked card while the permission is %s', async (permission) => {
  seed({ enabled: true, finished: true, waiting: true, error: true, askedAt: ASKED }, permission);
  await render(<NotificationsPage />);
  expect(screen.queryByText('Blocked in iOS Settings')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Open iOS Settings' })).toBeNull();
});

describe('the delivery text', () => {
  const ON: NotificationSettings = { enabled: true, finished: true, waiting: true, error: true, askedAt: ASKED };
  const computer = (id: string, disabled = false): MachineRecord => ({
    id,
    name: id,
    host: `${id}.local`,
    username: 'owner',
    port: 22,
    savePassword: false,
    lastConnectedAt: null,
    ...(disabled ? { disabled: true } : {}),
  });
  const RUNNING_ONLY = /nothing arrives until you open Ghostex again/;

  test('with an enabled computer that took the push registration, it says that computer can also notify while Ghostex is closed, promising nothing', async () => {
    seed(ON, 'granted');
    useMachinesStore.setState({ machines: [computer('m1')] });
    useAttentionFeedStore.setState({ pushComputers: ['m1'] });
    await render(<NotificationsPage />);
    expect(screen.getByText(/can also notify you while Ghostex is closed/)).toBeTruthy();
    expect(screen.getByText(/iOS decides when a push arrives, and one can come late or not at all/)).toBeTruthy();
    expect(screen.queryByText(RUNNING_ONLY)).toBeNull();
    // The three switches reach the computers; a change one does not get yet waits for its next registration.
    expect(screen.getByText(/Finished, Waiting for you and Ended with an error also apply to pushes/)).toBeTruthy();
    expect(screen.getByText(/keeps the earlier choice until it next accepts this iPhone/)).toBeTruthy();
    expect(screen.queryByText(/apply only while Ghostex is running/)).toBeNull();
  });

  test('without one, it keeps the text for a running app', async () => {
    seed(ON, 'granted');
    useMachinesStore.setState({ machines: [computer('m1')] });
    useAttentionFeedStore.setState({ pushComputers: [] });
    await render(<NotificationsPage />);
    expect(screen.getByText(RUNNING_ONLY)).toBeTruthy();
    expect(screen.queryByText(/while Ghostex is closed/)).toBeNull();
  });

  test('a computer that took it but is hidden does not count', async () => {
    seed(ON, 'granted');
    useMachinesStore.setState({ machines: [computer('m1'), computer('m2', true)] });
    useAttentionFeedStore.setState({ pushComputers: ['m2'] });
    await render(<NotificationsPage />);
    expect(screen.getByText(RUNNING_ONLY)).toBeTruthy();
  });

  test('while the stored record that names those computers is still read, it does not say that nothing arrives', async () => {
    seed(ON, 'granted');
    useMachinesStore.setState({ machines: [computer('m1')] });
    useAttentionFeedStore.setState({ pushComputers: null });
    await render(<NotificationsPage />);
    expect(screen.queryByText(RUNNING_ONLY)).toBeNull();
    expect(screen.getByText(/iOS decides when a push arrives, and one can come late or not at all/)).toBeTruthy();
  });
});
