/// <reference types="node" />
/**
 * Run with `bun test src/notifications/eventIdentity.model.test.ts`. The three invariants of the record of
 * announced events (`eventIdentity.ts`), driven through both real announcing routes (`processHostEvents` for
 * feed rows and pushes, `announceAttentionTransitions` for the Sessions list's attention sound) and checked
 * against an independent reference after every step of long random sequences, and at fixed counterexamples.
 *
 * The reference counts what the person actually gets: every notification request and every attention sound,
 * with its time. It decides which deliveries are one event from the host's own origin and the identity
 * contract: a row id and kind is one event; a Sessions-list copy is the first event of the row the computer
 * names for the attention (`attention.notificationId`, sent by some computers of a sequence and not by others),
 * and without that name an event of its own, its attention's, which no row joins. It checks:
 *
 * - I1: an event gets at most one notification and at most one sound, over all routes, and none from a
 *   delivery held back for the session open on screen or from a later copy of an event so held back.
 * - I2: a delivery whose notification (feed, push) or sound (Sessions list) the event has not had yet gets it,
 *   or is held back by the rate limit at a moment the reference's own count of what the person got says it
 *   must be; never silently dropped. A delivery that came while the stored record loaded is handled once it
 *   loaded, in the order it came.
 * - The rate (at most 8 notifications and sounds a minute, one per session every 20 s; only a row's
 *   notification within 20 s after the sound of the event that named the row is part of that sound) holds for
 *   every output, across launches.
 * - I3: after every step the record holds at most what took a grant within its window (from the arrival of
 *   the oldest copy still waiting) plus the rows of the computers' feeds as last read and one event per
 *   session, and never reports its own bound passed; the stored record matches it, keeps at most a minute of
 *   rate grants and drops a removed computer after its window. The ids of events seen on screen stay within
 *   their own bound per computer.
 *
 * Two kinds of modeled events may cause deviations, and only those the two accepted exceptions describe: the app
 * ended between showing and saving (a restart that does not wait for the record's write: each event that step
 * touched may be announced once more, or held although its other part came, and what was shown in that step no
 * longer counts for the rate); and the clock changed by hand (each event known then may be announced once more,
 * deliveries may be held for 60 s, and after a forward change of any size the rate counts just what came after
 * it, for that minute: at most one more batch; the outputs that took that batch after a change of less than a
 * minute are counted for their own test).
 *
 * A sequence runs on two computers with their own sessions: rows are written (a session's new row is its new
 * attention and replaces its unread older row, the feed keeps its newest rows, rows are cleared), a row's kind
 * changes in place, a session leaves attention, the feed is read as the app reads it (the first read of a
 * launch, of a computer shown again or after a gap longer than the app's slowest read interval only records;
 * later reads report new and changed rows, and may bring a row they reported again while it stays in the
 * feed), the Sessions list is read (after new rows, as the app reads it then, and on its own; its first pass
 * of a launch only records; it keeps what it saw while a computer was hidden), each event's push is sent once
 * at the event and arrives at most an hour later or not at all, in any order, the app restarts with a stored
 * record that loads at once, after seconds, or only after hours, or is ended before its write, the clock is
 * set back or forward, bursts hit the rate limit, a computer is hidden, shown again, removed and added again,
 * the attention sound is switched off and on, and the person opens a session on screen and leaves it again.
 * Every sequence comes from a seed; a failure names the seed, the step and the invariant.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  ANNOUNCED_WINDOW_MS,
  AnnouncedEvents,
  SEEN_ON_SCREEN_IDS,
  type AnnouncedEventsStorage,
  type EventIdentity,
} from './eventIdentity';
import { HOST_EVENT_KINDS, type HostEvent, type HostEventKind, type SessionFacts } from './events';
import { FEED_RETENTION_ROWS } from './feedContract';
import { announceAttentionTransitions, processHostEvents, type NotificationRequest } from './notify';
import type { NotificationSettings } from './settings';

/** The host contract and the rate rule, as the requirements state them. */
const PUSH_TTL_MS = 60 * 60 * 1000;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 8;
const RATE_PER_SESSION_MS = 20_000;
/** How long after a clock change its deviations are allowed. */
const CLOCK_GRACE_MS = 60_000;
/** A forward clock change below this is counted on its own (`subMinuteForward`); it has the same exception. */
const SHORT_FORWARD_MS = 60_000;
/** Chance per step that the person switches the attention sound off or on. */
const SOUND_SWITCH = 0.01;

const ALL_ON: NotificationSettings = {
  enabled: true,
  finished: true,
  waiting: true,
  error: true,
  askedAt: new Date(0).toISOString(),
};

const HELD_NOTIFICATION = 'Notification held back by the rate limit';
const HELD_SOUND = 'Attention sound held back by the rate limit';

type Random = {
  int(min: number, max: number): number;
  chance(probability: number): boolean;
  /** One of `items`, which must not be empty. */
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: T[]): T[];
};

/** A seeded generator (mulberry32): the same seed replays the same sequence. */
function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  return {
    int,
    chance: (probability) => next() < probability,
    pick: (items) => items[int(0, items.length - 1)],
    shuffle(items) {
      for (let i = items.length - 1; i > 0; i -= 1) {
        const j = int(0, i);
        [items[i], items[j]] = [items[j], items[i]];
      }
      return items;
    },
  };
}

/** The facts the phone's session list gives for a listed session; its attention as the host says. */
function sessionFacts(attention: { id: string; enteredAt: number } | undefined): SessionFacts {
  return {
    projectId: 'p1',
    agentLabel: 'Agent',
    agentIconId: 'claude',
    projectName: 'project',
    title: '',
    pendingQuestionCount: 0,
    awaitingAnswer: false,
    attentionId: attention?.id ?? '',
    attentionEnteredAt: attention === undefined ? '' : new Date(attention.enteredAt).toISOString(),
  };
}

/** `value[key]` when `value` is an object that has it (the stored record is checked as plain JSON). */
function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && key in value ? Reflect.get(value, key) : undefined;
}

/** Lets every queued promise step run (the record's writes, a finished load). */
async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

/** Lets the record's write after one task of the app run, as the app does between tasks. */
async function settle(): Promise<void> {
  for (let i = 0; i < 3; i += 1) await Promise.resolve();
}

/**
 * What a reference event had: its notification and sound (and when the sound came, real time), its
 * announcements, whether it was seen on screen, how many repeats an exception allows it (`spare`), and
 * whether one of its announcements was lost with an ended app (`lost`).
 */
type EventState = {
  notified: boolean;
  sounded: boolean;
  soundedAt: number | null;
  acts: number;
  seen: boolean;
  spare: number;
  lost: boolean;
};

const freshState = (): EventState => ({
  notified: false,
  sounded: false,
  soundedAt: null,
  acts: 0,
  seen: false,
  spare: 0,
  lost: false,
});

/** One notification or sound that took a place in the rate: its real and phone time and its session. */
type Output = { real: number; phone: number; session: string; lost: boolean };

/** A Sessions-list copy naming its row that was announced or seen and that the row has not taken yet. */
type ListCopy = {
  event: string;
  machineId: string;
  sessionId: string;
  attention: string;
  /** The row the computer named. */
  rowId: string;
  /** When it was handled (its sound played or it was seen), on the phone's clock. */
  phone: number;
};

/**
 * The reference's events: which deliveries are one event, and what each had. Two events found to be one only
 * later (each announced or seen before the link could be known) are joined without counting that as a repeat.
 */
class ReferenceEvents {
  private readonly parent = new Map<string, string>();
  private readonly state = new Map<string, EventState>();
  /** Per row (`machine|row id`): the first of its events announced or seen. */
  readonly rowFirsts = new Map<string, string>();
  /** Sessions-list copies naming their row that the row has not taken yet. */
  copies: ListCopy[] = [];
  /** Every notification and sound that took a place in the rate, oldest first. */
  readonly outputs: Output[] = [];

  find(key: string): string {
    let root = key;
    while (this.parent.has(root)) root = this.parent.get(root) ?? root;
    return root;
  }

  of(key: string): EventState {
    const root = this.find(key);
    let state = this.state.get(root);
    if (state === undefined) {
      state = freshState();
      this.state.set(root, state);
    }
    return state;
  }

  join(left: string, right: string): void {
    const a = this.find(left);
    const b = this.find(right);
    if (a === b) return;
    const sa = this.of(a);
    const sb = this.of(b);
    this.parent.set(b, a);
    const sounded = [sa.soundedAt, sb.soundedAt].filter((at): at is number => at !== null);
    this.state.set(a, {
      notified: sa.notified || sb.notified,
      sounded: sa.sounded || sb.sounded,
      soundedAt: sounded.length === 0 ? null : Math.max(...sounded),
      acts: sa.acts + sb.acts,
      seen: sa.seen || sb.seen,
      spare: sa.spare + sb.spare,
      lost: sa.lost || sb.lost,
    });
    this.state.delete(b);
  }

  /** Every event announced or seen gets one more allowed repeat (a clock change). */
  spareAll(): void {
    for (const state of this.state.values()) if (state.acts > 0 || state.seen) state.spare += 1;
  }

  /**
   * Whether a new output for `session` at `real` keeps the rate, counting the outputs not lost with an ended
   * app, and only those from the `from`-th output on (the first after a clock change).
   */
  rateAllows(real: number, session: string, from: number): boolean {
    let recent = 0;
    for (let i = this.outputs.length - 1; i >= from; i -= 1) {
      const output = this.outputs[i];
      if (real - output.real >= RATE_WINDOW_MS) break;
      if (output.lost) continue;
      recent += 1;
      if (output.session === session && real - output.real < RATE_PER_SESSION_MS) return false;
    }
    return recent < RATE_MAX;
  }

  /** Outputs on the phone's clock at or after `since` (a superset of the record's grants within its window). */
  outputsSince(since: number): number {
    return this.outputs.filter((output) => output.phone >= since).length;
  }
}

type HostRow = { id: string; sessionId: string; kind: HostEventKind; createdAt: number };

type HostAttention = { id: string; enteredAt: number; rowId: string };

