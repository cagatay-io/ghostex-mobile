/**
 * The agent menu's top row: the project a session starts in and, with more than one computer, the
 * computer it starts on ("Ghostex · Windows"); a tap opens the project list, where each project
 * shows its computers as chips (`ProjectPickerSheet`).
 *
 * CDXC:Sidebar 2026-11-03 DECISION:
 * User, of the New thread picker's machine row: "let's not show the machines here, show the machines inside the project picking area please instead". The agent menu has no machine chips any more; it names the computer on its project row, and the project list's rows carry each project's computers. This supersedes the Q1180 note that had the chips fill a row under the project.
 */

import { useMemo } from 'react';
import { useAppearance, type Appearance } from '../../theme/useAppearance';
import { Pressable, StyleSheet, Text, View } from 'react-native';



export function NewSessionProjectRow({
  label,
  machineLabel,
  onPress,
}: {
  label: string;
  /** The computer it starts on, shown while there is more than one. */
  machineLabel: string | null;
  onPress: () => void;
}) {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Project: ${label}${machineLabel === null ? '' : ` on ${machineLabel}`}. Tap to change`}
      onPress={onPress}
      style={({ pressed }) => [styles.project, pressed ? styles.pressed : null]}
    >
      <View style={styles.tile}>
        <Text style={styles.tileText}>{label.slice(0, 1).toUpperCase()}</Text>
      </View>
      <View style={styles.projectText}>
        <Text style={styles.projectLabel} numberOfLines={1}>
          {label}
          {machineLabel === null ? null : <Text style={styles.machine}>{` · ${machineLabel}`}</Text>}
        </Text>
        <Text style={styles.projectHint} numberOfLines={1}>
          Tap to change
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const createStyles = (appearance: Appearance) => StyleSheet.create({
  project: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: appearance.cardActive,
  },
  pressed: { opacity: 0.7 },
  tile: {
    width: 20,
    height: 20,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: appearance.neutralFill,
  },
  tileText: { color: appearance.muted, fontSize: 11, fontWeight: '600' },
  projectText: { flex: 1, minWidth: 0 },
  projectLabel: { color: appearance.foreground, fontSize: 15, fontWeight: '600' },
  machine: { color: appearance.muted, fontWeight: '400' },
  projectHint: { color: appearance.muted, fontSize: 12 },
  chevron: { color: appearance.muted, fontSize: 18 },
});
