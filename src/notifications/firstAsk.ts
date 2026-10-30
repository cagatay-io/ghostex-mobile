/**
 * The one-time ask (REQ-NOTIF-014, D-023 "Einmal fragen"): at the first launch of a version that has
 * notifications (a new install and an update alike) the app asks once whether it may notify. The ask
 * is the iOS permission prompt itself, without a screen of the app's own before it (D-031 item 4).
 * Allowed: the master, finished, waiting and error switches turn on; not allowed: all four stay off.
 * Either way `askedAt` is stored and the prompt is never requested again; later changes happen in
 * Settings > Notifications (and, after a denial, in iOS Settings, because iOS shows its prompt once).
 * The permission and the stored settings are passed in, so the flow is testable under `bun test`.
 */

import type { NotificationSettings } from './settings';

/** The system's answer. `undetermined`: nobody answered (the prompt was not shown or was dismissed). */
export type PermissionState = 'granted' | 'denied' | 'undetermined';

export type PermissionAdapter = {
  /** The current state, without asking. */
  current(): Promise<PermissionState>;
  /** Shows the system prompt when the state is undetermined, and returns the state after it. */
  request(): Promise<PermissionState>;
};

export type NotificationSettingsAccess = {
  get(): NotificationSettings;
  set(next: NotificationSettings): void;
};

export type FirstAskOutcome = 'alreadyAsked' | 'granted' | 'denied' | 'unanswered';

/** Runs the ask when it was never answered; a later start with `askedAt` set requests nothing. */
export async function runFirstAsk(
  permission: PermissionAdapter,
  settings: NotificationSettingsAccess,
  now: () => Date,
): Promise<FirstAskOutcome> {
  if (settings.get().askedAt !== undefined) return 'alreadyAsked';
  const answer = await permission.request();
  // Nobody answered: nothing is stored, so the next launch asks again (the ask has not happened yet).
  if (answer === 'undetermined') return 'unanswered';
  const on = answer === 'granted';
  settings.set({ enabled: on, finished: on, waiting: on, error: on, askedAt: now().toISOString() });
  return answer;
}
