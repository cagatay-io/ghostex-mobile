/**
 * Settings › Privacy & Analytics: dedicated privacy disclosure, synced `analyticsEnabled` toggle,
 * "Never sent" pill badges, live `/api/telemetryPreview` JSON inspector (with graceful fallback
 * for offline or older `gxserver` builds), and GitHub `ANALYTICS.md` link.
 *
 * Strictly JS-only (OTA-safe) and synced with the connected computer's `analyticsEnabled` setting.
 */

import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  ANALYTICS_DOCS_URL,
  ANALYTICS_PURPOSE_COPY,
  ANALYTICS_TOGGLE_TITLE,
  fetchTelemetryPreview,
  NEVER_SENT_ITEMS,
  readComputerAnalyticsSetting,
  saveComputerAnalyticsSetting,
  setMachineAnalyticsEnabled,
  type ReadAnalyticsSettingResult,
  type TelemetryPreviewResult,
} from '../../analytics/privacy';
import { clearPendingOnboardingSteps } from '../../analytics/onboarding';
import { Glyph } from '../../chat/native/cards/icons';
import ActionSheet from '../../components/common/ActionSheet';
import { isDemoMachine } from '../../demo/identity';
import {
  isMachineEnabled,
  machineDisplayLabel,
  machineName,
  useMachinesStore,
  type MachineRecord,
} from '../../machines/store';
import { useSettingsStore } from '../../settings/store';
import { GhostexRadii, GhostexStrokeWidth } from '../../theme/palette';
import { useAppearance } from '../../theme/useAppearance';
import { SettingsSection } from './SectionBoundary';
import {
  Caption,
  LinkRow,
  NoticeCard,
  SectionHeader,
  SettingsScreenLayout,
  ToggleRow,
  useSettingsStyles,
} from './SettingsControls';
import { SettingsSearchAnchor } from './search/SettingsSearchAnchor';

type SyncedSettingState = { kind: 'loading' } | ReadAnalyticsSettingResult;
type PreviewState = { kind: 'idle' } | { kind: 'loading' } | TelemetryPreviewResult;

function useAnalyticsComputer(pickedId: string | null): {
  machine: MachineRecord | null;
  machines: MachineRecord[];
} {
  const all = useMachinesStore((state) => state.machines);
  const selectedId = useMachinesStore((state) => state.selectedMachineId);
  return useMemo(() => {
    const machines = all.filter((entry) => isMachineEnabled(entry) && !isDemoMachine(entry));
    const machine =
      machines.find((entry) => entry.id === pickedId) ??
      machines.find((entry) => entry.id === selectedId) ??
      machines[0] ??
      null;
    return { machine, machines };
  }, [all, pickedId, selectedId]);
}

function statusReasonLabel(reason: string | null): string | null {
  switch (reason) {
    case 'enabled':
      return 'Analytics on';
    case 'onboarding_pending':
      return 'Held until onboarding finishes';
    case 'settings_disabled':
      return 'Off in settings (weekly active count only)';
    case 'env_disabled':
      return 'Stopped completely by DO_NOT_TRACK or GHOSTEX_TELEMETRY_DISABLED';
    case 'client_launch_disabled':
      return 'Stopped completely by --no-analytics';
    case 'remote_helper':
      return 'Off (remote SSH helper)';
    default:
      return null;
  }
}

