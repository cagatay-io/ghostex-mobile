/**
 * Agent notifications and the attention list, wired to the app: one `FeedEventSource` for the app's
 * lifetime reads every enabled computer's notification feed over the warm link on every screen, keeps the
 * rows for the attention list and the bell, turns new rows into local notifications (`processHostEvents`),
 * runs the one-time ask and opens the session a notification names when it is tapped.
 *
 * Pushes go through the same gate. A push that comes while the app is in front, or inactive, is one iOS asks the
 * app about: the app takes it, iOS shows nothing of it, and its event goes through `processHostEvents` like a
 * feed row, with the feed row id it carries (`notificationId`) as the event's id, so the push and the row of one
 * event announce once and share the one rate limit; the finished, waiting and error switches apply to it as to
 * any notification the running app posts. A push whose computer the phone cannot name is left to iOS. While the
 * app is out of front (in the background, or inactive) it posts nothing of its own for a feed row of a computer
 * that confirmed it accepted this phone's push registration (`pushComputers`, kept across launches in the record of
 * announced events): only the push announces that event, or the app takes it while inactive. That holds for a row
 * read out of front and for a row read in front whose session list still waited when the app left the front (each
 * read keeps the stretch in front it began in), and it is judged once the stored record is read. A row of any other
 * computer keeps the app's own notification, also one whose registration has no answer yet or whose acceptance was
 * lost with a stored record that could not be read (a push of an older registration can then come as well).
 * Back in front from inactive (without a background phase, which rebaselines every computer), every computer is
 * read again at once and the rows that read brings count as read out of front, because iOS may have shown their
 * pushes itself; every later read is in front again. A push iOS showed while the app was in the background is
 * handed to the record as that event's notification by the background run (`recordPushShownByIos`, `pushStore.ts`),
 * with the channels it used. A tapped notification opens its session and a tapped push marks its row read like a
 * tapped notification of the app; a waiting event's push opens the question card when the session's fresh list
 * shows a pending question (`openWaitingPush`). A tap's opening holds while no later tap came and the person did
 * not leave for another screen or session (`personNavigations`), and each of its steps checks that. At a cold start
 * both wait for the saved computers.
 *
 * Host contracts it reads (feature-detected): the feed endpoints over the
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
import { openDeepLink, personNavigations, tapOpens } from '../app/deepLinks';
import { chatMachineLink } from '../chat/rust/machine-link';
import { useInventoryStore } from '../inventory/store';
import { enabledMachines, machineDisplayLabel, useMachinesStore, type MachineRecord } from '../machines/store';
import { useSettingsStore } from '../settings/store';
import { sessionOnScreen } from '../terminal/zmxDisplay';
import { HOST_EVENT_KINDS, hostEventFromFeedRow, sessionFacts, waitsOnQuestion, type HostEvent } from './events';
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
import { announcedEvents, provenAttention, type AnnouncedEventsStorage, type EventIdentity } from './eventIdentity';
import { processHostEvents, type NotificationData, type NotifyDeps } from './notify';
import { pushEventFromData, pushMachineId, type PushEvent } from './pushMessage';

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
  /**
   * The computers that confirmed they accepted this phone's push registration, as the record of announced events
   * keeps them across launches (`pushAccepted`); null until the stored record is read. While the app is out of front
   * only their pushes announce their events, and Settings says that these computers can notify while Ghostex is
   * closed.
   */
  pushComputers: readonly string[] | null;
};

export const useAttentionFeedStore = create<AttentionFeedState>()(() => ({
  feeds: {},
  permission: null,
  pushComputers: null,
}));

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
  if (!hydrated) return;
  announcedEvents.keepComputers(new Set(machines.map((machine) => machine.id)));
  showPushComputers();
}

/** The stored record of announced events was read: what it knows of the computers' push tokens can be shown. */
let recordRead = false;

/** Settings shows the computers that accepted this phone's push registration, once the stored record is read. */
function showPushComputers(): void {
  if (!recordRead) return;
  const next = announcedEvents.pushAcceptedBy();
  const shown = useAttentionFeedStore.getState().pushComputers;
  if (shown === null || next.length !== shown.length || next.some((id, index) => shown[index] !== id)) {
    useAttentionFeedStore.setState({ pushComputers: next });
  }
}

/**
 * What a computer confirmed about this phone's push token (`pushToken.ts`): it holds it, or it holds none. Kept in
 * the record of announced events across launches, after what an earlier launch stored was read.
 */
