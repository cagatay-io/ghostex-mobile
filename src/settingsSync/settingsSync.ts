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
import { useInventoryStore } from '../inventory/store';
import { useSettingsStore, type GhostexSettings } from '../settings/store';
import {
  extractSyncedAppearancePatch,
  isAppearanceSyncActive,
  pickAppearanceSyncUpdates,
} from './appearanceSync';
import {
  computerDiffersFromSynced,
  SIDEBAR_ORGANIZATION_PREFIX,
  syncedSidebarValues,
  type SidebarOrganization,
  type SidebarOrganizationKey,
} from './sidebarOrganization';
import { useSyncedEntriesStore } from './syncedEntries';

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
  /** Per computer id, the categories it synced at the last exchange (only what this phone needs to know). */
  categories: Record<string, string[]>;
  /** Last applied HLC per `appearance/setting/*` key so inbound sync applies once and never overwrites newer local edits. */
  appliedAppearanceHlcs: Record<string, string>;
};

/** What Settings › Sync shows: per computer id, when it last synced or why it refused. */
export const useSettingsSyncStore = create<{
  lastSyncAt: Record<string, number>;
  refused: Record<string, string>;
}>(() => ({ lastSyncAt: {}, refused: {} }));

function applySyncedAppearance(state: Stored): boolean {
  if (!useSettingsStore.getState().hydrated) return false;
  if (!useSettingsStore.getState().settings.settingsSyncThroughPhone) return false;
  const { patch, nextAppliedHlcs, changed } = extractSyncedAppearancePatch(
    state.entries,
    state.appliedAppearanceHlcs,
  );
  if (!changed) return false;
  state.appliedAppearanceHlcs = nextAppliedHlcs;
  if (Object.keys(patch).length > 0) {
    useSettingsStore.getState().patchSettings(patch);
  }
  return true;
}

function publishEntries(state: Stored): void {
  const values: Record<string, unknown> = {};
  const origins: Record<string, string> = {};
  for (const entry of Object.values(state.entries)) {
    if (entry.value === undefined || entry.value === null) continue;
    values[entry.key] = entry.value;
    origins[entry.key] = entry.origin;
  }
  useSyncedEntriesStore.setState({ loaded: true, values, origins, categoriesByMachine: { ...state.categories } });
}

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
    categories: parsed.categories ?? {},
    appliedAppearanceHlcs: parsed.appliedAppearanceHlcs ?? {},
  };
  useSettingsSyncStore.setState({ lastSyncAt: stored.lastSyncAt, refused: stored.refused });
  publishEntries(stored);
  if (applySyncedAppearance(stored)) {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // Kept for this run; applied settings are already persisted in settings.v1.
    }
  }
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
      const sent = new Map(Object.values(state.entries).map((entry) => [entry.key, entry.hlc]));
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
      for (const [key, entry] of Object.entries(state.entries)) {
        // What the computer was sent comes back merged; an edit made here since then stays.
        if (categories.has(categoryOf(key)) && sent.get(key) === entry.hlc) delete state.entries[key];
      }
      for (const entry of result.entries ?? []) {
        // An edit made on this phone while the exchange was under way is newer than what came back.
        const current = state.entries[entry.key];
        if (current !== undefined && current.hlc > entry.hlc) continue;
        state.entries[entry.key] = entry;
      }
      state.categories[machine.id] = [...categories];
      state.lastSyncAt[machine.id] = Date.now();
      delete state.refused[machine.id];
    }
    applySyncedAppearance(state);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    useSettingsSyncStore.setState({ lastSyncAt: { ...state.lastSyncAt }, refused: { ...state.refused } });
    publishEntries(state);
  } finally {
    running = false;
    if (againAfterRound) {
      againAfterRound = false;
      syncSoon();
    }
  }
}

let againAfterRound = false;
let soonTimer: ReturnType<typeof setTimeout> | null = null;

/** One exchange shortly (an edit made here, or a computer whose list shows a value the phone doesn't hold yet). */
export function syncSoon(): void {
  if (running) {
    againAfterRound = true;
    return;
  }
  if (soonTimer !== null) return;
  soonTimer = setTimeout(() => {
    soonTimer = null;
    void round();
  }, 400);
}

/**
 * The next stamp after every stamp this phone holds (gx-core settings_sync/hlc.rs `next_hlc`, the same text):
 * `<wall ms, 13 digits>-<counter, 6 digits>-<node>`, so a phone whose clock runs behind still writes after what it
 * has seen.
 */
function nextHlc(state: Stored, node: string): string {
  let lastWall = 0;
  let lastCounter = 0;
  for (const entry of Object.values(state.entries)) {
    const [wallText, counterText] = entry.hlc.split('-');
    const wall = Number(wallText);
    const counter = Number(counterText);
    if (!Number.isFinite(wall) || !Number.isFinite(counter)) continue;
    if (wall > lastWall || (wall === lastWall && counter > lastCounter)) {
      lastWall = wall;
      lastCounter = counter;
    }
  }
  const now = Date.now();
  const [wall, counter] = now > lastWall ? [now, 0] : [lastWall, lastCounter + 1];
  return `${String(wall).padStart(13, '0')}-${String(counter).padStart(6, '0')}-${node}`;
}

