/**
 * The phone's Cloud Box registry: every box a paired computer listed (`cloudBoxes list`), or that
 * the phone started itself while the computer was off (./phoneStart.ts), with the computer it
 * belongs to. Rows are kept on the phone so a box and its sessions stay listed while that computer
 * is off; a box's connect token lives in the secure store, never here.
 *
 * CDXC:CloudBoxes 2026-11-02 WHY:
 * A box is another gxserver, reached like a computer (the chat link, its socket, its HTTP calls),
 * but it never becomes a saved machine: the user's machine list, its tabs, its SSH reconnects and
 * its polling loops all assume a computer the user added. So a box is a hidden machine
 * (`cloudbox:<boxId>`, [`boxMachineRecord`]) that the screens find through [`findMachineRecord`],
 * and its sessions are listed inside their home project (./boxSessions.ts), as on the desktop
 * (Q1015 "in project with badge": box machines never get a machine tab).
 * SEE-ALSO: apps/desktop/src/app/gx_store/cloud_boxes.rs, packages/gx-core/src/cloud_boxes.rs
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { useMachinesStore, type MachineRecord } from '../machines/store';
import {
  boxIdOfMachine,
  cloudBoxMachineId,
  isCloudBoxMachineId,
  type CloudBox,
  type CloudBoxConnectInfo,
} from './types';

const STORAGE_KEY = 'cloudBoxes.v1';

/** One box the phone knows, and the computer whose registry holds it. */
export type CloudBoxEntry = {
  box: CloudBox;
  /** The paired computer the box belongs to (its project's home). */
  homeMachineId: string;
  /** Where the row last came from: the computer's registry, or the provider read by the phone. */
  source: 'home' | 'provider';
};

type CloudBoxesState = {
  entries: Record<string, CloudBoxEntry>;
  loaded: boolean;
  /** Replaces every box one computer listed (rows it no longer lists are dropped). */
  setHomeBoxes: (homeMachineId: string, boxes: readonly CloudBox[]) => void;
  /** Puts one row in place (a create, a resume, a provider read). */
  putBox: (homeMachineId: string, box: CloudBox, source?: CloudBoxEntry['source']) => void;
  dropBox: (boxId: string) => void;
  load: () => Promise<void>;
};

function persist(entries: Record<string, CloudBoxEntry>): void {
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries)).catch(() => undefined);
}

export const useCloudBoxesStore = create<CloudBoxesState>()((set, get) => ({
  entries: {},
  loaded: false,
  setHomeBoxes: (homeMachineId, boxes) => {
    const next: Record<string, CloudBoxEntry> = {};
    for (const [boxId, entry] of Object.entries(get().entries)) {
      // A box the phone started itself stays until the computer lists it (or a provider read drops it).
      if (entry.homeMachineId !== homeMachineId || entry.source === 'provider') next[boxId] = entry;
    }
    for (const box of boxes) {
      if (box.state === 'deleted') {
        delete next[box.boxId];
        continue;
      }
      next[box.boxId] = { box, homeMachineId, source: 'home' };
    }
    if (sameEntries(get().entries, next)) return;
    set({ entries: next });
    persist(next);
  },
  putBox: (homeMachineId, box, source = 'home') => {
    const next = { ...get().entries };
    if (box.state === 'deleted') delete next[box.boxId];
    else next[box.boxId] = { box, homeMachineId, source };
    set({ entries: next });
    persist(next);
  },
  dropBox: (boxId) => {
    if (get().entries[boxId] === undefined) return;
    const next = { ...get().entries };
    delete next[boxId];
    set({ entries: next });
    persist(next);
    void forgetConnectInfo(boxId);
  },
  load: async () => {
    if (get().loaded) return;
    try {
      const text = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = text === null ? null : (JSON.parse(text) as unknown);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        // Rows read since the app started win over the stored copy.
        set({ entries: { ...(parsed as Record<string, CloudBoxEntry>), ...get().entries }, loaded: true });
        return;
      }
    } catch {
      // A broken stored copy is replaced by the next list.
    }
    set({ loaded: true });
  },
}));

function sameEntries(a: Record<string, CloudBoxEntry>, b: Record<string, CloudBoxEntry>): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every(
    (key) =>
      b[key] !== undefined &&
      a[key].homeMachineId === b[key].homeMachineId &&
      a[key].source === b[key].source &&
      JSON.stringify(a[key].box) === JSON.stringify(b[key].box),
  );
}

export function cloudBoxEntry(boxId: string | null): CloudBoxEntry | null {
  if (boxId === null) return null;
  return useCloudBoxesStore.getState().entries[boxId] ?? null;
}

export function cloudBoxEntryOfMachine(machineId: string): CloudBoxEntry | null {
  return cloudBoxEntry(boxIdOfMachine(machineId));
}

/** The boxes one computer holds, in the order the lists show them. */
export function boxesOfHome(entries: Record<string, CloudBoxEntry>, homeMachineId: string): CloudBoxEntry[] {
  return Object.values(entries)
    .filter((entry) => entry.homeMachineId === homeMachineId)
    .sort((a, b) => a.box.boxId.localeCompare(b.box.boxId));
}

/** The hidden machine a box's sessions, chat and actions run against. Never saved, never a tab. */
export function boxMachineRecord(entry: CloudBoxEntry): MachineRecord {
  return {
    id: cloudBoxMachineId(entry.box.boxId),
    name: entry.box.name,
    host: '',
    username: '',
    port: 0,
    savePassword: false,
    lastConnectedAt: null,
  };
}

/** A saved computer by id, or a box's hidden machine. */
export function findMachineRecord(machineId: string): MachineRecord | null {
  if (isCloudBoxMachineId(machineId)) {
    const entry = cloudBoxEntryOfMachine(machineId);
    return entry === null ? null : boxMachineRecord(entry);
  }
  return useMachinesStore.getState().machines.find((machine) => machine.id === machineId) ?? null;
}

/** The saved computer a box belongs to, when it is still saved. */
export function homeMachineOf(boxId: string): MachineRecord | null {
  const entry = cloudBoxEntry(boxId);
  if (entry === null) return null;
  return useMachinesStore.getState().machines.find((machine) => machine.id === entry.homeMachineId) ?? null;
}

// ---- connect info --------------------------------------------------------------------------------

const connectInfoCache = new Map<string, CloudBoxConnectInfo>();

function connectInfoKey(boxId: string): string {
  // expo-secure-store keys allow letters, digits, `.`, `-` and `_`.
  return `cloudbox.${boxId}.connect`;
}

/** The last connect info this phone learned for a box (its token included), or null. */
export async function storedConnectInfo(boxId: string): Promise<CloudBoxConnectInfo | null> {
  const cached = connectInfoCache.get(boxId);
  if (cached !== undefined) return cached;
  try {
    const text = await SecureStore.getItemAsync(connectInfoKey(boxId));
    if (text === null) return null;
    const parsed = JSON.parse(text) as CloudBoxConnectInfo;
    connectInfoCache.set(boxId, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export async function saveConnectInfo(info: CloudBoxConnectInfo): Promise<void> {
  const previous = connectInfoCache.get(info.boxId);
  connectInfoCache.set(info.boxId, info);
  if (previous !== undefined && JSON.stringify(previous) === JSON.stringify(info)) return;
  await SecureStore.setItemAsync(connectInfoKey(info.boxId), JSON.stringify(info)).catch(() => undefined);
}

export async function forgetConnectInfo(boxId: string): Promise<void> {
  connectInfoCache.delete(boxId);
  await SecureStore.deleteItemAsync(connectInfoKey(boxId)).catch(() => undefined);
}
