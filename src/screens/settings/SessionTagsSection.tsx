import { useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View, type AccessibilityActionEvent } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';

import ContextMenu from '../../components/sessions/ContextMenu';
import { MenuGlyph } from '../../components/sessions/icons';
import { useSidebarInk } from '../../components/sessions/rows';
import {
  AlertCircleGlyph,
  AlertTriangleGlyph,
  CircleDashedGlyph,
  HelpCircleGlyph,
  StatusCircleCheckGlyph,
  StatusCircleGlyph,
} from '../../components/sessions/unified/glyphs';
import { groupColor } from '../../components/sessions/unified/groupHeaders';
import type { GhostexMobileSummary } from '../../contract/mobileSummary';
import { EMPTY_CUSTOM_SESSION_TAGS } from '../../contract/mobileSummary/model';
import {
  isStatusTagId,
  listedTagItems,
  moveListedTagItem,
  normalizeTagListItems,
  storedTagListItems,
  type StatusTagId,
  type TagListItem,
} from '../../contract/sessionTagList';
import { SESSION_TAG_SECTIONS } from '../../contract/sessionTags';
import { STATUS_GROUP_LOOK } from '../../contract/unified/sessionGroups';
import { SessionGroupsCopy } from '../../copy';
import { setSidebarSetting } from '../../settingsSync/settingsSync';
import { useAppearance } from '../../theme/useAppearance';
import { SettingsSection } from './SectionBoundary';
import { Caption, SectionHeader, ToggleRow } from './SettingsControls';

const BUILTIN_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  SESSION_TAG_SECTIONS.flatMap((section) => section.options.map((option) => [option.value, option.label])),
);

const STATUS_GLYPHS: Readonly<Record<StatusTagId, typeof AlertTriangleGlyph>> = {
  'status-needs-you': AlertTriangleGlyph,
  'status-question': HelpCircleGlyph,
  'status-error': AlertCircleGlyph,
  'status-finished': StatusCircleCheckGlyph,
  'status-working': CircleDashedGlyph,
  'status-idle': StatusCircleGlyph,
};

/** A hold on the handle before it lifts its row, so a quick swipe still scrolls the page and a tap opens the menu. */
const LIFT_HOLD_MS = 250;

/** VoiceOver's two moves on a row and its handle; the menu also offers Move to top. */
const MOVE_ACTIONS = [
  { name: 'moveUp', label: SessionGroupsCopy.tags.moveUp },
  { name: 'moveDown', label: SessionGroupsCopy.tags.moveDown },
];

type RowFrame = { y: number; height: number };

/**
 * Settings › Sidebar & Sessions › Session Tags: the desktop's Tag filter list (`sidebarSessionTagListItems`), one
 * switch per entry in the list's order, synced with the computers. A tag switched off leaves the Tag As menu and the
 * tag filter (it is hidden and disabled, as the desktop's two buttons together); adding, renaming and deleting tags
 * stay on the computer. While Group sessions by tags is on, the six status entries are listed too, each with its
 * symbol and a "Status" caption.
 *
 * Each row has a handle beside its switch: dragged, it moves the row; tapped, it offers Move Up, Move Down and Move to
 * top, which VoiceOver also offers on the row. Every move writes the whole list through the switches' own writer, each
 * entry keeping its switches, and the entries the page does not list (the separators, and the status entries while
 * grouping is off) keep their places in it. A drag let go outside the list, cancelled by the system, or started on a
 * list that has changed since writes nothing.
 */