export default function PrivacyAnalyticsPage() {
  const [pickedId, setPickedId] = useState<string | null>(null);
  const { machine, machines } = useAnalyticsComputer(pickedId);
  const localEnabled = useSettingsStore((state) => state.settings.analyticsEnabled);
  const setSetting = useSettingsStore((state) => state.setSetting);

  const [remoteState, setRemoteState] = useState<SyncedSettingState>({ kind: 'loading' });
  const [syncNotice, setSyncNotice] = useState<{ tone: 'info' | 'error'; title: string; detail: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewState, setPreviewState] = useState<PreviewState>({ kind: 'idle' });
  const [copiedJson, setCopiedJson] = useState(false);

  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appearance = useAppearance();
  const settingsStyles = useSettingsStyles();
  const machineId = machine?.id ?? null;

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const loadRemoteSetting = useCallback(() => {
    if (machine === null) {
      setRemoteState({ kind: 'offline', message: 'Pair a computer to sync this setting with Ghostex on desktop.' });
      return () => undefined;
    }
    let live = true;
    setRemoteState({ kind: 'loading' });
    setSyncNotice(null);
    void readComputerAnalyticsSetting(machine).then((next) => {
      if (!live) return;
      setRemoteState(next);
      if (next.kind === 'value') {
        setSetting('analyticsEnabled', next.enabled);
      }
    });
    return () => {
      live = false;
    };
    // Reload when the picked computer changes, not on every store update of the same one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machineId]);

  useEffect(() => loadRemoteSetting(), [loadRemoteSetting]);

  // Reset preview when switching computers so we never show another machine's payload.
  useEffect(() => {
    setPreviewState({ kind: 'idle' });
    setCopiedJson(false);
  }, [machineId]);

  const loadPreview = useCallback(async () => {
    if (machine === null) {
      setPreviewState({
        kind: 'offline',
        message: 'Connect a computer to inspect its live JSON payload.',
      });
      return;
    }
    setPreviewState({ kind: 'loading' });
    setCopiedJson(false);
    const result = await fetchTelemetryPreview(machine);
    setPreviewState(result);
  }, [machine]);

  const handleTogglePreview = useCallback(() => {
    if (previewOpen) {
      setPreviewOpen(false);
      return;
    }
    setPreviewOpen(true);
    void loadPreview();
  }, [previewOpen, loadPreview]);

  const handleToggleAnalytics = useCallback(
    (next: boolean) => {
      setSetting('analyticsEnabled', next);
      if (!next) {
        clearPendingOnboardingSteps();
      }
      if (machine === null) {
        setSyncNotice(null);
        return;
      }

      setMachineAnalyticsEnabled(machine.id, next);
      setRemoteState({ kind: 'value', enabled: next, source: 'sharedSettings' });
      setSyncNotice(null);

      void saveComputerAnalyticsSetting(machine, next).then((result) => {
        if (result.kind === 'saved') {
          if (previewOpen) void loadPreview();
          return;
        }
        setSyncNotice({
          tone: result.kind === 'unsupported' ? 'info' : 'error',
          title:
            result.kind === 'unsupported'
              ? `Active on this phone, update ${machineDisplayLabel(machine)}`
              : `Couldn't sync to ${machineDisplayLabel(machine)}`,
          detail: result.message,
        });
      });
    },
    [machine, setSetting, previewOpen, loadPreview],
  );

  const handleCopyJson = useCallback((jsonText: string) => {
    void Clipboard.setStringAsync(jsonText).then(() => {
      setCopiedJson(true);
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedJson(false), 2_000);
    });
  }, []);

  const handleOpenDocs = useCallback(() => {
    void Linking.openURL(ANALYTICS_DOCS_URL).catch(() => undefined);
  }, []);

  const switchValue = remoteState.kind === 'value' ? remoteState.enabled : localEnabled;
  const computerLabel = machine !== null ? machineDisplayLabel(machine) : null;

  return (
    <SettingsScreenLayout>
      <SettingsSection name="settings:privacy:analytics">
        <SectionHeader title="Usage analytics" />
        {machine !== null && machines.length > 1 ? (
          <ComputerRow machine={machine} machines={machines} onPick={setPickedId} />
        ) : null}

        <ToggleRow
          label={ANALYTICS_TOGGLE_TITLE}
          detail={ANALYTICS_PURPOSE_COPY}
          value={switchValue}
          onValueChange={handleToggleAnalytics}
        />

        {computerLabel !== null && remoteState.kind === 'loading' ? (
          <Caption>Reading {computerLabel}'s setting…</Caption>
        ) : null}
        {computerLabel !== null && remoteState.kind === 'value' ? (
          <Caption>Synced with {computerLabel}'s analyticsEnabled setting.</Caption>
        ) : null}
        {remoteState.kind === 'unsupported' || remoteState.kind === 'offline' ? (
          <Caption>{remoteState.message}</Caption>
        ) : null}

        {syncNotice !== null ? (
          <NoticeCard tone={syncNotice.tone} title={syncNotice.title} detail={syncNotice.detail} />
        ) : null}

        <View style={[settingsStyles.card, styles.disclosureCard]}>
          <View style={styles.disclosureHead}>
            <Glyph name="shield-check" size={18} color={appearance.accent} />
            <Text style={settingsStyles.linkTitle}>Zero personal data, MIT open-source</Text>
          </View>
          <Text style={[styles.disclosureBody, { color: appearance.muted }]}>
            Ghostex collects no personal data at all, is completely free and MIT open-source, and syncs this switch with
            your connected computer's analyticsEnabled setting. When switched off, this phone also stops sending mobile
            screen, hello, and onboarding pings immediately.
          </Text>
          <Text style={[styles.disclosureBody, { color: appearance.muted }]}>
            Turning this off stops all usage and feature tracking and keeps only 1 anonymous weekly active count (random
            install ID + analytics_enabled: false, zero other properties, only when used that week). Setting
            DO_NOT_TRACK=1 or --no-analytics on your computer stops even that completely.
          </Text>
        </View>
      </SettingsSection>

      <SettingsSection name="settings:privacy:never-sent">
        <SectionHeader title="Never sent" />
        <View style={[settingsStyles.card, styles.neverSentCard]}>
          <View style={styles.pillWrap}>
            {NEVER_SENT_ITEMS.map((item) => (
              <View
                key={item}
                style={[
                  styles.pill,
                  {
                    backgroundColor: appearance.background,
                    borderColor: appearance.border,
                  },
                ]}
              >
                <View style={[styles.pillDot, { backgroundColor: appearance.mutedGlyph }]} />
                <Text style={[styles.pillText, { color: appearance.foreground }]}>{item}</Text>
              </View>
            ))}
          </View>
          <Text style={[styles.neverSentNote, { color: appearance.muted }]}>
            Every event uses a random per-install UUIDv4 and a closed allowlist in Ghostex's open-source server code.
          </Text>
        </View>
      </SettingsSection>

      <SettingsSection name="settings:privacy:preview">
        <SectionHeader title="Inspect what's sent" />
        <SettingsSearchAnchor label="View what's sent">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: previewOpen }}
            onPress={handleTogglePreview}
            style={({ pressed }) => [settingsStyles.row, pressed && settingsStyles.rowPressed]}
          >
            <View style={settingsStyles.linkText}>
              <Text style={settingsStyles.linkTitle}>View what's sent</Text>
              <Text style={settingsStyles.linkDescription}>
                {previewOpen
                  ? 'Hide payload preview'
                  : computerLabel !== null
                    ? `Inspect the live JSON payload from ${computerLabel}.`
                    : 'See a summary of the anonymous fields Ghostex sends.'}
              </Text>
            </View>
            <Text style={settingsStyles.chevron}>{previewOpen ? '⌄' : '›'}</Text>
          </Pressable>
        </SettingsSearchAnchor>

        {previewOpen ? (
          <View style={[settingsStyles.card, styles.previewCard]}>
            {previewState.kind === 'loading' ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={appearance.mutedGlyph} />
                <Text style={settingsStyles.linkDescription}>
                  Loading live payload from {computerLabel ?? 'your computer'}…
                </Text>
              </View>
            ) : null}

            {previewState.kind === 'live' ? (
              <>
                <View style={styles.previewHeader}>
                  <View style={styles.previewHeaderText}>
                    <Text style={settingsStyles.linkTitle}>Live payload preview</Text>
                    <Text style={settingsStyles.linkDescription}>
                      {statusReasonLabel(previewState.statusReason) ?? 'Read-only preview from /api/telemetryPreview'}
                    </Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.jsonContainer,
                    {
                      backgroundColor: appearance.background,
                      borderColor: appearance.border,
                    },
                  ]}
                >
                  <ScrollView horizontal showsHorizontalScrollIndicator>
                    <Text selectable style={[styles.jsonText, { color: appearance.foreground }]}>
                      {previewState.formattedJson}
                    </Text>
                  </ScrollView>
                </View>
                <View style={styles.previewActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={copiedJson ? 'JSON copied' : 'Copy JSON'}
                    onPress={() => handleCopyJson(previewState.formattedJson)}
                    style={({ pressed }) => [
                      styles.actionButton,
                      {
                        backgroundColor: pressed ? appearance.neutralFillPressed : appearance.neutralFill,
                      },
                    ]}
                  >
                    <Glyph name={copiedJson ? 'check' : 'copy'} size={15} color={appearance.foreground} />
                    <Text style={settingsStyles.cardLabel}>{copiedJson ? 'Copied' : 'Copy JSON'}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Refresh preview"
                    onPress={() => void loadPreview()}
                    style={({ pressed }) => [
                      styles.actionButton,
                      {
                        backgroundColor: pressed ? appearance.neutralFillPressed : appearance.neutralFill,
                      },
                    ]}
                  >
                    <Glyph name="refresh" size={15} color={appearance.foreground} />
                    <Text style={settingsStyles.cardLabel}>Refresh</Text>
                  </Pressable>
                </View>
              </>
            ) : null}

            {previewState.kind === 'unsupported' || previewState.kind === 'offline' ? (
              <>
                <Text style={settingsStyles.linkTitle}>Plain-English summary</Text>
                <Text style={[styles.disclosureBody, { color: appearance.muted }]}>{previewState.message}</Text>
                <Text style={[styles.disclosureBody, { color: appearance.muted }]}>
                  When analytics is on, your computer sends a random per-install UUIDv4, OS and architecture, Ghostex
                  version, and anonymous feature and screen counts (never prompts, code, file paths, emails, login
                  files, custom CLI/tool names, or raw IPs). When turned off, it sends at most 1 anonymous weekly active
                  count (random install ID + analytics_enabled: false, zero other properties) only when used that week,
                  and DO_NOT_TRACK=1 or --no-analytics stops even that completely.
                </Text>
                <View style={styles.previewActions}>
                  {machine !== null ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Try again"
                      onPress={() => void loadPreview()}
                      style={({ pressed }) => [
                        styles.actionButton,
                        {
                          backgroundColor: pressed ? appearance.neutralFillPressed : appearance.neutralFill,
                        },
                      ]}
                    >
                      <Glyph name="refresh" size={15} color={appearance.foreground} />
                      <Text style={settingsStyles.cardLabel}>Try again</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Open ANALYTICS.md on GitHub"
                    onPress={handleOpenDocs}
                    style={({ pressed }) => [
                      styles.actionButton,
                      {
                        backgroundColor: pressed ? appearance.neutralFillPressed : appearance.neutralFill,
                      },
                    ]}
                  >
                    <Glyph name="external-link" size={15} color={appearance.foreground} />
                    <Text style={settingsStyles.cardLabel}>Open ANALYTICS.md</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </View>
        ) : null}

        <LinkRow
          title="Read ANALYTICS.md on GitHub"
          description="Full event reference and open-source audit links."
          onPress={handleOpenDocs}
        />
      </SettingsSection>
    </SettingsScreenLayout>
  );
}

