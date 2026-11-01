/**
 * The iPhone's notification centre through `expo-notifications` (SDK 58, MIT): local notifications only
 * (the config plugin's `enableRemoteNotifications` is off until push), the permission behind the
 * one-time ask, banners while the app is in front, and taps.
 *
 * iOS only: on Android nothing here touches expo-notifications; the Android persistent
 * notification (`src/app/persistentNotification.ts`) stays what it was.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { PermissionAdapter, PermissionState } from './firstAsk';
import type { NotificationCentre, NotificationData } from './notify';

export const NOTIFICATIONS_SUPPORTED = Platform.OS === 'ios';

function permissionState(status: Notifications.NotificationPermissionsStatus): PermissionState {
  switch (status.ios?.status) {
    case Notifications.IosAuthorizationStatus.AUTHORIZED:
    case Notifications.IosAuthorizationStatus.PROVISIONAL:
    case Notifications.IosAuthorizationStatus.EPHEMERAL:
      return 'granted';
    case Notifications.IosAuthorizationStatus.DENIED:
      return 'denied';
    default:
      return 'undetermined';
  }
}

export const expoPermission: PermissionAdapter = {
  current: async () => permissionState(await Notifications.getPermissionsAsync()),
  request: async () =>
    permissionState(
      await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } }),
    ),
};

export const expoNotificationCentre: NotificationCentre = {
  post: async (request) => {
    await Notifications.scheduleNotificationAsync({
      identifier: request.identifier,
      content: { title: request.title, body: request.line, sound: request.sound, data: request.data },
      trigger: null,
    });
  },
};

/** The tap target of a notification: its own data, or (a push message without a link) its session. */
function tapData(response: Notifications.NotificationResponse): Partial<NotificationData> | null {
  if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return null;
  // The native dictionary as the SDK types it, widened by `null`, which a push without data can carry; each
  // field is checked before use.
  const data: Record<string, unknown> | null | undefined = response.notification.request.content.data;
  if (typeof data?.machineId !== 'string' || typeof data.sessionId !== 'string') return null;
  return {
    machineId: data.machineId,
    sessionId: data.sessionId,
    ...(typeof data.url === 'string' ? { url: data.url } : {}),
    ...(typeof data.notificationId === 'string' ? { notificationId: data.notificationId } : {}),
  };
}

/**
 * Shows the app's notifications while it is in front (a banner over any screen, with its own sound)
 * and hands every tap to `onTap`, including the tap that started the app (a cold start).
 */
export function installNotificationCentre(onTap: (data: Partial<NotificationData>) => void): void {
  if (!NOTIFICATIONS_SUPPORTED) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  const handle = (response: Notifications.NotificationResponse | null): void => {
    if (response === null) return;
    const data = tapData(response);
    if (data === null) return;
    Notifications.clearLastNotificationResponse();
    onTap(data);
  };
  handle(Notifications.getLastNotificationResponse());
  Notifications.addNotificationResponseReceivedListener(handle);
}
