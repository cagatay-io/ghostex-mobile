/**
 * A push that iOS hands to the app in the background. The computer sends its pushes with content-available,
 * so iOS may start or wake the app for a short while (not guaranteed: iOS decides, advises few such runs an
 * hour, and a force-quit app gets none). In that while the app loads what a launch in the background has not
 * loaded yet, refreshes the session list, brings the Live Activity and widgets in line with the list it read,
 * and completes within `BACKGROUND_PUSH_BUDGET_MS`, inside the time iOS gives such a run. A launch in the background
 * mounts no screen, so this run installs their existing consumers. When the refresh fails or reads no computer's
 * session list, both are left as they are: nothing read says that no agent works or waits.
 *
 * A push with an alert that came while the app was in the background was shown by iOS itself: it goes to the
 * record of announced events as that event's notification (`shownByIos`), with the sound only when the push
 * carried one (`aps.sound`; without it iOS showed it silently), so a copy of the same event that a read of the
 * feed brings later in this run is not announced a second time, and its attention sound is still the Sessions
 * list's to play. It goes there as soon as the saved computers are loaded, before a feed read of an app that was
 * still running can bring the row, and once more with the fresh session list, for a session the list did not
 * have yet; the second is the same presentation (`again`), which neither announces nor counts a second time (one
 * notification per event, `eventIdentity.ts`). A push that came while the app was in front, or inactive, is not
 * recorded here: in front iOS asks the app how to show it (`takeForegroundPush` in `feedStore.ts`); while the app
 * is inactive iOS may ask the same or show the push itself (not verified), and a run then cannot tell which, so
 * recording it could count a push the app held back as shown (`feedStore.ts` covers the return to the front).
 *
 * The app state, stores, refresh, Live Activity and widget update, record and timer are passed in, so the handler
 * is testable under `bun test`.
 */

import { pushEventFromData, type PushEvent } from './pushMessage';

/** How long a background run may take: iOS ends one after about 30 seconds. */
export const BACKGROUND_PUSH_BUDGET_MS = 25_000;

/** What the run tells iOS: it refreshed, there was nothing to do, or it could not refresh. */
export type BackgroundPushResult = 'newData' | 'noData' | 'failed';

export type BackgroundPushDeps = {
  /** Loads what a launch in the background has not loaded yet (the saved computers, Settings). */
  prepare(): Promise<void>;
  /**
   * Reads every enabled computer's session list; resolves whether at least one was read. An unreachable computer
   * keeps its error in the inventory store rather than rejecting the refresh.
   */
  refreshSessions(): Promise<boolean>;
  /** Applies the refreshed list and resolves after ActivityKit and the widget snapshot write/reload calls finish. */
  updateActivityAndWidgets(): Promise<void>;
  /** Whether the app is in the background now (iOS shows a push's alert itself then). */
  inBackground(): boolean;
  /**
   * iOS showed this push's alert, with its sound when `sound`: the record takes it as the event's notification.
   * `again`: the same presentation recorded once more.
   */
  shownByIos(event: PushEvent, sound: boolean, again: boolean): void;
  /** A timer of `ms`: `expired` settles when it runs out, `cancel` stops it. */
  startTimer(ms: number): { expired: Promise<void>; cancel(): void };
  log(message: string): void;
};

/** What a background run receives: the push's data and its `aps` dictionary, or (not on iOS) a tap. */
function backgroundPush(payload: unknown): { event: PushEvent | null; alert: boolean; sound: boolean } | null {
  if (typeof payload !== 'object' || payload === null || 'actionIdentifier' in payload) return null;
  // The cast holds: `payload` is a non-null object; every field taken from it is checked below.
  const { data, aps } = payload as { data?: unknown; aps?: unknown };
  if (typeof aps !== 'object' || aps === null) return null;
  const apsRecord = aps as Record<string, unknown>;
  if (apsRecord['content-available'] !== 1) return null;
  let event: PushEvent | null = null;
  if (typeof data === 'object' && data !== null) {
    const { body, dataString } = data as { body?: unknown; dataString?: unknown };
    event = pushEventFromData(body);
    if (event === null && typeof dataString === 'string') {
      try {
        event = pushEventFromData(JSON.parse(dataString));
      } catch {
        // No readable event; the session list is refreshed all the same.
      }
    }
  }
  return {
    event,
    alert: apsRecord.alert !== undefined,
    sound: apsRecord.sound !== undefined && apsRecord.sound !== null,
  };
}

export async function handleBackgroundPush(payload: unknown, deps: BackgroundPushDeps): Promise<BackgroundPushResult> {
  const push = backgroundPush(payload);
  if (push === null) return 'noData';
  // Judged as the push came: a push iOS showed stays shown when the person opens the app meanwhile.
  const shownByIos = push.alert && push.event !== null && deps.inBackground() ? push.event : null;
  let recorded = false;
  const record = (): void => {
    if (shownByIos === null) return;
    deps.shownByIos(shownByIos, push.sound, recorded);
    recorded = true;
  };
  let settled = false;
  /** The session refresh completed; what remains is the Live Activity and widgets. */
  let sessionsRefreshed = false;
  const refreshed = deps
    .prepare()
    .then(() => {
      record();
      return deps.refreshSessions();
    })
    .then(
      async (read): Promise<BackgroundPushResult> => {
        sessionsRefreshed = true;
        if (!read) return 'newData';
        try {
          await deps.updateActivityAndWidgets();
        } catch {
          deps.log('Push: the Live Activity and the widgets were not updated in the background (unexpected)');
        }
        return 'newData';
      },
      () => {
        deps.log('Push: the session list was not refreshed in the background (unexpected)');
        return 'failed' as const;
      },
    )
    .finally(() => {
      settled = true;
    });
  const timer = deps.startTimer(BACKGROUND_PUSH_BUDGET_MS);
  const result = await Promise.race([
    refreshed,
    timer.expired.then((): BackgroundPushResult => {
      if (settled) return 'failed';
      if (!sessionsRefreshed) {
        deps.log('Push: the session list was not refreshed in the background in time');
        return 'failed';
      }
      deps.log('Push: the Live Activity and the widgets were not updated in the background in time');
      return 'newData';
    }),
  ]);
  timer.cancel();
  record();
  return result;
}
