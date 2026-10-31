/**
 * Push, wired to the app: the phone's Expo push token on its computers (`pushToken.ts`) and the background task
 * iOS runs for a push with content-available (`backgroundPush.ts`). How a push is announced while the app runs
 * is in `feedStore.ts`, with the feed's notifications; what each computer confirms about the token goes to the
 * record of announced events there (`pushAccepted`), which keeps across launches which computers accepted this
 * phone's registration, because while the app is out of front only their pushes announce their events, and
 * Settings says what that means for delivery.
 *
 * The token goes to every enabled computer over its warm link (`POST /api/registerPushToken` on the
 * computer's gxserver, with the link's bearer token like every other request of that link), and nowhere else.
 * The registration runs at the app's start, when the app comes back to the front, when the master switch or the
 * first ask's answer changes, when a computer is added or shown again, and when iOS issues a new token. A
 * computer on the exec route (no gxserver API for the phone) and one whose gxserver does not know the route are not
 * asked again until the app starts again or the token changes; only the second is known to hold no token.
 *
 * The background task is defined when this module loads: iOS can start the app in the background for a push,
 * and then no screen is mounted and `initPushNotifications` does not run. iOS only; on Android nothing here
 * runs.
 */

import * as TaskManager from 'expo-task-manager';
import { AppState } from 'react-native';

import { logAppEvent } from '../app/appLog';
import { chatMachineLink } from '../chat/rust/machine-link';
import { useInventoryStore } from '../inventory/store';
import { enabledMachines, machineDisplayLabel, useMachinesStore } from '../machines/store';
import { useSettingsStore } from '../settings/store';
import { handleBackgroundPush } from './backgroundPush';
import { pushAccepted, recordPushShownByIos } from './feedStore';
import {
  BACKGROUND_PUSH_TASK,
  backgroundTaskResult,
  expoPermission,
  expoPushToken,
  NOTIFICATIONS_SUPPORTED,
  pushProjectId,
  registerBackgroundPushTask,
  watchPushToken,
} from './notificationCentre';
import { REGISTER_PUSH_TOKEN_METHOD } from './pushMessage';
import { PushTokenRegistration, type PushTokenParams, type PushTokenSendOutcome } from './pushToken';

const PUSH_TOKEN_REQUEST_TIMEOUT_MS = 10_000;

/**
 * One registration request to a computer's gxserver over its warm link. `current` is the pass's check that the
 * master switch and the token still ask for it: looking up the link's route can take a handshake, so it is checked
 * again once the route is known, and nothing is sent when it no longer holds (`superseded`).
 */
async function sendPushToken(
  machineId: string,
  params: PushTokenParams,
  current: () => boolean,
): Promise<PushTokenSendOutcome> {
  const machine = enabledMachines(useMachinesStore.getState()).find((entry) => entry.id === machineId);
  if (machine === undefined) return 'unreachable';
  const link = chatMachineLink(machine);
  const route = await link.route();
  if (route === 'legacy') return 'legacy';
  if (route !== 'socket') return 'unreachable';
  if (!current()) return 'superseded';
  const answer = await link.rpc(REGISTER_PUSH_TOKEN_METHOD, params, PUSH_TOKEN_REQUEST_TIMEOUT_MS);
  if (answer.error === null) return 'done';
  // gxserver answers an `/api/` route it does not know with `notFound`.
  if (answer.error.code === 'notFound') return 'unsupported';
  if (answer.error.code === 'unreachable') return 'unreachable';
  // A refusal or an answer the phone cannot read: not taken, so the computer keeps what it held before.
  return 'refused';
}

const registration = new PushTokenRegistration({
  permission: () => expoPermission.current(),
  settings: () => useSettingsStore.getState().settings.notifications,
  projectId: pushProjectId,
  obtainToken: expoPushToken,
  machines: () =>
    enabledMachines(useMachinesStore.getState()).map((machine) => ({
      id: machine.id,
      label: machineDisplayLabel(machine),
    })),
  send: sendPushToken,
  accepted: pushAccepted,
  log: logAppEvent,
});

if (NOTIFICATIONS_SUPPORTED) {
  TaskManager.defineTask(BACKGROUND_PUSH_TASK, async ({ data, executionInfo }) =>
    backgroundTaskResult(
      await handleBackgroundPush(data, {
        // A launch in the background mounts no screen, so nothing else loads these.
        prepare: async () => {
          await Promise.all([useMachinesStore.getState().hydrate(), useSettingsStore.getState().hydrate()]);
        },
        refreshSessions: () => useInventoryStore.getState().refreshAll(),
        inBackground: () => (executionInfo.appState ?? AppState.currentState) === 'background',
        shownByIos: recordPushShownByIos,
        startTimer: (ms) => {
          const timer = Promise.withResolvers<void>();
          const handle = setTimeout(timer.resolve, ms);
          return { expired: timer.promise, cancel: () => clearTimeout(handle) };
        },
        log: logAppEvent,
      }),
    ),
  );
}

let installed = false;

/** Install once at app startup, after `initAttentionNotifications`; runs for the app's lifetime. */
export function initPushNotifications(): void {
  if (installed || !NOTIFICATIONS_SUPPORTED) return;
  installed = true;
  const sync = (): void => void registration.sync();
  watchPushToken(() => void registration.tokenChanged());
  let switches = useSettingsStore.getState().settings.notifications;
  useSettingsStore.subscribe((state) => {
    const next = state.settings.notifications;
    if (next.enabled === switches.enabled && next.askedAt === switches.askedAt) return;
    switches = next;
    sync();
  });
  const enabledIds = (): string =>
    enabledMachines(useMachinesStore.getState())
      .map((machine) => machine.id)
      .join('\n');
  let computers = enabledIds();
  useMachinesStore.subscribe(() => {
    const next = enabledIds();
    if (next === computers) return;
    computers = next;
    sync();
  });
  // Back in front: the permission may have changed, and a computer that could not be reached is asked again.
  AppState.addEventListener('change', (next) => {
    if (next === 'active') sync();
  });
  void registerBackgroundPushTask().catch(() => {
    logAppEvent('Push: the background task for pushes was not registered');
  });
  sync();
}
