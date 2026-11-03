/**
 * The attention list (the notifications design): the computers' notification feeds, the desktop bell's list,
 * newest first in "Unread" and "Read" groups. A row names agent · project, the session's title, the time and the
 * event as word and glyph; never anything the agent wrote. A tap opens the session and marks the row read on the
 * computer; an account row is only marked read. A long press opens the row's menu at the row (Open Session, Mark as
 * Read/Unread, Clear).
 *
 * One component for the full screen (`AttentionListScreen`) and, later, the attention-list pane: the caller decides
 * what opening a session means (`onOpenSession`: navigate to it, or open it in the pane beside).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type ViewInstance } from 'react-native';

import { AGENT_ICONS } from '../assets/agentIcons.generated';
import ContextMenu, { type ContextMenuItem, type MenuAnchor } from '../components/sessions/ContextMenu';
import { measureInWindow } from '../components/common/measureInWindow';
import { useScrollToBarEdges } from '../components/common/verticalBar/VerticalBarArea';
import { agentIconTint, formatLastActive } from '../contract/mobileSummary';
import { NotificationsCopy } from '../copy';
import { useInventoryStore } from '../inventory/store';
import { enabledMachines, machineDisplayLabel, useMachinesStore } from '../machines/store';
import { GhostexPalette, GhostexRadii, GhostexStrokeWidth, SidebarPalette, colorWithOpacity } from '../theme/palette';
import { useAppearance, type Appearance } from '../theme/useAppearance';
import { buildAttentionList, type AttentionRow, type ListKind, type MachineFeed } from './attentionRows';
import { sessionFacts } from './events';
import { refreshAttentionFeeds, updateAttentionFeed, useAttentionFeedStore } from './feedStore';
import { CloudOffGlyph, BellGlyph, KindGlyph } from './icons';

/** What opening a row's session asks for. */
export type OpenSessionTarget = { machineId: string; sessionId: string; question: boolean };

/** How often the rows' "5m ago" moves on while the list is on screen. */
const CLOCK_TICK_MS = 30_000;

/** The event colours of the design: Ghostex's status language, word and glyph carry it too. */
function kindColor(kind: ListKind, appearance: Appearance): string {
  if (kind === 'waiting') return SidebarPalette.ROW_ATTENTION;
  if (kind === 'question') return SidebarPalette.ROW_QUESTION;
  if (kind === 'failed' || kind === 'resetExpiring') return SidebarPalette.MENU_DANGER;
  return appearance.muted;
}

type Notice = { key: string; text: string };

/** The rows of every enabled computer and a notice for each one that cannot be read. */
function useAttentionRows(): { rows: AttentionRow[]; notices: Notice[]; loading: boolean; unreachable: string | null } {
  const feeds = useAttentionFeedStore((state) => state.feeds);
  const machines = useMachinesStore((state) => state.machines);
  const inventories = useInventoryStore((state) => state.inventoriesByMachineId);
  return useMemo(() => {
    const enabled = enabledMachines({ machines });
    const shown: MachineFeed[] = [];
    const notices: Notice[] = [];
    let loading = false;
    for (const machine of enabled) {
      const feed = feeds[machine.id];
      const label = machineDisplayLabel(machine);
      if (feed === undefined || feed.status === 'loading') loading = true;
      else if (feed.status === 'legacy') notices.push({ key: machine.id, text: NotificationsCopy.tooOld(label) });
      else if (feed.status === 'unreachable') notices.push({ key: machine.id, text: NotificationsCopy.offline(label) });
      if (feed !== undefined) shown.push({ machineId: machine.id, machineLabel: label, rows: feed.rows });
    }
    const rows = buildAttentionList(shown, (machineId, sessionId) =>
      sessionFacts(inventories[machineId]?.summary, sessionId),
    );
    const failing = enabled.find((machine) => feeds[machine.id]?.status === 'unreachable');
    const unreachable =
      failing !== undefined && notices.length === enabled.length ? machineDisplayLabel(failing) : null;
    return { rows, notices, loading, unreachable };
  }, [feeds, machines, inventories]);
}