/** A computer as its host has it: the feed (newest first) and each session's attention. */
type Host = {
  name: string;
  rows: HostRow[];
  attentions: Map<string, HostAttention>;
  written: number;
  /** How many times the phone added it. */
  added: number;
  /** Whether its session list names the feed row written for an attention (`attention.notificationId`). */
  namesRow: boolean;
};

/** A computer on the phone. Added again after its removal, the same host is a new computer (a new id). */
type Computer = {
  id: string;
  host: Host;
  state: 'shown' | 'hidden' | 'removed';
  /** Real time and the clock changes so far when it was removed. */
  removedAt: number;
  removedClock: number;
  /** Row id → kind as the last read of this launch saw them; null until the first (which only records). */
  seen: Map<string, HostEventKind> | null;
  /** The rows (`id:kind`) the reads since that first one reported. */
  reported: Set<string>;
  readAt: number;
  /** The rows the record was last told are in the feed. */
  feedIds: Set<string>;
  /** The Sessions list's last view of each session (in attention or not); null before its first pass. */
  listed: Map<string, boolean> | null;
};

/**
 * The longest the app goes without reading a computer it can reach while it runs (every 5 s, every 60 s with the
 * live channel): a longer gap means it was away or could not read it, and its next read only records.
 */
const READ_GAP_MS = 60_000;

type Push = { deliverAt: number; expiresAt: number; event: HostEvent };

type Delivery = {
  route: 'feed' | 'push' | 'list';
  machineId: string;
  sessionId: string;
  /** feed, push: the row and its kind; list: the row the computer names ('' none) and null. */
  rowId: string;
  kind: string | null;
  /** list: the attention the session entered. */
  attention: HostAttention | null;
  /** feed, push: when the row was written (the computer's clock, real time). */
  createdAt: number;
  arrivedPhone: number;
  handledPhone: number;
  step: number;
  outcome: 'waiting' | 'silent' | 'held' | 'posted' | 'sounded';
  /** The reference's event and what it had when the delivery was handled. */
  event: string;
  before: EventState;
  /** The session was open on screen when the delivery was handled (and the phone lists it). */
  onScreen: boolean;
  /** The output it would get needs a place in the rate (it is no notification within 20 s of its sound). */
  needsPlace: boolean;
  rateAllowed: boolean;
  /** Within a minute after a clock change: the rate may deviate. */
  clockGrace: boolean;
  /** The phone lists the session when the delivery is handled (a removed computer's sessions are not). */
  listed: boolean;
  postedWithSound: boolean;
  /** The attention sound was on when it was handled. */
  soundOn: boolean;
  /** An exception allowed what it got (a repeat). */
  deviated: boolean;
  /** The attention a row came in provably at its handling ('' none). */
  proven: string;
};

type Profile = {
  name: string;
  /** The seeds its test runs: `count` from `first` on. */
  seeds: { first: number; count: number };
  steps: number;
  sessions: number;
  /** Chance per step that a row is written; in a quiet phase `quiet.write` instead. */
  write: number;
  /** Busy phases alternate with quiet ones, in which the rate limit lets late copies out again. */
  quiet: { busyMs: number; quietMs: number; write: number } | null;
  /** Chance per step that the app restarts after its write. */
  restart: number;
  /** Chance per step that iOS ends the app before the step's write. */
  kill: number;
  /** Chance per step that the person sets the clock back or forward. */
  clock: number;
  /** Chance per step that a session leaves attention (its agent works again). */
  leave: number;
  /** Chance per step of a pass of the Sessions list on its own (an inventory poll). */
  listPass: number;
  /** Chance per step that the person opens a session on screen, and that the person leaves the one open. */
  look: { open: number; leave: number };
  /** While the stored record is read: chance per step that the clock jumps hours (the read hangs, iOS pauses). */
  longWait: number;
  /** How far the clock moves per step: chance and range (ms) of each kind of step. */
  advance: readonly { chance: number; minMs: number; maxMs: number }[];
};

const PROFILES: Record<'mixed' | 'pressure' | 'launches', Profile> = {
  // Hours pass: rows stay in the feed for longer than the window, pushes arrive late, reads hang for hours.
  mixed: {
    name: 'mixed',
    seeds: { first: 1, count: 1_200 },
    steps: 1_200,
    sessions: 6,
    write: 0.3,
    quiet: null,
    restart: 0.008,
    kill: 0.004,
    clock: 0.004,
    leave: 0.04,
    listPass: 0.08,
    look: { open: 0.05, leave: 0.1 },
    longWait: 0.15,
    advance: [
      { chance: 0.6, minMs: 0, maxMs: 5_000 },
      { chance: 0.25, minMs: 3_000, maxMs: 60_000 },
      { chance: 0.12, minMs: 60_000, maxMs: 20 * 60_000 },
      { chance: 0.03, minMs: 20 * 60_000, maxMs: 3 * 60 * 60_000 },
    ],
  },
  // Forty sessions write about two rows a second for twenty minutes, then ten quiet minutes, for longer than
  // the record's window: in a busy phase most deliveries are held by the rate limit; in a quiet one late
  // pushes of earlier events get through.
  pressure: {
    name: 'pressure',
    seeds: { first: 1_001, count: 12 },
    steps: 24_000,
    sessions: 40,
    write: 0.95,
    quiet: { busyMs: 20 * 60_000, quietMs: 10 * 60_000, write: 0.02 },
    restart: 0.0003,
    kill: 0.0002,
    clock: 0.0002,
    leave: 0.02,
    listPass: 0.05,
    look: { open: 0.001, leave: 0.01 },
    longWait: 0.05,
    advance: [
      { chance: 0.99, minMs: 0, maxMs: 600 },
      { chance: 0.01, minMs: 3_000, maxMs: 30_000 },
    ],
  },
  // The app restarts about every twenty seconds for hours, each launch busy: the rate limit has to hold
  // across launches, and no announced event may be forgotten inside its window.
  launches: {
    name: 'launches',
    seeds: { first: 2_001, count: 40 },
    steps: 4_000,
    sessions: 8,
    write: 0.6,
    quiet: null,
    restart: 0.08,
    kill: 0.02,
    clock: 0.002,
    leave: 0.03,
    listPass: 0.1,
    look: { open: 0.05, leave: 0.1 },
    longWait: 0.005,
    advance: [
      { chance: 0.95, minMs: 0, maxMs: 2_000 },
      { chance: 0.05, minMs: 2_000, maxMs: 20_000 },
    ],
  },
};

/** The model's clock at the start of a sequence (ms). */
const START_MS = 1_700_000_000_000;

/** What a sequence measured, for the test's report. */
type SequenceReport = {
  violation: string | null;
  deliveries: number;
  posted: number;
  held: number;
  listSounds: number;
  listHeld: number;
  /** Notifications that came as part of their event's sound (within 20 s after it). */
  joinedSound: number;
  /** Rows that took the Sessions-list copy naming them. */
  namedLinks: number;
  /** Sessions-list copies (sound on) of events whose notification came without its sound. */
  soundAfterBanner: number;
  /** Outputs past the plain rate (within one more batch) in the minute after a clock set forward by under a minute. */
  subMinuteForward: number;
  restarts: number;
  kills: number;
  clockBack: number;
  clockForward: number;
  /** Repeats the exceptions allowed. */
  deviations: number;
  /** The most launches within one hour. */
  launchesPerHour: number;
  deferred: number;
  /** Deliveries handled more than the record's window after they arrived (a read that settled after hours). */
  lateHandled: number;
  maxSize: number;
  /** Deliveries held back for the session open on screen. */
  onScreen: number;
  /** Later copies of events seen on screen, handled after the person left the session. */
  seenCopies: number;
  /** The most ids of events seen on screen one computer's record held. */
  maxSeen: number;
};

const emptyReport = (): SequenceReport => ({
  violation: null,
  deliveries: 0,
  posted: 0,
  held: 0,
  listSounds: 0,
  listHeld: 0,
  joinedSound: 0,
  namedLinks: 0,
  soundAfterBanner: 0,
  subMinuteForward: 0,
  restarts: 0,
  kills: 0,
  clockBack: 0,
  clockForward: 0,
  deviations: 0,
  launchesPerHour: 0,
  deferred: 0,
  lateHandled: 0,
  maxSize: 0,
  onScreen: 0,
  seenCopies: 0,
  maxSeen: 0,
});

/** One random sequence and its reference; `run` returns its first violation, or null. */
class Sequence {
  /** Real time (the computers' clock), and how far the phone's clock is off it. */
  private real = START_MS;
  private offset = 0;
  /** Real time of the last clock change, and how many there were. */
  private clockChangedAt = -Infinity;
  /**
   * The last clock set forward, by any amount (real time), and how many outputs came before it: for a minute after
   * it the rate counts only the outputs after it (one more batch at most). Whether it was less than a minute.
   */
  private graceAt = -Infinity;
  private graceFrom = 0;
  private graceShort = false;
  /** The attention sound switch (Settings › Notifications). */
  private soundOn = true;
  private clockChanges = 0;
  private step = 0;
  private readonly random: Random;
  private readonly hosts: Host[];
  private readonly computers: Computer[] = [];
  private pushes: Push[] = [];
  /** Submitted to a route, not yet handled (the record still loads), in the order they came. */
  private readonly waiting: Delivery[] = [];
  /** Handled since the last check. */
  private readonly handled: Delivery[] = [];
  /** Handled, and the outputs, since the record's last write: what an ended app loses. */
  private stepHandled: Delivery[] = [];
  private stepOutputs: Output[] = [];
  /** Sessions-list copies rows took, and rows first announced or seen, since the record's last write. */
  private stepTaken: ListCopy[] = [];
  private stepRows: string[] = [];
  private current: Delivery | null = null;
  private readonly reference = new ReferenceEvents();
  private violation: string | null = null;
  private stored: string | null = null;
  private storedAt = 0;
  private storedClock = 0;
  private record = new AnnouncedEvents(() => this.phone());
  /** The launch whose writes reach storage; an ended one's do not. */
  private launchId = 0;
  private loaded = false;
  private loading: Promise<void> = Promise.resolve();
  private releaseRead: (() => void) | null = null;
  private readonly launches: number[] = [];
  /** The session the person has open on screen, if any. */
  private onScreen: { machineId: string; sessionId: string } | null = null;
  private readonly report = emptyReport();

