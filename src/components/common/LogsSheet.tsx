/**
 * Logs bottom sheet, opened by tapping the sessions-screen status line: the
 * in-app event log (appLog.ts) as selectable timestamped lines, newest last,
 * with a Copy button that puts the full plain-text log on the clipboard. Half folded like a laptop it starts
 * below the fold and the log scrolls inside.
 */

import { useMemo, useEffect, useRef, useState } from 'react';
import { useAppearance, type Appearance } from '../../theme/useAppearance';

import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useFoldSheetMaxHeight } from './foldAvoidance';
import { useVerticalBarSpace } from './verticalBar/VerticalBarArea';
import * as Clipboard from 'expo-clipboard';

import { formatAppLog, formatLogTime, useAppLogStore } from '../../app/appLog';
import { GhostexRadii, GhostexStrokeWidth } from '../../theme/palette';

export type LogsSheetProps = {
  visible: boolean;
  onClose: () => void;
};

export default function LogsSheet({ visible, onClose }: LogsSheetProps) {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  const bar = useVerticalBarSpace();
  const foldMaxHeight = useFoldSheetMaxHeight({ avoidsKeyboard: false });
  const entries = useAppLogStore((state) => state.entries);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current !== null) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const copyLog = (): void => {
    void Clipboard.setStringAsync(formatAppLog(entries)).then(() => {
      setCopied(true);
      if (copiedTimer.current !== null) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, bar.padding]} onPress={onClose}>
        <Pressable
          style={[styles.sheet, foldMaxHeight !== undefined && { maxHeight: foldMaxHeight }]}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={styles.headerRow}>
            <Text style={styles.title}>Logs</Text>
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.copyButton, pressed && styles.copyButtonPressed]}
              disabled={entries.length === 0}
              onPress={copyLog}
            >
              <Text style={[styles.copyButtonLabel, entries.length === 0 ? styles.copyButtonDisabled : null]}>
                {copied ? 'Copied' : 'Copy'}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.subtitle}>Recent connection and status events on this phone.</Text>
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {entries.length === 0 ? (
              <Text style={styles.emptyText}>No log entries yet.</Text>
            ) : (
              entries.map((entry, index) => (
                <View key={`${entry.at}-${index}`} style={styles.row}>
                  <Text style={styles.rowTime}>{formatLogTime(entry.at)}</Text>
                  <Text selectable style={styles.rowMessage}>
                    {entry.message}
                  </Text>
                </View>
              ))
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const createStyles = (appearance: Appearance) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: appearance.background,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderWidth: GhostexStrokeWidth,
    borderColor: appearance.border,
    paddingTop: 14,
    paddingBottom: 24,
    paddingHorizontal: 12,
    maxHeight: '80%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  title: {
    flex: 1,
    color: appearance.foreground,
    fontSize: 15,
    fontWeight: 'bold',
  },
  copyButton: {
    minHeight: 32,
    paddingHorizontal: 14,
    borderRadius: GhostexRadii.row,
    backgroundColor: appearance.neutralFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyButtonPressed: {
    backgroundColor: appearance.neutralFillPressed,
  },
  copyButtonLabel: {
    color: appearance.foreground,
    fontSize: 12,
    fontWeight: '600',
  },
  copyButtonDisabled: {
    opacity: 0.4,
  },
  subtitle: {
    color: appearance.muted,
    fontSize: 12,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  list: {
    marginTop: 10,
  },
  listContent: {
    gap: 4,
    paddingBottom: 4,
  },
  emptyText: {
    color: appearance.muted,
    fontSize: 12,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 4,
    gap: 8,
  },
  rowTime: {
    color: appearance.muted,
    fontSize: 11,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  rowMessage: {
    flex: 1,
    color: appearance.foreground,
    fontSize: 11,
    lineHeight: 16,
  },
});
