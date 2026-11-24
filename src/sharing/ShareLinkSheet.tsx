/**
 * Native React Native bottom sheet for sharing a Live page or local port over a public tunnel.
 *
 * JS-only and OTA-safe: uses standard React Native controls, `SwitchRow`, `expo-clipboard`, and
 * React Native's built-in `Share` sheet. Matches the desktop Share link popover
 * (`apps/desktop/src/app/window/share_link_popover.rs`).
 */

import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SwitchRow } from '../components/common/SwitchRow';
import type { MachineConnectionTarget } from '../machines/credentials';
import { useAppearance } from '../theme/useAppearance';
import {
  formatShareRemaining,
  sharingRpc,
  type ShareExpiry,
  type ShareItem,
  type SharingState,
} from './api';

export type ShareSheetTarget =
  | { kind: 'page'; pageId: string; title: string }
  | { kind: 'port'; port: number; title: string };

const EXPIRY_OPTIONS: ReadonlyArray<{ value: ShareExpiry; label: string }> = [
  { value: '1h', label: '1h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: 'untilStopped', label: 'Until stopped' },
];

export function ShareLinkSheet({
  visible,
  machine,
  target,
  onClose,
}: {
  visible: boolean;
  machine: MachineConnectionTarget | undefined;
  target: ShareSheetTarget | null;
  onClose: () => void;
}) {
  const appearance = useAppearance();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<SharingState | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expiry, setExpiry] = useState<ShareExpiry>('24h');
  const [passcodeOn, setPasscodeOn] = useState(false);
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);
  const [initialized, setInitialized] = useState(false);

  const reload = useCallback(async () => {
    if (!machine) return;
    setLoading(true);
    setError(null);
    const answer = await sharingRpc<SharingState>(machine, { op: 'read' });
    setLoading(false);
    if (answer.error !== null) {
      setError(answer.error);
      return;
    }
    setState(answer.result);
    if (!initialized && answer.result.config) {
      setExpiry(answer.result.config.defaultExpiry ?? '24h');
      setPasscodeOn(answer.result.config.defaultPasscode === true);
      setInitialized(true);
    }
  }, [initialized, machine]);

  useEffect(() => {
    if (visible && machine && target) {
      void reload();
    } else if (!visible) {
      setError(null);
      setCopied(null);
    }
  }, [visible, machine, target, reload]);

  const activeShare: ShareItem | null = (() => {
    if (!state || !target) return null;
    if (target.kind === 'page') {
      return state.shares.find((s) => s.kind === 'page' && s.pageId === target.pageId) ?? null;
    }
    return state.shares.find((s) => s.kind === 'port' && s.port === target.port) ?? null;
  })();

  const enabled = state?.config?.enabled ?? true;

  const enableSharing = async () => {
    if (!machine || busy) return;
    setBusy(true);
    setError(null);
    const answer = await sharingRpc<SharingState>(machine, { op: 'setConfig', patch: { enabled: true } });
    setBusy(false);
    if (answer.error !== null) {
      setError(answer.error);
      return;
    }
    setState(answer.result);
  };

  const createShare = async () => {
    if (!machine || !target || busy) return;
    setBusy(true);
    setError(null);
    const payload =
      target.kind === 'page'
        ? { op: 'createPage', pageId: target.pageId, expiry, requirePasscode: passcodeOn }
        : { op: 'createPort', port: target.port, title: target.title, expiry, requirePasscode: passcodeOn };
    const answer = await sharingRpc<{ share?: ShareItem; status?: SharingState; state?: SharingState }>(
      machine,
      payload,
    );
    setBusy(false);
    if (answer.error !== null) {
      setError(answer.error);
      return;
    }
    const nextState = answer.result.status ?? answer.result.state;
    if (nextState) {
      setState(nextState);
    } else {
      void reload();
    }
    if (answer.result.share?.url) {
      void Clipboard.setStringAsync(answer.result.share.url);
      setCopied('link');
      setTimeout(() => setCopied((prev) => (prev === 'link' ? null : prev)), 2000);
    }
  };

  const stopShare = async (shareId: string) => {
    if (!machine || busy) return;
    setBusy(true);
    setError(null);
    const answer = await sharingRpc<SharingState>(machine, { op: 'stop', shareId });
    setBusy(false);
    if (answer.error !== null) {
      setError(answer.error);
      return;
    }
    setState(answer.result);
  };

  const copyValue = (which: 'link' | 'code', value: string) => {
    void Clipboard.setStringAsync(value);
    setCopied(which);
    setTimeout(() => setCopied((prev) => (prev === which ? null : prev)), 2000);
  };

  const shareSystem = async (url: string, passcode?: string) => {
    const message = passcode ? `${url}\nPasscode: ${passcode}` : url;
    try {
      await Share.share({ message, url });
    } catch {
      // User dismissed share sheet.
    }
  };

  if (!visible || !target) return null;

  const titleLabel = target.kind === 'page' ? target.title : `${target.title} (:${target.port})`;
  const privacyNote =
    target.kind === 'page'
      ? 'Anyone with the link can view this Live page and answer its questions. Outside answers arrive in this chat labeled with their name.'
      : `Anyone with the link can reach localhost:${target.port} while Ghostex is open on this computer.`;

  const green = appearance.light ? '#168049' : '#34d399';
  const danger = appearance.light ? '#b91c1c' : '#f87171';
  const panelBg = appearance.light ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.055)';
  const raisedBg = appearance.light ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)';
  const hairline = appearance.light ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.11)';
  const primaryBg = appearance.light ? '#5c5c5c' : '#e5e5e5';
  const primaryFg = appearance.light ? '#ffffff' : '#171717';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.sheet,
            {
              backgroundColor: appearance.card,
              borderColor: hairline,
              paddingBottom: Math.max(20, insets.bottom + 12),
            },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.headerText}>
              <View style={styles.titleRow}>
                <Text style={[styles.title, { color: appearance.foreground }]}>
                  {activeShare ? 'Shared link' : 'Share link'}
                </Text>
                {activeShare ? (
                  <View style={[styles.livePill, { backgroundColor: `${green}24` }]}>
                    <View style={[styles.liveDot, { backgroundColor: green }]} />
                    <Text style={[styles.liveText, { color: green }]}>Live</Text>
                  </View>
                ) : null}
              </View>
              <Text numberOfLines={1} style={[styles.subtitle, { color: appearance.muted }]}>
                {titleLabel}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              hitSlop={8}
              style={[styles.closeBtn, { backgroundColor: raisedBg }]}
            >
              <Text style={[styles.closeText, { color: appearance.muted }]}>✕</Text>
            </Pressable>
          </View>

          {error ? (
            <View style={[styles.errorBox, { borderColor: `${danger}55`, backgroundColor: `${danger}18` }]}>
              <Text style={[styles.errorText, { color: danger }]}>{error}</Text>
            </View>
          ) : null}

          {loading && !state ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={appearance.muted} />
              <Text style={[styles.noteText, { color: appearance.muted }]}>Checking sharing status…</Text>
            </View>
          ) : !enabled && !activeShare ? (
            <View style={styles.section}>
              <View style={[styles.noteBox, { backgroundColor: panelBg, borderColor: hairline }]}>
                <Text style={[styles.noteText, { color: appearance.muted }]}>
                  Sharing is turned off on this computer. Turn it on to create public tunnel links.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => void enableSharing()}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: primaryBg, opacity: busy || pressed ? 0.75 : 1 },
                ]}
              >
                <Text style={[styles.primaryBtnText, { color: primaryFg }]}>
                  {busy ? 'Turning on…' : 'Turn on Sharing'}
                </Text>
              </Pressable>
            </View>
          ) : activeShare ? (
            <View style={styles.section}>
              <View style={[styles.noteBox, { backgroundColor: panelBg, borderColor: hairline }]}>
                <Text style={[styles.noteText, { color: appearance.muted }]}>{privacyNote}</Text>
              </View>

              <View style={styles.urlHeader}>
                <Text style={[styles.sectionLabel, { color: appearance.muted }]}>Public URL</Text>
                <Text style={[styles.sectionLabel, { color: appearance.muted }]}>
                  {formatShareRemaining(activeShare.expiresAtMs)}
                </Text>
              </View>
              <View style={[styles.urlBox, { backgroundColor: raisedBg, borderColor: hairline }]}>
                <Text selectable numberOfLines={1} style={[styles.urlText, { color: appearance.foreground }]}>
                  {activeShare.url}
                </Text>
              </View>

              {activeShare.passcode ? (
                <View style={[styles.codeRow, { backgroundColor: panelBg, borderColor: hairline }]}>
                  <View style={styles.codeLeft}>
                    <Text style={[styles.codeLabel, { color: appearance.muted }]}>Passcode</Text>
                    <Text selectable style={[styles.codeValue, { color: appearance.foreground }]}>
                      {activeShare.passcode}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => copyValue('code', activeShare.passcode!)}
                    style={[styles.smallBtn, { backgroundColor: raisedBg, borderColor: hairline }]}
                  >
                    <Text style={[styles.smallBtnText, { color: appearance.foreground }]}>
                      {copied === 'code' ? 'Copied' : 'Copy'}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              <View style={styles.actionRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => copyValue('link', activeShare.url)}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    styles.flexBtn,
                    { backgroundColor: primaryBg, opacity: pressed ? 0.8 : 1 },
                  ]}
                >
                  <Text style={[styles.primaryBtnText, { color: primaryFg }]}>
                    {copied === 'link' ? 'Copied link' : 'Copy link'}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void shareSystem(activeShare.url, activeShare.passcode)}
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    { backgroundColor: raisedBg, borderColor: hairline, opacity: pressed ? 0.75 : 1 },
                  ]}
                >
                  <Text style={[styles.secondaryBtnText, { color: appearance.foreground }]}>Share…</Text>
                </Pressable>
              </View>

              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => void stopShare(activeShare.shareId || activeShare.id || '')}
                style={({ pressed }) => [
                  styles.dangerBtn,
                  {
                    borderColor: `${danger}44`,
                    backgroundColor: `${danger}16`,
                    opacity: busy || pressed ? 0.75 : 1,
                  },
                ]}
              >
                <Text style={[styles.dangerBtnText, { color: danger }]}>
                  {busy ? 'Stopping…' : 'Stop sharing'}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.section}>
              <View style={[styles.noteBox, { backgroundColor: panelBg, borderColor: hairline }]}>
                <Text style={[styles.noteText, { color: appearance.muted }]}>{privacyNote}</Text>
              </View>

              <Text style={[styles.sectionLabel, { color: appearance.muted }]}>Link expires</Text>
              <View style={[styles.chipTrack, { backgroundColor: panelBg, borderColor: hairline }]}>
                {EXPIRY_OPTIONS.map((opt) => {
                  const selected = expiry === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => setExpiry(opt.value)}
                      style={[
                        styles.chip,
                        selected && { backgroundColor: raisedBg, borderColor: hairline, borderWidth: 1 },
                      ]}
                    >
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.chipText,
                          {
                            color: selected ? appearance.foreground : appearance.muted,
                            fontWeight: selected ? '600' : '400',
                          },
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <SwitchRow
                label="Require passcode"
                value={passcodeOn}
                onValueChange={setPasscodeOn}
                disabled={busy}
                style={[styles.switchRow, { backgroundColor: panelBg, borderColor: hairline }]}
              >
                <View style={styles.switchCopy}>
                  <Text style={[styles.switchTitle, { color: appearance.foreground }]}>Require passcode</Text>
                  <Text style={[styles.switchSub, { color: appearance.muted }]}>
                    Ask visitors for a 6-digit code before opening.
                  </Text>
                </View>
                <Switch value={passcodeOn} onValueChange={setPasscodeOn} disabled={busy} />
              </SwitchRow>

              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => void createShare()}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: primaryBg, opacity: busy || pressed ? 0.75 : 1 },
                ]}
              >
                {busy ? <ActivityIndicator size="small" color={primaryFg} /> : null}
                <Text style={[styles.primaryBtnText, { color: primaryFg }]}>
                  {busy ? 'Creating link…' : 'Create share link'}
                </Text>
              </Pressable>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.48)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 13,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    gap: 12,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
  },
  noteBox: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  noteText: {
    fontSize: 13,
    lineHeight: 18,
  },
  errorBox: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 18,
  },
  sectionLabel: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  chipTrack: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
  },
  chip: {
    flex: 1,
    minHeight: 34,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  chipText: {
    fontSize: 12.5,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  switchCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  switchTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  switchSub: {
    fontSize: 12,
    lineHeight: 16,
  },
  urlHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  urlBox: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  urlText: {
    fontSize: 13,
    fontFamily: 'Courier',
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  codeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  codeLabel: {
    fontSize: 13,
  },
  codeValue: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Courier',
    letterSpacing: 1.5,
  },
  smallBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  smallBtnText: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  flexBtn: {
    flex: 1,
  },
  primaryBtn: {
    height: 42,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  primaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryBtn: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '500',
  },
  dangerBtn: {
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
