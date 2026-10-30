/**
 * The computer the project file browser reads from, looked up when a request goes out: the machine record is
 * rebuilt on every inventory poll, so the screens keep only its id.
 */

import { useCallback } from 'react';

import { sessionChatRpc } from '../chat/rust/transport';
import { DocsCopy } from '../copy';
import { useMachinesStore, type MachineRecord } from '../machines/store';
import type { DocsRpc } from './request';

/** The saved machine with this id; throws the message the browser shows once it is no longer saved. */
export function currentMachine(machineId: string): MachineRecord {
  const machine = useMachinesStore.getState().machines.find((candidate) => candidate.id === machineId);
  if (machine === undefined) throw new Error(DocsCopy.machineMissing);
  return machine;
}

/** `runProjectDocsAction` on this computer, stable for as long as the id stays (for Effect and memo deps). */
export function useProjectDocsRpc(machineId: string): DocsRpc {
  return useCallback<DocsRpc>(
    async (method, params, timeoutMs) => sessionChatRpc(currentMachine(machineId), method, params, timeoutMs),
    [machineId],
  );
}
