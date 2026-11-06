/**
 * The app's one summary refresh. The controller is the real one; app state, machine
 * selection, `refreshAll` and the interval timers are fakes, so the test advances a fake clock instead of
 * waiting. The refresh knows nothing about routes: the Terminal screen in front is the case where the
 * old poll, tied to the Sessions screen's focus, did not run at all.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { startSummaryRefresh, type Observable } from './summaryRefresh';

const INTERVAL_MS = 5000; // INVENTORY_POLL_INTERVAL_MS, the existing interval

function observable<T>(initial: T): Observable<T> & { set: (value: T) => void } {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: (next) => {
      value = next;
      for (const listener of listeners) listener();
    },
  };
}

/** A fake clock with interval timers only, which is all the refresh uses. */
function fakeClock() {
  let now = 0;
  let nextId = 1;
  const intervals = new Map<number, { run: () => void; ms: number; due: number }>();
  return {
    timers: {
      setInterval: (run: () => void, ms: number): number => {
        const id = nextId++;
        intervals.set(id, { run, ms, due: now + ms });
        return id;
      },
      clearInterval: (id: number): void => {
        intervals.delete(id);
      },
    },
    advance(ms: number): void {
      const end = now + ms;
      for (;;) {
        let next: { id: number; due: number } | null = null;
        for (const [id, interval] of intervals) {
          if (interval.due <= end && (next === null || interval.due < next.due)) next = { id, due: interval.due };
        }
        if (next === null) break;
        const interval = intervals.get(next.id);
        if (interval === undefined) break;
        now = interval.due;
        interval.due += interval.ms;
        interval.run();
      }
      now = end;
    },
    now: () => now,
    activeIntervals: () => intervals.size,
  };
}

function setup(appState: string, machineSelected: boolean) {
  const clock = fakeClock();
  const app = observable(appState);
  const machine = observable(machineSelected);
  const calls: number[] = [];
  const polling: boolean[] = [];
  const stop = startSummaryRefresh({
    appState: app,
    machineSelected: machine,
    refreshAll: () => calls.push(clock.now()),
    setPolling: (value) => polling.push(value),
    intervalMs: INTERVAL_MS,
    timers: clock.timers,
  });
  return { clock, app, machine, calls, polling, stop };
}

describe('summary refresh on every screen', () => {
  test('active app, selected machine, Terminal in front: refreshAll every 5 s', () => {
    const { clock, calls } = setup('active', true);
    clock.advance(10_000);
    // Read once when the refresh starts, then at the existing 5-second interval.
    assert.deepEqual(calls, [0, 5000, 10_000]);
  });

  test('in the background refreshAll is not called', () => {
    const { clock, calls } = setup('background', true);
    clock.advance(10_000);
    assert.deepEqual(calls, []);
  });

  test('going to the background stops the poll, coming back reads at once', () => {
    const { clock, app, calls, polling } = setup('active', true);
    clock.advance(5000);
    app.set('background');
    clock.advance(10_000);
    assert.deepEqual(calls, [0, 5000]);
    app.set('active');
    assert.deepEqual(calls, [0, 5000, 15_000]);
    assert.deepEqual(polling, [true, false, true]);
  });

  test('with no machine selected refreshAll is not called', () => {
    const { clock, machine, calls } = setup('active', false);
    clock.advance(10_000);
    assert.deepEqual(calls, []);
    machine.set(true);
    clock.advance(5000);
    assert.deepEqual(calls, [10_000, 15_000]);
  });

  test('re-evaluations while it runs (Sessions screen focus, store updates) keep one call per interval', () => {
    const { clock, app, machine, calls } = setup('active', true);
    // What a focused Sessions screen and the stores do while the refresh runs: the machine store emits on
    // every hydrate and selection write, AppState repeats `active`. None of it may start a second poll.
    machine.set(true);
    app.set('active');
    app.set('inactive');
    app.set('active');
    clock.advance(INTERVAL_MS);
    assert.equal(clock.activeIntervals(), 1);
    assert.deepEqual(calls, [0, 5000]);
  });

  test('stopping the refresh clears its timer and reports the poll as stopped', () => {
    const { clock, calls, polling, stop } = setup('active', true);
    stop();
    clock.advance(10_000);
    assert.deepEqual(calls, [0]);
    assert.deepEqual(polling, [true, false]);
    assert.equal(clock.activeIntervals(), 0);
  });
});
