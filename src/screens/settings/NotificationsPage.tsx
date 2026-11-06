/**
 * Settings > Notifications (was Sounds; the notifications design, states settings,
 * settings-master-off, settings-denied): one master switch and one each for finished, waiting and
 * error, the delivery limit without push in words (no promise for a locked or
 * paused phone), and the attention sound that was this page's only row before. With the master off the
 * three stay visible and keep their values, dimmed. When iOS blocks notifications the page says so
 * and leads to iOS Settings, because iOS asks only once.
 * Agent notifications are iOS only; on Android the page keeps the sound.
 */

import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { SwitchRow as RowToggle } from '../../components/common/SwitchRow';
import { NotificationsCopy } from '../../copy';
import {
  askForNotificationsOnce,
  refreshNotificationPermission,
  useAttentionFeedStore,
} from '../../notifications/feedStore';
import { BellOffGlyph } from '../../notifications/icons';
import { NOTIFICATIONS_SUPPORTED } from '../../notifications/notificationCentre';
import type { NotificationSettings } from '../../notifications/settings';
import { useSettingsStore } from '../../settings/store';
import { colorWithOpacity, GhostexPalette, neutralButtonFills, SidebarPalette } from '../../theme/palette';
import { useAppearance } from '../../theme/useAppearance';
import { Caption, SectionHeader, SettingsScreenLayout, SettingToggle, useSettingsStyles } from './SettingsControls';

type KindKey = 'finished' | 'waiting' | 'error';

/** A Settings switch row that dims while disabled, on the shared row so a tap anywhere on it toggles. */
function SwitchRow({
  label,
  detail,
  value,
  disabled = false,
  onValueChange,
}: {
  label: string;
  detail?: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const styles = useSettingsStyles();
  const appearance = useAppearance();
  return (
    <RowToggle
      value={value}
      disabled={disabled}
      onValueChange={onValueChange}
      label={label}
      style={[styles.row, disabled && styles.rowDisabled]}
      pressedStyle={styles.rowPressed}
    >
      <View style={local.label}>
        <Text style={styles.cardLabel}>{label}</Text>
        {detail !== undefined ? <Text style={[local.detail, { color: appearance.muted }]}>{detail}</Text> : null}
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ false: appearance.control, true: GhostexPalette.ACCENT }}
        thumbColor={value ? appearance.foreground : appearance.controlThumb}
        ios_backgroundColor={appearance.control}
      />
    </RowToggle>
  );
}

function BlockedCard() {
  const appearance = useAppearance();
  const fills = neutralButtonFills(appearance.light);
  const copy = NotificationsCopy.settings;
  return (
    <View
      accessibilityRole="alert"
      style={[local.blocked, { backgroundColor: colorWithOpacity(SidebarPalette.ROW_FAILED, 12) }]}
    >
      <BellOffGlyph size={20} color={SidebarPalette.MENU_DANGER} />
      <View style={local.blockedText}>
        <Text style={[local.blockedTitle, { color: appearance.foreground }]}>{copy.blockedTitle}</Text>
        <Text style={[local.detail, { color: appearance.muted }]}>{copy.blockedText}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void Linking.openSettings()}
          style={({ pressed }) => [local.blockedButton, { backgroundColor: pressed ? fills.pressed : fills.rest }]}
        >
          <Text style={[local.blockedButtonText, { color: appearance.foreground }]}>{copy.openSettings}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function AgentNotifications() {
  const notifications = useSettingsStore((state) => state.settings.notifications);
  const setSetting = useSettingsStore((state) => state.setSetting);
  const permission = useAttentionFeedStore((state) => state.permission);
  const copy = NotificationsCopy.settings;

  useFocusEffect(
    useCallback(() => {
      void refreshNotificationPermission();
    }, []),
  );

  const set = (next: Partial<NotificationSettings>) => setSetting('notifications', { ...notifications, ...next });
  const setMaster = (on: boolean) => {
    // Turned on before the one-time ask ever ran (it was dismissed): this is the ask.
    if (on && notifications.askedAt === undefined) void askForNotificationsOnce();
    else set({ enabled: on });
  };
  const kind = (key: KindKey, label: string, detail: string) => (
    <SwitchRow
      label={label}
      detail={detail}
      value={notifications[key]}
      disabled={!notifications.enabled}
      onValueChange={(on) => set({ [key]: on })}
    />
  );

  return (
    <>
      {permission === 'denied' ? <BlockedCard /> : null}
      <SectionHeader title={copy.sectionAgents} />
      <SwitchRow label={copy.master} value={notifications.enabled} onValueChange={setMaster} />
      <Caption>{copy.limit}</Caption>
      {kind('finished', copy.finished, copy.finishedDetail)}
      {kind('waiting', copy.waiting, copy.waitingDetail)}
      {kind('error', copy.error, copy.errorDetail)}
      <Caption>{copy.rules}</Caption>
    </>
  );
}

export default function NotificationsPage() {
  const copy = NotificationsCopy.settings;
  return (
    <SettingsScreenLayout>
      {NOTIFICATIONS_SUPPORTED ? <AgentNotifications /> : null}
      {NOTIFICATIONS_SUPPORTED ? <SectionHeader title={copy.sectionSound} /> : null}
      <SettingToggle settingKey="doneNotificationSound" label={copy.sound} />
      <Caption>{copy.soundDetail}</Caption>
    </SettingsScreenLayout>
  );
}

const local = StyleSheet.create({
  label: { flex: 1, gap: 2, paddingVertical: 4 },
  detail: { fontSize: 12 },
  blocked: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 8 },
  blockedText: { flex: 1, minWidth: 0, gap: 4, alignItems: 'flex-start' },
  blockedTitle: { fontSize: 14, fontWeight: '600' },
  blockedButton: { marginTop: 8, minHeight: 44, paddingHorizontal: 14, borderRadius: 8, justifyContent: 'center' },
  blockedButtonText: { fontSize: 14, fontWeight: '600' },
});
