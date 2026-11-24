/**
 * Whether the app is in front, and since when it has been in the background, for the log lines that explain a drop:
 * a connection that ended 40 s after the app went to the background is iOS's doing far more often than the computer's.
 * `lifecycle.ts` feeds it every AppState change; `inactive` (Control Center, a call banner) is still in front here.
 * It also counts time in front for a limit that must not run out while the app is away (`inFrontCountdown`).
 */

import { AppState, type AppStateStatus } from 'react-native';

let backgroundSince: number | null = AppState.currentState === 'background' ? Date.now() : null;

/** Told each time the app goes to the background (false) or comes back to the front (true). */
const frontListeners = new Set<(inFront: boolean) => void>();

/** Records an AppState change; returns how long the app was away when it just came back to the front. */
export function noteAppState(next: AppStateStatus, now = Date.now()): number | null {
  if (next === 'background') {
    if (backgroundSince === null) {
      backgroundSince = now;
      for (const listener of [...frontListeners]) listener(false);
    }
    return null;
  }
  if (next !== 'active' || backgroundSince === null) return null;
  const away = now - backgroundSince;
  backgroundSince = null;
  for (const listener of [...frontListeners]) listener(true);
  return away;
}

/** "in front", or "42 s in the background". */
export function whereTheAppIs(now = Date.now()): string {
  return backgroundSince === null ? 'in front' : `${formatDuration(now - backgroundSince)} in the background`;
}

/**
 * Calls `expire` once the app has been in front for `ms`; time in the background does not count. Measured with
 * `performance.now`, an elapsed-time clock, so a change of the device's clock does not move it. Returns its stop.
 */
export function inFrontCountdown(ms: number, expire: () => void): () => void {
  let left = ms;
  let since = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const run = (): void => {
    if (timer !== null) return;
    since = performance.now();
    timer = setTimeout(() => {
      stop();
      expire();
    }, left);
  };
  const pause = (): void => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    left -= performance.now() - since;
  };
  const listener = (inFront: boolean): void => (inFront ? run() : pause());
  frontListeners.add(listener);
  const stop = (): void => {
    pause();
    frontListeners.delete(listener);
  };
  if (backgroundSince === null) run();
  return stop;
}

/** "850 ms", "42 s", "3 min 5 s", "2 h 4 min". */
export function formatDuration(ms: number): string {
  if (ms < 1_000) return `${Math.max(0, Math.round(ms))} ms`;
  const seconds = Math.round(ms / 1_000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return seconds % 60 === 0 ? `${minutes} min` : `${minutes} min ${seconds % 60} s`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 === 0 ? `${hours} h` : `${hours} h ${minutes % 60} min`;
}