function RowContent({ row, now, appearance }: { row: AttentionRow; now: Date; appearance: Appearance }) {
  const Icon = AGENT_ICONS[row.agentIconId] ?? AGENT_ICONS.terminal;
  const color = kindColor(row.kind, appearance);
  const detail = row.machineLabel !== null ? `${row.detail} · ${row.machineLabel}` : row.detail;
  return (
    <>
      <View style={styles.tile}>
        <Icon size={20} color={agentIconTint(row.agentIconId)} />
      </View>
      <View style={styles.text}>
        <View style={styles.firstLine}>
          <Text
            style={[
              styles.who,
              { color: row.read ? SidebarPalette.FOREGROUND : appearance.foreground },
              !row.read && styles.whoUnread,
            ]}
            numberOfLines={1}
          >
            {row.who}
          </Text>
          <Text style={[styles.time, { color: appearance.muted }]}>{formatLastActive(row.createdAt, now)}</Text>
        </View>
        {detail.length > 0 ? (
          <Text style={[styles.detail, { color: appearance.muted }]} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
        <View style={styles.kind}>
          <KindGlyph kind={row.kind} size={14} color={color} />
          <Text style={[styles.kindText, { color }, !row.read && styles.kindUnread]}>{row.label}</Text>
        </View>
      </View>
    </>
  );
}

function rowLabel(row: AttentionRow, now: Date): string {
  const parts = [row.read ? null : NotificationsCopy.rowUnread, `${row.who}, ${row.label}.`];
  if (row.detail.length > 0) parts.push(`${row.detail}.`);
  if (row.machineLabel !== null) parts.push(`${row.machineLabel}.`);
  parts.push(`${formatLastActive(row.createdAt, now)}.`);
  return parts.filter((part) => part !== null).join(' ');
}

function Row({
  row,
  now,
  appearance,
  held,
  onOpen,
  onHold,
}: {
  row: AttentionRow;
  now: Date;
  appearance: Appearance;
  held: boolean;
  onOpen: (row: AttentionRow) => void;
  onHold: (row: AttentionRow, frame: MenuAnchor) => void;
}) {
  const ref = useRef<ViewInstance | null>(null);
  const label = rowLabel(row, now);
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={row.account ? undefined : NotificationsCopy.openSession}
      testID={`attention-row-${row.notificationId}`}
      onPress={() => onOpen(row)}
      onLongPress={() => measureInWindow(ref, (frame) => onHold(row, frame))}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: appearance.card, borderColor: appearance.border },
        !row.read && styles.rowUnread,
        (pressed || held) && { backgroundColor: appearance.cardActive },
      ]}
    >
      <RowContent row={row} now={now} appearance={appearance} />
    </Pressable>
  );
}

function EmptyState({
  icon,
  title,
  text,
  appearance,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  appearance: Appearance;
}) {
  return (
    <View style={styles.empty}>
      {icon}
      <Text style={[styles.emptyTitle, { color: appearance.foreground }]}>{title}</Text>
      <Text style={[styles.emptyText, { color: appearance.muted }]}>{text}</Text>
    </View>
  );
}

