/**
 * Agent notifications and the attention list, wired to the app (S7): one `FeedEventSource` for the app's
 * lifetime reads every enabled computer's notification feed over the warm link on every screen
 * (REQ-NOTIF-001), keeps the rows for the attention list and the bell (REQ-NOTIF-011), turns new rows
 * into local notifications (`processHostEvents`), runs the one-time ask (REQ-NOTIF-014) and opens the
 * session a notification names when it is tapped (REQ-NOTIF-012, -016).
 *
 * Host contracts it reads (feature-detected; `research/spike-host-data.md`): the feed endpoints over the
 * warm link (an older computer on the exec route has no feed for the phone: `legacy`), the
 * `stream=notifications` channel when the computer lists `notificationStream`, the feed kind `failed`, and in
 * the session list `pendingQuestionCount` and the question-card field `awaitingAnswer`, the latter only when
 * the summary's `capabilities` announce it (`sessionFacts`).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { create } from 'zustand';

import { logAppEvent } from '../app/appLog';
import { sessionDeepLink } from '../app/deepLinkHandler';
import { openDeepLink } from '../app/deepLinks';
import { chatMachineLink } from '../chat/rust/machine-link';
import { useInventoryStore } from '../inventory/store';
import { enabledMachines, machineDisplayLabel, useMachinesStore, type MachineRecord } from '../machines/store';
import { useSettingsStore } from '../settings/store';
import { sessionOnScreen } from '../terminal/zmxDisplay';
import { hostEventFromFeedRow, sessionFacts, type HostEvent } from './events';
import { FeedEventSource, FeedUnavailableError, type FeedReadFailure } from './eventSource';
import { FeedRequestError, readFeed, updateFeed, type FeedRpc, type FeedUpdate } from './feedClient';
import { isAccountRow, type FeedRow, type FeedSnapshot } from './feedContract';
import { NOTIFICATION_STREAM_CAPABILITY, openFeedStream } from './feedStream';
import { runFirstAsk, type PermissionState } from './firstAsk';
import {
  expoNotificationCentre,
  expoPermission,
  installNotificationCentre,
  NOTIFICATIONS_SUPPORTED,
} from './notificationCentre';
import { announcedEvents, type AnnouncedEventsStorage } from './eventIdentity';
import { processHostEvents, type NotificationData, type NotifyDeps } from './notify';

const FEED_REQUEST_TIMEOUT_MS = 10_000;
/** How long new events wait for the computer's fresh session list before they are mapped with what is there. */
const SESSION_LIST_WAIT_MS = 5_000;

export type MachineFeedStatus = 'loading' | 'ready' | FeedReadFailure;

export type MachineFeedState = { status: MachineFeedStatus; rows: readonly FeedRow[] };

type AttentionFeedState = {
  /** Per enabled computer; a computer appears once its first read finished. */
  feeds: Record<string, MachineFeedState>;
  /** iOS's notification permission; null until read (and always on Android). */
  permission: PermissionState | null;
};

export const useAttentionFeedStore = create<AttentionFeedState>()(() => ({ feeds: {}, permission: null }));

/** The computers the source reads: enabled ones whose sign-in the inventory has not seen fail. */
function feedMachines(): MachineRecord[] {
  const inventories = useInventoryStore.getState().inventoriesByMachineId;
  return enabledMachines(useMachinesStore.getState()).filter((machine) => {
    const failure = inventories[machine.id]?.lastErrorCode;
    return failure !== 'authFailed' && failure !== 'hostKeyChanged';
  });
}

function machineById(machineId: string): MachineRecord | undefined {
  return enabledMachines(useMachinesStore.getState()).find((machine) => machine.id === machineId);
}