/** Which computer the Privacy & Analytics toggle and preview read from; a tap picks another. */
function ComputerRow({
  machine,
  machines,
  onPick,
}: {
  machine: MachineRecord;
  machines: MachineRecord[];
  onPick: (id: string) => void;
}) {
  const settingsStyles = useSettingsStyles();
  const appearance = useAppearance();
  const [open, setOpen] = useState(false);
  return (
    <SettingsSearchAnchor label="Privacy & Analytics computer">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Privacy & Analytics settings for ${machineDisplayLabel(machine)}`}
        accessibilityHint="Picks another computer"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [settingsStyles.row, styles.computer, pressed && settingsStyles.rowPressed]}
      >
        <View style={settingsStyles.linkText}>
          <Text style={settingsStyles.linkTitle}>{machineDisplayLabel(machine)}</Text>
          <Text style={settingsStyles.linkDescription}>
            {`Synced with analyticsEnabled on ${machineName(machine)}`}
          </Text>
        </View>
        <Text style={[settingsStyles.chevron, { color: appearance.muted }]}>⌄</Text>
      </Pressable>
      <ActionSheet
        visible={open}
        title="Privacy & Analytics on"
        onClose={() => setOpen(false)}
        items={machines.map((entry) => ({
          key: entry.id,
          label: `${entry.id === machine.id ? '✓ ' : ''}${machineDisplayLabel(entry)}`,
          onPress: () => {
            setOpen(false);
            onPick(entry.id);
          },
        }))}
      />
    </SettingsSearchAnchor>
  );
}

const MONOSPACE_FONT = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

const styles = StyleSheet.create({
  computer: {
    minHeight: 56,
  },
  disclosureCard: {
    gap: 8,
  },
  disclosureHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  disclosureBody: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  neverSentCard: {
    gap: 10,
  },
  pillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: GhostexRadii.pill,
    borderWidth: GhostexStrokeWidth,
  },
  pillDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '500',
  },
  neverSentNote: {
    fontSize: 11.5,
    lineHeight: 16.5,
  },
  previewCard: {
    gap: 10,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  previewHeaderText: {
    flex: 1,
    gap: 2,
  },
  jsonContainer: {
    borderRadius: GhostexRadii.row,
    borderWidth: GhostexStrokeWidth,
    padding: 10,
    maxHeight: 280,
  },
  jsonText: {
    fontFamily: MONOSPACE_FONT,
    fontSize: 11.5,
    lineHeight: 17,
  },
  previewActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: GhostexRadii.row,
  },
});