  constructor(
    private readonly seed: number,
    private readonly profile: Profile,
  ) {
    this.random = seededRandom(seed);
    this.hosts = ['mac', 'studio'].map((name) => ({
      name,
      rows: [],
      attentions: new Map(),
      written: 0,
      added: 0,
      namesRow: this.random.chance(0.5),
    }));
    for (const host of this.hosts) this.addComputer(host);
  }

  private phone(): number {
    return this.real + this.offset;
  }

  async run(): Promise<SequenceReport> {
    this.launch(false);
    await this.loading;
    for (this.step = 1; this.step <= this.profile.steps && this.violation === null; this.step += 1) {
      this.deliverDuePushes();
      // Only a load or a restart waits for promises; other steps run synchronously, as one task of the app.
      const waiting = this.act();
      if (waiting !== null) await waiting;
      this.checkDeliveries();
      this.checkBound();
      if (this.loaded && this.waiting.length === 0 && this.random.chance(this.profile.kill)) await this.kill();
      else await settle();
      if (this.step % 100 === 0) await this.checkStoredRecord();
      this.advance();
    }
    if (this.violation === null) {
      this.releaseRead?.();
      await this.loading;
      this.checkDeliveries();
      this.checkBound();
      await this.checkStoredRecord();
    }
    return { ...this.report, violation: this.violation };
  }

  private violate(invariant: 'I1' | 'I2' | 'I3' | 'rate', what: string): void {
    this.violation ??= `seed ${this.seed} (${this.profile.name}), step ${this.step}: ${invariant} ${what}`;
  }

  private act(): Promise<void> | null {
    if (this.releaseRead !== null && this.random.chance(0.3)) {
      this.releaseRead();
      this.releaseRead = null;
      return this.loading;
    }
    if (this.random.chance(this.writeChance())) this.writeRow();
    this.look();
    if (this.random.chance(this.profile.leave)) this.leaveAttention();
    if (this.random.chance(this.profile.clock)) this.changeClock();
    if (this.random.chance(SOUND_SWITCH)) this.soundOn = !this.soundOn;
    const roll = this.random.int(0, 999) / 1000;
    const restartAt = 0.06 + this.profile.restart;
    if (roll < 0.04) this.changeKind();
    else if (roll < 0.06) this.clearRows();
    else if (roll < restartAt) return this.loaded ? this.restart() : null;
    else if (roll < restartAt + 0.006) this.changeComputer();
    else if (roll < restartAt + 0.006 + this.profile.listPass) this.listPass();
    else this.readFeed();
    return null;
  }

  private writeChance(): number {
    const quiet = this.profile.quiet;
    if (quiet === null) return this.profile.write;
    const elapsed = (this.real - START_MS) % (quiet.busyMs + quiet.quietMs);
    return elapsed < quiet.busyMs ? this.profile.write : quiet.write;
  }

  // The host side.

  private writeRow(): void {
    const host = this.random.pick(this.hosts);
    const sessionId = `s${this.random.int(0, this.profile.sessions - 1)}`;
    // The host deletes a session's unread row when it writes the session's next one.
    if (this.random.chance(0.8)) host.rows = host.rows.filter((row) => row.sessionId !== sessionId);
    const row: HostRow = {
      id: `${host.name}-n${host.written}`,
      sessionId,
      kind: this.random.pick(HOST_EVENT_KINDS),
      createdAt: this.real,
    };
    host.written += 1;
    host.rows.unshift(row);
    host.rows.length = Math.min(host.rows.length, FEED_RETENTION_ROWS);
    host.attentions.set(sessionId, { id: `attention-${row.id}`, enteredAt: this.real, rowId: row.id });
    this.sendPush(host, row);
  }

  /** The host turns an unread finished row into needsInput in place: a second event of that row. */
  private changeKind(): void {
    const host = this.random.pick(this.hosts);
    const finished = host.rows.filter((row) => row.kind === 'finished');
    if (finished.length === 0) return;
    const row = this.random.pick(finished);
    row.kind = 'needsInput';
    this.sendPush(host, row);
  }

  /** A session's agent works again: it leaves attention. */
  private leaveAttention(): void {
    const host = this.random.pick(this.hosts);
    const sessions = [...host.attentions.keys()];
    if (sessions.length > 0) host.attentions.delete(this.random.pick(sessions));
  }

  /** Clear All, or one row dismissed. */
  private clearRows(): void {
    const host = this.random.pick(this.hosts);
    if (this.random.chance(0.3)) host.rows = [];
    else if (host.rows.length > 0) host.rows.splice(this.random.int(0, host.rows.length - 1), 1);
  }

  /** The event's one push, sent now to the computer the host was last added as, arriving within its hour. */
  private sendPush(host: Host, row: HostRow): void {
    if (!this.random.chance(0.75)) return;
    const computer = this.computers.filter((entry) => entry.host === host).at(-1);
    if (computer === undefined) return;
    const delay = this.random.chance(0.5) ? this.random.int(0, 30_000) : this.random.int(0, PUSH_TTL_MS);
    this.pushes.push({
      deliverAt: this.real + delay,
      expiresAt: this.real + PUSH_TTL_MS,
      event: this.hostEvent(computer.id, row),
    });
  }

  // The phone side.

  /**
   * The person sets the phone's clock back or forward, by seconds or hours. A clock set forward, by any amount, may
   * let the rate through one more batch in the minute after it.
   */
  private changeClock(): void {
    const by = this.random.chance(0.5)
      ? this.random.int(1_000, 5 * 60_000)
      : this.random.int(5 * 60_000, 3 * PUSH_TTL_MS);
    const back = this.random.chance(0.5);
    this.offset += back ? -by : by;
    if (back) this.report.clockBack += 1;
    else this.report.clockForward += 1;
    this.clockChangedAt = this.real;
    if (!back) {
      this.graceAt = this.real;
      this.graceFrom = this.reference.outputs.length;
      this.graceShort = by < SHORT_FORWARD_MS;
    }
    this.clockChanges += 1;
    this.reference.spareAll();
  }

  private hostEvent(machineId: string, row: HostRow): HostEvent {
    return {
      machineId,
      sessionId: row.sessionId,
      kind: row.kind,
      eventId: row.id,
      occurredAt: new Date(row.createdAt).toISOString(),
    };
  }

  private deliverDuePushes(): void {
    const due = this.pushes.filter((push) => push.deliverAt <= this.real);
    this.pushes = this.pushes.filter((push) => push.deliverAt > this.real);
    for (const push of this.random.shuffle(due)) {
      // Past its time-to-live a push is not delivered; a removed computer's sessions are not listed.
      if (push.expiresAt < this.real) continue;
      const computer = this.computers.find((entry) => entry.id === push.event.machineId);
      if (computer === undefined || computer.state === 'removed') continue;
      this.deliver([push.event], 'push');
    }
  }

  /** A read of a shown computer's feed: the record keeps its rows, new and changed rows and some copies come. */
  private readFeed(): void {
    const shown = this.computers.filter((computer) => computer.state === 'shown');
    if (shown.length === 0) return;
    const computer = this.random.pick(shown);
    const rows = computer.host.rows.map((row) => ({ ...row }));
    this.record.retainFeed(
      computer.id,
      rows.map((row) => ({ sessionId: row.sessionId, id: row.id })),
    );
    computer.feedIds = new Set(rows.map((row) => row.id));
    if (this.real - computer.readAt > READ_GAP_MS) computer.seen = null;
    computer.readAt = this.real;
    const seen = computer.seen;
    if (seen === null) computer.reported.clear();
    const fresh = seen === null ? [] : rows.filter((row) => seen.get(row.id) !== row.kind);
    for (const row of fresh) computer.reported.add(`${row.id}:${row.kind}`);
    const again = rows.filter((row) => computer.reported.has(`${row.id}:${row.kind}`));
    const copies =
      again.length === 0 ? [] : Array.from({ length: this.random.int(0, 2) }, () => this.random.pick(again));
    computer.seen = new Map(rows.map((row) => [row.id, row.kind]));
    // New rows make the app read the session list first; its pass runs before the rows are handled.
    if (fresh.length > 0) this.passOver(computer);
    const events = [...fresh, ...copies].map((row) => this.hostEvent(computer.id, row));
    if (events.length > 0) this.deliver(events, 'feed');
  }

  /** A pass of the Sessions list over a shown computer (an inventory poll). */
  private listPass(): void {
    const shown = this.computers.filter((computer) => computer.state === 'shown');
    if (shown.length > 0) this.passOver(this.random.pick(shown));
  }

  /**
   * The Sessions list as the app reads it (`src/app/alerts.ts`): sessions out of attention leave it (also at the
   * first pass), sessions that turned into attention since the last pass enter it; the first pass only records.
   * Each entering session goes to the real route on its own, so its outcome is its own; with the sound off (as
   * the pass found it, though the route reads it later while the record loads) the route handles none of them.
   */
  private passOver(computer: Computer): void {
    const first = computer.listed === null;
    const listed = computer.listed ?? new Map<string, boolean>();
    const left: { machineId: string; sessionId: string }[] = [];
    const entered: { sessionId: string; attention: HostAttention }[] = [];
    for (let i = 0; i < this.profile.sessions; i += 1) {
      const sessionId = `s${i}`;
      const attention = computer.host.attentions.get(sessionId);
      const previous = listed.get(sessionId);
      listed.set(sessionId, attention !== undefined);
      if (attention === undefined) left.push({ machineId: computer.id, sessionId });
      else if (!first && previous === false) entered.push({ sessionId, attention });
    }
    computer.listed = listed;
    const soundOn = this.soundOn;
    const deps = {
      announced: this.record,
      soundOn: () => soundOn,
      onScreen: (machineId: string, sessionId: string) => {
        this.handling(machineId, sessionId);
        return this.isOnScreen(machineId, sessionId);
      },
      play: (events: readonly EventIdentity[]) => this.played(events),
      log: (line: string) => this.logged(line),
    };
    const identities = entered.map(({ sessionId, attention }) => ({
      machineId: computer.id,
      sessionId,
      kind: null,
      rowId: computer.host.namesRow ? attention.rowId : '',
      episode: attention.id,
    }));
    if (entered.length === 0 || !soundOn) {
      if (left.length > 0 || identities.length > 0) announceAttentionTransitions(left, identities, deps);
      return;
    }
    for (const [index, identity] of identities.entries()) {
      const attention = entered[index]?.attention ?? null;
      const { machineId, sessionId, rowId } = identity;
      this.submit({ route: 'list', machineId, sessionId, rowId, kind: null, attention, createdAt: 0 });
      announceAttentionTransitions(index === 0 ? left : [], [identity], deps);
    }
  }

