/**
 * The Bots sheet: every computer's GBots, each with its status dot and its conversations; tapping
 * a conversation opens it in the chat, as tapping a session row does. Opened from the Bots button
 * in the Sessions screen's bottom bar, which shows only while some computer has GBots.
 * See src/sessions/gbots.ts for the decision record.
 */

import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import type { GhostexSession } from '../../contract/mobileSummary';
import { machineDisplayLabel, type MachineRecord } from '../../machines/store';
import { gbotDotColor, type GbotGroup } from '../../sessions/gbots';
import { GhostexStrokeWidth, SetupPalette } from '../../theme/palette';
import { ChevronLeftGlyph, type GlyphProps } from './icons';

/** GBots' mark (Tabler's robot), as on the desktop's Bots button. */
export function RobotGlyph({ size, color }: GlyphProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 6a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2l0 -4 M12 2v2 M9 12v9 M15 12v9 M5 16l4 -2 M15 14l4 2 M9 18h6 M10 8v.01 M14 8v.01"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** The bot tile's periwinkle, the desktop's GBots tile colour. */
const GBOT_TILE = '#9fb0ff';

const STATUS_WORDS = { working: 'Working', idle: 'Ready', offline: 'Not running' } as const;

export default function GbotsSheet({
  visible,
  groups,
  showComputer,
  onClose,
  onOpen,
}: {
  visible: boolean;
  groups: readonly GbotGroup<MachineRecord, GhostexSession>[];
  /** Name each bot's computer: more than one computer is connected. */
  showComputer: boolean;
  onClose: () => void;
  onOpen: (machine: MachineRecord, session: GhostexSession) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.fill, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
        <Pressable style={styles.backdrop} accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} />
        <View style={styles.panel}>
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
              style={styles.headerButton}
              onPress={onClose}
            >
              <ChevronLeftGlyph size={22} color={SetupPalette.FOREGROUND} />
            </Pressable>
            <Text style={styles.title}>Bots</Text>
          </View>
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {groups.length === 0 ? (
              <Text style={styles.empty}>No bots yet. Make one with New bot in Ghostex on your computer.</Text>
            ) : null}
            {groups.map((group) => (
              <View key={group.key} style={styles.bot}>
                <View style={styles.botRow}>
                  <View style={styles.tile}>
                    <Text style={styles.tileLetter}>{group.bot.name.slice(0, 1).toUpperCase()}</Text>
                  </View>
                  <View style={styles.botText}>
                    <Text style={styles.botName} numberOfLines={1}>
                      {group.bot.name}
                    </Text>
                    <Text style={styles.botMeta} numberOfLines={1}>
                      {STATUS_WORDS[group.bot.activity]}
                      {showComputer ? ` · ${machineDisplayLabel(group.machine)}` : ''}
                    </Text>
                  </View>
                  <View style={[styles.dot, { backgroundColor: gbotDotColor(group.bot.activity) }]} />
                </View>
                {group.sessions.map((session) => (
                  <Pressable
                    key={session.sessionId}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${session.title || 'conversation'}`}
                    style={({ pressed }) => [styles.conversation, pressed ? styles.pressed : null]}
                    onPress={() => onOpen(group.machine, session)}
                  >
                    <RobotGlyph size={15} color={GBOT_TILE} />
                    <Text style={styles.conversationTitle} numberOfLines={1}>
                      {session.title || 'Conversation'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, paddingHorizontal: 10 },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: SetupPalette.BACKDROP,
  },
  panel: {
    flexShrink: 1,
    maxHeight: '100%',
    backgroundColor: SetupPalette.PANEL,
    borderRadius: 12,
    borderWidth: GhostexStrokeWidth,
    borderColor: SetupPalette.BORDER_STRONG,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderBottomWidth: GhostexStrokeWidth,
    borderBottomColor: SetupPalette.BORDER,
  },
  headerButton: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { color: SetupPalette.FOREGROUND, fontSize: 16, fontWeight: '600' },
  list: { flexGrow: 0 },
  listContent: { paddingHorizontal: 8, paddingVertical: 8, gap: 10 },
  empty: { color: SetupPalette.MUTED, fontSize: 14, padding: 12 },
  bot: { gap: 2 },
  botRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6, paddingVertical: 6 },
  tile: {
    width: 20,
    height: 20,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GBOT_TILE,
  },
  tileLetter: { color: '#111111', fontSize: 12, fontWeight: '700' },
  botText: { flex: 1, minWidth: 0 },
  botName: { color: SetupPalette.FOREGROUND, fontSize: 15 },
  botMeta: { color: SetupPalette.MUTED, fontSize: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  conversation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 40,
    paddingLeft: 36,
    paddingRight: 8,
    borderRadius: 8,
  },
  pressed: { backgroundColor: SetupPalette.CARD },
  conversationTitle: { flex: 1, minWidth: 0, color: SetupPalette.FOREGROUND, fontSize: 14 },
});