export function SessionTagsSection({
  items,
  summary,
  grouping,
}: {
  items: unknown[] | null;
  summary: GhostexMobileSummary | null;
  /** Group sessions by tags is on: the status entries are listed. */
  grouping: boolean;
}) {
  const appearance = useAppearance();
  const ink = useSidebarInk();
  const catalog = summary?.customSessionTags ?? EMPTY_CUSTOM_SESSION_TAGS;
  const list = normalizeTagListItems(items, summary === null ? null : catalog);
  const listed = listedTagItems(list, grouping);
  const stored = JSON.stringify(storedTagListItems(list));
  /** The list as last drawn, which a drop compares with the one its drag started on. */
  const current = useRef(stored);
  current.current = stored;
  const frames = useRef(new Map<string, RowFrame>());
  const [drag, setDrag] = useState<{ id: string; dy: number } | null>(null);
  /** The dragged entry and the list its drag started on, read by the drop whatever render its gesture last saw. */
  const lifted = useRef<{ id: string; from: string } | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const label = (item: TagListItem): string =>
    isStatusTagId(item.id)
      ? SessionGroupsCopy.status[item.id]
      : item.kind === 'untagged'
        ? SessionGroupsCopy.noTag
        : (BUILTIN_LABELS[item.id] ?? catalog.tags[item.id]?.name ?? item.id);
  const write = (next: readonly TagListItem[]) =>
    setSidebarSetting('sidebarSessionTagListItems', storedTagListItems(next));
  const setShown = (id: string, shown: boolean) =>
    write(list.map((item) => (item.id === id ? { ...item, enabled: shown, visible: shown } : item)));
  const move = (item: TagListItem, position: number): void => {
    const next = moveListedTagItem(list, item.id, position, grouping);
    if (next === null) return;
    write(next);
    AccessibilityInfo.announceForAccessibility(SessionGroupsCopy.tags.moved(label(item), position + 1));
  };
  const onAction = (item: TagListItem, at: number) => (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'moveUp') move(item, at - 1);
    else if (event.nativeEvent.actionName === 'moveDown') move(item, at + 1);
  };

  /** Where a dragged row's centre falls among the listed rows' frames; `null` outside the list. */
  const dropPosition = (id: string, dy: number): number | null => {
    const start = frames.current.get(id);
    if (start === undefined) return null;
    const centre = start.y + start.height / 2 + dy;
    for (const [index, item] of listed.entries()) {
      const frame = frames.current.get(item.id);
      if (frame !== undefined && centre >= frame.y && centre < frame.y + frame.height) return index;
    }
    return null;
  };
  const drop = (item: TagListItem, dy: number): void => {
    const started = lifted.current;
    lifted.current = null;
    setDrag(null);
    // A list that changed during the drag (an edit synced in) is not overwritten by the stale one.
    if (started === null || started.id !== item.id || started.from !== current.current) return;
    const position = dropPosition(item.id, dy);
    if (position !== null) move(item, position);
  };
  const cancel = (): void => {
    lifted.current = null;
    setDrag(null);
  };

  const menuItem = listed.find((item) => item.id === menuFor) ?? null;
  const menuAt = menuItem === null ? -1 : listed.indexOf(menuItem);
  const menuMove = (position: number) => () => {
    setMenuFor(null);
    if (menuItem !== null) move(menuItem, position);
  };

  return (
    <SettingsSection name="settings:sessions-list:session-tags">
      <SectionHeader title="Session Tags" />
      <Caption>{SessionGroupsCopy.tags.reorderCaption}</Caption>
      {grouping ? <Caption>{SessionGroupsCopy.tags.statusCaption}</Caption> : null}
      <Caption>{SessionGroupsCopy.tags.syncCaption}</Caption>
      <View>
        {listed.map((item, at) => {
          const name = label(item);
          const dy = drag !== null && drag.id === item.id ? drag.dy : null;
          const Glyph = isStatusTagId(item.id) ? STATUS_GLYPHS[item.id] : null;
          const color = isStatusTagId(item.id) ? groupColor(STATUS_GROUP_LOOK[item.id].colorToken, ink) : null;
          return (
            <View
              key={item.id}
              onLayout={(event) => {
                const { y, height } = event.nativeEvent.layout;
                frames.current.set(item.id, { y, height });
              }}
              style={[styles.row, dy === null ? null : [styles.lifted, { transform: [{ translateY: dy }] }]]}
            >
              <ReorderHandle
                label={SessionGroupsCopy.tags.handleLabel(name, at + 1, listed.length)}
                color={appearance.mutedGlyph}
                onOpenMenu={() => setMenuFor(item.id)}
                onAccessibilityAction={onAction(item, at)}
                onLift={() => {
                  lifted.current = { id: item.id, from: current.current };
                  setDrag({ id: item.id, dy: 0 });
                }}
                onMove={(dy) => setDrag((was) => (was === null || was.id !== item.id ? was : { ...was, dy }))}
                onDrop={(dy) => drop(item, dy)}
                onCancel={cancel}
              />
              <View style={styles.toggle}>
                <ToggleRow
                  label={name}
                  detail={item.kind === 'status' ? SessionGroupsCopy.statusCaption : undefined}
                  icon={Glyph === null || color === null ? undefined : <Glyph size={18} color={color} />}
                  value={item.enabled && item.visible}
                  onValueChange={(next) => setShown(item.id, next)}
                  accessibilityActions={MOVE_ACTIONS}
                  onAccessibilityAction={onAction(item, at)}
                />
              </View>
            </View>
          );
        })}
      </View>
      {menuItem !== null ? (
        <ContextMenu
          visible
          title={SessionGroupsCopy.tags.menuTitle(label(menuItem), menuAt + 1)}
          items={[
            {
              kind: 'item',
              key: 'up',
              label: SessionGroupsCopy.tags.moveUp,
              disabled: menuAt <= 0,
              onPress: menuMove(menuAt - 1),
            },
            {
              kind: 'item',
              key: 'down',
              label: SessionGroupsCopy.tags.moveDown,
              disabled: menuAt >= listed.length - 1,
              onPress: menuMove(menuAt + 1),
            },
            {
              kind: 'item',
              key: 'top',
              label: SessionGroupsCopy.tags.moveToTop,
              disabled: menuAt <= 0,
              onPress: menuMove(0),
            },
            { kind: 'separator', key: 'done-separator' },
            { kind: 'item', key: 'done', label: SessionGroupsCopy.tags.done, onPress: () => setMenuFor(null) },
          ]}
          onClose={() => setMenuFor(null)}
        />
      ) : null}
    </SettingsSection>
  );
}