export function pushAccepted(machineId: string, holds: boolean): void {
  announcedEvents.whenLoaded(() => {
    announcedEvents.setPushAccepted(machineId, holds);
    showPushComputers();
  });
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
 * The attention list joins its rows to that list (agent, project, "has a question") and
 * new events are mapped with it, whether or not notifications are on. A caller joins
 * the read under way when that read started after the caller's feed snapshot arrived; otherwise it waits for
 * one more read after it, shared by every such caller (a row that came during an older
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

/** Counts the times the app left the front (inactive or background): a stretch in front ends at each. */
let frontStretch = 0;
/** True while the reads that the return from inactive starts begin: they read what came while inactive. */
let readingTheReturn = false;

/** The stretch in front a read starts in, or null while the app is out of front or the read is the return's. */
function frontNow(): number | null {
  return AppState.currentState === 'active' && !readingTheReturn ? frontStretch : null;
}

/** Per computer: the stretch in front its feed read under way began in (`frontNow`). */
const readFronts = new Map<string, number | null>();

/**
 * New events of one computer (feed rows, a push while the app is in front): its session list is read first,
 * because only sessions it lists notify and "has a question" depends on its question count. Feed rows the app was
 * out of front for (`front`, the stretch their read began in, is null or no longer the stretch in front: read while
 * out of front or as the return's, or the app left the front while they waited) post nothing of their own for a
 * computer that confirmed it accepted this phone's push registration: iOS shows the push itself, or asks the app
 * about it while inactive (`takeForegroundPush`); a push that does not come leaves the event to the attention list.
 * That is judged once the stored record is read.
 */
async function notifyHostEvents(
  machineId: string,
  events: readonly HostEvent[],
  route: 'feed' | 'push',
  front: number | null,
): Promise<void> {
  const settings = useSettingsStore.getState().settings.notifications;
  if (!NOTIFICATIONS_SUPPORTED || settings.askedAt === undefined || !settings.enabled) return;
  if (events.length === 0) return;
  // The events count as arrived now, not when the session list answers (`eventIdentity.ts`, rule 4).
  const arrival = announcedEvents.arrive();
  await within(readSessionList(machineId), SESSION_LIST_WAIT_MS);
  announcedEvents.whenLoaded(() => {
    const outOfFront = route === 'feed' && (front === null || front !== frontNow());
    if (outOfFront && announcedEvents.acceptsPush(machineId)) return;
    processHostEvents(events, sessionFactsFor, notifyDeps, arrival);
  }, arrival);
}

/** The kinds a push can notify with (a push without alert, when an agent starts, never does). */
const NOTIFYING_KINDS: ReadonlySet<string> = new Set(HOST_EVENT_KINDS);

/**
 * A push as a host event of the phone's computer it names, or null when it names none. It happened when its row
 * was written, as far as the feed already shows that row, else now (the push comes right after the row).
 */
function pushHostEvent(push: PushEvent): HostEvent | null {
  const machineId = pushMachineId(push.machineId, enabledMachines(useMachinesStore.getState()));
  if (machineId === null) return null;
  const row =
    push.notificationId.length > 0
      ? useAttentionFeedStore.getState().feeds[machineId]?.rows.find((entry) => entry.id === push.notificationId)
      : undefined;
  return {
    machineId,
    sessionId: push.sessionId,
    kind: push.kind,
    eventId: push.notificationId,
    occurredAt: row?.createdAt ?? new Date().toISOString(),
  };
}

/**
 * A push iOS asks the app about (the app is in front, or inactive): true when the app takes it (iOS then shows
 * nothing of it), false when iOS is to show it as it came (data the app cannot read, a computer it cannot name:
 * nothing is lost).
 */
function takeForegroundPush(data: unknown): boolean {
  const push = pushEventFromData(data);
  if (push === null) return false;
  if (!NOTIFYING_KINDS.has(push.kind)) return true;
  const event = pushHostEvent(push);
  if (event === null) return false;
  void notifyHostEvents(event.machineId, [event], 'push', null).catch((error: unknown) => {
    logAppEvent(`Notifications: a push not handled (${failureCategory(error)})`);
  });
  return true;
}

/**
 * A push with an alert that iOS showed while the app was in the background, with its sound when `sound`: the
 * record of announced events takes it as its event's notification whatever the switches and the rate limit say
 * now (`shownBySystem`), so a copy of the event that comes later, from the feed or the Sessions list, announces
 * nothing more, and a push without a sound leaves the event's attention sound to the Sessions list. It counts as
 * shown from now (its arrival), once: `again` is the same presentation recorded once more.
 */
export function recordPushShownByIos(push: PushEvent, sound: boolean, again: boolean): void {
  const kind = HOST_EVENT_KINDS.find((known) => known === push.kind);
  if (kind === undefined) return;
  const event = pushHostEvent(push);
  if (event === null) return;
  const arrival = announcedEvents.arrive();
  announcedEvents.whenLoaded(() => {
    const identity: EventIdentity = {
      machineId: event.machineId,
      sessionId: event.sessionId,
      kind,
      rowId: event.eventId,
      episode: provenAttention(event.occurredAt, sessionFactsFor(event.machineId, event.sessionId)),
    };
    announcedEvents.shownBySystem(identity, sound, { at: arrival.at, again });
  }, arrival);
}

/** Open live feed channels per computer, as their close functions. */
const streams = new Map<string, () => void>();

const source = new FeedEventSource({
  machines: () => feedMachines().map((machine) => ({ id: machine.id, label: machineDisplayLabel(machine) })),
  read: async (machineId) => {
    readFronts.set(machineId, frontNow());
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
    const events = rows
      .map((row) => hostEventFromFeedRow(machineId, row))
      .filter((event): event is HostEvent => event !== null);
    void notifyHostEvents(machineId, events, 'feed', readFronts.get(machineId) ?? null).catch((error: unknown) => {
      logAppEvent(`Notifications: new notification rows not handled (${failureCategory(error)})`);
    });
  },
  log: logAppEvent,
  now: Date.now,
  setInterval: (run, ms) => setInterval(run, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
});

/**
 * Opens the live channel of a computer that offers it, while the app is in front. While the forward is looked up the
 * computer's entry is a reservation of this call: hiding or removing the computer, or the app leaving the front,
 * closes it like an open channel (it leaves the map), and the lookup's answer opens the channel only while that same
 * reservation still stands, so neither a hidden computer nor a later call's reservation gets a channel from it.
 */
function ensureStream(machineId: string): void {
  if (streams.has(machineId) || AppState.currentState !== 'active') return;
  const machine = machineById(machineId);
  if (machine === undefined) return;
  const link = chatMachineLink(machine);
  if (link.capabilities()?.includes(NOTIFICATION_STREAM_CAPABILITY) !== true) return;
  // Reserved while the forward is looked up, so a second read does not open a second socket.
  const reservation = (): void => {
    if (streams.get(machineId) === reservation) streams.delete(machineId);
  };
  streams.set(machineId, reservation);
  void link
    .gxserverLink()
    .then((gxserver) => {
      if (streams.get(machineId) !== reservation) return;
      if (gxserver === null) {
        reservation();
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
    .catch(reservation);
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

/** The one-time ask, also when the master switch is turned on before it ever ran. */
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

/** Taps on notifications so far: a later tap supersedes an earlier tap's opening. */
let taps = 0;

/**
 * A waiting event's push carries no link: the session opens at its question card when the session's fresh list
 * shows a pending question (`waitsOnQuestion`, the rule of a "has a question" notification), else as a tap in the
 * Sessions list opens it. The list is read anew at the tap and waited for at most `SESSION_LIST_WAIT_MS`, so the
 * session never waits longer to open. When the read ends within that, the session opens once, as the list then
 * says. When it does not, the session opens then, as the list last read says, and the tap keeps its question
 * intent: once the fresh list comes and shows a pending question, the question link opens the session's question
 * card in place of what opened. A fresh list without a question or a read that failed (the computer cannot be
 * reached) ends that wait without a further step. Every opening, the question card's too, happens only while the
 * tap's opening is `current` (no later tap, and the person did not leave for another screen or session); otherwise
 * nothing opens, and the question stays in the attention list and the session. No question text is read or carried.
 */
async function openWaitingPush(machineId: string, sessionId: string, current: () => boolean): Promise<void> {
  const open = (question: boolean): void => {
    if (!current()) return;
    openDeepLink(
      sessionDeepLink({ machineId, sessionId, ...(question ? { view: 'question' as const } : {}) }),
      current,
    );
  };
  // Superseded while it waited for the saved computers: no session list is read for it.
  if (!current()) return;
  const machine = machineById(machineId);
  if (machine === undefined) {
    open(waitsOnQuestion(sessionFactsFor(machineId, sessionId)));
    return;
  }
  let ended = false;
  // True when the read brought the computer's list; false when it failed.
  const fresh = useInventoryStore
    .getState()
    .refreshMachineFresh(machine)
    .then(
      () => useInventoryStore.getState().inventoriesByMachineId[machineId]?.lastErrorCode === null,
      (error: unknown) => {
        logAppEvent(
          `${machineDisplayLabel(machine)}: session list for a tapped push not read (${failureCategory(error)})`,
        );
        return false;
      },
    )
    .finally(() => {
      ended = true;
    });
  await within(fresh, SESSION_LIST_WAIT_MS);
  const question = waitsOnQuestion(sessionFactsFor(machineId, sessionId));
  open(question);
  if (ended || question) return;
  if (!(await fresh) || !waitsOnQuestion(sessionFactsFor(machineId, sessionId))) return;
  open(true);
}

/**
 * A tap on a notification: the app's own carries its link; a push opens its session (a waiting event's push:
 * `openWaitingPush`, once the saved computers are loaded). Both mark their row read once the computer is there. The
 * opening is current while no later tap came and the person did not leave for another screen or session since the
 * tap (`personNavigations`; the app's own opening of this session is not theirs, `tapOpens`); the link handler
 * checks that at each of its steps, up to the navigation.
 */
function openTapped(data: Partial<NotificationData>): void {
  const { machineId, sessionId, notificationId } = data;
  if (machineId === undefined || sessionId === undefined) return;
  taps += 1;
  const tap = taps;
  tapOpens(machineId, sessionId);
  const navigations = personNavigations();
  const current = (): boolean => tap === taps && personNavigations() === navigations;
  if (data.url !== undefined) openDeepLink(data.url, current);
  else if (data.kind === 'needsInput') whenComputersLoaded(() => void openWaitingPush(machineId, sessionId, current));
  else openDeepLink(sessionDeepLink({ machineId, sessionId }), current);
  if (notificationId !== undefined && notificationId.length > 0) {
    whenComputersLoaded(() => void updateAttentionFeed(machineId, { action: 'markRead', notificationId }));
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
  installNotificationCentre(openTapped, takeForegroundPush);
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
      .then(() => {
        recordRead = true;
        keepKnownComputers();
        showPushComputers();
      });
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
        readFronts.delete(id);
      }
      useAttentionFeedStore.setState({
        feeds: Object.fromEntries(Object.entries(feeds).filter(([id]) => ids.has(id))),
      });
    }
    // A hidden or removed computer's feed is read no more.
    for (const [id, close] of [...streams]) if (!ids.has(id)) close();
  });
  // Back from the background iOS goes through `inactive` before `active`: the source forgets what it saw at
  // the first state that is no longer `background`, so no read from then on (the return's own, the poll
  // timer's, an announcement's) reports rows written while the app was away (the first-fetch rule); the
  // attention list shows them. Once the app is active it reads every computer at once.
  let away = AppState.currentState === 'background';
  let returning = false;
  // Back in front from inactive without a background phase in between (Control Center, a call, the app switcher,
  // Notification Centre): iOS may have shown the pushes of a computer that accepted this phone's push registration
  // itself meanwhile, without asking the app, and a run then records nothing. So every computer is read again at once
  // (a read from before is dropped), and every row that read brings counts as read out of front (`frontNow`), also
  // one written after the return but before that read answered: such a computer's rows stay their pushes' (or the
  // attention list's), every other computer keeps the app's own notification for them. Every later read is in front
  // again, also while the stored record is still read.
  let inactiveInFront = AppState.currentState === 'inactive';
  AppState.addEventListener('change', (next) => {
    if (next !== 'active') frontStretch += 1;
    if (next === 'background') {
      away = true;
      inactiveInFront = false;
      closeStreams();
      return;
    }
    if (away) {
      away = false;
      returning = true;
      source.rebaseline();
    } else if (next === 'inactive') inactiveInFront = true;
    if (next === 'active' && inactiveInFront) {
      inactiveInFront = false;
      readingTheReturn = true;
      for (const machine of feedMachines()) void source.readAgain(machine.id);
      readingTheReturn = false;
    }
    if (next !== 'active' || !returning) return;
    returning = false;
    void refreshAttentionFeeds();
    void refreshNotificationPermission();
  });
  source.start();
}
