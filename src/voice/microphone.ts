/**
 * The microphone permission the voice agent and Dictate ask for, on Android and iOS, and the
 * sentence that says where to allow it when the phone said no.
 */

import { PermissionsAndroid, Platform } from 'react-native';

import { GhostexNative } from '../../modules/ghostex-native/src';

/** Asks for the microphone once (the system asks the user the first time); answers whether it is allowed. */
export async function microphoneAllowed(): Promise<boolean> {
  if (Platform.OS === 'ios') return GhostexNative.microphonePermission().catch(() => false);
  const permission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
  if (await PermissionsAndroid.check(permission)) return true;
  return (await PermissionsAndroid.request(permission)) === PermissionsAndroid.RESULTS.GRANTED;
}

/** "Ghostex needs microphone access to <purpose>. Allow it in <the phone's settings path>." */
export function microphoneDeniedMessage(purpose: string, os: string = Platform.OS): string {
  const where =
    os === 'ios' ? 'iPhone Settings › Apps › Ghostex › Microphone' : 'Android Settings › Apps › Ghostex › Permissions';
  return `Ghostex needs microphone access to ${purpose}. Allow it in ${where}.`;
}
