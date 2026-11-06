/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. A push with content-available for which iOS starts the app in the background:
 * the task `pushStore.ts` defines when it loads runs with no screen mounted, so `App` installs
 * nothing, and the task brings the Live Activity and the widgets in line with the session list it refreshed before
 * it completes; when it could read no computer's session list, it leaves them as they are. Real: the task, the
 * stores, the inventory client and summary parser, `liveActivity.ts` and `widgets.ts`. Fakes only at the boundaries:
 * the task registry (to get the task), SSH, ActivityKit and the widgets' native module. The tests run in order, the
 * first on a cold launch.
 */

import * as TaskManager from 'expo-task-manager';

import { GhostexLiveActivity } from '../../modules/ghostex-live-activity/src/GhostexLiveActivity';
import { GhostexWidgets } from '../../modules/ghostex-widgets/src/GhostexWidgets';
import { useInventoryStore } from '../inventory/store';
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
// The SSH boundary: connected at once; the session list command answers with `mockWire`, anything else with nothing,
// or every command fails while `mockUnreachable`.
let mockWire: object = { sessions: [] };
let mockUnreachable = false;
jest.mock('../remote/connection', () => ({
  ensureConnected: () => Promise.resolve(),
  reconnectMachine: () => Promise.resolve(),
  cancelConnectionAttempt: () => undefined,
}));
jest.mock('../remote/commands', () => {
  const list = jest.requireActual('../commands/ghostexCli').sessionsListCommand();
  return {
    execRemoteCommand: jest.fn((_machineId: string, command: string) =>
      mockUnreachable
        ? Promise.reject(new Error('connection unavailable'))
        : Promise.resolve({ stdout: command === list ? JSON.stringify(mockWire) : '', stderr: '', exitCode: 0 }),
    ),
  };
});
// ActivityKit: the activity an earlier run of the app started is still on the Lock Screen.
jest.mock('../../modules/ghostex-live-activity/src/GhostexLiveActivity', () => ({
  GhostexLiveActivity: {
    hasActivity: jest.fn(() => true),
    start: jest.fn(() => Promise.resolve()),
    update: jest.fn(() => Promise.resolve()),
    end: jest.fn(() => Promise.resolve()),
  },
}));
jest.mock('../../modules/ghostex-widgets/src/GhostexWidgets', () => ({
  GhostexWidgets: {
    writeSnapshot: jest.fn(() => Promise.resolve()),
    removeSnapshot: jest.fn(() => Promise.resolve()),
    reloadTimelines: jest.fn(),
  },
}));

const MACHINE: MachineRecord = {
  id: 'background-mac',
  name: 'Background Mac',
  host: 'background.invalid',
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
const widgets = jest.mocked(GhostexWidgets!);

/** The task as iOS runs it for `PUSH`. */
function runTask(): Promise<unknown> {
  const calls = jest.mocked(TaskManager.defineTask).mock.calls;
  expect(calls).toHaveLength(1);
  return calls[0][1](PUSH as never);
}

const wire = (fields: object) => ({
  ok: true,
  capabilities: { workingStartedAt: true, attentionKind: true },
  sessions: [{ sessionId: 's1', projectId: 'p1', projectName: 'p', provider: 'zmx', agent: 'claude', ...fields }],
});
/** The JSON a native call received (the activity's content state, the widget snapshot). */
const sentJson = (call: unknown[] | undefined): unknown => JSON.parse(String(call?.[0]));

beforeAll(() => {
  useMachinesStore.setState({ machines: [MACHINE], selectedMachineId: MACHINE.id, hydrated: true });
  useSettingsStore.setState({ hydrated: true });
});

test('a cold launch for a push that reads no session list: the Live Activity and the widgets stay as they are', async () => {
  mockUnreachable = true;

  expect(await runTask()).toBe(0);

  const inventory = useInventoryStore.getState().inventoriesByMachineId[MACHINE.id];
  expect(inventory?.summary).toBeNull();
  expect(inventory?.lastError).not.toBeNull();
  // Nothing read says that no agent works or waits: the activity of the earlier run keeps what it shows.
  expect(native.update).not.toHaveBeenCalled();
  expect(native.start).not.toHaveBeenCalled();
  expect(native.end).not.toHaveBeenCalled();
  expect(widgets.writeSnapshot).not.toHaveBeenCalled();
  expect(widgets.removeSnapshot).not.toHaveBeenCalled();
  expect(widgets.reloadTimelines).not.toHaveBeenCalled();
  mockUnreachable = false;
});

test('a cold launch for a push: the Live Activity and the widgets get the fresh list before the task completes', async () => {
  mockWire = wire({ activity: 'working', workingStartedAt: new Date(Date.now() - 60_000).toISOString() });

  expect(await runTask()).toBe(0);

  expect(useInventoryStore.getState().inventoriesByMachineId[MACHINE.id]?.summary?.sessions).toHaveLength(1);
  // The activity from the earlier run goes on with the fresh list: updated once, not ended, no second one.
  expect(native.update).toHaveBeenCalledTimes(1);
  expect(sentJson(native.update.mock.calls[0])).toMatchObject({ counts: { working: 1, waiting: 0 } });
  expect(native.start).not.toHaveBeenCalled();
  expect(native.end).not.toHaveBeenCalled();
  expect(widgets.writeSnapshot).toHaveBeenCalledTimes(1);
  expect(sentJson(widgets.writeSnapshot.mock.calls[0])).toMatchObject({ counts: { working: 1, waiting: 0 } });
  expect(widgets.reloadTimelines).toHaveBeenCalledTimes(1);
});

test('the next push in the same run: once more each, with the list it brings', async () => {
  mockWire = wire({ activity: 'attention', attention: { enteredAt: new Date().toISOString(), kind: 'needsInput' } });

  expect(await runTask()).toBe(0);

  expect(native.update).toHaveBeenCalledTimes(2);
  expect(sentJson(native.update.mock.calls[1])).toMatchObject({ counts: { working: 0, waiting: 1 } });
  expect(native.end).not.toHaveBeenCalled();
  expect(widgets.writeSnapshot).toHaveBeenCalledTimes(2);
  expect(sentJson(widgets.writeSnapshot.mock.calls[1])).toMatchObject({ counts: { working: 0, waiting: 1 } });
  expect(widgets.reloadTimelines).toHaveBeenCalledTimes(2);
});

test('a push whose read list has no agent: the activity shows that, read just now (no agent works or waits)', async () => {
  // The activity's 15-minute end timer starts here; Jest's clock keeps it from outliving the test.
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  mockWire = { ok: true, capabilities: { workingStartedAt: true, attentionKind: true }, sessions: [] };

  expect(await runTask()).toBe(0);

  expect(native.update).toHaveBeenCalledTimes(3);
  expect(sentJson(native.update.mock.calls[2])).toMatchObject({ counts: { working: 0, waiting: 0 } });
  expect(native.end).not.toHaveBeenCalled();
  jest.clearAllTimers();
  jest.useRealTimers();
});
