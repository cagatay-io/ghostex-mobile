/**
 * Earlier Chats sheet for Ask Ghostex AI: lists the earlier Ask Ghostex AI chats still open
 * (asleep, from `ghostex chief status --json` `earlierChats`), newest first, with title and date;
 * a tap opens one. The last row, History, opens Main Hub's closed sessions.
 *
 * Mirrors the desktop's Earlier Chats menu (apps/desktop/src/app/native_sidebar/chief.rs
 * `show_native_sidebar_chief_earlier`, commit f76c9a478).
 */

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatChiefEarlierChatDate, HOME_LABEL, type ChiefEarlierChat } from '../../contract/chief';
import { sessionMenuIcon } from '../../session-menu/glyphs';
import { GhostexRadii, GhostexStrokeWidth } from '../../theme/palette';
import { useAppearance, type Appearance } from '../../theme/useAppearance';
import BottomSheet from '../common/BottomSheet';
import { ChevronRightGlyph, MessageCircleGlyph } from './icons';

export type ChiefEarlierChatsSheetProps = {
  visible: boolean;
  /** Optional subtitle (for example, the computer name when viewing another computer's Ask Ghostex AI). */
  subtitle?: string;
  /** Preloaded list from the status call that opened the menu, or `null` to fetch on open. */
  initialChats?: readonly ChiefEarlierChat[] | null;
  /** Loads earlier chats from `ghostex chief status --json` when not already preloaded. */
  load: () => Promise<ChiefEarlierChat[]>;
  /** Opens one of the earlier chats (waking it if asleep). */
  onOpenChat: (chat: ChiefEarlierChat) => void;
  /** Opens Main Hub's History (closed chats); omitted when the computer has no home project. */
  onOpenHistory?: () => void;
  onClose: () => void;
};

export default function ChiefEarlierChatsSheet({
  visible,
  subtitle,
  initialChats = null,
  load,
  onOpenChat,
  onOpenHistory,
  onClose,
}: ChiefEarlierChatsSheetProps) {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  const [chats, setChats] = useState<readonly ChiefEarlierChat[] | null>(initialChats);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    if (initialChats !== null) {
      setChats(initialChats);
      return;
    }
    let cancelled = false;
    setChats(null);
    load().then(
      (loaded) => {
        if (!cancelled) setChats(loaded);
      },
      (loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError));
      },
    );
    return () => {
      cancelled = true;
    };
    // Read once per opening when not preloaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialChats]);

  const nowMs = Date.now();

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.title} numberOfLines={1}>
        Earlier Chats
      </Text>
      {subtitle !== undefined && subtitle.length > 0 ? (
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}

      <View style={styles.list}>
        {chats === null && error === null ? (
          <View style={styles.stateBox}>
            <ActivityIndicator size="small" color={appearance.muted} />
          </View>
        ) : null}

        {error !== null ? (
          <Text style={styles.error}>Earlier chats didn&apos;t load. {error}</Text>
        ) : null}

        {chats !== null && chats.length === 0 ? (
          <Text style={styles.empty}>No earlier chats yet.</Text>
        ) : null}

        {chats !== null
          ? chats.map((chat) => {
              const date = formatChiefEarlierChatDate(chat.lastActiveAt, nowMs);
              return (
                <Pressable
                  key={`${chat.projectId}:${chat.sessionId}`}
                  accessibilityRole="button"
                  accessibilityLabel={date.length > 0 ? `${chat.title}, ${date}` : chat.title}
                  style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
                  onPress={() => onOpenChat(chat)}
                >
                  <View style={styles.iconSlot}>
                    <MessageCircleGlyph size={16} color={appearance.muted} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {chat.title}
                    </Text>
                    {date.length > 0 ? (
                      <Text style={styles.rowDate} numberOfLines={1}>
                        {date}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })
          : null}

        {onOpenHistory !== undefined ? (
          <>
            <View style={styles.separator} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`History, ${HOME_LABEL}`}
              style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
              onPress={onOpenHistory}
            >
              <View style={styles.iconSlot}>
                {sessionMenuIcon('history', { size: 16, color: appearance.foreground })}
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  History
                </Text>
                <Text style={styles.rowDate} numberOfLines={1}>
                  Closed chats in {HOME_LABEL}
                </Text>
              </View>
              <ChevronRightGlyph size={16} color={appearance.muted} />
            </Pressable>
          </>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const createStyles = (appearance: Appearance) =>
  StyleSheet.create({
    title: {
      color: appearance.foreground,
      fontSize: 17,
      fontWeight: '600',
    },
    subtitle: {
      color: appearance.muted,
      fontSize: 13,
      marginTop: 2,
    },
    list: {
      marginTop: 12,
      gap: 6,
    },
    stateBox: {
      paddingVertical: 18,
      alignItems: 'center',
    },
    empty: {
      color: appearance.muted,
      fontSize: 13,
      paddingVertical: 12,
      paddingHorizontal: 4,
    },
    error: {
      color: appearance.danger,
      fontSize: 13,
      lineHeight: 18,
      paddingVertical: 8,
      paddingHorizontal: 4,
    },
    row: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: GhostexRadii.row,
      backgroundColor: appearance.card,
      borderWidth: GhostexStrokeWidth,
      borderColor: appearance.border,
    },
    rowPressed: {
      backgroundColor: appearance.cardActive,
    },
    iconSlot: {
      width: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowText: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    rowTitle: {
      color: appearance.foreground,
      fontSize: 14.5,
      fontWeight: '500',
    },
    rowDate: {
      color: appearance.muted,
      fontSize: 12,
    },
    separator: {
      height: GhostexStrokeWidth,
      backgroundColor: appearance.border,
      marginVertical: 4,
    },
  });