/**
 * A row's 44 × 44 pt handle, apart from its switch: a tap opens the move menu, a hold then drag moves the row. The
 * pan runs its callbacks on the JS thread (a handful of state changes per drag, as the terminal tabs' drag).
 */
function ReorderHandle({
  label,
  color,
  onOpenMenu,
  onAccessibilityAction,
  onLift,
  onMove,
  onDrop,
  onCancel,
}: {
  label: string;
  color: string;
  onOpenMenu: () => void;
  onAccessibilityAction: (event: AccessibilityActionEvent) => void;
  onLift: () => void;
  onMove: (dy: number) => void;
  onDrop: (dy: number) => void;
  onCancel: () => void;
}) {
  const pan = usePanGesture({
    activateAfterLongPress: LIFT_HOLD_MS,
    runOnJS: true,
    onActivate: onLift,
    onUpdate: (event) => onMove(event.translationY),
    onDeactivate: (event) => (event.canceled ? onCancel() : onDrop(event.translationY)),
    // A touch the system took: the row goes back and nothing is written (nothing once the drop above ended it).
    onFinalize: onCancel,
  });
  return (
    <GestureDetector gesture={pan}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityActions={MOVE_ACTIONS}
        onAccessibilityAction={onAccessibilityAction}
        onPress={onOpenMenu}
        style={styles.handle}
      >
        <MenuGlyph size={18} color={color} />
      </Pressable>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lifted: { zIndex: 1, opacity: 0.92 },
  handle: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  toggle: { flex: 1, minWidth: 0 },
});
