/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. Removing a computer from the Machines list (swipe → Remove → confirm): once the
 * first notification ask was answered, the app first asks the computer over its warm link to remove this phone's
 * push token, while the computer's saved record and link still exist, and only then closes its connection and
 * removes it; a computer that does not answer is removed after the bounded wait. The confirm text says so only when
 * the removal asks the computer, also when the first ask's answer arrives while the confirm is open. The real
 * screen, cards, machines and settings stores, first ask and push wiring
 * (`pushStore.ts`); mocked are the boundaries only: the swipe gesture (a stand-in row that shows its actions, as
 * after a swipe), the native module (the connection that is closed), each computer's gxserver behind the warm link
 * (a fake that records every request and whether the computer's record still existed then), expo-notifications,
 * expo-task-manager, storage, the safe area, the app log and the focus effect.
 */

import type * as ReactModule from 'react';
import type { ReactNode } from 'react';
import type * as ReactNativeModule from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { useMachinesStore, type MachineRecord } from '../machines/store';
import { runFirstAsk } from '../notifications/firstAsk';
import { REMOVAL_WAIT_MS } from '../notifications/pushToken';
import type { NotificationSettings } from '../notifications/settings';
import { defaultSettings, useSettingsStore } from '../settings/store';
import MachinesScreen from './MachinesScreen';

/** In order: each request to a computer's gxserver and each closed connection. */
const mockEvents: string[] = [];
/** While set, the warm link's route lookup waits for it (a computer that does not answer). */
const mockLink: { routeGate: Promise<void> | null } = { routeGate: null };

jest.mock('../../modules/ghostex-native/src', () => ({
  GhostexNative: {
    addListener: () => ({ remove: () => undefined }),
    disconnect: async (machineId: string) => {
      mockEvents.push(`disconnect ${machineId}`);
    },
  },
}));
jest.mock('../chat/rust/machine-link', () => ({
  chatMachineLink: (machine: { id: string }) => ({
    route: async () => {
      if (mockLink.routeGate !== null) await mockLink.routeGate;
      return 'socket';
    },
    rpc: async (method: string, params: { action?: string }) => {
      const { useMachinesStore: machines } = jest.requireActual<{ useMachinesStore: typeof useMachinesStore }>(
        '../machines/store',
      );
      const saved = machines.getState().machines.some((entry) => entry.id === machine.id);
      mockEvents.push(`${method} ${params.action ?? ''} ${machine.id} (${saved ? 'record saved' : 'record gone'})`);
      return { result: {}, error: null };
    },
  }),
}));
jest.mock('expo-notifications', () => ({}));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return { SafeAreaView: MockView, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: () => undefined,
}));
/** The stand-in swipe row's props: its actions and its card. */
type MockRowProps = { actions: ReactNode; children: ReactNode };
jest.mock('./machines-screen/SwipeRevealRow', () => {
  const { forwardRef, useImperativeHandle } = jest.requireActual<typeof ReactModule>('react');
  const { View: MockView } = jest.requireActual<typeof ReactNativeModule>('react-native');
  const Row = forwardRef<{ close: () => void }, MockRowProps>(function Row({ actions, children }, ref) {
    useImperativeHandle(ref, () => ({ close: () => undefined }), []);
    return (
      <MockView>
        {children}
        {actions}
      </MockView>
    );
  });
  return { __esModule: true, default: Row, SWIPE_REVEAL_WIDTH: 176 };
});
jest.mock('../app/appLog', () => ({ logAppEvent: jest.fn() }));

const MACHINE: MachineRecord = {
  id: 'm1',
  name: 'Mac mini',
  host: 'mac-mini.local',
  username: 'owner',
  port: 22,
  savePassword: false,
  lastConnectedAt: null,
};

const ANSWERED: NotificationSettings = {
  enabled: true,
  finished: true,
  waiting: true,
  error: true,
  askedAt: new Date(0).toISOString(),
};
const NOT_ASKED: NotificationSettings = { enabled: false, finished: false, waiting: false, error: false };

