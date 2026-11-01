/**
 * Runs the Home Screen widgets' writer for the app's lifetime: every change of the inventory (each summary refresh)
 * or of the machines brings the App Group snapshot in line and, when it changed, asks WidgetKit to reload the
 * widgets (`widgetWriter.ts`). iOS only; on Android the native module does not exist and nothing is installed.
 *
 * `refreshWidgets` is the update entry point for a short background wake (the push handler can call it beside
 * `refreshLiveActivity`): it reads every summary again and resolves once the snapshot is written.
 */

import { Platform } from 'react-native';

import { GhostexWidgets } from '../../modules/ghostex-widgets/src/GhostexWidgets';
import { logAppEvent } from '../app/appLog';
import { wasmCoreBridge } from '../chat/rust/wasm-core/bridge';
import { useInventoryStore } from '../inventory/store';
import { selectedMachine, useMachinesStore } from '../machines/store';
import { machineTargetFor } from '../screens/terminal-screen/session-lookups';
import { readAccountsAnswer } from '../usage/client';
import { buildUsageBars } from '../usage/usageMeters';
import { currentSources } from './liveActivity';
import { createWidgetWriter, type WidgetInputs, type WidgetWriter } from './widgetWriter';

let installed = false;
let writer: WidgetWriter | null = null;

/** Null until the saved computers are loaded: before that, no computer would read as the last one removed. */
function currentInputs(): WidgetInputs | null {
  const machines = useMachinesStore.getState();
  if (!machines.hydrated) return null;
  return {
    computersSaved: machines.machines.length > 0,
    sources: currentSources(),
    selectedMachineId: selectedMachine(machines)?.id ?? null,
    polling: useInventoryStore.getState().polling,
  };
}

function syncWidgets(): Promise<void> {
  const inputs = currentInputs();
  return writer === null || inputs === null ? Promise.resolve() : writer.sync(inputs);
}

/** Install once at app startup; subscriptions live for the app's lifetime. */
export function initWidgets(): void {
  if (installed) return;
  installed = true;
  if (Platform.OS !== 'ios' || GhostexWidgets === null) return;
  const native = GhostexWidgets;
  writer = createWidgetWriter({
    host: {
      write: (json) => native.writeSnapshot(json),
      remove: () => native.removeSnapshot(),
      reloadTimelines: () => native.reloadTimelines(),
    },
    now: Date.now,
    readUsageBars: async (machineId) => {
      const machine = machineTargetFor(machineId);
      if (machine === null) return [];
      const answer = await readAccountsAnswer(machine, false);
      const columns = await wasmCoreBridge.call({
        op: 'accountUsageColumns',
        args: [JSON.stringify(answer), Date.now()],
      });
      return buildUsageBars(answer, columns);
    },
    onError: logAppEvent,
  });
  useInventoryStore.subscribe(() => void syncWidgets());
  useMachinesStore.subscribe(() => void syncWidgets());
  void syncWidgets();
}

/** Reads every summary again and writes the snapshot; resolves once it is written (and the reload requested). */
export async function refreshWidgets(): Promise<void> {
  await useInventoryStore.getState().refreshAll();
  await syncWidgets();
}
