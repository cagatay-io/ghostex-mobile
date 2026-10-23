/**
 * Settings > Updates: the running version and, in release builds, the over-the-air update state
 * (downloading, or ready with a Restart button). On the GitHub APK it also offers a newer APK, but
 * only for a release whose JavaScript cannot arrive over the air (new native code): one primary
 * button walks Download (with percent) → Install (opens the Android package installer).
 * Listed on the Settings home while over-the-air updates or ANDROID_SELF_UPDATE_ENABLED are on.
 */

import * as Application from 'expo-application';
import { useUpdates } from 'expo-updates';
import { StyleSheet, Text, View } from 'react-native';

import { SetupButton } from '../../components/onboarding/SetupPrimitives';
import { ANDROID_SELF_UPDATE_ENABLED } from '../../config/featureFlags';
import { SetupPalette } from '../../theme/palette';
import { useAppearance } from '../../theme/useAppearance';
import { formatByteSize, installedAppVersion } from '../../updates/androidSelfUpdate';
import {
  availableUpdate,
  useAndroidSelfUpdateStore,
  type UpdateCheckState,
  type UpdateDownloadState,
} from '../../updates/androidSelfUpdateStore';
import {
  checkForAppUpdate,
  OTA_ENABLED,
  restartToApplyUpdate,
  runningAppVersion,
  useReadyUpdate,
} from '../../updates/overTheAir';
import { SettingsScreenLayout, ValueRow } from './SettingsControls';

const UpdatesCopy = {
  versionLabel: 'Version',
  appBuildLabel: 'App build',
  installedLabel: 'Installed',
  latestLabel: 'Latest release',
  otaAutomatic: 'Updates download on their own and apply the next time Ghostex starts.',
  otaChecking: 'Checking for an update…',
  otaDownloading: (percent: number | null) =>
    percent === null ? 'Downloading an update…' : `Downloading an update… ${percent}%`,
  otaReady: (version: string | null) => (version === null ? 'An update is ready.' : `Ghostex ${version} is ready.`),
  otaError: (message: string) => `The last update check failed: ${message}`,
  restartButton: 'Restart to update',
  notChecked: 'Ghostex has not checked GitHub for a newer release yet.',
  checking: 'Checking GitHub…',
  upToDate: (checkedAt: number) => `No new app to install. Checked ${formatRelativeTime(checkedAt)}.`,
  available: (version: string, size: number) => `Ghostex ${version} needs a new app install (${formatByteSize(size)}).`,
  checkButton: 'Check for updates',
  downloadButton: (version: string) => `Download Ghostex ${version}`,
  downloading: (percent: number) => `Downloading… ${percent}%`,
  cancelButton: 'Cancel download',
  installButton: (version: string) => `Install Ghostex ${version}`,
  installHint: 'Android will ask you to allow installs from Ghostex once, then shows the installer.',
} as const;