  private changeComputer(): void {
    const kept = this.computers.filter((computer) => computer.state !== 'removed');
    const roll = this.random.int(0, 3);
    if (roll === 0 && kept.length > 0) {
      const computer = this.random.pick(kept);
      computer.state = computer.state === 'shown' ? 'hidden' : 'shown';
      // Shown again, its feed starts over with a first read that only records; the Sessions list keeps its view.
      computer.seen = null;
    } else if (roll === 1 && kept.length > 0) {
      const computer = this.random.pick(kept);
      computer.state = 'removed';
      computer.removedAt = this.phone();
      computer.removedClock = this.clockChanges;
      computer.feedIds = new Set();
    } else {
      const gone = this.hosts.filter((host) => !kept.some((computer) => computer.host === host));
      if (gone.length === 0) return;
      this.addComputer(this.random.pick(gone));
    }
    this.record.keepComputers(this.keptIds());
  }

  private addComputer(host: Host): void {
    host.added += 1;
    this.computers.push({
      id: `${host.name}#${host.added}`,
      host,
      state: 'shown',
      removedAt: 0,
      removedClock: 0,
      seen: null,
      reported: new Set(),
      readAt: 0,
      feedIds: new Set(),
      listed: null,
    });
  }

  private keptIds(): Set<string> {
    return new Set(this.computers.filter((computer) => computer.state !== 'removed').map((computer) => computer.id));
  }

  /** The person opens a session of a shown computer on screen, or leaves the one open. */
  private look(): void {
    if (this.onScreen !== null) {
      if (this.random.chance(this.profile.look.leave)) this.onScreen = null;
      return;
    }
    const shown = this.computers.filter((computer) => computer.state === 'shown');
    if (shown.length === 0 || !this.random.chance(this.profile.look.open)) return;
    const sessionId = `s${this.random.int(0, this.profile.sessions - 1)}`;
    this.onScreen = { machineId: this.random.pick(shown).id, sessionId };
  }

  private isOnScreen(machineId: string, sessionId: string): boolean {
    return this.onScreen?.machineId === machineId && this.onScreen.sessionId === sessionId;
  }

  /** A new launch: a new record; the stored one (with the rate limit's grants) loads at once or later. */
  private launch(slow: boolean): void {
    this.launchId += 1;
    const launch = this.launchId;
    this.record = new AnnouncedEvents(() => this.phone());
    this.loaded = false;
    // A new launch shows the Sessions list first.
    this.onScreen = null;
    this.launches.push(this.real);
    while (this.launches.length > 0 && this.real - (this.launches[0] ?? this.real) > 60 * 60_000) {
      this.launches.shift();
    }
    this.report.launchesPerHour = Math.max(this.report.launchesPerHour, this.launches.length);
    for (const computer of this.computers) {
      computer.seen = null;
      computer.listed = null;
    }
    const storage: AnnouncedEventsStorage = {
      read: () => {
        if (!slow) return Promise.resolve(this.readStored());
        const { promise, resolve } = Promise.withResolvers<string | null>();
        this.releaseRead = () => resolve(this.readStored());
        return promise;
      },
      write: async (record) => {
        // An ended launch writes nothing more.
        if (launch !== this.launchId) return;
        this.stored = record;
        this.storedAt = this.phone();
        this.storedClock = this.clockChanges;
        // The record written holds everything handled so far.
        this.stepHandled = [];
        this.stepOutputs = [];
        this.stepTaken = [];
        this.stepRows = [];
      },
      failed: (problem) => {
        if (launch !== this.launchId) return;
        if (problem === 'bound') this.violate('I3', 'the record reported its bound passed');
        else this.violate('I3', `the stored record was not ${problem === 'read' ? 'read' : 'written'}`);
      },
    };
    // As the app starts it: the record loads, then learns which computers the phone keeps.
    const record = this.record;
    this.loading = record.load(storage).then(() => {
      if (launch !== this.launchId) return;
      this.loaded = true;
      record.keepComputers(this.keptIds());
    });
  }

  /**
   * What a launch reads. A record stored before the last clock change still has the old times: the launch
   * notices a clock set back only now (`normalizeClock`), so its minute of held deliveries starts now.
   */
  private readStored(): string | null {
    if (this.storedClock < this.clockChanges) this.clockChangedAt = this.real;
    return this.stored;
  }

  /** The app quits once what it announced is written, and starts again. */
  private async restart(): Promise<void> {
    await this.checkStoredRecord();
    this.report.restarts += 1;
    this.launch(this.random.chance(0.7));
    await flush();
  }

  /**
   * iOS ends the app after this step showed what it showed and before the step's write: the next launch reads
   * what was stored before. Each event touched since then may be announced once more (or held although its
   * other part came), what was shown since then no longer counts for the rate (one more batch can come), and a
   * Sessions-list copy a row took since then waits for its row again (whose next kind may take it, silently).
   */
  private async kill(): Promise<void> {
    this.report.kills += 1;
    for (const output of this.stepOutputs) output.lost = true;
    this.reference.copies.push(...this.stepTaken);
    this.stepTaken = [];
    for (const rowKey of this.stepRows) this.reference.rowFirsts.delete(rowKey);
    this.stepRows = [];
    for (const delivery of this.stepHandled) {
      const state = this.reference.of(delivery.event);
      state.spare += 1;
      state.lost = true;
    }
    this.launch(this.random.chance(0.5));
    await flush();
  }

  private deliver(events: readonly HostEvent[], route: 'feed' | 'push'): void {
    for (const event of events) {
      this.submit({
        route,
        machineId: event.machineId,
        sessionId: event.sessionId,
        rowId: event.eventId,
        kind: event.kind,
        attention: null,
        // The row's time; a row changed in place keeps it.
        createdAt: Date.parse(event.occurredAt),
      });
    }
    processHostEvents(
      events,
      (machineId, sessionId) => {
        this.handling(machineId, sessionId);
        const computer = this.computers.find((entry) => entry.id === machineId);
        if (computer === undefined || computer.state === 'removed') return undefined;
        return sessionFacts(computer.host.attentions.get(sessionId));
      },
      {
        centre: { post: async (request) => this.posted(request) },
        announced: this.record,
        settings: () => ALL_ON,
        soundOn: () => this.soundOn,
        onScreen: (machineId, sessionId) => this.isOnScreen(machineId, sessionId),
        log: (line) => this.logged(line),
      },
    );
  }

  private submit(
    fields: Pick<Delivery, 'route' | 'machineId' | 'sessionId' | 'rowId' | 'kind' | 'attention' | 'createdAt'>,
  ): void {
    this.waiting.push({
      ...fields,
      arrivedPhone: this.phone(),
      handledPhone: this.phone(),
      step: this.step,
      outcome: 'waiting',
      onScreen: false,
      event: '',
      before: freshState(),
      needsPlace: true,
      rateAllowed: true,
      clockGrace: false,
      listed: true,
      postedWithSound: false,
      soundOn: true,
      deviated: false,
      proven: '',
    });
    this.report.deliveries += 1;
    if (!this.loaded) this.report.deferred += 1;
  }

  /**
   * A route starts handling its next delivery (it asks for the session's facts, or whether the session is on
   * screen): the reference decides which event it is, and what that event had.
   */
  private handling(machineId: string, sessionId: string): void {
    this.finishCurrent();
    const delivery = this.waiting.shift();
    if (delivery === undefined || delivery.machineId !== machineId || delivery.sessionId !== sessionId) {
      this.violate('I2', `a delivery was handled out of the order it came in (${machineId} ${sessionId})`);
      return;
    }
    if (this.phone() - delivery.arrivedPhone > ANNOUNCED_WINDOW_MS) this.report.lateHandled += 1;
    const computer = this.computers.find((entry) => entry.id === machineId);
    // The Sessions list's pass was computed while the computer was shown; a removed computer lists no session.
    delivery.listed = delivery.route === 'list' || computer?.state !== 'removed';
    if (delivery.route === 'list') this.identifyListCopy(delivery);
    else this.identifyRow(delivery, computer);
    const reference = this.reference;
    delivery.before = { ...reference.of(delivery.event) };
    delivery.onScreen = delivery.listed && this.isOnScreen(machineId, sessionId);
    const before = delivery.before;
    if (delivery.route === 'list' && before.notified && !before.sounded) this.report.soundAfterBanner += 1;
    // A row's notification within 20 s after its event's sound (the Sessions list named the row, the only way a
    // row joins a sound) is part of that sound: it needs no place in the rate. The other order needs one.
    delivery.needsPlace = !(
      delivery.route !== 'list' &&
      before.soundedAt !== null &&
      !before.notified &&
      this.real - before.soundedAt < RATE_PER_SESSION_MS
    );
    delivery.soundOn = this.soundOn;
    delivery.clockGrace = this.real - this.clockChangedAt < CLOCK_GRACE_MS;
    delivery.rateAllowed = reference.rateAllows(this.real, `${machineId}\n${sessionId}`, 0);
    delivery.outcome = 'silent';
    delivery.handledPhone = this.phone();
    this.current = delivery;
    this.handled.push(delivery);
    this.stepHandled.push(delivery);
  }

  /** The Sessions list's copy: the first event of the row it names, else its attention's own event. */
  private identifyListCopy(delivery: Delivery): void {
    const attention = delivery.attention;
    if (attention === null) return;
    const named =
      delivery.rowId.length > 0 ? this.reference.rowFirsts.get(`${delivery.machineId}|${delivery.rowId}`) : undefined;
    delivery.event = named ?? `K|${delivery.machineId}|${attention.id}`;
  }

