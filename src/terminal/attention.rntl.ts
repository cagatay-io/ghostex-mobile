/// <reference types="jest" />
import { acknowledgeCoordinatorThreadsCommand } from '../commands/ghostexCli';
import { runGhostexCli } from '../components/sessions/cli';
import { parseMobileSummary } from '../contract/mobileSummary';
import { emptyMachineInventory, useInventoryStore } from '../inventory/store';
import { useMachinesStore, type MachineRecord } from '../machines/store';
import { acknowledgeSessionAttention } from './attention';

jest.mock('../components/sessions/cli', () => ({ runGhostexCli: jest.fn(() => Promise.resolve('')) }));
jest.mock('../../modules/ghostex-native/src', () => ({ GhostexNative: {} }));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const MACHINE: MachineRecord = {
  id: 'computer', name: 'Computer', host: 'computer.local', username: 'tester', port: 22,
  savePassword: false, lastConnectedAt: null,
};

test('opening a coordinator does not acknowledge an announced question as a finished thread', async () => {
  const run = jest.mocked(runGhostexCli);
  useMachinesStore.setState({ machines: [MACHINE] });
  const refreshMachine = jest.fn(() => Promise.resolve());
  useInventoryStore.setState({ refreshMachine });
  for (const [capability, count, awaitingAnswer, expectedCalls] of [
    [true, 0, true, 0],
    [false, 0, true, 1],
    [true, 0, false, 1],
    [false, 1, false, 0],
  ] as const) {
    run.mockClear();
    refreshMachine.mockClear();
    const summary = parseMobileSummary(JSON.stringify({
      capabilities: { awaitingAnswer: capability },
      sessions: [
        { sessionId: 'lead', projectId: 'project', provider: 'zmx', globalRef: 'computer:project:lead',
          coordinatorRole: 'coordinator', lifecycleState: 'running', activity: 'idle' },
        { sessionId: 'thread', projectId: 'project', provider: 'zmx', coordinatorProjectId: 'project',
          coordinatorSessionId: 'lead', coordinatorThreadState: 'finished',
          lifecycleState: 'running', activity: 'attention', pendingQuestionCount: count, awaitingAnswer },
      ],
    }));
    if (summary === null) throw new Error('invalid summary fixture');
    expect(summary.sessions).toHaveLength(2);
    useInventoryStore.setState({ inventoriesByMachineId: {
      computer: { ...emptyMachineInventory(), summary, serverSummary: summary },
    } });
    acknowledgeSessionAttention('computer', 'lead');
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(expectedCalls);
    expect(refreshMachine).toHaveBeenCalledTimes(expectedCalls);
    if (expectedCalls > 0) {
      expect(run).toHaveBeenCalledWith(MACHINE, acknowledgeCoordinatorThreadsCommand('computer:project:lead'));
    }
    expect(summary.sessions[1]?.pendingQuestionCount).toBe(count);
  }
});