function renderScreen(notifications: NotificationSettings) {
  useMachinesStore.setState({ hydrated: true, machines: [MACHINE], selectedMachineId: 'm1' });
  useSettingsStore.setState({ hydrated: true, settings: { ...defaultSettings(), notifications } });
  // The cast holds for what the screen calls on its navigation and route: nothing on the paths tested here.
  const props = { navigation: { navigate: () => undefined }, route: { key: 'machines', name: 'Machines' } };
  return render(<MachinesScreen {...(props as unknown as Parameters<typeof MachinesScreen>[0])} />);
}

/** Swipe → Remove: the confirm dialog opens; its own Remove is the last one on screen. */
async function openRemove() {
  await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));
}

async function confirmRemove() {
  const buttons = screen.getAllByRole('button', { name: 'Remove' });
  await fireEvent.press(buttons[buttons.length - 1]!);
}

beforeEach(() => {
  mockEvents.length = 0;
  mockLink.routeGate = null;
});

test('the computer is asked once to remove the push token while its record still exists, then disconnected and removed', async () => {
  await renderScreen(ANSWERED);
  await openRemove();
  expect(
    screen.getByText(
      'Mac mini is removed from this phone, along with its saved password and pairing key. If Mac mini can be reached, it also stops sending push notifications. Nothing else changes on the computer.',
    ),
  ).toBeTruthy();
  await confirmRemove();
  await waitFor(() => expect(useMachinesStore.getState().machines).toEqual([]));
  expect(mockEvents).toEqual(['registerPushToken unregister m1 (record saved)', 'disconnect m1']);
});

test('before the first notification ask was answered nothing is asked, and the text says nothing changes on the computer', async () => {
  await renderScreen(NOT_ASKED);
  await openRemove();
  expect(
    screen.getByText(
      'Mac mini is removed from this phone, along with its saved password and pairing key. Nothing changes on the computer.',
    ),
  ).toBeTruthy();
  await confirmRemove();
  await waitFor(() => expect(useMachinesStore.getState().machines).toEqual([]));
  expect(mockEvents).toEqual(['disconnect m1']);
});

test('the open confirm says what removing does once the first ask is answered, and removing then asks the computer', async () => {
  await renderScreen(NOT_ASKED);
  await openRemove();
  const before =
    'Mac mini is removed from this phone, along with its saved password and pairing key. Nothing changes on the computer.';
  expect(screen.getByText(before)).toBeTruthy();
  await act(async () => {
    await runFirstAsk(
      { current: async () => 'denied', request: async () => 'denied' },
      {
        get: () => useSettingsStore.getState().settings.notifications,
        set: (next) => useSettingsStore.getState().setSetting('notifications', next),
      },
      () => new Date(0),
    );
  });
  expect(
    screen.getByText(
      'Mac mini is removed from this phone, along with its saved password and pairing key. If Mac mini can be reached, it also stops sending push notifications. Nothing else changes on the computer.',
    ),
  ).toBeTruthy();
  expect(screen.queryByText(before)).toBeNull();
  await confirmRemove();
  await waitFor(() => expect(useMachinesStore.getState().machines).toEqual([]));
  expect(mockEvents).toEqual(['registerPushToken unregister m1 (record saved)', 'disconnect m1']);
});

test('a computer that does not answer is removed after the bounded wait, without its removal going out later', async () => {
  const route = Promise.withResolvers<void>();
  mockLink.routeGate = route.promise;
  await renderScreen(ANSWERED);
  await openRemove();
  await confirmRemove();
  expect(useMachinesStore.getState().machines).toEqual([MACHINE]);
  await waitFor(() => expect(useMachinesStore.getState().machines).toEqual([]), {
    timeout: REMOVAL_WAIT_MS + 1_000,
  });
  mockLink.routeGate = null;
  route.resolve();
  await waitFor(() => expect(mockEvents).toEqual(['disconnect m1']));
});
