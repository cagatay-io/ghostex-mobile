/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. A Live Activity for an agent that a background run for a push read while no activity
 * was on screen: ActivityKit starts an activity only for an app in front, so the run asks for none, and once the
 * person brings the app to front it starts for that same working stint. Real: the background task `pushStore.ts`
 * defines, the stores, the inventory client and summary parser, `liveActivity.ts` with its controller, and the app
 * lifecycle with its summary refresh. Fakes only at the boundaries: the task registry (to get the task), AppState
 * (driven here), SSH, the widgets' native module and ActivityKit, which, like iOS, refuses a start while the app is
 * not active.
 */

import { AppState, type AppStateStatus } from 'react-native';
import * as TaskManager from 'expo-task-manager';

import { GhostexLiveActivity } from '../../modules/ghostex-live-activity/src/GhostexLiveActivity';
import { initAppLifecycle } from '../app/lifecycle';
import { useMachinesStore, type MachineRecord } from '../machines/store';
import { useSettingsStore } from '../settings/store';
import './pushStore';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../../modules/ghostex-native/src', () => ({
  GhostexNative: { addListener: () => ({ remove: () => undefined }) },
}));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('expo-notifications', () => ({ BackgroundNotificationTaskResult: { NewData: 0, NoData: 1, Failed: 2 } }));
jest.mock('../app/deepLinks', () => ({ openDeepLink: jest.fn(), personNavigations: () => 0 }));
// Foreground recovery of terminals and connections is not part of this path.
jest.mock('../app/autoReconnect', () => ({ recoverConnections: () => undefined }));
// The SSH boundary: connected at once; the session list command answers with `mockWire`, anything else with nothing.
let mockWire: object = { sessions: [] };
jest.mock('../remote/connection', () => ({
  ensureConnected: () => Promise.resolve(),
  reconnectMachine: () => Promise.resolve(),
  cancelConnectionAttempt: () => undefined,
}));
jest.mock('../remote/commands', () => {
  const list = jest.requireActual('../commands/ghostexCli').sessionsListCommand();
  return {
    execRemoteCommand: jest.fn((_machineId: string, command: string) =>
      Promise.resolve({ stdout: command === list ? JSON.stringify(mockWire) : '', stderr: '', exitCode: 0 }),
    ),
  };
});
// iOS's app state, which ActivityKit and the app read alike.
let mockAppState: AppStateStatus = 'background';
// ActivityKit: no activity on screen; a start is refused unless the app is active, as iOS refuses one.
let mockOnScreen = false;
jest.mock('../../modules/ghostex-live-activity/src/GhostexLiveActivity', () => ({
  GhostexLiveActivity: {
    hasActivity: jest.fn(() => mockOnScreen),
    start: jest.fn(() => {
      if (mockAppState !== 'active') return Promise.reject(new Error('iOS did not start the Live Activity'));
      mockOnScreen = true;
      return Promise.resolve();
    }),
    update: jest.fn(() => Promise.resolve()),
    end: jest.fn(() => {
      mockOnScreen = false;
      return Promise.resolve();
    }),
  },
}));
jest.mock('../../modules/ghostex-widgets/src/GhostexWidgets', () => ({
  GhostexWidgets: {
    writeSnapshot: jest.fn(() => Promise.resolve()),
    removeSnapshot: jest.fn(() => Promise.resolve()),
    reloadTimelines: jest.fn(),
  },
}));

const T0 = Date.parse('2026-11-03T09:00:00Z');
const MACHINE: MachineRecord = {
  id: 'foreground-mac',
  name: 'Foreground Mac',
  host: 'foreground.invalid',
  username: 'me',
  port: 22,
  savePassword: false,
  lastConnectedAt: null,
};
const PUSH = {
  data: { aps: { 'content-available': 1 }, data: { body: {} } },
  executionInfo: { appState: 'background' },
};

const native = jest.mocked(GhostexLiveActivity!);
const appStateListeners: Array<(state: AppStateStatus) => void> = [];

/** The task as iOS runs it for `PUSH`. */
function runTask(): Promise<unknown> {
  const calls = jest.mocked(TaskManager.defineTask).mock.calls;
  expect(calls).toHaveLength(1);
  return calls[0][1](PUSH as never);
}

beforeAll(() => {
  jest.useFakeTimers({ now: T0, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  Object.defineProperty(AppState, 'currentState', { get: () => mockAppState, configurable: true });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListeners.push(listener as (state: AppStateStatus) => void);
    return { remove: () => undefined };
  });
  useMachinesStore.setState({ machines: [MACHINE], selectedMachineId: MACHINE.id, hydrated: true });
  useSettingsStore.setState({ hydrated: true });
});

afterAll(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

test('an agent a background push read: no start in the background; in front the same working stint starts it', async () => {
  mockWire = {
    ok: true,
    capabilities: { workingStartedAt: true, attentionKind: true },
    sessions: [
      {
        sessionId: 's1',
        projectId: 'p1',
        projectName: 'p',
        provider: 'zmx',
        agent: 'claude',
        activity: 'working',
        workingStartedAt: new Date(T0 - 60_000).toISOString(),
      },
    ],
  };

  // A launch in the background for the push: no screen is mounted, the task refreshes and brings the activity in line.
  expect(await runTask()).toBe(0);
  expect(native.start).not.toHaveBeenCalled();
  expect(mockOnScreen).toBe(false);

  // The person opens the app: iOS makes it active and App installs the lifecycle, whose refresh reads the same stint.
  mockAppState = 'active';
  for (const listener of appStateListeners) listener('active');
  initAppLifecycle();
  await jest.advanceTimersByTimeAsync(0);

  expect(native.start).toHaveBeenCalledTimes(1);
  expect(mockOnScreen).toBe(true);
  expect(JSON.parse(String(native.start.mock.calls[0]?.[0]))).toMatchObject({ counts: { working: 1, waiting: 0 } });
});