/**
 * Several synced keys updated together in one persist and one exchange round (for example a theme
 * or artwork change on this phone). When `recordAppliedAppearance` is true, each written HLC is
 * recorded in `appliedAppearanceHlcs` so our own edit never echoes back as an inbound patch.
 */
export async function editSyncedEntries(
  updates: ReadonlyArray<readonly [string, unknown]>,
  recordAppliedAppearance = false,
): Promise<void> {
  if (updates.length === 0) return;
  const state = await load();
  const origin = `phone-${state.phoneId}`;
  const originName = pairingDeviceName();
  let changed = false;
  for (const [key, value] of updates) {
    const current = state.entries[key];
    if (current !== undefined && JSON.stringify(current.value ?? null) === JSON.stringify(value ?? null)) {
      if (recordAppliedAppearance) state.appliedAppearanceHlcs[key] = current.hlc;
      continue;
    }
    const hlc = nextHlc(state, origin);
    state.entries[key] = {
      key,
      value,
      hlc,
      parent: current?.hlc ?? null,
      origin,
      originName,
    };
    if (recordAppliedAppearance) state.appliedAppearanceHlcs[key] = hlc;
    changed = true;
  }
  if (!changed) return;
  publishEntries(state);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Kept for this run; the next exchange still carries it.
  }
  syncSoon();
}

/**
 * A change made on this phone to a synced key (gx-core settings_sync/entries.rs `local_edit`): stored with a new
 * stamp under the phone's own member id, so the next exchange hands it to every computer, where the newest stamp of
 * a key wins as between computers. Nothing is written when the key already says `value`.
 */
export async function editSyncedEntry(key: string, value: unknown): Promise<void> {
  await editSyncedEntries([[key, value]]);
}

/** Starts the rounds: every half minute and whenever the app comes to the front. */
export function initSettingsSync(): void {
  if (started) return;
  started = true;
  void load();
  setInterval(() => void round(), ROUND_MS);
  useSettingsStore.subscribe((state, previous) => {
    if (state.hydrated && !previous.hydrated && stored !== null) {
      if (applySyncedAppearance(stored)) {
        void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stored)).catch(() => {});
      }
    }
  });
  useInventoryStore.subscribe((state, previous) => {
    if (state.inventoriesByMachineId !== previous.inventoriesByMachineId) exchangeWhenAComputerChanged();
  });
  AppState.addEventListener('change', (next) => {
    if (next === 'active') void round();
  });
}

/** What made the last early exchange, per computer, so one difference that stays (a value it refuses) asks once. */
const askedFor = new Map<string, string>();

/**
 * A computer that syncs Sidebar organization shows a value other than the synced one: it was changed there since the
 * last exchange (or has not taken this phone's edit yet), so the two meet now and the change shows on the phone in a
 * moment rather than on the next half-minute round.
 */
function exchangeWhenAComputerChanged(): void {
  const { categoriesByMachine, values } = useSyncedEntriesStore.getState();
  const synced = syncedSidebarValues(values);
  for (const [machineId, inventory] of Object.entries(useInventoryStore.getState().inventoriesByMachineId)) {
    if (!(categoriesByMachine[machineId] ?? []).includes('spaces') || inventory.serverSummary === null) continue;
    const difference = computerDiffersFromSynced(inventory.serverSummary, synced);
    if (difference === null) {
      askedFor.delete(machineId);
      continue;
    }
    if (askedFor.get(machineId) === difference) continue;
    askedFor.set(machineId, difference);
    syncSoon();
  }
}

/**
 * A Sidebar organization setting changed on this phone (its Settings page or a list menu): applied here at once and
 * handed to every computer at the next exchange, which runs in a moment.
 */
export function setSidebarSetting<K extends SidebarOrganizationKey>(key: K, value: SidebarOrganization[K]): void {
  void editSyncedEntry(`${SIDEBAR_ORGANIZATION_PREFIX}${key}`, value);
}

/**
 * Applies a theme/artwork settings patch locally on this phone and, when Settings Sync is carrying
 * Appearance with at least one computer, forwards the synced Appearance keys (`windowArt`,
 * `windowArtLight`, `windowArtDim`, `themeRoles`, colours and palettes) to the next exchange.
 * Desktop-only window transparency keys are never written by the phone.
 */
export function patchThemeSettings(patch: Partial<GhostexSettings>): void {
  useSettingsStore.getState().patchSettings(patch);
  if (!useSettingsStore.getState().settings.settingsSyncThroughPhone) return;
  const { categoriesByMachine, values } = useSyncedEntriesStore.getState();
  if (!isAppearanceSyncActive(categoriesByMachine, values)) return;
  const updates = pickAppearanceSyncUpdates(patch);
  if (updates.length > 0) {
    void editSyncedEntries(updates, true);
  }
}