/** Requests to this computer's gxserver over the warm link; throws `FeedUnavailableError` without one. */
async function feedRpc(machine: MachineRecord): Promise<FeedRpc> {
  const link = chatMachineLink(machine);
  const route = await link.route();
  if (route === 'legacy') throw new FeedUnavailableError('legacy');
  if (route !== 'socket') throw new FeedUnavailableError('unreachable');
  return async (method, params) => {
    const answer = await link.rpc(method, params, FEED_REQUEST_TIMEOUT_MS);
    if (answer.error?.code === 'unreachable') throw new FeedUnavailableError('unreachable');
    if (answer.error?.code === 'notFound') throw new FeedUnavailableError('legacy');
    return answer;
  };
}

function setFeed(machineId: string, feed: MachineFeedState): void {
  useAttentionFeedStore.setState((state) => ({ feeds: { ...state.feeds, [machineId]: feed } }));
}

/** The computer's feed as just read or changed: the list shows it, the event record keeps its rows. */
function applySnapshot(machineId: string, snapshot: FeedSnapshot): void {
  setFeed(machineId, { status: 'ready', rows: snapshot.rows });
  announcedEvents.retainFeed(machineId, snapshot.rows);
}

/**
 * Why a request to a computer failed, as a fixed word for the app log. Never the computer's or the
 * system's own error text: the app log can be exported, and that text can carry paths or agent output.
 */
function failureCategory(error: unknown): string {
  if (error instanceof FeedUnavailableError) return error.reason;
  if (error instanceof FeedRequestError) return error.category;
  return 'unexpected';
}

const notifyDeps: NotifyDeps = {
  centre: expoNotificationCentre,
  announced: announcedEvents,
  settings: () => useSettingsStore.getState().settings.notifications,
  soundOn: () => useSettingsStore.getState().settings.doneNotificationSound,
  onScreen: sessionOnScreen,
  log: logAppEvent,
};

/** Where the record of announced events (`eventIdentity.ts`, rule 4) is kept across launches. */
const ANNOUNCED_EVENTS_STORAGE_KEY = 'notifications.announced.v1';

const announcedEventsStorage: AnnouncedEventsStorage = {
  read: () => AsyncStorage.getItem(ANNOUNCED_EVENTS_STORAGE_KEY),
  write: (record) => AsyncStorage.setItem(ANNOUNCED_EVENTS_STORAGE_KEY, record),
  failed: (problem) =>
    logAppEvent(
      problem === 'read'
        ? 'Notifications: the stored record of announced events was not read; it is written anew'
        : problem === 'write'
          ? 'Notifications: the record of announced events was not saved'
          : 'Notifications: the record of announced events holds more than its bound; it keeps them all',
    ),
};

/** The record keeps the computers on the phone (hidden ones too); a removed one's feed is read no more. */
function keepKnownComputers(): void {
  const { hydrated, machines } = useMachinesStore.getState();
  if (hydrated) announcedEvents.keepComputers(new Set(machines.map((machine) => machine.id)));
}

function sessionFactsFor(machineId: string, sessionId: string) {
  return sessionFacts(useInventoryStore.getState().inventoriesByMachineId[machineId]?.summary, sessionId);
}

