/**
 * Android persistent-notification feed (port of the Termux fork's
 * TermuxService notification): while at least one machine is configured, a
 * silent ongoing foreground-service notification shows the remote session
 * inventory (attention/done first, then working, then the rest — the same
 * ordering as the old GhostexServiceNotificationFormatter) and keeps SSH +
 * warm terminals alive in the background.
 */

import { Platform } from 'react-native';

import { GhostexNative } from '../../modules/ghostex-native/src';
import type { NotificationSessionRow } from '../../modules/ghostex-native/src/GhostexNative.types';
import { useInventoryStore } from '../inventory/store';
import { useMachinesStore } from '../machines/store';
import { notificationRowsFromSummary } from './persistentNotificationRows';

let installed = false;
let serviceEnabled = false;
let lastRowsJson = '';

function statusRank(status: string): number {
  if (status === 'done' || status === 'attention') return 0;
  if (status === 'working') return 1;
  return 2;
}

function collectRows(): NotificationSessionRow[] {
  const inventories = useInventoryStore.getState().inventoriesByMachineId;
  const rows: NotificationSessionRow[] = [];
  for (const [machineId, inventory] of Object.entries(inventories)) {
    if (inventory.summary !== null) rows.push(...notificationRowsFromSummary(machineId, inventory.summary));
  }
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const delta = statusRank(a.row.status) - statusRank(b.row.status);
      return delta !== 0 ? delta : a.index - b.index;
    })
    .map((entry) => entry.row);
}

function sync(): void {
  const hasMachines = useMachinesStore.getState().machines.length > 0;
  if (hasMachines !== serviceEnabled) {
    serviceEnabled = hasMachines;
    void GhostexNative.setPersistentNotificationEnabled(hasMachines).catch(() => {});
    if (!hasMachines) {
      lastRowsJson = '';
      return;
    }
  }
  if (!serviceEnabled) return;
  const rows = collectRows();
  const json = JSON.stringify(rows);
  if (json === lastRowsJson) return;
  lastRowsJson = json;
  void GhostexNative.updatePersistentNotification(rows).catch(() => {});
}

/** Install once at app startup (no-op on iOS). */
export function initPersistentNotification(): void {
  if (installed || Platform.OS !== 'android') return;
  installed = true;
  void GhostexNative.requestNotificationPermission().catch(() => {});
  useInventoryStore.subscribe(() => sync());
  useMachinesStore.subscribe(() => sync());
  sync();
}
