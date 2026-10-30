/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. The Live Activity as the app wires it, end to end on the phone: the real app
 * lifecycle (`initAppLifecycle`, AppState) runs the real summary refresh, the real inventory store reads the
 * summary through the real inventory client, and the real `initLiveActivity` turns the stores into calls on
 * the native module. Fakes only at the boundaries: the SSH exec answers with a summary in the CLI's wire form,
 * the native module is a fake ActivityKit that the user can "remove" the activity from, and the clock is Jest's.
 *
 * REQ-LIVEACT-010 AC1/AC2 through the app's wiring (a refresh every 5 seconds reaches the activity; in the
 * background no refresh runs and the store's polling flag is off) and REQ-LIVEACT-004 AC1 (an agent starting to
 * work starts exactly one activity; after the user removed it, the same session's next working stint starts a
 * new one). A finished row stays after the computer stops sending its attention, until 2 minutes after the finish.
 */

import { AppState, type AppStateStatus } from 'react-native';

import { GhostexLiveActivity } from '../../modules/ghostex-live-activity/src/GhostexLiveActivity';
import { initAppLifecycle } from '../app/lifecycle';
import { useInventoryStore } from '../inventory/store';
import { useMachinesStore, type MachineRecord } from '../machines/store';
import { execRemoteCommand } from '../remote/commands';
import { useSettingsStore } from '../settings/store';
import { initLiveActivity } from './liveActivity';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../../modules/ghostex-native/src', () => ({
  GhostexNative: { addListener: () => ({ remove: () => undefined }) },
}));
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
// ActivityKit: one activity that the app starts and ends, and that the user can remove from the Lock Screen.
let mockOnScreen = false;
jest.mock('../../modules/ghostex-live-activity/src/GhostexLiveActivity', () => ({
  GhostexLiveActivity: {
    hasActivity: jest.fn(() => mockOnScreen),
    start: jest.fn(() => {
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

const T0 = Date.parse('2026-10-29T20:00:00Z');
const MACHINE: MachineRecord = {
  id: 'wiring-mac',
  name: 'Wiring Mac',
  host: 'wiring.invalid',
  username: 'me',
  port: 22,
  savePassword: false,
  lastConnectedAt: null,
};

const session = (sessionId: string, fields: object) => ({
  sessionId,
  provider: 'zmx',
  agent: 'claude',
  projectName: 'p',
  ...fields,
});
const working = (sessionId: string, since: number) =>
  session(sessionId, { activity: 'working', workingStartedAt: new Date(since).toISOString() });
const waiting = (sessionId: string, since: number) =>
  session(sessionId, {
    activity: 'attention',
    attention: { enteredAt: new Date(since).toISOString(), kind: 'needsInput' },
  });

const finished = (sessionId: string, at: number, workedSince: number) =>
  session(sessionId, {
    activity: 'attention',
    attention: {
      enteredAt: new Date(at).toISOString(),
      kind: 'finished',
      workingStartedAt: new Date(workedSince).toISOString(),
    },
  });

const native = jest.mocked(GhostexLiveActivity!);
const listCalls = () =>
  jest
    .mocked(execRemoteCommand)
    .mock.calls.filter(([, command]) => command === 'ghostex sessions --json --mobile-summary').length;
const sentState = (call: unknown[] | undefined) =>
  JSON.parse(String(call?.[0])) as { counts: object; agents: { target: { sessionId: string }; state: string }[] };
const lastRows = () =>
  sentState(native.update.mock.calls.at(-1)).agents.map((row) => [row.target.sessionId, row.state]);

let appState: AppStateStatus = 'active';
const appStateListeners: Array<(state: AppStateStatus) => void> = [];
function moveApp(next: AppStateStatus): void {
  appState = next;
  for (const listener of appStateListeners) listener(next);
}

beforeAll(() => {
  jest.useFakeTimers({ now: T0 });
  Object.defineProperty(AppState, 'currentState', { get: () => appState, configurable: true });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListeners.push(listener as (state: AppStateStatus) => void);
    return { remove: () => undefined };
  });
});

afterAll(() => {
  jest.useRealTimers();
});

test('REQ-LIVEACT-010 AC1/AC2 and REQ-LIVEACT-004 AC1 through the app wiring: refresh → activity, background stops, next stint restarts', async () => {
  useMachinesStore.setState({ machines: [MACHINE], selectedMachineId: MACHINE.id, hydrated: true });
  useSettingsStore.setState({ hydrated: true });
  mockWire = { sessions: [working('s1', T0 - 60_000)] };

  // App start, as App.tsx installs them.
  initAppLifecycle();
  initLiveActivity();
  await jest.advanceTimersByTimeAsync(0);

  // REQ-LIVEACT-004 AC1: the first refresh shows an agent working, so exactly one activity starts with its row.
  expect(listCalls()).toBe(1);
  expect(useInventoryStore.getState().polling).toBe(true);
  expect(native.start).toHaveBeenCalledTimes(1);
  expect(sentState(native.start.mock.calls[0]).agents.map((row) => row.target.sessionId)).toEqual(['s1']);

  // REQ-LIVEACT-010 AC1: every 5 seconds the refresh runs and its change reaches the activity.
  mockWire = { sessions: [working('s1', T0 - 60_000), waiting('s2', T0 + 2_000)] };
  await jest.advanceTimersByTimeAsync(5_000);
  expect(listCalls()).toBe(2);
  expect(native.update).toHaveBeenCalledTimes(1);
  expect(sentState(native.update.mock.calls[0]).counts).toEqual({ working: 1, waiting: 1 });
  expect(native.start).toHaveBeenCalledTimes(1);

  // REQ-LIVEACT-010 AC2: in the background no refresh runs, and the store's poll flag is off.
  moveApp('background');
  await jest.advanceTimersByTimeAsync(10_000);
  expect(listCalls()).toBe(2);
  expect(useInventoryStore.getState().polling).toBe(false);

  // Back in front the refresh runs at once again. The user removes the activity; the same stint does not
  // bring it back.
  moveApp('active');
  await jest.advanceTimersByTimeAsync(0);
  expect(listCalls()).toBe(3);
  mockOnScreen = false;
  await jest.advanceTimersByTimeAsync(5_000);
  expect(listCalls()).toBe(4);
  expect(native.start).toHaveBeenCalledTimes(1);

  // REQ-LIVEACT-004 AC1: the same session starts its next working stint (a new workingStartedAt): a new activity.
  mockWire = { sessions: [working('s1', T0 + 30_000), waiting('s2', T0 + 2_000)] };
  await jest.advanceTimersByTimeAsync(5_000);
  expect(native.start).toHaveBeenCalledTimes(2);
});

// Continues the app run of the test above (the activity runs, the clock stands at T0 + 25 s).
test('through the app wiring a finished row stays after the computer stops sending its attention, until 2 minutes after the finish', async () => {
  mockWire = {
    sessions: [working('s1', T0 + 30_000), waiting('s2', T0 + 2_000), finished('s3', T0 + 24_000, T0 + 10_000)],
  };
  await jest.advanceTimersByTimeAsync(5_000);
  expect(lastRows()).toContainEqual(['s3', 'finished']);

  // The finish was acknowledged on another device: the computer no longer sends the session's attention.
  mockWire = { sessions: [working('s1', T0 + 30_000), waiting('s2', T0 + 2_000), session('s3', { activity: 'idle' })] };
  await jest.advanceTimersByTimeAsync(5_000);
  expect(lastRows()).toContainEqual(['s3', 'finished']);

  await jest.advanceTimersByTimeAsync(120_000);
  expect(lastRows()).not.toContainEqual(['s3', 'finished']);
});
