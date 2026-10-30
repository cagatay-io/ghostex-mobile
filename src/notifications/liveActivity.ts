/**
 * Runs the Live Activity for the app's lifetime (S8): every change of the inventory, the machines or the
 * settings rebuilds the content state from the polled summaries and hands it to the controller, which starts,
 * updates or ends the activity through ActivityKit. iOS only; on Android the native module does not exist and
 * nothing is installed (REQ-NFR-005).
 *
 * `refreshLiveActivity` is the local update entry point for a short background wake (D-060: the push slice's
 * silent-push handler calls it); it reads every summary again and resolves once ActivityKit has the result.
 */

import { useMemo } from 'react';
import { Platform } from 'react-native';

import { GhostexLiveActivity } from '../../modules/ghostex-live-activity/src/GhostexLiveActivity';
import { logAppEvent } from '../app/appLog';
import { useInventoryStore, type MachineInventory } from '../inventory/store';
import { enabledMachines, machineDisplayLabel, useMachinesStore, type MachineRecord } from '../machines/store';
import { useSettingsStore } from '../settings/store';
import { createActivityController, type ActivityController, type LiveActivityAdapter } from './activityController';
import { buildContentState, computersNeedingUpdate, workingStints, type ActivitySource } from './contentState';

type NativeLiveActivity = NonNullable<typeof GhostexLiveActivity>;

/** iOS with the native module in the build (REQ-NFR-005: Android and older builds have none). */
export const LIVE_ACTIVITY_SUPPORTED = Platform.OS === 'ios' && GhostexLiveActivity !== null;

let installed = false;
let controller: ActivityController | null = null;
/** ActivityKit calls run one after another, in the order the controller made them. */
let queue: Promise<void> = Promise.resolve();
let pendingCalls = 0;
/** The inputs of the last pass, so the store updates of a poll that changed nothing cost nothing. */
let lastInputs: { sources: readonly ActivitySource[]; enabled: boolean } | null = null;

function enqueue(call: () => Promise<void>): Promise<void> {
  pendingCalls += 1;
  const result = queue.then(call);
  queue = result.then(
    () => {
      pendingCalls -= 1;
    },
    () => {
      pendingCalls -= 1;
    },
  );
  return result;
}

function nativeAdapter(native: NativeLiveActivity): LiveActivityAdapter {
  return {
    hasActivity: () => (pendingCalls > 0 ? null : native.hasActivity()),
    request: ({ state, staleDate }) => enqueue(() => native.start(JSON.stringify(state), staleDate)),
    update: ({ state, staleDate }) => enqueue(() => native.update(JSON.stringify(state), staleDate)),
    end: () => enqueue(() => native.end()),
  };
}

function sourcesOf(
  machines: readonly MachineRecord[],
  inventories: Record<string, MachineInventory>,
): ActivitySource[] {
  const sources: ActivitySource[] = [];
  for (const machine of machines) {
    const inventory = inventories[machine.id];
    const summary = inventory?.summary ?? null;
    if (inventory === undefined || summary === null || inventory.loadedAt === null) continue;
    sources.push({ machineId: machine.id, summary, loadedAt: inventory.loadedAt });
  }
  return sources;
}

function currentSources(): ActivitySource[] {
  return sourcesOf(enabledMachines(useMachinesStore.getState()), useInventoryStore.getState().inventoriesByMachineId);
}

/**
 * The names of the enabled computers whose Ghostex is too old for the Live Activity (D-063), for Settings
 * (REQ-LIVEACT-004, -005); empty while every computer with agents sends what the activity needs.
 */
export function useComputersNeedingUpdate(): string[] {
  const machines = useMachinesStore((state) => state.machines);
  const inventories = useInventoryStore((state) => state.inventoriesByMachineId);
  return useMemo(() => {
    const enabled = enabledMachines({ machines });
    const outdated = new Set(computersNeedingUpdate(sourcesOf(enabled, inventories)));
    return enabled.filter((machine) => outdated.has(machine.id)).map(machineDisplayLabel);
  }, [machines, inventories]);
}

function sameInputs(sources: readonly ActivitySource[], enabled: boolean): boolean {
  if (lastInputs === null || lastInputs.enabled !== enabled || lastInputs.sources.length !== sources.length) {
    return false;
  }
  return sources.every((source, index) => {
    const last = lastInputs?.sources[index];
    return (
      last !== undefined &&
      last.machineId === source.machineId &&
      last.summary === source.summary &&
      last.loadedAt === source.loadedAt
    );
  });
}

/** Brings the activity in line with the latest summaries and the setting. */
function syncLiveActivity(): void {
  const settings = useSettingsStore.getState();
  // The switch is a stored setting: nothing starts or ends before it is read (FL-STA-04).
  if (controller === null || !settings.hydrated) return;
  const enabled = settings.settings.liveActivityEnabled;
  const sources = currentSources();
  if (sameInputs(sources, enabled)) return;
  lastInputs = { sources, enabled };
  const now = Date.now();
  controller.process(
    buildContentState(sources, now),
    workingStints(sources, now),
    enabled,
    computersNeedingUpdate(sources).length === 0,
  );
}

/** Install once at app startup; subscriptions live for the app's lifetime. */
export function initLiveActivity(): void {
  if (installed) return;
  installed = true;
  if (Platform.OS !== 'ios' || GhostexLiveActivity === null) return;
  controller = createActivityController({
    adapter: nativeAdapter(GhostexLiveActivity),
    now: Date.now,
    timers: {
      setTimeout: (run, ms) => setTimeout(run, ms),
      clearTimeout: (handle) => clearTimeout(handle),
    },
    onError: logAppEvent,
  });
  useInventoryStore.subscribe(syncLiveActivity);
  useMachinesStore.subscribe(syncLiveActivity);
  useSettingsStore.subscribe(syncLiveActivity);
  syncLiveActivity();
}

/**
 * Reads every summary again and applies it to the activity; resolves once ActivityKit has the update. For a
 * short background wake, where the foreground poll does not run (D-060).
 */
export async function refreshLiveActivity(): Promise<void> {
  await useInventoryStore.getState().refreshAll();
  syncLiveActivity();
  await queue;
}
