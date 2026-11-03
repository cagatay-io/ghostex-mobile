/**
 * The agent menu's top row: the project a session starts in and, with more than one computer, the
 * computer it starts on ("Ghostex · Windows"); a tap opens the project list, where each project
 * shows its computers as chips (`ProjectPickerSheet`).
 *
 * CDXC:Sidebar 2026-11-03 DECISION:
 * User, of the New thread picker's machine row: "let's not show the machines here, show the machines inside the project picking area please instead". The agent menu has no machine chips any more; it names the computer on its project row, and the project list's rows carry each project's computers. This supersedes the Q1180 note that had the chips fill a row under the project.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SidebarPalette } from '../../theme/palette';

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

const styles = StyleSheet.create({
  project: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: SidebarPalette.MENU_HOVER,
  },
  pressed: { opacity: 0.7 },
  tile: {
    width: 20,
    height: 20,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  tileText: { color: SidebarPalette.MUTED, fontSize: 11, fontWeight: '600' },
  projectText: { flex: 1, minWidth: 0 },
  projectLabel: { color: SidebarPalette.FOREGROUND, fontSize: 15, fontWeight: '600' },
  machine: { color: SidebarPalette.MUTED, fontWeight: '400' },
  projectHint: { color: SidebarPalette.MUTED, fontSize: 12 },
  chevron: { color: SidebarPalette.MUTED, fontSize: 18 },
});
