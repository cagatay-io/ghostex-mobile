/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. A computer's Global Actions come only from a summary read over the current
 * connection: when a read fails or an explicit retry starts, the cached ones are dropped from the retained summary,
 * and the next answer is applied in full even when its text has not changed (automatic reconnect and the return to
 * the foreground: `src/app/autoReconnect.rntl.ts`).
 */

import { parseMobileSummary, type GhostexMobileSummary } from '../contract/mobileSummary';
import { reconnectMachine } from '../remote/connection';
import { fetchInventory } from './client';
import { useInventoryStore } from './store';
import type { MachineRecord } from '../machines/store';

const machine: MachineRecord = {
  id: 'm1',
  name: 'Mac',
  host: 'mac.local',
  username: 'me',
  port: 22,
  savePassword: false,
  lastConnectedAt: null,
};

jest.mock('../analytics/clientHello', () => ({ reportClientHello: jest.fn() }));
jest.mock('../app/appLog', () => ({ logAppEvent: jest.fn() }));
jest.mock('../machines/credentials', () => ({ hasPassword: jest.fn(async () => false) }));
jest.mock('../remote/connection', () => ({ reconnectMachine: jest.fn(async () => undefined) }));
jest.mock('../terminal/sessions', () => ({ restoreAttachTabs: jest.fn(async () => undefined) }));
jest.mock('../machines/store', () => ({
  enabledMachines: () => [{ id: 'm1', name: 'Mac', host: 'mac.local', username: 'me', port: 22 }],
  machineDisplayLabel: () => 'Mac',
  useMachinesStore: { getState: () => ({ markConnected: jest.fn(), selectedMachineId: 'm1' }) },
}));
jest.mock('./client', () => ({
  fetchInventory: jest.fn(),
  summarizeFailureDetailed: (error: unknown) => ({
    message: error instanceof Error ? error.message : String(error),
    reasonCode: 'sshRefused',
  }),
}));

const fetchMock = fetchInventory as jest.MockedFunction<typeof fetchInventory>;
const reconnectMock = reconnectMachine as jest.MockedFunction<typeof reconnectMachine>;

const WIRE = JSON.stringify({
  sessions: [{ sessionId: 's1', projectId: 'P1', provider: 'zmx', isLive: true }],
  quickActionsByProject: { P1: [{ actionType: 'terminal', commandId: 'c1', name: 'Tests' }] },
  globalQuickActions: [{ actionType: 'terminal', commandId: 'g1', name: 'Git Status' }],
  capabilities: { globalQuickActions: true },
});

function serverSummary(): GhostexMobileSummary {
  const summary = parseMobileSummary(WIRE);
  if (summary === null) throw new Error('fixture does not parse');
  return summary;
}

function answerWithSummary(): void {
  fetchMock.mockImplementation(async () => ({ summary: serverSummary(), fingerprint: WIRE }));
}

const current = () => useInventoryStore.getState().inventoriesByMachineId.m1;

beforeEach(() => {
  useInventoryStore.getState().clearMachine('m1');
  fetchMock.mockReset();
  reconnectMock.mockReset();
  reconnectMock.mockImplementation(async () => undefined);
});

test('a failed read drops the cached Global Actions and keeps the rest of the list', async () => {
  answerWithSummary();
  await useInventoryStore.getState().refreshMachine(machine);
  expect(current()?.summary?.globalQuickActions).toHaveLength(1);

  fetchMock.mockImplementation(async () => {
    throw new Error('Connection refused');
  });
  await useInventoryStore.getState().refreshMachine(machine);
  const inventory = current();
  expect(inventory?.lastError).toBe('Connection refused');
  expect(inventory?.summary?.globalQuickActions).toEqual([]);
  expect(inventory?.summary?.globalQuickActionsSupported).toBe(false);
  expect(inventory?.serverSummary?.globalQuickActions).toEqual([]);
  expect(inventory?.serverSummary?.globalQuickActionsSupported).toBe(false);
  // Sessions and project actions stay on screen as before.
  expect(inventory?.summary?.sessions.map((session) => session.sessionId)).toEqual(['s1']);
  expect(inventory?.summary?.quickActionsByProject.P1).toHaveLength(1);
});

test('the next answer brings them back even when its text is unchanged', async () => {
  answerWithSummary();
  await useInventoryStore.getState().refreshMachine(machine);
  fetchMock.mockImplementationOnce(async () => {
    throw new Error('Connection refused');
  });
  await useInventoryStore.getState().refreshMachine(machine);
  expect(current()?.summary?.globalQuickActions).toEqual([]);

  await useInventoryStore.getState().refreshMachine(machine);
  expect(current()?.lastError).toBeNull();
  expect(current()?.summary?.globalQuickActions.map((action) => action.commandId)).toEqual(['g1']);
  expect(current()?.summary?.globalQuickActionsSupported).toBe(true);
});

test('an explicit retry drops the cached Global Actions before the computer answers again', async () => {
  answerWithSummary();
  await useInventoryStore.getState().refreshMachine(machine);
  expect(current()?.summary?.globalQuickActions).toHaveLength(1);

  const reconnect = Promise.withResolvers<void>();
  reconnectMock.mockImplementation(() => reconnect.promise);
  const retry = useInventoryStore.getState().retryMachine('m1');
  await Promise.resolve();
  expect(current()?.summary?.globalQuickActions).toEqual([]);
  expect(current()?.summary?.globalQuickActionsSupported).toBe(false);

  reconnect.resolve();
  await retry;
  expect(current()?.summary?.globalQuickActions.map((action) => action.commandId)).toEqual(['g1']);
});
