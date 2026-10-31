/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. Global Actions come only from a summary read over the current connection: when the
 * automatic reconnect or the return to the foreground starts recovering a computer, its cached Global Actions and
 * capability go before the computer answers again, while its sessions and project actions stay on screen.
 */

import { AppState } from 'react-native';

import { parseMobileSummary } from '../contract/mobileSummary';
import { fetchInventory } from '../inventory/client';
import { useInventoryStore } from '../inventory/store';
import type { MachineRecord } from '../machines/store';
import { ensureConnected } from '../remote/connection';
import { initAutoReconnect, recoverConnections } from './autoReconnect';

type ConnectionEvent = { machineId: string; state: string; errorCode?: string };

const mockListeners: Record<string, (event: ConnectionEvent) => void> = {};

jest.mock('../../modules/ghostex-native/src', () => ({
  GhostexNative: {
    addListener: (name: string, callback: (event: ConnectionEvent) => void) => {
      mockListeners[name] = callback;
      return { remove() {} };
    },
  },
}));
jest.mock('../analytics/clientHello', () => ({ reportClientHello: jest.fn() }));
jest.mock('./appLog', () => ({ logAppEvent: jest.fn() }));
jest.mock('../chat/rust/machine-link', () => ({ chatLinkKeptInBackground: () => false }));
jest.mock('../machines/credentials', () => ({ hasPassword: async () => false }));
jest.mock('../terminal/sessions', () => ({
  restoreAttachTabs: async () => undefined,
  useTerminalStore: { getState: () => ({ tabs: [] }) },
}));
jest.mock('../settings/store', () => ({
  useSettingsStore: { getState: () => ({ settings: { autoReconnect: true } }) },
}));
jest.mock('../machines/store', () => ({
  enabledMachines: () => [{ id: 'm1', name: 'Mac', host: 'mac.local', username: 'me', port: 22 }],
  machineDisplayLabel: () => 'Mac',
  useMachinesStore: { getState: () => ({ markConnected() {}, selectedMachineId: 'm1' }) },
}));
jest.mock('../remote/connection', () => ({
  ensureConnected: jest.fn(),
  reconnectMachine: jest.fn(),
  cancelConnectionAttempt: jest.fn(),
}));
jest.mock('../inventory/client', () => ({
  fetchInventory: jest.fn(),
  summarizeFailureDetailed: (error: unknown) => ({
    message: error instanceof Error ? error.message : String(error),
    reasonCode: 'sshRefused',
  }),
}));

const machine: MachineRecord = {
  id: 'm1',
  name: 'Mac',
  host: 'mac.local',
  username: 'me',
  port: 22,
  savePassword: false,
  lastConnectedAt: null,
};

const WIRE = JSON.stringify({
  sessions: [{ sessionId: 's1', projectId: 'P1', provider: 'zmx', isLive: true }],
  projects: [{ projectId: 'P1', name: 'Project' }],
  quickActionsByProject: { P1: [{ actionType: 'terminal', commandId: 'c1', name: 'Tests' }] },
  globalQuickActions: [{ actionType: 'terminal', commandId: 'g1', name: 'Git Status' }],
  capabilities: { globalQuickActions: true },
});

const fetchMock = fetchInventory as jest.MockedFunction<typeof fetchInventory>;
const ensureConnectedMock = ensureConnected as jest.MockedFunction<typeof ensureConnected>;
const current = () => useInventoryStore.getState().inventoriesByMachineId.m1;

/** A computer whose summary with Global Actions is on screen, and a reconnect that has not finished yet. */
async function loadedWithPendingReconnect(): Promise<() => Promise<void>> {
  fetchMock.mockImplementation(async () => ({ summary: parseMobileSummary(WIRE)!, fingerprint: WIRE }));
  await useInventoryStore.getState().refreshMachine(machine);
  expect(current()?.summary?.globalQuickActionsSupported).toBe(true);
  const pending = Promise.withResolvers<void>();
  ensureConnectedMock.mockReset();
  ensureConnectedMock.mockReturnValue(pending.promise);
  return async () => {
    pending.resolve();
    // Let the recovery finish: restore tabs, then read the list again.
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };
}

function expectGlobalsDroppedOnly(): void {
  const inventory = current();
  expect(inventory?.summary?.globalQuickActionsSupported).toBe(false);
  expect(inventory?.summary?.globalQuickActions).toEqual([]);
  expect(inventory?.serverSummary?.globalQuickActionsSupported).toBe(false);
  expect(inventory?.serverSummary?.globalQuickActions).toEqual([]);
  // Sessions, projects and project actions stay on screen.
  expect(inventory?.summary?.sessions.map((session) => session.sessionId)).toEqual(['s1']);
  expect(inventory?.summary?.projects.map((project) => project.projectId)).toEqual(['P1']);
  expect(inventory?.summary?.quickActionsByProject.P1).toHaveLength(1);
}

beforeAll(() => {
  jest.useFakeTimers();
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  initAutoReconnect();
});

afterAll(() => {
  useInventoryStore.getState().stopPolling();
  jest.useRealTimers();
});

beforeEach(() => {
  useInventoryStore.getState().clearMachine('m1');
  fetchMock.mockReset();
});

test('the automatic reconnect drops the cached Global Actions before the computer answers again', async () => {
  const finishReconnect = await loadedWithPendingReconnect();
  try {
    mockListeners.onConnectionState({ machineId: 'm1', state: 'disconnected' });
    jest.advanceTimersByTime(2000);
    mockListeners.onConnectionState({ machineId: 'm1', state: 'connecting' });
    expect(ensureConnectedMock).toHaveBeenCalledTimes(1);
    expectGlobalsDroppedOnly();
  } finally {
    await finishReconnect();
  }
  // The answer over the new connection is applied in full although its text is unchanged.
  expect(current()?.summary?.globalQuickActionsSupported).toBe(true);
  expect(current()?.summary?.globalQuickActions.map((action) => action.commandId)).toEqual(['g1']);
});

test('returning to the foreground drops the cached Global Actions while the connection is checked', async () => {
  const finishReconnect = await loadedWithPendingReconnect();
  try {
    recoverConnections();
    expect(ensureConnectedMock).toHaveBeenCalledTimes(1);
    expectGlobalsDroppedOnly();
  } finally {
    await finishReconnect();
  }
  expect(current()?.summary?.globalQuickActions.map((action) => action.commandId)).toEqual(['g1']);
});
