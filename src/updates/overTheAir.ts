/**
 * Over-the-air updates of the app's JavaScript (expo-updates), from Ghostex's own update server.
 *
 * expo-updates checks at every launch and downloads in the background; the update runs from the
 * next launch, or at once when the reader taps Restart in Settings › Updates. A phone keeps the app
 * alive for days, so `initOverTheAirUpdates` also checks when the app comes back to the
 * foreground, at most every CHECK_INTERVAL_MS. Release builds turn updates on (app.config.js);
 * development builds and Metro leave `OTA_ENABLED` false and everything here does nothing.
 *
 * An update only reaches a binary with the same runtime version (scripts/ota-runtime-version.js),
 * so new native code still needs a new APK, TestFlight build or store release.
 * SEE-ALSO: app.config.js (CDXC:Release 2026-10-23 DECISION), tooling/release-mobile/ota-server/.
 */

import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useUpdates } from 'expo-updates';
import { AppState, Platform, type AppStateStatus } from 'react-native';

export const OTA_ENABLED = Updates.isEnabled;

const CHECK_INTERVAL_MS = 30 * 60 * 1000;

/** `https://ota.ghostex.dev/v1/manifest/production` → that server's status URL for `runtime`. */
function statusUrl(runtimeVersion: string): string | null {
  const manifestUrl = Constants.expoConfig?.updates?.url;
  const match = manifestUrl === undefined ? null : /^(.*)\/v1\/manifest\/([^/]+)$/u.exec(manifestUrl);
  if (match === null) return null;
  return `${match[1]}/v1/status/${match[2]}/${Platform.OS}/${encodeURIComponent(runtimeVersion)}`;
}

/** The release the running JavaScript came from: an update's, or the binary's own when none applied. */
export function runningAppVersion(): string | null {
  return Constants.expoConfig?.version ?? Application.nativeApplicationVersion;
}

/** The release an update manifest was built from (the app config travels in `extra.expoClient`). */
export function manifestAppVersion(manifest: Partial<Updates.Manifest> | undefined): string | null {
  const extra = (manifest as { extra?: { expoClient?: { version?: unknown } } } | undefined)?.extra;
  const version = extra?.expoClient?.version;
  return typeof version === 'string' ? version : null;
}

let lastCheckAt = Date.now();
let checkInFlight: Promise<void> | null = null;

/** Ask the server for an update and download it when there is one. Errors land in useUpdates(). */
export function checkForAppUpdate(): Promise<void> {
  if (!OTA_ENABLED) return Promise.resolve();
  if (checkInFlight !== null) return checkInFlight;
  lastCheckAt = Date.now();
  checkInFlight = (async () => {
    try {
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) await Updates.fetchUpdateAsync();
    } catch {
      // useUpdates() reports checkError/downloadError to Settings › Updates.
    } finally {
      checkInFlight = null;
    }
  })();
  return checkInFlight;
}

/** Run the downloaded update now. */
export function restartToApplyUpdate(): Promise<void> {
  return Updates.reloadAsync();
}

let installed = false;

/** Foreground checks on top of expo-updates' own check at launch. */
export function initOverTheAirUpdates(): void {
  if (!OTA_ENABLED || installed) return;
  installed = true;
  AppState.addEventListener('change', (status: AppStateStatus) => {
    if (status === 'active' && Date.now() - lastCheckAt >= CHECK_INTERVAL_MS) void checkForAppUpdate();
  });
}

/** A downloaded update waiting for a restart (with the release it came from), or null. */
export function useReadyUpdate(): { version: string | null } | null {
  const { isUpdatePending, downloadedUpdate } = useUpdates();
  if (!isUpdatePending) return null;
  return { version: manifestAppVersion(downloadedUpdate?.manifest) };
}

/**
 * Whether release `version` has been published over the air for this binary, so it arrives
 * without installing anything. The server keeps the newest release per runtime version.
 */
export async function releaseArrivesOverTheAir(version: string): Promise<boolean> {
  const runtimeVersion = Updates.runtimeVersion;
  if (!OTA_ENABLED || runtimeVersion === null) return false;
  const url = statusUrl(runtimeVersion);
  if (url === null) throw new Error('This build has no update server address.');
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch (error) {
    throw new Error(
      `Could not reach the Ghostex update server (${error instanceof Error ? error.message : String(error)}).`,
    );
  }
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`The Ghostex update server responded with HTTP ${response.status}.`);
  const body = (await response.json()) as { version?: unknown };
  return body.version === version;
}
