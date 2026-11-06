/**
 * The phone as a member of settings sync: it keeps every synced entry it gets and trades them with
 * each computer it is connected to, so a change made on one computer reaches another the next time
 * the phone reaches it, even when the two never meet.
 *
 * CDXC:SettingsSync 2026-11-06 DECISION:
 * User (Q1375): the phone is "a full member: holds a copy, edits offline, carries changes". The
 * phone does no merging: it sends all its entries to a computer's `/api/settingsSyncExchange`,
 * which merges them (newest edit of each key wins) and answers with everything it has in the
 * categories it syncs, and the phone takes that answer for those categories and keeps the rest.
 * So the rules stay in gxserver (gx-core `settings_sync`). It only asks a computer whose link is
 * already open (`ChatMachineLink.current`), so syncing never wakes a connection.
 * SEE-ALSO: server/src/settings_sync/exchange.rs (the phone's `phoneId`), gx-core settings_sync
 * `phone_member_id`.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { create } from 'zustand';

import { chatMachineLink } from '../chat/rust/machine-link';
import { isCloudBoxMachineId } from '../cloudBoxes/types';
import { pairingDeviceName } from '../machines/pairing';
import { useMachinesStore } from '../machines/store';
import { useSettingsStore } from '../settings/store';

const STORAGE_KEY = 'settingsSync.v1';
const ROUND_MS = 30_000;
const EXCHANGE_TIMEOUT_MS = 20_000;

/** One synced key as gxserver sends it; the phone stores it as it came. */
export type SyncEntry = {
  key: string;
  value?: unknown;
  hlc: string;
  parent?: string | null;
  origin: string;
  originName?: string;
};

type Stored = {
  phoneId: string;
  entries: Record<string, SyncEntry>;
  lastSyncAt: Record<string, number>;
  refused: Record<string, string>;
};

/** What Settings › Sync shows: per computer id, when it last synced or why it refused. */
export const useSettingsSyncStore = create<{
  lastSyncAt: Record<string, number>;
  refused: Record<string, string>;
}>(() => ({ lastSyncAt: {}, refused: {} }));

let stored: Stored | null = null;
let running = false;
let started = false;

function newPhoneId(): string {
  let id = '';
  for (let index = 0; index < 20; index += 1) id += Math.floor(Math.random() * 36).toString(36);
  return id;
}

async function load(): Promise<Stored> {
  if (stored !== null) return stored;
  let parsed: Partial<Stored> = {};
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw !== null) parsed = JSON.parse(raw) as Partial<Stored>;
  } catch {
    // A damaged copy starts empty; the computers hold everything it had.
  }
  stored = {
    phoneId: typeof parsed.phoneId === 'string' && parsed.phoneId.length >= 4 ? parsed.phoneId : newPhoneId(),
    entries: parsed.entries ?? {},
    lastSyncAt: parsed.lastSyncAt ?? {},
    refused: parsed.refused ?? {},
  };
  useSettingsSyncStore.setState({ lastSyncAt: stored.lastSyncAt, refused: stored.refused });
  return stored;
}

function categoryOf(key: string): string {
  return key.split('/')[0] ?? '';
}

/** One exchange with each connected computer. */
async function round(): Promise<void> {
  if (running || AppState.currentState !== 'active') return;
  if (!useSettingsStore.getState().settings.settingsSyncThroughPhone) return;
  running = true;
  try {
    const state = await load();
    for (const machine of useMachinesStore.getState().machines) {
      if (isCloudBoxMachineId(machine.id)) continue;
      const link = chatMachineLink(machine);
      if (link.current() !== 'socket') continue;
      const answer = await link.rpc(
        'settingsSyncExchange',
        { phoneId: state.phoneId, name: pairingDeviceName(), entries: Object.values(state.entries) },
        EXCHANGE_TIMEOUT_MS,
      );
      if (answer.error !== null) {
        // A computer that removed this phone says so; an older Ghostex has no settings sync.
        if (answer.error.code === 'syncRemoved') state.refused[machine.id] = answer.error.message;
        continue;
      }
      const result = (answer.result ?? {}) as { entries?: SyncEntry[]; categories?: string[] };
      const categories = new Set(result.categories ?? []);
      for (const key of Object.keys(state.entries)) {
        if (categories.has(categoryOf(key))) delete state.entries[key];
      }
      for (const entry of result.entries ?? []) state.entries[entry.key] = entry;
      state.lastSyncAt[machine.id] = Date.now();
      delete state.refused[machine.id];
    }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    useSettingsSyncStore.setState({ lastSyncAt: { ...state.lastSyncAt }, refused: { ...state.refused } });
  } finally {
    running = false;
  }
}

/** Starts the rounds: every half minute and whenever the app comes to the front. */
export function initSettingsSync(): void {
  if (started) return;
  started = true;
  void load();
  setInterval(() => void round(), ROUND_MS);
  AppState.addEventListener('change', (next) => {
    if (next === 'active') void round();
  });
}