export default function AttentionList({ onOpenSession }: { onOpenSession: (target: OpenSessionTarget) => void }) {
  const appearance = useAppearance();
  // The list reaches under the iPhone Duo's side bar, its rows keep clear of it.
  const edges = useScrollToBarEdges(styles.content);
  const { rows, notices, loading, unreachable } = useAttentionRows();
  const [now, setNow] = useState(() => new Date());
  const [menu, setMenu] = useState<{ row: AttentionRow; frame: MenuAnchor } | null>(null);
  const [failed, setFailed] = useState(false);
  const [pulling, setPulling] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const send = useCallback((row: AttentionRow, action: 'markRead' | 'markUnread' | 'dismiss') => {
    void updateAttentionFeed(row.machineId, { action, notificationId: row.notificationId }).then((done) =>
      setFailed(!done),
    );
  }, []);

  const open = useCallback(
    (row: AttentionRow) => {
      setMenu(null);
      if (!row.read) send(row, 'markRead');
      if (!row.account) {
        onOpenSession({ machineId: row.machineId, sessionId: row.sessionId, question: row.kind === 'question' });
      }
    },
    [onOpenSession, send],
  );

  const pull = useCallback(() => {
    setPulling(true);
    void refreshAttentionFeeds().finally(() => setPulling(false));
  }, []);

  const menuItems = useMemo((): ContextMenuItem[] => {
    if (menu === null) return [];
    const { row } = menu;
    const items: ContextMenuItem[] = [];
    if (!row.account) {
      items.push({ kind: 'item', key: 'open', label: NotificationsCopy.openSession, onPress: () => open(row) });
    }
    items.push(
      row.read
        ? {
            kind: 'item',
            key: 'unread',
            label: NotificationsCopy.markUnread,
            onPress: () => {
              setMenu(null);
              send(row, 'markUnread');
            },
          }
        : {
            kind: 'item',
            key: 'read',
            label: NotificationsCopy.markRead,
            onPress: () => {
              setMenu(null);
              send(row, 'markRead');
            },
          },
      {
        kind: 'item',
        key: 'clear',
        label: NotificationsCopy.clear,
        destructive: true,
        onPress: () => {
          setMenu(null);
          send(row, 'dismiss');
        },
      },
    );
    return items;
  }, [menu, open, send]);

  const unread = rows.filter((row) => !row.read);
  const read = rows.filter((row) => row.read);
  const section = (title: string, list: AttentionRow[]) =>
    list.length === 0 ? null : (
      <View key={title} style={styles.section}>
        <Text accessibilityRole="header" style={[styles.sectionTitle, { color: appearance.muted }]}>
          {title}
        </Text>
        {list.map((row) => (
          <Row
            key={row.key}
            row={row}
            now={now}
            appearance={appearance}
            held={menu?.row.key === row.key}
            onOpen={open}
            onHold={(target, frame) => setMenu({ row: target, frame })}
          />
        ))}
      </View>
    );

  let body: ReactNode;
  if (rows.length > 0) body = [section(NotificationsCopy.unread, unread), section(NotificationsCopy.read, read)];
  else if (unreachable !== null) {
    body = (
      <EmptyState
        icon={<CloudOffGlyph size={32} color={appearance.muted} />}
        title={NotificationsCopy.cantLoadTitle}
        text={NotificationsCopy.cantLoadText(unreachable)}
        appearance={appearance}
      />
    );
  } else if (loading) {
    body = <Text style={[styles.loading, { color: appearance.muted }]}>{NotificationsCopy.loading}</Text>;
  } else {
    body = (
      <EmptyState
        icon={<BellGlyph size={32} color={appearance.muted} />}
        title={NotificationsCopy.emptyTitle}
        text={NotificationsCopy.emptyText}
        appearance={appearance}
      />
    );
  }

  return (
    <>
      <ScrollView
        style={[styles.scroll, edges.scroll]}
        contentContainerStyle={[styles.content, edges.content]}
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={pull} tintColor={appearance.muted} />}
      >
        {notices.map((notice) => (
          <View
            key={notice.key}
            accessibilityRole="alert"
            style={[styles.notice, { backgroundColor: appearance.card }]}
          >
            <CloudOffGlyph size={16} color={appearance.muted} />
            <Text style={[styles.noticeText, { color: appearance.muted }]}>{notice.text}</Text>
          </View>
        ))}
        {failed ? (
          <Text accessibilityRole="alert" style={styles.failed}>
            {NotificationsCopy.actionFailed}
          </Text>
        ) : null}
        {body}
      </ScrollView>
      <ContextMenu
        visible={menu !== null}
        title={menu?.row.who ?? ''}
        subtitle={menu?.row.detail}
        items={menuItems}
        onClose={() => setMenu(null)}
        rowAnchor={menu?.frame}
        lifted={
          menu === null
            ? undefined
            : {
                content: (
                  <View style={styles.liftedRow}>
                    <RowContent row={menu.row} now={now} appearance={appearance} />
                  </View>
                ),
                accessibilityLabel: rowLabel(menu.row, now),
                onPress: () => open(menu.row),
              }
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 12, paddingBottom: 28, flexGrow: 1 },
  section: { gap: 8, marginBottom: 6 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 14,
    marginBottom: 2,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 12,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: GhostexStrokeWidth,
  },
  rowUnread: {
    // The desktop bell's attention-blue wash and border on unread rows.
    backgroundColor: colorWithOpacity(SidebarPalette.ROW_ATTENTION, 9),
    borderColor: colorWithOpacity(SidebarPalette.ROW_ATTENTION, 38),
  },
  liftedRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 12 },
  tile: {
    width: 34,
    height: 34,
    borderRadius: GhostexRadii.card,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GhostexPalette.NEUTRAL_FILL,
  },
  text: { flex: 1, minWidth: 0, gap: 3 },
  firstLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  who: { flex: 1, minWidth: 0, fontSize: 15, lineHeight: 20, fontWeight: '500' },
  whoUnread: { fontWeight: '700' },
  time: { fontSize: 12, fontVariant: ['tabular-nums'] },
  detail: { fontSize: 13, lineHeight: 18 },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  kindText: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  kindUnread: { fontWeight: '600' },
  empty: { flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 24 },
  emptyTitle: { marginTop: 4, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  emptyText: { fontSize: 13, textAlign: 'center' },
  loading: { marginTop: 24, fontSize: 13, textAlign: 'center' },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: GhostexRadii.card,
    marginBottom: 8,
  },
  noticeText: { flex: 1, fontSize: 13 },
  failed: { color: SidebarPalette.MENU_DANGER, fontSize: 13, paddingHorizontal: 4, marginBottom: 8 },
});