  /**
   * A row's copy: the row and kind; when the record knows no event of the row yet, it takes the Sessions-list
   * copy that named the row, and no other.
   */
  private identifyRow(delivery: Delivery, computer: Computer | undefined): void {
    const reference = this.reference;
    const { machineId, sessionId, rowId } = delivery;
    delivery.event = `${machineId}|${sessionId}|${rowId}|${delivery.kind}`;
    const now = delivery.listed ? computer?.host.attentions.get(sessionId) : undefined;
    delivery.proven = now !== undefined && now.enteredAt <= delivery.createdAt ? now.id : '';
    const state = reference.of(delivery.event);
    const rowKnown = reference.rowFirsts.has(`${machineId}|${rowId}`);
    if (!delivery.listed || state.acts > 0 || state.seen || rowKnown) return;
    // A copy that named its row is kept like the row's events (while the row is in the feed as last read, or for
    // the record's window from the copy), and as its attention's first event while that is provable.
    const inFeed = computer?.feedIds.has(rowId) === true;
    const named = reference.copies.find(
      (copy) =>
        copy.machineId === machineId &&
        copy.sessionId === sessionId &&
        copy.rowId === rowId &&
        (inFeed || delivery.proven === copy.attention || delivery.arrivedPhone - copy.phone <= ANNOUNCED_WINDOW_MS),
    );
    if (named === undefined) return;
    this.report.namedLinks += 1;
    reference.copies = reference.copies.filter((copy) => copy !== named);
    this.stepTaken.push(named);
    reference.join(named.event, delivery.event);
  }

  /**
   * An output of the current delivery's event: I1 per channel (a repeat only as far as an exception allows),
   * and its place in the rate, unless it is a row's notification within 20 s after its event's sound. Within a
   * minute after a clock set forward the rate counts only the outputs after that change; an output past the plain
   * rate after a change of less than a minute is counted on its own.
   */
  private observe(delivery: Delivery, notification: boolean, sound: boolean): void {
    const state = this.reference.of(delivery.event);
    const repeat = (notification && state.notified) || (sound && state.sounded) || state.seen;
    if (repeat) {
      if (state.spare > 0) {
        state.spare -= 1;
        delivery.deviated = true;
        this.report.deviations += 1;
      } else {
        const what = state.seen ? 'was announced after it was seen on screen' : 'was announced twice';
        this.violate('I1', `${delivery.event} ${what} (${delivery.route}, step ${delivery.step})`);
      }
    }
    const session = `${delivery.machineId}\n${delivery.sessionId}`;
    if (delivery.deviated || delivery.needsPlace) {
      const grace = this.real - this.graceAt < CLOCK_GRACE_MS;
      if (!this.reference.rateAllows(this.real, session, grace ? this.graceFrom : 0)) {
        this.violate('rate', `${delivery.event} went out beyond the rate (${delivery.route}, step ${delivery.step})`);
      } else if (grace && this.graceShort && !this.reference.rateAllows(this.real, session, 0)) {
        this.report.subMinuteForward += 1;
      }
      const output = { real: this.real, phone: this.phone(), session, lost: false };
      this.reference.outputs.push(output);
      this.stepOutputs.push(output);
    } else this.report.joinedSound += 1;
    state.acts += 1;
    if (notification) state.notified = true;
    if (sound) {
      state.sounded = true;
      state.soundedAt = this.real;
    }
  }

  private posted(request: NotificationRequest): void {
    const delivery = this.current;
    const { machineId, sessionId, notificationId, kind } = request.data;
    if (
      delivery === null ||
      delivery.route === 'list' ||
      delivery.machineId !== machineId ||
      delivery.sessionId !== sessionId ||
      delivery.rowId !== notificationId ||
      delivery.kind !== kind
    ) {
      this.violate('I1', `${machineId} ${sessionId} ${notificationId} announced outside its own delivery`);
      return;
    }
    delivery.outcome = 'posted';
    delivery.postedWithSound = request.sound;
    this.observe(delivery, true, request.sound);
  }

  private played(events: readonly EventIdentity[]): void {
    const delivery = this.current;
    if (
      delivery === null ||
      delivery.route !== 'list' ||
      events.length !== 1 ||
      events[0]?.sessionId !== delivery.sessionId
    ) {
      this.violate('I1', 'an attention sound played outside its own delivery');
      return;
    }
    delivery.outcome = 'sounded';
    this.report.listSounds += 1;
    this.observe(delivery, false, true);
  }

  private logged(line: string): void {
    if (!line.startsWith(HELD_NOTIFICATION) && !line.startsWith(HELD_SOUND)) return;
    if (this.current === null) return;
    this.current.outcome = 'held';
    if (this.current.route === 'list') this.report.listHeld += 1;
  }

  /**
   * Marks the event of the delivery just handled seen when its session was open on screen, and records what a
   * later copy is matched to: a Sessions-list copy naming its row, announced or seen, waits for that row; a row
   * announced or seen is its row's first event.
   */
  private finishCurrent(): void {
    const delivery = this.current;
    this.current = null;
    if (delivery === null) return;
    const reference = this.reference;
    const state = reference.of(delivery.event);
    if (delivery.onScreen) state.seen = true;
    if (state.acts === 0 && !state.seen) return;
    const { machineId, sessionId, rowId } = delivery;
    if (delivery.route === 'list') {
      const attention = delivery.attention;
      if (attention === null || rowId.length === 0 || delivery.event !== `K|${machineId}|${attention.id}`) return;
      if (reference.copies.some((copy) => copy.event === delivery.event)) return;
      reference.copies.push({
        event: delivery.event,
        machineId,
        sessionId,
        attention: attention.id,
        rowId,
        phone: delivery.handledPhone,
      });
      return;
    }
    const rowKey = `${machineId}|${rowId}`;
    if (reference.rowFirsts.has(rowKey)) return;
    reference.rowFirsts.set(rowKey, delivery.event);
    this.stepRows.push(rowKey);
  }

  private checkDeliveries(): void {
    this.finishCurrent();
    for (const delivery of this.handled.splice(0)) {
      if (delivery.outcome === 'posted') this.report.posted += 1;
      if (delivery.outcome === 'held') this.report.held += 1;
      const where = `${delivery.event} (${delivery.route}, step ${delivery.step})`;
      if (delivery.onScreen || (delivery.listed && delivery.before.seen)) {
        // Held back for the session on screen, or a copy of an event seen there: nothing is announced.
        if (delivery.onScreen) this.report.onScreen += 1;
        else this.report.seenCopies += 1;
        // A copy that an exception lets announce again may also be held by the rate limit.
        const excused =
          delivery.deviated || (delivery.outcome === 'held' && (delivery.before.spare > 0 || delivery.before.lost));
        if (delivery.outcome !== 'silent' && (delivery.onScreen || !excused)) {
          const why = delivery.onScreen ? 'its session was open on screen' : 'it was seen on screen';
          this.violate('I1', `${where} was ${delivery.outcome} although ${why}`);
        }
        continue;
      }
      if (delivery.deviated) continue;
      const due = delivery.listed && (delivery.route === 'list' ? !delivery.before.sounded : !delivery.before.notified);
      if (!due) continue;
      if (delivery.outcome === 'held') {
        // Holding is right when the rate is full, after a clock change, or when the record lost the event's
        // first part with an ended app.
        if (delivery.clockGrace || delivery.before.lost) continue;
        if (!delivery.needsPlace) this.violate('I2', `${where} was held although it is part of its sound`);
        else if (delivery.rateAllowed) this.violate('I2', `${where} was held although the rate allowed it`);
        continue;
      }
      if (delivery.outcome === 'silent') {
        this.violate('I2', `${where} was due but neither announced nor held by the rate limit`);
        continue;
      }
      // Its sound comes with it when the sound is on and the event has not sounded yet.
      const withSound = delivery.soundOn && !delivery.before.sounded;
      if (delivery.outcome === 'posted' && delivery.postedWithSound !== withSound) {
        this.violate('I2', `${where} posted ${delivery.postedWithSound ? 'with' : 'without'} its sound`);
      }
    }
    if (this.loaded && this.waiting.length > 0) {
      this.violate('I2', `${this.waiting.length} deliveries still wait after the record loaded`);
    }
  }

  /**
   * The record against the reference's count: at most what took a place in the rate within its window (on
   * the phone's clock, from the arrival of the oldest copy still waiting), plus the rows each kept computer's
   * feed had at its last read with each of their kinds, plus one first event per session of a kept computer
   * (its current attention), plus one per session of any computer and one per feed row for an event kept from
   * a takeover within the window whose first announcement came before it.
   */
  private checkBound(): void {
    const size = this.record.size();
    this.report.maxSize = Math.max(this.report.maxSize, size);
    const horizon = Math.min(this.phone(), ...this.waiting.map((delivery) => delivery.arrivedPhone));
    const kept = this.computers.filter((computer) => computer.state !== 'removed');
    const feedRows = kept.reduce((rows, computer) => rows + computer.feedIds.size, 0);
    const bound =
      this.reference.outputsSince(horizon - ANNOUNCED_WINDOW_MS) +
      feedRows * HOST_EVENT_KINDS.length +
      kept.length * this.profile.sessions +
      this.computers.length * (this.profile.sessions + FEED_RETENTION_ROWS);
    if (size > bound) this.violate('I3', `the record holds ${size} events, the reference allows ${bound}`);
    for (const computer of this.computers) {
      const seen = this.record.seenOnScreenIds(computer.id);
      this.report.maxSeen = Math.max(this.report.maxSeen, seen);
      if (seen > SEEN_ON_SCREEN_IDS) this.violate('I3', `${computer.id} keeps ${seen} ids of events seen on screen`);
    }
  }

