/**
 * The app-level source of agent events (REQ-NOTIF-001): it reads every enabled computer's notification
 * feed while the app can run, on every screen, not only on the Sessions screen (whose inventory poll
 * stops when it loses focus). An unread row is a new event when its id was not there before (the host
 * writes a new row for a session's new attention and drops its older unread one) or when its kind
 * changed since the last read: the host turns a session's unread `finished` row into `needsInput` in
 * place when the finished turn left open questions (`mark_unread_session_notification_needs_input`,
 * `server/src/notification_feed/store.rs`). A row only marked read or unread again (`markUnread`,
 * `deferUnread`, another client) is no new event.
 *
 * - Without a live event channel the feed is read every `POLL_INTERVAL_MS`. A computer whose gxserver
 *   offers `stream=notifications` (H2, capability `notificationStream`) announces each change; its feed
 *   is read on that announcement (`refresh`) and otherwise only every `STREAMED_POLL_INTERVAL_MS`.
 * - A computer that cannot be read is tried again every `FAILING_POLL_INTERVAL_MS`, so an unreachable or
 *   older computer costs no handshake every few seconds.
 * - The first read of a computer, the first after a failed one, and the first after `rebaseline` (the
 *   app came back from the background, where iOS may have paused it) only record what is there: no
 *   notification for states that already exist (REQ-NOTIF-009 first-fetch rule, derived). What happened
 *   meanwhile is in the attention list, the reliable view after a reconnect (D-060). A read that was under
 *   way at `rebaseline` answers with the feed from before: its answer is dropped, so it neither notifies
 *   nor becomes the baseline, and a read asked for after `rebaseline` does not join it.
 *
 * Timers, clock, reads and the log are passed in, so the source is testable under `bun test`.
 */

import type { FeedRow, FeedSnapshot } from './feedContract';

export const POLL_INTERVAL_MS = 5_000;
export const STREAMED_POLL_INTERVAL_MS = 60_000;
export const FAILING_POLL_INTERVAL_MS = 30_000;

/** Why a computer's feed could not be read: its Ghostex has no feed for the phone, or it did not answer. */
export type FeedReadFailure = 'legacy' | 'unreachable';

/** A computer's feed cannot be read; it carries only the reason (never the computer's own error text). */
export class FeedUnavailableError extends Error {
  constructor(readonly reason: FeedReadFailure) {
    super(`notification feed ${reason}`);
  }
}

export type FeedReadOutcome = { kind: 'ready'; snapshot: FeedSnapshot } | { kind: 'failed'; reason: FeedReadFailure };

export type FeedSourceMachine = { id: string; label: string };

export type FeedEventSourceDeps = {
  machines(): readonly FeedSourceMachine[];
  /** Reads one computer's feed; throws `FeedUnavailableError` (or anything, counted as unreachable). */
  read(machineId: string): Promise<FeedSnapshot>;
  /** Every finished read. */
  onRead(machineId: string, outcome: FeedReadOutcome): void;
  /** Unread rows that are new events since the previous read, oldest first; never on a baseline read. */
  onNewRows(machineId: string, rows: readonly FeedRow[]): void;
  log(message: string): void;
  now(): number;
  setInterval(run: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
};

type MachineState = {
  /** Each row's kind at the last read, by row id; null until a (re)baseline read. */
  seen: Map<string, FeedRow['kind']> | null;
  lastReadAt: number;
  failing: boolean;
  streamed: boolean;
  /** Counts `rebaseline` calls: a read started under an older generation is from before the return. */
  generation: number;
  reading: { generation: number; promise: Promise<void> } | null;
};

export class FeedEventSource {
  private readonly states = new Map<string, MachineState>();
  private timer: unknown = null;

  constructor(private readonly deps: FeedEventSourceDeps) {}

  start(): void {
    if (this.timer !== null) return;
    this.timer = this.deps.setInterval(() => this.tick(), POLL_INTERVAL_MS);
    this.tick();
  }

  stop(): void {
    if (this.timer === null) return;
    this.deps.clearInterval(this.timer);
    this.timer = null;
  }

  /** The next read of every computer only records what is there (back from the background). */
  rebaseline(): void {
    for (const state of this.states.values()) {
      state.seen = null;
      state.generation += 1;
    }
  }

  /** A live channel for this computer's feed opened (true) or closed (false). */
  setStreamed(machineId: string, streamed: boolean): void {
    this.stateFor(machineId).streamed = streamed;
  }

  /** Reads every computer whose turn it is; forgets computers that are gone. */
  tick(): void {
    const machines = this.deps.machines();
    const ids = new Set(machines.map((machine) => machine.id));
    for (const id of this.states.keys()) if (!ids.has(id)) this.states.delete(id);
    const now = this.deps.now();
    for (const machine of machines) {
      const state = this.stateFor(machine.id);
      const interval = state.failing
        ? FAILING_POLL_INTERVAL_MS
        : state.streamed
          ? STREAMED_POLL_INTERVAL_MS
          : POLL_INTERVAL_MS;
      // Half a tick of slack, so timer jitter does not skip a whole interval.
      if (now - state.lastReadAt >= interval - POLL_INTERVAL_MS / 2) void this.refresh(machine.id);
    }
  }

  /** Reads one computer's feed now (an announcement, the list opening, a pull); joins a read in flight. */
  refresh(machineId: string): Promise<void> {
    const state = this.stateFor(machineId);
    if (state.reading !== null && state.reading.generation === state.generation) return state.reading.promise;
    state.lastReadAt = this.deps.now();
    const generation = state.generation;
    const promise = this.deps
      .read(machineId)
      .then(
        (snapshot) => {
          if (generation !== state.generation) return;
          state.failing = false;
          this.ingest(machineId, state, snapshot);
          this.deps.onRead(machineId, { kind: 'ready', snapshot });
        },
        (error: unknown) => {
          if (generation !== state.generation) return;
          state.failing = true;
          // What arrives while the computer cannot be read is no news by the time it can: the next good
          // read is a baseline, and the attention list shows what happened (D-060).
          state.seen = null;
          const reason = error instanceof FeedUnavailableError ? error.reason : 'unreachable';
          this.deps.onRead(machineId, { kind: 'failed', reason });
        },
      )
      .finally(() => {
        if (state.reading?.promise === promise) state.reading = null;
      });
    state.reading = { generation, promise };
    return promise;
  }

  private ingest(machineId: string, state: MachineState, snapshot: FeedSnapshot): void {
    const previous = state.seen;
    state.seen = new Map(snapshot.rows.map((row) => [row.id, row.kind]));
    if (previous === null) return;
    const fresh = snapshot.rows.filter((row) => !row.read && previous.get(row.id) !== row.kind).reverse();
    if (fresh.length === 0) return;
    const label = this.deps.machines().find((machine) => machine.id === machineId)?.label ?? machineId;
    for (const row of fresh) this.deps.log(`${label}: notification feed event received (${row.kind})`);
    this.deps.onNewRows(machineId, fresh);
  }

  private stateFor(machineId: string): MachineState {
    let state = this.states.get(machineId);
    if (state === undefined) {
      state = {
        seen: null,
        lastReadAt: Number.NEGATIVE_INFINITY,
        failing: false,
        streamed: false,
        generation: 0,
        reading: null,
      };
      this.states.set(machineId, state);
    }
    return state;
  }
}
