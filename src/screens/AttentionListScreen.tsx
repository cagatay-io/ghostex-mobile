/**
 * Notifications: the attention list as a screen, opened from the bell on the Sessions
 * screen. The header's "…" holds Mark All Read and Clear All, as the head of the desktop
 * bell's list; Clear All asks first, because the rows also leave the bell on the computer. A row opens
 * its session as a notification does (`ghostex://session`, a "has a question" row at its question card).
 *
 * The "…" menu stands at its button wherever the header is (approved mockup `notifications`, state
 * list-menu): with the header on top (every iPhone but the Duo) under the button at the
 * window's trailing edge, as a menu at the control it opened from (`rowAnchor`); in the Duo's status band
 * or a side bar, as that band's or bar's menus stand (`anchor`).
 */

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View, type ViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { sessionDeepLink } from '../app/deepLinkHandler';
import { openDeepLink } from '../app/deepLinks';
import BottomSheet from '../components/common/BottomSheet';
import { measureInWindow } from '../components/common/measureInWindow';
import { useStackScreenRail } from '../components/common/verticalBar/stackRail';
import { useHeaderPlacement } from '../components/common/verticalBar/VerticalBarArea';
import ContextMenu, { type MenuAnchor } from '../components/sessions/ContextMenu';
import { MoreGlyph } from '../components/sessions/icons';
import { NotificationsCopy } from '../copy';
import type { RootStackParamList } from '../navigation/types';
import AttentionList, { type OpenSessionTarget } from '../notifications/AttentionList';
import { refreshAttentionFeeds, updateAllAttentionFeeds, useAttentionFeedStore } from '../notifications/feedStore';
import { destructiveButtonFills, GhostexPalette, neutralButtonFills } from '../theme/palette';
import { useAppearanceHeader } from './settings/useAppearanceHeader';

type Props = NativeStackScreenProps<RootStackParamList, 'AttentionList'>;

/** Where the open "…" menu stands: at its header control on top (`control`), or at a band or side-bar button. */
type MenuState = { anchor?: MenuAnchor; control?: MenuAnchor } | null;

export default function AttentionListScreen({ navigation }: Props) {
  const appearance = useAppearanceHeader();
  const moreRef = useRef<ViewInstance | null>(null);
  const headerOnTop = useHeaderPlacement().kind === 'top';
  const [menu, setMenu] = useState<MenuState>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [failed, setFailed] = useState(false);
  const feeds = useAttentionFeedStore((state) => state.feeds);
  const shown = Object.values(feeds).filter((feed) => feed.status === 'ready');
  const anyRows = shown.some((feed) => feed.rows.length > 0);
  const anyUnread = shown.some((feed) => feed.rows.some((row) => !row.read));

  // The list is read again whenever it comes into view, so it is current on arrival.
  useFocusEffect(
    useCallback(() => {
      void refreshAttentionFeeds();
    }, []),
  );

  const openSession = useCallback((target: OpenSessionTarget) => {
    openDeepLink(
      sessionDeepLink({
        machineId: target.machineId,
        sessionId: target.sessionId,
        ...(target.question ? { view: 'question' as const } : {}),
      }),
    );
  }, []);

  const runAll = useCallback((action: 'markAllRead' | 'clearAll') => {
    void updateAllAttentionFeeds(action).then((done) => setFailed(!done));
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: NotificationsCopy.title,
      headerRight: () => (
        <Pressable
          ref={moreRef}
          accessibilityRole="button"
          accessibilityLabel={NotificationsCopy.menuTitle}
          hitSlop={6}
          onPress={() =>
            measureInWindow(moreRef, (frame) => setMenu(headerOnTop ? { control: frame } : { anchor: frame }))
          }
          style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
        >
          <MoreGlyph size={20} color={appearance.foreground} />
        </Pressable>
      ),
    });
  }, [navigation, appearance.foreground, headerOnTop]);
  // Where the system stands a side bar the "…" stands there under Back (the Duo's header is in its status band).
  useStackScreenRail(
    useMemo(
      () => ({
        entries: [
          {
            key: 'notificationsMenu',
            label: NotificationsCopy.menuTitle,
            icon: (size: number) => <MoreGlyph size={size} color={GhostexPalette.FOREGROUND} />,
            onPress: (anchor?: MenuAnchor) => setMenu({ anchor }),
          },
        ],
        reserveKeyboard: false,
      }),
      [],
    ),
  );

  const danger = destructiveButtonFills(GhostexPalette.DANGER, appearance.light);
  const neutral = neutralButtonFills(appearance.light);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: appearance.background }]} edges={['bottom']}>
      {failed ? (
        <Text accessibilityRole="alert" style={styles.failed}>
          {NotificationsCopy.actionFailed}
        </Text>
      ) : null}
      <AttentionList onOpenSession={openSession} />
      <ContextMenu
        visible={menu !== null}
        title={NotificationsCopy.menuTitle}
        subtitle={NotificationsCopy.menuSubtitle}
        anchor={menu?.anchor}
        rowAnchor={menu?.control}
        onClose={() => setMenu(null)}
        items={[
          {
            kind: 'item',
            key: 'markAllRead',
            label: NotificationsCopy.markAllRead,
            disabled: !anyUnread,
            onPress: () => {
              setMenu(null);
              runAll('markAllRead');
            },
          },
          {
            kind: 'item',
            key: 'clearAll',
            label: NotificationsCopy.clearAll,
            destructive: true,
            disabled: !anyRows,
            onPress: () => {
              setMenu(null);
              setConfirmClear(true);
            },
          },
        ]}
      />
      <BottomSheet visible={confirmClear} onClose={() => setConfirmClear(false)}>
        <View style={styles.sheet}>
          <Text accessibilityRole="header" style={[styles.sheetTitle, { color: appearance.foreground }]}>
            {NotificationsCopy.clearAllTitle}
          </Text>
          <Text style={[styles.sheetText, { color: appearance.muted }]}>{NotificationsCopy.clearAllBody}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setConfirmClear(false);
              runAll('clearAll');
            }}
            style={({ pressed }) => [styles.sheetButton, { backgroundColor: pressed ? danger.pressed : danger.rest }]}
          >
            <Text style={[styles.sheetButtonText, { color: GhostexPalette.DANGER }]}>{NotificationsCopy.clearAll}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setConfirmClear(false)}
            style={({ pressed }) => [styles.sheetButton, { backgroundColor: pressed ? neutral.pressed : neutral.rest }]}
          >
            <Text style={[styles.sheetButtonText, { color: appearance.foreground }]}>{NotificationsCopy.cancel}</Text>
          </Pressable>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerButton: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  failed: { color: GhostexPalette.DANGER, fontSize: 13, paddingHorizontal: 16, paddingTop: 8 },
  sheet: { gap: 10, paddingHorizontal: 4 },
  sheetTitle: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
  sheetText: { fontSize: 14, textAlign: 'center', marginBottom: 6 },
  sheetButton: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sheetButtonText: { fontSize: 16, fontWeight: '600' },
});