  /**
   * The stored record as written: as the record holds it (its events and its ids of events seen on screen), a
   * minute of grants, no removed computer past its window (unless the clock changed since its removal).
   */
  private async checkStoredRecord(): Promise<void> {
    // Counting lets the record forget what is past its window now; its write follows within the flush.
    const size = this.loaded ? this.record.size() : 0;
    const seenIds = this.loaded
      ? this.computers.reduce((ids, computer) => ids + this.record.seenOnScreenIds(computer.id), 0)
      : 0;
    await flush();
    if (this.stored === null || !this.loaded) return;
    const stored: unknown = JSON.parse(this.stored);
    const computers = field(stored, 'computers');
    const grants = field(stored, 'grants');
    if (typeof computers !== 'object' || computers === null || !Array.isArray(grants)) {
      this.violate('I3', 'the stored record has no computers or grants');
      return;
    }
    if (grants.length > RATE_MAX) this.violate('I3', `the stored record keeps ${grants.length} rate grants`);
    let events = 0;
    let seen = 0;
    for (const [machineId, entry] of Object.entries(computers)) {
      const list = field(entry, 'events');
      events += Array.isArray(list) ? list.length : Infinity;
      const seenList = field(entry, 'seen');
      seen += Array.isArray(seenList) ? seenList.length : Infinity;
      const computer = this.computers.find((candidate) => candidate.id === machineId);
      if (
        computer?.state === 'removed' &&
        computer.removedClock === this.storedClock &&
        this.storedAt - computer.removedAt > ANNOUNCED_WINDOW_MS
      ) {
        this.violate('I3', `${machineId} is still stored ${this.storedAt - computer.removedAt} ms after its removal`);
      }
    }
    if (this.waiting.length === 0 && events !== size) {
      this.violate('I3', `the stored record has ${events} events, the record ${size}`);
    }
    if (this.waiting.length === 0 && seen !== seenIds) {
      this.violate('I3', `the stored record has ${seen} ids of events seen on screen, the record ${seenIds}`);
    }
  }

  private advance(): void {
    // While the stored record is read the clock moves little, or (a hanging read, iOS pausing the app) hours.
    if (this.releaseRead !== null) {
      this.real += this.random.chance(this.profile.longWait)
        ? this.random.int(ANNOUNCED_WINDOW_MS / 2, 2 * ANNOUNCED_WINDOW_MS)
        : this.random.int(0, 2_000);
      return;
    }
    let roll = this.random.int(0, 999) / 1000;
    for (const step of this.profile.advance) {
      roll -= step.chance;
      if (roll < 0) {
        this.real += this.random.int(step.minMs, step.maxMs);
        return;
      }
    }
  }
}

/** What a profile's sequences found: their violations (each naming its seed) and their measures. */
type SeedRun = { failures: string[]; totals: SequenceReport };

/** Each profile's run, made once for the tests below that read it. */
const runs = new Map<Profile, Promise<SeedRun>>();

/** Runs the profile's sequences, each from its own seed, once; the violations name their seeds. */
function runSeeds(profile: Profile): Promise<SeedRun> {
  const known = runs.get(profile);
  if (known !== undefined) return known;
  const run = (async () => {
    const failures: string[] = [];
    const totals = emptyReport();
    for (let seed = profile.seeds.first; seed < profile.seeds.first + profile.seeds.count; seed += 1) {
      const report = await new Sequence(seed, profile).run();
      if (report.violation !== null) failures.push(report.violation);
      for (const key of Object.keys(totals) as (keyof SequenceReport)[]) {
        if (key === 'violation') continue;
        const max = key === 'launchesPerHour' || key === 'maxSize' || key === 'maxSeen';
        totals[key] = max ? Math.max(totals[key], report[key]) : totals[key] + report[key];
      }
    }
    return { failures, totals };
  })();
  runs.set(profile, run);
  return run;
}

describe('the record of announced events over random sequences', () => {
  test('mixed sequences: 1200 seeds hold I1, I2, I3 and the rate after every step', { timeout: 300_000 }, async () => {
    const { failures, totals } = await runSeeds(PROFILES.mixed);
    assert.deepEqual(failures, [], `failing seeds:\n${failures.join('\n')}`);
    // The sequences reach what they are meant to: restarts, ended apps and clock changes both ways, deliveries
    // while loading and after hours of it, rate-limit holds, the Sessions list's sounds, played and held, rows
    // taken by the copy that named them, attention sounds of events whose notification came without its sound,
    // notifications that came as part of their sound, and deliveries held back for the session on screen with
    // later copies of them; the ids of events seen on screen stayed below their bound, so none was let go early
    // and every copy of a seen event had to stay silent.
    assert.ok(
      totals.restarts > 100 &&
        totals.kills > 100 &&
        totals.clockBack > 100 &&
        totals.clockForward > 100 &&
        totals.deferred > 100 &&
        totals.lateHandled > 10 &&
        totals.held > 100 &&
        totals.listSounds > 100 &&
        totals.listHeld > 0 &&
        totals.namedLinks > 100 &&
        totals.soundAfterBanner > 10 &&
        totals.joinedSound > 100 &&
        totals.onScreen > 100 &&
        totals.seenCopies > 100 &&
        totals.maxSeen < SEEN_ON_SCREEN_IDS,
      JSON.stringify(totals),
    );
  });

  test(
    'sequences under rate-limit pressure: 12 seeds hold I1, I2, I3 and the rate after every step',
    { timeout: 300_000 },
    async () => {
      const { failures, totals } = await runSeeds(PROFILES.pressure);
      assert.deepEqual(failures, [], `failing seeds:\n${failures.join('\n')}`);
      // Far more deliveries were held than the record could ever hold; the Sessions list was held too; the record
      // grew to hundreds of events, near what the rate limit lets out within its window.
      assert.ok(totals.held > 100_000 && totals.listHeld > 100 && totals.maxSize > 600, JSON.stringify(totals));
    },
  );

  test(
    'sequences of many launches: 40 seeds hold I1, I2, I3 and the rate after every step',
    { timeout: 300_000 },
    async () => {
      const { failures, totals } = await runSeeds(PROFILES.launches);
      assert.deepEqual(failures, [], `failing seeds:\n${failures.join('\n')}`);
      // More than a hundred launches within an hour, each busy enough to meet the rate limit, many ended before
      // their write.
      assert.ok(totals.launchesPerHour > 100 && totals.held > 1_000 && totals.kills > 1_000, JSON.stringify(totals));
    },
  );

  test(
    'a clock set forward by less than a minute: at most one more batch in the minute after it, in any profile',
    { timeout: 900_000 },
    async () => {
      const all = await Promise.all([PROFILES.mixed, PROFILES.pressure, PROFILES.launches].map(runSeeds));
      // Every output in the minute after a forward change is checked against one more batch (`observe`): none
      // went past it, in any profile; and changes of less than a minute did let outputs past the plain rate.
      assert.deepEqual(
        all.map(({ failures }) => failures),
        [[], [], []],
      );
      assert.ok(all.reduce((sum, { totals }) => sum + totals.subMinuteForward, 0) > 0);
    },
  );
});

type MemoryStorage = AnnouncedEventsStorage & { record: string | null };

function memoryStorage(): MemoryStorage {
  const storage: MemoryStorage = {
    record: null,
    read: async () => storage.record,
    write: async (record) => {
      storage.record = record;
    },
    failed: (problem) => assert.fail(`the record reported ${problem}`),
  };
  return storage;
}

/** Both routes as the app wires them, on one computer `m`, with a record loaded from `storage`. */
function route(storage: AnnouncedEventsStorage, clock: { now: number }) {
  const posted: NotificationRequest[] = [];
  /** The Sessions list's sounds, each with the sessions it announced. */
  const played: string[][] = [];
  const logs: string[] = [];
  /** The sessions open on screen. */
  const onScreen = new Set<string>();
  const announced = new AnnouncedEvents(() => clock.now);
  /** The session list as the phone reads it: each session's attention (none when absent), and its row if named. */
  const attentions = new Map<string, { id: string; enteredAt: number; rowId?: string }>();
  /** The attention sound switch. */
  const sound = { on: true };
  const deps = {
    centre: { post: async (request: NotificationRequest) => void posted.push(request) },
    announced,
    settings: () => ALL_ON,
    soundOn: () => sound.on,
    onScreen: (_machineId: string, sessionId: string) => onScreen.has(sessionId),
    play: (events: readonly EventIdentity[]) => void played.push(events.map((event) => event.sessionId)),
    log: (line: string) => void logs.push(line),
  };
  return {
    posted,
    played,
    logs,
    announced,
    attentions,
    sound,
    onScreen,
    loading: announced.load(storage),
    /** A feed row or the push of an event written at `createdAt`. */
    deliver: (rowId: string, sessionId: string, kind: HostEventKind = 'finished', createdAt = clock.now) =>
      processHostEvents(
        [{ machineId: 'm', sessionId, kind, eventId: rowId, occurredAt: new Date(createdAt).toISOString() }],
        (_machineId, session) => sessionFacts(attentions.get(session)),
        deps,
      ),
    /** A pass of the Sessions list: sessions that left attention, and those that entered their current one. */
    sessionsList: (left: readonly string[], entered: readonly string[]) =>
      announceAttentionTransitions(
        left.map((sessionId) => ({ machineId: 'm', sessionId })),
        entered.map((sessionId) => ({
          machineId: 'm',
          sessionId,
          kind: null,
          rowId: attentions.get(sessionId)?.rowId ?? '',
          episode: attentions.get(sessionId)?.id ?? '',
        })),
        deps,
      ),
    requestsFor: (rowId: string) => posted.filter((request) => request.data.notificationId === rowId),
    /** How often the event of row `rowId` in session `sessionId`'s attention sounded, from either route. */
    soundsFor: (rowId: string, sessionId: string) =>
      posted.filter((request) => request.data.notificationId === rowId && request.sound).length +
      played.filter((sessions) => sessions.includes(sessionId)).length,
  };
}