/** Waits for `promise` at most `ms`. */
function within(promise: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    void promise.finally(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** Per computer: how many feed snapshots arrived, so a session-list read can tell which rows it is newer than. */
const feedSnapshots = new Map<string, number>();

/** The session-list read under way per computer: the snapshots it is newer than, and one queued after it. */
type SessionListRead = { promise: Promise<void>; newerThan: number; next: Promise<void> | null };
const sessionListReads = new Map<string, SessionListRead>();

/**
 * Reads a computer's session list anew, so that the answer is newer than the feed rows that asked for it.
 * The attention list joins its rows to that list (agent, project, "has a question"; REQ-NOTIF-011, -017) and
 * new events are mapped with it (REQ-NOTIF-007, -015), whether or not notifications are on. A caller joins
 * the read under way when that read started after the caller's feed snapshot arrived; otherwise it waits for
 * one more read after it, shared by every such caller (review s7-r1 r2 K-1: a row that came during an older
 * read is not mapped with that read's answer). At most one read runs per computer, one more waits.
 */
function readSessionList(machineId: string): Promise<void> {
  const machine = machineById(machineId);
  if (machine === undefined) return Promise.resolve();
  const running = sessionListReads.get(machineId);
  if (running === undefined) return startSessionListRead(machine);
  if (running.newerThan >= (feedSnapshots.get(machineId) ?? 0)) return running.promise;
  running.next ??= running.promise.then(() => startSessionListRead(machine));
  return running.next;
}

function startSessionListRead(machine: MachineRecord): Promise<void> {
  const read: SessionListRead = {
    promise: Promise.resolve(),
    newerThan: feedSnapshots.get(machine.id) ?? 0,
    next: null,
  };
  read.promise = Promise.resolve()
    // `refreshMachineFresh` lets an inventory read already under way finish and then asks again.
    .then(() => useInventoryStore.getState().refreshMachineFresh(machine))
    .catch((error: unknown) => {
      logAppEvent(
        `${machineDisplayLabel(machine)}: session list for notifications not read (${failureCategory(error)})`,
      );
    })
    .finally(() => {
      if (sessionListReads.get(machine.id) === read && read.next === null) sessionListReads.delete(machine.id);
    });
  sessionListReads.set(machine.id, read);
  return read.promise;
}

/** Whether `rows` hold a session's row that `before` did not have as it is now (a new row, or a new kind). */
function hasRowsToJoin(before: readonly FeedRow[], rows: readonly FeedRow[]): boolean {
  const kinds = new Map(before.map((row) => [row.id, row.kind]));
  return rows.some((row) => !isAccountRow(row) && kinds.get(row.id) !== row.kind);
}

/**
 * New rows of one computer: its session list is read first, because only sessions it lists notify
 * (REQ-NOTIF-007) and "has a question" depends on its question count (REQ-NOTIF-015).
 */
async function notifyNewRows(machineId: string, rows: readonly FeedRow[]): Promise<void> {
  const settings = useSettingsStore.getState().settings.notifications;
  if (!NOTIFICATIONS_SUPPORTED || settings.askedAt === undefined || !settings.enabled) return;
  const events = rows
    .map((row) => hostEventFromFeedRow(machineId, row))
    .filter((event): event is HostEvent => event !== null);
  if (events.length === 0) return;
  // The rows count as arrived now, not when the session list answers (`eventIdentity.ts`, rule 4).
  const arrival = announcedEvents.arrive();
  await within(readSessionList(machineId), SESSION_LIST_WAIT_MS);
  processHostEvents(events, sessionFactsFor, notifyDeps, arrival);
}

/** Open live feed channels (H2) per computer, as their close functions. */
const streams = new Map<string, () => void>();

const source = new FeedEventSource({
  machines: () => feedMachines().map((machine) => ({ id: machine.id, label: machineDisplayLabel(machine) })),
  read: async (machineId) => {
    const machine = machineById(machineId);
    if (machine === undefined) throw new FeedUnavailableError('unreachable');
    const snapshot = await readFeed(await feedRpc(machine));
    feedSnapshots.set(machineId, (feedSnapshots.get(machineId) ?? 0) + 1);
    return snapshot;
  },
  onRead: (machineId, outcome) => {
    if (outcome.kind === 'ready') {
      const before = useAttentionFeedStore.getState().feeds[machineId]?.rows ?? [];
      applySnapshot(machineId, outcome.snapshot);
      // The list's join is read for new rows also on a baseline read and with notifications off.
      if (hasRowsToJoin(before, outcome.snapshot.rows)) void readSessionList(machineId);
      ensureStream(machineId);
      return;
    }
    const previous = useAttentionFeedStore.getState().feeds[machineId];
    // Rows already read stay visible under the notice that the computer cannot be reached now.
    setFeed(machineId, { status: outcome.reason, rows: previous?.rows ?? [] });
  },
  onNewRows: (machineId, rows) => {
    void notifyNewRows(machineId, rows).catch((error: unknown) => {
      logAppEvent(`Notifications: new notification rows not handled (${failureCategory(error)})`);
    });
  },
  log: logAppEvent,
  now: Date.now,
  setInterval: (run, ms) => setInterval(run, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
});

/** Opens the live channel of a computer that offers it, while the app is in front. */
function ensureStream(machineId: string): void {
  if (streams.has(machineId) || AppState.currentState !== 'active') return;
  const machine = machineById(machineId);
  if (machine === undefined) return;
  const link = chatMachineLink(machine);
  if (link.capabilities()?.includes(NOTIFICATION_STREAM_CAPABILITY) !== true) return;
  // Reserved while the forward is looked up, so a second read does not open a second socket.
  streams.set(machineId, () => undefined);
  void link
    .gxserverLink()
    .then((gxserver) => {
      if (gxserver === null || streams.get(machineId) === undefined) {
        streams.delete(machineId);
        return;
      }
      const close = openFeedStream(
        gxserver,
        () => void source.refresh(machineId),
        () => {
          if (streams.get(machineId) === close) streams.delete(machineId);
          source.setStreamed(machineId, false);
        },
      );
      streams.set(machineId, close);
      source.setStreamed(machineId, true);
    })
    .catch(() => streams.delete(machineId));
}

function closeStreams(): void {
  for (const close of [...streams.values()]) close();
  streams.clear();
}

/**
 * Reads every computer's feed now (the attention list came into view or was pulled, the app came back). A
 * waiting row's "has a question" follows its session's question fields (an open question card, a counted
 * pending question), which can change while the row stays as it is: so this also reads the session list of a
 * computer whose feed has a needsInput row, one read per computer and refresh, not on every poll.
 */
export function refreshAttentionFeeds(): Promise<void> {
  return Promise.all(
    feedMachines().map(async (machine) => {
      await source.refresh(machine.id);
      const rows = useAttentionFeedStore.getState().feeds[machine.id]?.rows ?? [];
      if (rows.some((row) => row.kind === 'needsInput' && !isAccountRow(row))) void readSessionList(machine.id);
    }),
  ).then(() => undefined);
}

/** Sends one change to a computer's feed; false (and a log line) when it did not take it. */
export async function updateAttentionFeed(machineId: string, update: FeedUpdate): Promise<boolean> {
  const machine = machineById(machineId);
  if (machine === undefined) return false;
  try {
    applySnapshot(machineId, await updateFeed(await feedRpc(machine), update));
    return true;
  } catch (error) {
    logAppEvent(`${machineDisplayLabel(machine)}: notification ${update.action} failed (${failureCategory(error)})`);
    return false;
  }
}

/** Mark All Read or Clear All on every computer whose list is shown; false when one did not take it. */
export async function updateAllAttentionFeeds(action: 'markAllRead' | 'clearAll'): Promise<boolean> {
  const ready = Object.entries(useAttentionFeedStore.getState().feeds).filter(([, feed]) => feed.status === 'ready');
  const results = await Promise.all(ready.map(([machineId]) => updateAttentionFeed(machineId, { action })));
  return results.every(Boolean);
}

export async function refreshNotificationPermission(): Promise<void> {
  if (!NOTIFICATIONS_SUPPORTED) return;
  try {
    useAttentionFeedStore.setState({ permission: await expoPermission.current() });
  } catch {
    // The page keeps the last known state.
  }
}

/** The one-time ask (REQ-NOTIF-014), also when the master switch is turned on before it ever ran. */
export async function askForNotificationsOnce(): Promise<void> {
  if (!NOTIFICATIONS_SUPPORTED) return;
  const settings = useSettingsStore.getState();
  try {
    await runFirstAsk(
      expoPermission,
      {
        get: () => useSettingsStore.getState().settings.notifications,
        set: (next) => settings.setSetting('notifications', next),
      },
      () => new Date(),
    );
  } catch (error) {
    logAppEvent(`Notifications: the permission ask failed (${failureCategory(error)})`);
  }
  await refreshNotificationPermission();
}

function openTapped(data: Partial<NotificationData>): void {
  if (data.machineId === undefined || data.sessionId === undefined) return;
  openDeepLink(data.url ?? sessionDeepLink({ machineId: data.machineId, sessionId: data.sessionId }));
  if (data.notificationId !== undefined && data.notificationId.length > 0) {
    void updateAttentionFeed(data.machineId, { action: 'markRead', notificationId: data.notificationId });
  }
}

/** Runs `run` once the saved computers are loaded: at once when they are, else when they come (a cold start). */
function whenComputersLoaded(run: () => void): void {
  if (useMachinesStore.getState().hydrated) {
    run();
    return;
  }
  let ran = false;
  const unsubscribe = useMachinesStore.subscribe((state) => {
    if (ran || !state.hydrated) return;
    ran = true;
    unsubscribe();
    run();
  });
}

let installed = false;

/** Install once at app startup; runs for the app's lifetime. */
export function initAttentionNotifications(): void {
  if (installed) return;
  installed = true;
  installNotificationCentre(openTapped);
  // What was announced before this launch, so a late copy of it stays silent (`eventIdentity.ts`, rule 4).
  // Every notification and attention sound waits until it is read (invariant I1), then goes out in order. The
  // record names the computers by their id, so it is read once the saved computers are loaded: that load can merge
  // duplicate records and move what the phone saved under a dropped id, this record included, to the one it keeps.
  whenComputersLoaded(() => {
    void announcedEvents
      .load(announcedEventsStorage)
      .catch((error: unknown) => {
        logAppEvent(`Notifications: events that waited for the record not all handled (${failureCategory(error)})`);
      })
      .then(keepKnownComputers);
  });
  if (useSettingsStore.getState().hydrated) void askForNotificationsOnce();
  else {
    const unsubscribe = useSettingsStore.subscribe((state) => {
      if (!state.hydrated) return;
      unsubscribe();
      void askForNotificationsOnce();
    });
  }
  // A removed or hidden computer leaves the list and closes its channel; the event record keeps a hidden one's
  // record and a removed one's events of the last two hours (`eventIdentity.ts`, rule 4).
  useMachinesStore.subscribe(() => {
    keepKnownComputers();
    const ids = new Set(enabledMachines(useMachinesStore.getState()).map((machine) => machine.id));
    const feeds = useAttentionFeedStore.getState().feeds;
    if (Object.keys(feeds).some((id) => !ids.has(id))) {
      for (const id of Object.keys(feeds)) {
        if (ids.has(id)) continue;
        feedSnapshots.delete(id);
      }
      useAttentionFeedStore.setState({
        feeds: Object.fromEntries(Object.entries(feeds).filter(([id]) => ids.has(id))),
      });
    }
    for (const [id, close] of [...streams]) if (!ids.has(id)) close();
  });
  // Back from the background iOS goes through `inactive` before `active`: the source forgets what it saw at
  // the first state that is no longer `background`, so no read from then on (the return's own, the poll
  // timer's, an announcement's) reports rows written while the app was away (REQ-NOTIF-009, derived); the
  // attention list shows them (D-060). Once the app is active it reads every computer at once.
  let away = AppState.currentState === 'background';
  let returning = false;
  AppState.addEventListener('change', (next) => {
    if (next === 'background') {
      away = true;
      closeStreams();
      return;
    }
    if (away) {
      away = false;
      returning = true;
      source.rebaseline();
    }
    if (next !== 'active' || !returning) return;
    returning = false;
    void refreshAttentionFeeds();
    void refreshNotificationPermission();
  });
  source.start();
}
