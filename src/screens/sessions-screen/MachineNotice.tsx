/**
 * The notice floating over the top of the Sessions list while its machine is not connected
 * (`machineNotice` in src/components/sessions/machineNotice.ts holds the rule): the connecting
 * pill, the failure card with its × and buttons, or the failure shrunk to a pill that a tap opens
 * again. It is absolutely positioned over the list so the rows never move; only the card and the
 * pill take touches, the space beside the pill passes them to the list.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SetupButton } from '../../components/onboarding/SetupPrimitives';
import { RefreshGlyph, SettingsGlyph, XGlyph } from '../../components/sessions/icons';
import type { MachineNotice as MachineNoticeModel } from '../../components/sessions/machineNotice';
import { SpinningLoader } from '../../components/sessions/MachineTabs';
import { WarningTriangleIcon } from '../../components/terminal/icons';
import { MachineNoticeCopy } from '../../copy';
import type { SidebarAppearance } from '../../theme/sidebarAppearance';
import { SetupPalette } from '../../theme/palette';

export default function MachineNotice({
  notice,
  collapsed,
  appearance,
  onShrink,
  onExpand,
  onReconnect,
  onRemoteSettings,
}: {
  notice: MachineNoticeModel;
  /** The user shrank this failure to its pill. */
  collapsed: boolean;
  appearance: SidebarAppearance;
  onShrink: () => void;
  onExpand: () => void;
  onReconnect: () => void;
  onRemoteSettings: () => void;
}) {
  const surface = { backgroundColor: appearance.card, borderColor: appearance.border };
  if (notice.kind === 'connecting') {
    return (
      <View pointerEvents="box-none" style={styles.pillRow}>
        <View accessibilityLiveRegion="polite" style={[styles.pill, surface]}>
          <SpinningLoader color={appearance.muted} size={13} />
          <Text numberOfLines={1} style={[styles.pillText, { color: appearance.muted }]}>
            {notice.title}
          </Text>
        </View>
      </View>
    );
  }
  if (collapsed) {
    return (
      <View pointerEvents="box-none" style={styles.pillRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={notice.title}
          accessibilityHint={MachineNoticeCopy.expandHint}
          onPress={onExpand}
          style={({ pressed }) => [styles.pill, surface, pressed ? styles.pressed : null]}
        >
          <WarningTriangleIcon size={13} color={SetupPalette.ERROR} />
          <Text numberOfLines={1} style={[styles.pillText, styles.pillTitle, { color: appearance.foreground }]}>
            {notice.title}
          </Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View accessibilityLiveRegion="polite" style={[styles.card, surface]}>
      <View style={styles.header}>
        <WarningTriangleIcon size={14} color={SetupPalette.ERROR} />
        <Text style={[styles.title, { color: appearance.foreground }]}>{notice.title}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={MachineNoticeCopy.shrink}
          hitSlop={10}
          onPress={onShrink}
          style={({ pressed }) => [styles.close, pressed ? styles.pressed : null]}
        >
          <XGlyph size={14} color={appearance.muted} />
        </Pressable>
      </View>
      <Text style={[styles.reason, { color: appearance.muted }]}>{notice.reason}</Text>
      <View style={styles.actions}>
        <SetupButton
          small
          variant="primary"
          busy={notice.retrying}
          label={MachineNoticeCopy.reconnect}
          icon={<RefreshGlyph size={13} color={SetupPalette.PRIMARY_BUTTON_FOREGROUND} />}
          onPress={onReconnect}
        />
        <SetupButton
          small
          variant="secondary"
          label={MachineNoticeCopy.remoteSettings}
          icon={<SettingsGlyph size={13} color={SetupPalette.FOREGROUND} />}
          onPress={onRemoteSettings}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pillRow: {
    position: 'absolute',
    top: 6,
    left: 12,
    right: 12,
    alignItems: 'center',
  },
  pill: {
    maxWidth: '100%',
    height: 32,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 4,
  },
  pillText: { fontSize: 13, flexShrink: 1 },
  pillTitle: { fontWeight: '600' },
  card: {
    position: 'absolute',
    top: 6,
    left: 8,
    right: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 6,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 14, fontWeight: '600' },
  close: { width: 26, height: 26, marginRight: -4, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  reason: { fontSize: 13, lineHeight: 18, marginTop: 2, paddingLeft: 22 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, paddingLeft: 22 },
  pressed: { opacity: 0.6 },
});
