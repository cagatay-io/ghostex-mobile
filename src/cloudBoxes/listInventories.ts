/**
 * The inventories the session lists draw: every saved computer's, with its Cloud Boxes' sessions
 * inside their home project (./boxSessions.ts `withBoxSessions`). The boxes' own inventories stay
 * in the inventory store for the chat and every request to a box, but are not listed on their own:
 * a box is never a computer of its own in the lists (Q1015).
 */

import { useMemo } from 'react';

import { useInventoryStore, type MachineInventory } from '../inventory/store';
import { withBoxSessions } from './boxSessions';
import { boxesOfHome, useCloudBoxesStore, type CloudBoxEntry } from './store';
import { isCloudBoxMachineId } from './types';

export function listInventories(
  inventories: Record<string, MachineInventory>,
  entries: Record<string, CloudBoxEntry>,
): Record<string, MachineInventory> {
  const boxSummaries: Record<string, MachineInventory['summary']> = {};
  for (const [machineId, inventory] of Object.entries(inventories)) {
    if (isCloudBoxMachineId(machineId)) boxSummaries[machineId] = inventory.summary;
  }
  const out: Record<string, MachineInventory> = {};
  for (const [machineId, inventory] of Object.entries(inventories)) {
    if (isCloudBoxMachineId(machineId)) continue;
    const boxes = boxesOfHome(entries, machineId);
    out[machineId] =
      boxes.length === 0 || inventory.summary === null
        ? inventory
        : { ...inventory, summary: withBoxSessions(inventory.summary, boxes, boxSummaries) };
  }
  return out;
}

/** `useInventoryStore(state => state.inventoriesByMachineId)` for the lists. */
export function useListInventories(): Record<string, MachineInventory> {
  const inventories = useInventoryStore((state) => state.inventoriesByMachineId);
  const entries = useCloudBoxesStore((state) => state.entries);
  return useMemo(() => listInventories(inventories, entries), [inventories, entries]);
}