function formatRelativeTime(at: number): string {
  const elapsedMinutes = Math.max(0, Math.round((Date.now() - at) / 60_000));
  if (elapsedMinutes < 1) return 'just now';
  if (elapsedMinutes < 60) return `${elapsedMinutes} min ago`;
  const elapsedHours = Math.round(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours} h ago`;
  return new Date(at).toLocaleDateString();
}

type StatusLine = { text: string; tone: 'muted' | 'accent' | 'error' };

function checkStatusLine(check: UpdateCheckState): StatusLine {
  switch (check.phase) {
    case 'idle':
      return { text: UpdatesCopy.notChecked, tone: 'muted' };
    case 'checking':
      return { text: UpdatesCopy.checking, tone: 'muted' };
    case 'checked':
      return check.updateAvailable
        ? { text: UpdatesCopy.available(check.latest.version, check.latest.apkSize), tone: 'accent' }
        : { text: UpdatesCopy.upToDate(check.checkedAt), tone: 'muted' };
    case 'error':
      return { text: check.message, tone: 'error' };
  }
}

function downloadPercent(download: UpdateDownloadState): number {
  if (download.phase !== 'downloading' || download.totalBytes <= 0) return 0;
  return Math.min(100, Math.floor((download.bytesWritten / download.totalBytes) * 100));
}

function StatusText({ line }: { line: StatusLine }) {
  const appearance = useAppearance();
  return (
    <Text
      style={[
        styles.status,
        { color: appearance.muted },
        line.tone === 'accent' ? styles.statusAccent : null,
        line.tone === 'error' ? styles.statusError : null,
      ]}
    >
      {line.text}
    </Text>
  );
}

/** The over-the-air update state from expo-updates. */
function OverTheAirSection() {
  const { isChecking, isDownloading, downloadProgress, checkError, downloadError } = useUpdates();
  const ready = useReadyUpdate();
  const error = downloadError ?? checkError;
  const line: StatusLine =
    ready !== null
      ? { text: UpdatesCopy.otaReady(ready.version), tone: 'accent' }
      : isDownloading
        ? {
            text: UpdatesCopy.otaDownloading(
              downloadProgress === undefined ? null : Math.round(downloadProgress * 100),
            ),
            tone: 'muted',
          }
        : isChecking
          ? { text: UpdatesCopy.otaChecking, tone: 'muted' }
          : error !== undefined
            ? { text: UpdatesCopy.otaError(error.message), tone: 'error' }
            : { text: UpdatesCopy.otaAutomatic, tone: 'muted' };
  return (
    <View style={styles.actions}>
      <StatusText line={line} />
      {ready !== null ? (
        <SetupButton
          variant="primary"
          label={UpdatesCopy.restartButton}
          accessibilityLabel={UpdatesCopy.restartButton}
          onPress={() => void restartToApplyUpdate()}
        />
      ) : null}
    </View>
  );
}

/** A newer APK from GitHub, for a release that brings new native code. */
function ApkSection() {
  const appearance = useAppearance();
  const check = useAndroidSelfUpdateStore((state) => state.check);
  const download = useAndroidSelfUpdateStore((state) => state.download);
  const downloadUpdate = useAndroidSelfUpdateStore((state) => state.downloadUpdate);
  const cancelDownload = useAndroidSelfUpdateStore((state) => state.cancelDownload);
  const installUpdate = useAndroidSelfUpdateStore((state) => state.installUpdate);
  const update = availableUpdate(check);

  return (
    <>
      {check.phase === 'checked' ? <ValueRow label={UpdatesCopy.latestLabel} value={check.latest.version} /> : null}
      <StatusText line={checkStatusLine(check)} />
      {update !== null ? (
        <View style={styles.actions}>
          {download.phase === 'ready' ? (
            <SetupButton
              variant="primary"
              label={UpdatesCopy.installButton(download.version)}
              accessibilityLabel={UpdatesCopy.installButton(download.version)}
              onPress={() => void installUpdate()}
            />
          ) : download.phase === 'downloading' ? (
            <>
              <SetupButton
                variant="primary"
                disabled
                label={UpdatesCopy.downloading(downloadPercent(download))}
                onPress={() => undefined}
              />
              <SetupButton label={UpdatesCopy.cancelButton} onPress={cancelDownload} />
            </>
          ) : (
            <SetupButton
              variant="primary"
              label={UpdatesCopy.downloadButton(update.version)}
              accessibilityLabel={UpdatesCopy.downloadButton(update.version)}
              onPress={() => void downloadUpdate()}
            />
          )}
          {download.phase === 'error' ? (
            <Text style={[styles.status, styles.statusError]}>{download.message}</Text>
          ) : null}
          {download.phase === 'ready' && download.installError !== null ? (
            <Text style={[styles.status, styles.statusError]}>{download.installError}</Text>
          ) : null}
          <Text style={[styles.status, { color: appearance.muted }]}>{UpdatesCopy.installHint}</Text>
        </View>
      ) : null}
    </>
  );
}

export default function UpdatesPage() {
  const apkChecking = useAndroidSelfUpdateStore((state) => state.check.phase === 'checking');
  const checkForApk = useAndroidSelfUpdateStore((state) => state.checkForUpdates);
  const { isChecking } = useUpdates();

  const installedVersion = installedAppVersion();
  const buildNumber = Application.nativeBuildVersion;
  const installed = buildNumber === null ? installedVersion : `${installedVersion} (${buildNumber})`;

  return (
    <SettingsScreenLayout>
      {OTA_ENABLED ? (
        <>
          <ValueRow label={UpdatesCopy.versionLabel} value={runningAppVersion() ?? installedVersion} />
          <ValueRow label={UpdatesCopy.appBuildLabel} value={installed} />
          <OverTheAirSection />
        </>
      ) : (
        <ValueRow label={UpdatesCopy.installedLabel} value={installed} />
      )}

      {ANDROID_SELF_UPDATE_ENABLED ? <ApkSection /> : null}

      <SetupButton
        label={UpdatesCopy.checkButton}
        accessibilityLabel={UpdatesCopy.checkButton}
        busy={apkChecking || isChecking}
        onPress={() => {
          void checkForAppUpdate();
          if (ANDROID_SELF_UPDATE_ENABLED) void checkForApk();
        }}
      />
    </SettingsScreenLayout>
  );
}

const styles = StyleSheet.create({
  status: {
    fontSize: 12.5,
    lineHeight: 18,
    paddingHorizontal: 4,
  },
  statusAccent: {
    color: SetupPalette.ACCENT,
  },
  statusError: {
    color: SetupPalette.ERROR,
  },
  actions: {
    gap: 8,
  },
});
