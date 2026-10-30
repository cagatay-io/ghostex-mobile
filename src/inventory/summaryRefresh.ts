/**
 * The one summary refresh of the app (REQ-LIVEACT-010). While the app is in the foreground and a machine is
 * selected, every enabled machine's mobile summary is read again every `intervalMs` on whatever screen is in
 * front, the terminal included, so the Live Activity (and later the widgets) see state changes while the user
 * works in a session. The Sessions screen shares this refresh instead of running its own poll.
 *
 * Kept free of React Native and the stores, so the rule is testable under `bun test`; `src/app/lifecycle.ts`
 * wires it to AppState, the machines store and the inventory store.
 */

/** A value that can change, and tells when it did. */
export type Observable<T> = {
  readonly get: () => T;
  /** Returns the unsubscribe function. */
  readonly subscribe: (listener: () => void) => () => void;
};

export type IntervalTimers<Handle> = {
  readonly setInterval: (run: () => void, ms: number) => Handle;
  readonly clearInterval: (handle: Handle) => void;
};

export type SummaryRefreshDeps<Handle> = {
  /** React Native AppState values: `active`, `inactive`, `background`, `unknown`, `extension`. */
  readonly appState: Observable<string>;
  readonly machineSelected: Observable<boolean>;
  readonly refreshAll: () => void;
  /** Tells the inventory store whether the poll runs (its not-answering retry only runs while it does). */
  readonly setPolling: (polling: boolean) => void;
  readonly intervalMs: number;
  readonly timers: IntervalTimers<Handle>;
};

/**
 * iOS keeps an `inactive` app in the foreground (Control Center, the app switcher on its way out, a system
 * prompt), so the poll keeps running there and stops only in the background.
 */
function isForeground(appState: string): boolean {
  return appState === 'active' || appState === 'inactive';
}

/** Starts the refresh rule; the returned function stops it and the poll. */
export function startSummaryRefresh<Handle>(deps: SummaryRefreshDeps<Handle>): () => void {
  let handle: Handle | null = null;

  const stopPoll = (): void => {
    if (handle === null) return;
    deps.timers.clearInterval(handle);
    handle = null;
    deps.setPolling(false);
  };

  const evaluate = (): void => {
    const run = isForeground(deps.appState.get()) && deps.machineSelected.get();
    if (!run) {
      stopPoll();
      return;
    }
    if (handle !== null) return;
    deps.setPolling(true);
    // A screen that comes back to the foreground, or a newly selected machine, gets its list now rather than
    // one interval later, as the Sessions screen's own poll did when it gained focus.
    deps.refreshAll();
    handle = deps.timers.setInterval(deps.refreshAll, deps.intervalMs);
  };

  const unsubscribeAppState = deps.appState.subscribe(evaluate);
  const unsubscribeMachine = deps.machineSelected.subscribe(evaluate);
  evaluate();

  return () => {
    unsubscribeAppState();
    unsubscribeMachine();
    stopPoll();
  };
}