describe('fixed counterexamples', () => {
  /**
   * Forty sessions, each finishing a short turn every forty seconds (a row a second; the feed holds each
   * session's latest row), `rows` rows after n0; then n0's one push, sent at its event with an hour to live.
   */
  async function lateCopyAfter(rows: number) {
    const clock = { now: 0 };
    const app = route(memoryStorage(), clock);
    await app.loading;
    const feed = new Map<string, { sessionId: string; id: string }>();
    const write = (index: number) => {
      const sessionId = `s${index % 40}`;
      feed.set(sessionId, { sessionId, id: `n${index}` });
      app.announced.retainFeed('m', [...feed.values()]);
      app.deliver(`n${index}`, sessionId);
    };
    write(0);
    for (let i = 1; i <= rows; i += 1) {
      clock.now = i * 1_000;
      write(i);
    }
    clock.now += 21_000;
    app.deliver('n0', 's0', 'finished', 0);
    return app;
  }

  test('865 rate-held deliveries do not push out an announced event whose one push is still on its way', async () => {
    const app = await lateCopyAfter(1_000);
    assert.equal(app.logs.length, 865);
    assert.equal(app.requestsFor('n0').length, 1);
    assert.equal(app.requestsFor('n0').filter((request) => request.sound).length, 1);
  });

  test('three times as many rate-held deliveries still do not push it out', async () => {
    const app = await lateCopyAfter(3_000);
    assert.ok(app.logs.length > 2_000, `${app.logs.length} held`);
    assert.equal(app.requestsFor('n0').length, 1);
    assert.equal(app.requestsFor('n0').filter((request) => request.sound).length, 1);
  });

  test("the Sessions list's sound, a held notification, the session leaving attention and 1300 rows: n0's late push does not sound again", async () => {
    const clock = { now: 0 };
    const app = route(memoryStorage(), clock);
    await app.loading;
    // Eight other sessions' events take the minute's notifications.
    for (let i = 1; i <= 8; i += 1) app.deliver(`block${i}`, `s${i}`);
    assert.equal(app.posted.length, 8);
    // s0 enters attention a0 naming n0; the Sessions list sees it, then n0 arrives.
    clock.now = 1_000;
    app.attentions.set('s0', { id: 'a0', enteredAt: 1_000, rowId: 'n0' });
    app.sessionsList([], ['s0']);
    clock.now = 2_000;
    app.deliver('n0', 's0', 'finished', 1_500);
    // s0 works again; forty sessions write 1300 rows, one a second, most of them held by the rate limit.
    app.attentions.delete('s0');
    app.sessionsList(['s0'], []);
    const feed = new Map<string, { sessionId: string; id: string }>();
    for (let i = 1; i <= 1_300; i += 1) {
      clock.now = 2_000 + i * 1_000;
      const sessionId = `s${i % 40}`;
      feed.set(sessionId, { sessionId, id: `held${i}` });
      app.announced.retainFeed('m', [...feed.values()]);
      app.deliver(`held${i}`, sessionId);
    }
    assert.ok(app.logs.length > 1_008, `${app.logs.length} held`);
    // A quiet minute, then n0's one push, well within its hour.
    clock.now += 61_000;
    app.deliver('n0', 's0', 'finished', 1_500);
    assert.equal(app.soundsFor('n0', 's0'), 1);
    assert.equal(app.requestsFor('n0').length, 1);
  });

  test("the Sessions list's sound plays, n0's notification follows silent; after the session left and 1300 rows its push stays silent", async () => {
    const clock = { now: 0 };
    const app = route(memoryStorage(), clock);
    await app.loading;
    app.attentions.set('s0', { id: 'a0', enteredAt: 0, rowId: 'n0' });
    app.sessionsList([], ['s0']);
    clock.now = 1_000;
    app.deliver('n0', 's0', 'finished', 500);
    assert.deepEqual(
      app.requestsFor('n0').map((request) => request.sound),
      [false],
    );
    app.attentions.delete('s0');
    app.sessionsList(['s0'], []);
    const feed = new Map<string, { sessionId: string; id: string }>();
    for (let i = 1; i <= 1_300; i += 1) {
      clock.now = 1_000 + i * 1_000;
      const sessionId = `s${i % 40}`;
      feed.set(sessionId, { sessionId, id: `held${i}` });
      app.announced.retainFeed('m', [...feed.values()]);
      app.deliver(`held${i}`, sessionId);
    }
    clock.now += 61_000;
    app.deliver('n0', 's0', 'finished', 500);
    assert.equal(app.soundsFor('n0', 's0'), 1);
    assert.equal(app.requestsFor('n0').length, 1);
  });

  test("127 launches 21 s apart, each with eight new events and its record written: n0's push at 2707 s gives no second notification", async () => {
    const clock = { now: 0 };
    const storage = memoryStorage();
    /** One launch at `launch × 21 s`: its record loads what the last one stored, eight new events come. */
    const launchAt = async (launch: number) => {
      clock.now = launch * 21_000;
      const app = route(storage, clock);
      await app.loading;
      app.announced.retainFeed(
        'm',
        Array.from({ length: 8 }, (_, i) => ({ sessionId: `s${i}`, id: `n${launch * 8 + i}` })),
      );
      for (let i = 0; i < 8; i += 1) app.deliver(`n${launch * 8 + i}`, `s${i}`);
      await flush();
      return app;
    };
    const n0Requests = (app: { requestsFor(rowId: string): NotificationRequest[] }) => app.requestsFor('n0').length;
    let notified = 0;
    let last = await launchAt(0);
    for (let launch = 1; launch <= 126; launch += 1) {
      notified += n0Requests(last);
      last = await launchAt(launch);
    }
    clock.now += 61_000;
    assert.equal(clock.now, 2_707_000);
    last.deliver('n0', 's0', 'finished', 0);
    notified += n0Requests(last);
    assert.equal(notified, 1);
  });

  test('a copy queued within its hour while the stored record loads stays silent, however late the read settles', async () => {
    const clock = { now: 0 };
    const storage = memoryStorage();
    const first = route(storage, clock);
    await first.loading;
    first.deliver('n0', 's1');
    await flush();
    assert.equal(first.requestsFor('n0').length, 1);

    clock.now = 60_000;
    const read = Promise.withResolvers<string | null>();
    const second = route({ ...storage, read: () => read.promise }, clock);
    second.deliver('n0', 's1', 'finished', 0);
    clock.now = ANNOUNCED_WINDOW_MS + 1;
    read.resolve(storage.record);
    await second.loading;
    assert.deepEqual(second.posted, []);
  });

  test('a copy that comes while the stored record loads waits for it and stays silent; a new event then notifies', async () => {
    const clock = { now: 0 };
    const storage = memoryStorage();
    const first = route(storage, clock);
    await first.loading;
    first.deliver('n0', 's1');
    await flush();
    assert.equal(first.requestsFor('n0').length, 1);

    clock.now += 60_000;
    const read = Promise.withResolvers<string | null>();
    const second = route({ ...storage, read: () => read.promise }, clock);
    // While the record loads: n0's late push, and a new event n1.
    second.deliver('n0', 's1', 'finished', 0);
    second.deliver('n1', 's2');
    assert.equal(second.posted.length, 0);
    read.resolve(storage.record);
    await second.loading;
    assert.deepEqual(
      second.posted.map((request) => request.data.notificationId),
      ['n1'],
    );
  });

  test('a new kind of a row kept in the feed for hours keeps its own window once the row leaves the feed', async () => {
    const clock = { now: 0 };
    const app = route(memoryStorage(), clock);
    await app.loading;
    app.announced.retainFeed('m', [{ sessionId: 's1', id: 'n0' }]);
    app.deliver('n0', 's1', 'finished');
    clock.now = ANNOUNCED_WINDOW_MS + 1;
    app.deliver('n0', 's1', 'needsInput');
    app.announced.retainFeed('m', []);
    // The needsInput push, sent at that event, arrives now.
    clock.now += 21_000;
    app.deliver('n0', 's1', 'needsInput', ANNOUNCED_WINDOW_MS + 1);
    assert.deepEqual(
      app.posted.map((request) => request.data.kind),
      ['finished', 'needsInput'],
    );
  });

  test("an event held back for the session on screen: its push after the person left, the Sessions list's pass and a push after a restart stay silent", async () => {
    const clock = { now: 0 };
    const storage = memoryStorage();
    const app = route(storage, clock);
    await app.loading;
    app.attentions.set('s0', { id: 'a0', enteredAt: 0, rowId: 'n0' });
    app.onScreen.add('s0');
    app.deliver('n0', 's0', 'finished', 0);
    app.onScreen.delete('s0');
    // Half an hour later the person is elsewhere; n0's push and the Sessions list's pass of a0 come.
    clock.now = 30 * 60_000;
    app.deliver('n0', 's0', 'finished', 0);
    app.sessionsList([], ['s0']);
    await flush();
    // The app restarts; n0's push still comes within its hour.
    clock.now = 50 * 60_000;
    const next = route(storage, clock);
    await next.loading;
    next.deliver('n0', 's0', 'finished', 0);
    assert.deepEqual([...app.posted, ...next.posted], []);
    assert.deepEqual(app.played, []);
    // The session's next event is new.
    next.deliver('n1', 's0');
    assert.deepEqual(
      next.posted.map((request) => [request.data.notificationId, request.sound]),
      [['n1', true]],
    );
  });

  test('past the bound of ids seen on screen the oldest seen event notifies once late; an announced one never again', async () => {
    const clock = { now: 0 };
    const app = route(memoryStorage(), clock);
    await app.loading;
    app.deliver('announced', 's1');
    // One more seen event than the bound has ids (each a row without a proven attention: one id).
    app.onScreen.add('s0');
    for (let i = 0; i <= SEEN_ON_SCREEN_IDS; i += 1) {
      clock.now += 1_000;
      app.deliver(`seen${i}`, 's0');
    }
    app.onScreen.delete('s0');
    assert.equal(app.announced.seenOnScreenIds('m'), SEEN_ON_SCREEN_IDS);
    clock.now += 21_000;
    for (const rowId of ['seen0', 'seen1', `seen${SEEN_ON_SCREEN_IDS}`]) app.deliver(rowId, 's0', 'finished', 0);
    app.deliver('announced', 's1', 'finished', 0);
    assert.deepEqual(
      app.posted.map((request) => request.data.notificationId),
      ['announced', 'seen0'],
    );
    clock.now += 21_000;
    app.deliver('seen0', 's0', 'finished', 0);
    assert.equal(app.requestsFor('seen0').length, 1);
  });

  test("a kind that takes over the Sessions list's sound 90 min later: its push after the session left, 50 min on, stays silent, also across a restart", async () => {
    for (const restart of [false, true]) {
      const clock = { now: 0 };
      const storage = memoryStorage();
      const app = route(storage, clock);
      await app.loading;
      app.attentions.set('s0', { id: 'a0', enteredAt: 0, rowId: 'n0' });
      app.sessionsList([], ['s0']);
      // Ninety minutes on, the computer turns n0 (written at 0) into needsInput in place; the feed brings it.
      clock.now = 90 * 60_000;
      app.deliver('n0', 's0', 'needsInput', 0);
      // The session works again; the push sent at that change arrives fifty minutes later.
      app.attentions.delete('s0');
      app.sessionsList(['s0'], []);
      clock.now = 140 * 60_000;
      await flush();
      const late = restart ? route(storage, clock) : app;
      await late.loading;
      late.deliver('n0', 's0', 'needsInput', 0);
      assert.equal(app.requestsFor('n0').length + (restart ? late.requestsFor('n0').length : 0), 1);
      assert.equal(app.soundsFor('n0', 's0') + (restart ? late.soundsFor('n0', 's0') : 0), 1);
    }
  });

  test('eight sounds, eight other events a minute later, then the first eight rows: at most eight notifications that minute', async () => {
    const clock = { now: 0 };
    const app = route(memoryStorage(), clock);
    await app.loading;
    const old = Array.from({ length: 8 }, (_, i) => `old${i}`);
    for (const [i, row] of old.entries()) app.attentions.set(row, { id: `a${i}`, enteredAt: 0, rowId: row });
    app.sessionsList([], old);
    assert.equal(app.played.length, 1);
    clock.now = 60_000;
    for (let i = 0; i < 8; i += 1) app.deliver(`new${i}`, `new${i}`);
    assert.equal(app.posted.length, 8);
    clock.now = 60_001;
    for (const sessionId of old) app.deliver(sessionId, sessionId, 'finished', 0);
    assert.equal(app.posted.length, 8);
    // Their notifications are held, not lost: a minute later a copy of each brings it, without a second sound.
    for (let i = 0; i < 8; i += 1) {
      clock.now = 121_000 + i * 21_000;
      app.deliver(old[i], old[i], 'finished', 0);
    }
    assert.deepEqual(
      app.posted.slice(8).map((request) => [request.data.notificationId, request.sound]),
      old.map((rowId) => [rowId, false]),
    );
  });

  test("the Sessions list's sound and its row's notification within 20 s are one announcement; later the notification takes its own place", async () => {
    const clock = { now: 0 };
    const app = route(memoryStorage(), clock);
    await app.loading;
    app.attentions.set('s0', { id: 'a0', enteredAt: 0, rowId: 'n0' });
    app.attentions.set('s1', { id: 'a1', enteredAt: 0, rowId: 'n1' });
    app.sessionsList([], ['s0', 's1']);
    // Six other events fill the minute to eight with the two sounds.
    for (let i = 2; i <= 7; i += 1) app.deliver(`other${i}`, `s${i}`);
    clock.now = 5_000;
    app.deliver('n0', 's0', 'finished', 0);
    assert.deepEqual(
      app.requestsFor('n0').map((request) => request.sound),
      [false],
    );
    // 25 s after its sound, s1's row needs a place of its own: the minute is full, so it waits.
    clock.now = 25_000;
    app.deliver('n1', 's1', 'finished', 0);
    assert.deepEqual(app.requestsFor('n1'), []);
    clock.now = 61_000;
    app.deliver('n1', 's1', 'finished', 0);
    assert.deepEqual(
      app.requestsFor('n1').map((request) => request.sound),
      [false],
    );
  });

  /** s1's attention a0 (naming n0 or no row) is sounded or seen at 0, the session leaves it at 1 s. */
  async function shortAttention(options: { namesRow: boolean; seen: boolean }) {
    const clock = { now: 0 };
    const app = route(memoryStorage(), clock);
    await app.loading;
    if (options.seen) app.onScreen.add('s1');
    app.attentions.set('s1', { id: 'a0', enteredAt: 0, rowId: options.namesRow ? 'n0' : '' });
    app.sessionsList([], ['s1']);
    app.onScreen.delete('s1');
    clock.now = 1_000;
    app.attentions.delete('s1');
    app.sessionsList(['s1'], []);
    return { app, clock };
  }

  test('a short attention: another row is its own event; the named row, three minutes on, sounds once; without the name twice', async () => {
    for (const namesRow of [true, false]) {
      const { app, clock } = await shortAttention({ namesRow, seen: false });
      clock.now = 30_000;
      app.deliver('n1', 's1', 'failed', 20_000);
      clock.now = 3 * 60_000;
      app.deliver('n0', 's1', 'finished', 0);
      const posted = app.posted.map((request) => `${request.data.notificationId} ${request.sound}`);
      assert.deepEqual(posted, ['n1 true', `n0 ${!namesRow}`]);
      assert.equal(app.soundsFor('n0', 's1'), namesRow ? 1 : 2);
    }
  });

  test('a short attention seen on screen: the named row stays silent; another row, or any row without the name, notifies', async () => {
    for (const namesRow of [true, false]) {
      const { app, clock } = await shortAttention({ namesRow, seen: true });
      clock.now = 30_000;
      app.deliver('n1', 's1', 'failed', 20_000);
      clock.now = 3 * 60_000;
      app.deliver('n0', 's1', 'finished', 0);
      const posted = app.posted.map((request) => `${request.data.notificationId} ${request.sound}`);
      assert.deepEqual(posted, namesRow ? ['n1 true'] : ['n1 true', 'n0 true']);
      assert.deepEqual(app.played, []);
    }
  });

  test('two attentions naming no row, the earlier sounded and the later seen: their row is an event of its own', async () => {
    const { app, clock } = await shortAttention({ namesRow: false, seen: false });
    clock.now = 21_000;
    app.onScreen.add('s1');
    app.attentions.set('s1', { id: 'a1', enteredAt: 21_000 });
    app.sessionsList([], ['s1']);
    app.onScreen.delete('s1');
    clock.now = 22_000;
    app.attentions.delete('s1');
    app.sessionsList(['s1'], []);
    clock.now = 42_000;
    app.deliver('n1', 's1', 'finished', 21_000);
    const posted = app.posted.map((request) => [request.data.notificationId, request.sound]);
    assert.deepEqual(posted, [['n1', true]]);
  });

  test('another copy still waiting does not tie a new row to an earlier attention naming no row, sounded or seen', async () => {
    for (const seen of [false, true]) {
      const { app, clock } = await shortAttention({ namesRow: false, seen });
      clock.now = 119_000;
      const waiting = app.announced.arrive();
      clock.now = 121_000;
      app.deliver('new-event', 's1', 'finished', 121_000);
      app.announced.whenLoaded(() => undefined, waiting);
      assert.deepEqual(
        app.posted.map((request) => [request.data.notificationId, request.sound]),
        [['new-event', true]],
      );
    }
  });

  test('the attention sound after its event notified without it takes its own place: held when eight came that minute', async () => {
    const clock = { now: 0 };
    const app = route(memoryStorage(), clock);
    await app.loading;
    app.sound.on = false;
    for (let i = 0; i < 8; i += 1) app.deliver(`n${i}`, `s${i}`);
    assert.equal(app.posted.length, 8);
    app.sound.on = true;
    clock.now = 5_000;
    app.attentions.set('s0', { id: 'a0', enteredAt: 0, rowId: 'n0' });
    app.sessionsList([], ['s0']);
    assert.deepEqual(app.played, []);
    assert.ok(app.logs.some((line) => line.startsWith(HELD_SOUND)));
  });

  test('the clock set back: launches at 0, 30, 60 and 90 s hold a new event for at most a minute', async () => {
    const clock = { now: 10 * ANNOUNCED_WINDOW_MS };
    const storage = memoryStorage();
    const before = route(storage, clock);
    await before.loading;
    for (let i = 0; i < 8; i += 1) before.deliver(`n${i}`, `s${i}`);
    await flush();
    const posted: string[] = [];
    for (const now of [0, 30_000, 60_000, 90_000]) {
      clock.now = now;
      const app = route(storage, clock);
      await app.loading;
      app.deliver('fresh', 'new');
      // n0's copy is still the same event.
      app.deliver('n0', 's0', 'finished', 0);
      posted.push(...app.posted.map((request) => `${now / 1_000}s ${request.data.notificationId}`));
      await flush();
    }
    assert.deepEqual(posted, ['60s fresh']);
  });

  test('the clock set forward by three hours: a copy of an announced event within its hour comes at most once more', async () => {
    const clock = { now: 0 };
    const app = route(memoryStorage(), clock);
    await app.loading;
    app.deliver('n0', 's');
    app.announced.retainFeed('m', []);
    clock.now = 3 * 60 * 60_000;
    app.deliver('n0', 's', 'finished', 0);
    clock.now += 21_000;
    app.deliver('n0', 's', 'finished', 0);
    assert.equal(app.requestsFor('n0').length, 2);
  });

  test('the app ended between showing and saving: the event comes at most once more and is not lost', async () => {
    const clock = { now: 0 };
    let durable: string | null = null;
    const stalled: AnnouncedEventsStorage = {
      read: async () => durable,
      // The process ends before the write settles.
      write: () => new Promise<void>(() => undefined),
      failed: () => assert.fail('the record reported a problem'),
    };
    const first = route(stalled, clock);
    await first.loading;
    first.deliver('n0', 's');
    await flush();
    assert.equal(first.requestsFor('n0').length, 1);
    clock.now = 21_000;
    const saving: AnnouncedEventsStorage = {
      read: async () => durable,
      write: async (record) => {
        durable = record;
      },
      failed: () => assert.fail('the record reported a problem'),
    };
    const second = route(saving, clock);
    await second.loading;
    second.deliver('n0', 's', 'finished', 0);
    await flush();
    clock.now = 42_000;
    const third = route(saving, clock);
    await third.loading;
    third.deliver('n0', 's', 'finished', 0);
    assert.equal(first.requestsFor('n0').length + second.requestsFor('n0').length + third.requestsFor('n0').length, 2);
  });
});
