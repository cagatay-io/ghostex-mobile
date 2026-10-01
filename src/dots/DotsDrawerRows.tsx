/**
 * What the Sessions screen draws under the Dots chip (the desktop's Dots sidebar mode, CONTRACT.md
 * §8): the pinned OpenDots row (opens DotsHome; badge = pending approvals) and one card per dot,
 * whose header draws the dot's face, name and status with a "+" (new chat) and an Open button, and
 * whose sessions are the ordinary session rows the caller renders.
 */

import { useRef, useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import ContextMenu from '../components/sessions/ContextMenu';
import { ChevronRightGlyph, MoreGlyph, PlusGlyph } from '../components/sessions/icons';
import {
  ds,
  ProjectBranch,
  projectRailColor,
  ProjectStatusCounts,
  TOP_LEVEL_BRANCH_WIDTH,
} from '../components/sessions/rows';
import type { MenuAnchor } from '../components/sessions/ContextMenu';
import type { DotRowInfo, DrawerBlock, ProjectCardBlock } from '../components/sessions/drawerModel';
import type { DrawerItem } from '../contract/grouping';
import { useInventoryStore } from '../inventory/store';
import type { MachineRecord } from '../machines/store';
import { mixHexColors, SidebarPalette } from '../theme/palette';
import { pauseDot, resumeDot, stopDot } from './client';
import { DotFace, DotsMark, DotStatusDot } from './DotFace';
import { DEFAULT_DOT_LOOK } from './look';
import { startDotChat, type DotsNavigation } from './openChat';
import { DOT_STATUS_COLORS, dotStatusLabel } from './status';
import { useDotsStore } from './store';

const TITLE_COLOR = mixHexColors(SidebarPalette.FOREGROUND, '#FFFFFF', 92);

function HeaderButton({ label, onPress, children }: { label: string; onPress: () => void; children: ReactElement }) {
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={label}
      hitSlop={5}
      style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]}
      onPress={onPress}
    >
      {children}
    </Pressable>
  );
}

/** The pinned OpenDots row: Home of the dots (hand off, approvals, updates). */
export function OpenDotsRow({
  needsYou,
  dotCount,
  onPress,
}: {
  needsYou: number;
  dotCount: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={needsYou > 0 ? `OpenDots, ${needsYou} waiting for you` : 'OpenDots'}
      style={({ pressed }) => [styles.homeRow, pressed ? styles.rowPressed : null]}
      onPress={onPress}
    >
      <View style={styles.homeIcon}>
        <DotsMark size={ds(18)} color={TITLE_COLOR} />
      </View>
      <View style={styles.homeText}>
        <Text style={styles.title} numberOfLines={1}>
          OpenDots
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {dotCount === 0 ? 'No dots yet. Tap to make your first one.' : 'Hand off a task, approvals and updates'}
        </Text>
      </View>
      {needsYou > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{needsYou}</Text>
        </View>
      ) : null}
      <ChevronRightGlyph size={ds(14)} color={SidebarPalette.HEADER_BUTTON_ICON} />
    </Pressable>
  );
}

/** One dot's card: its header and, while expanded, its sessions. */
export function DotCard({
  card,
  dot,
  renderChild,
  onToggle,
  onNewChat,
  onOpen,
  onMenu,
  sidebarBackground,
}: {
  card: ProjectCardBlock;
  dot: DotRowInfo;
  renderChild: (child: DrawerItem) => ReactElement | null;
  onToggle: () => void;
  onNewChat: () => void;
  onOpen: () => void;
  onMenu: (anchor: MenuAnchor) => void;
  sidebarBackground: string;
}) {
  const rowRef = useRef<View | null>(null);
  const header = card.header;
  const look = dot.look ?? DEFAULT_DOT_LOOK;
  const openMenu = (): void => {
    rowRef.current?.measureInWindow((x, y, width, height) => onMenu({ x, y, width, height }));
  };
  return (
    <View style={styles.card}>
      <ProjectBranch color={projectRailColor(look.color, sidebarBackground)} width={TOP_LEVEL_BRANCH_WIDTH} />
      <View style={styles.cardBody}>
        <Pressable
          ref={rowRef}
          accessibilityRole='button'
          accessibilityLabel={`${dot.name}, ${dotStatusLabel(dot.status)}`}
          style={({ pressed }) => [styles.headerRow, pressed ? styles.rowPressed : null]}
          onPress={onToggle}
          onLongPress={openMenu}
        >
          <DotFace look={look} status={dot.status} size={ds(24)} />
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={1}>
              {dot.name}
            </Text>
            <View style={styles.statusLine}>
              <DotStatusDot status={dot.status} size={ds(5)} />
              <Text
                style={[styles.statusText, dot.status === 'idle' ? null : { color: DOT_STATUS_COLORS[dot.status] }]}
                numberOfLines={1}
              >
                {dotStatusLabel(dot.status)}
              </Text>
            </View>
          </View>
          <View style={styles.trailing}>
            {header.collapsed ? (
              <ProjectStatusCounts
                workingCount={header.workingCount}
                attentionCount={header.attentionCount}
                backgroundWorkCount={header.backgroundWorkCount}
                awakeCount={header.awakeCount}
              />
            ) : null}
            {dot.dotId.length > 0 ? (
              <HeaderButton label={`New chat with ${dot.name}`} onPress={onNewChat}>
                <PlusGlyph size={ds(14)} color={SidebarPalette.HEADER_BUTTON_ICON} />
              </HeaderButton>
            ) : null}
            <HeaderButton label={`${dot.name} options`} onPress={openMenu}>
              <MoreGlyph size={ds(14)} color={SidebarPalette.HEADER_BUTTON_ICON} />
            </HeaderButton>
            {dot.dotId.length > 0 ? (
              <HeaderButton label={`Open ${dot.name}`} onPress={onOpen}>
                <ChevronRightGlyph size={ds(14)} color={SidebarPalette.HEADER_BUTTON_ICON} />
              </HeaderButton>
            ) : null}
          </View>
        </Pressable>
        {!header.collapsed && card.children.length > 0 ? (
          <View style={styles.sessions}>{card.children.map((child) => renderChild(child))}</View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * One Dots-chip block as the Sessions screen renders it: the OpenDots row, or a dot card with its
 * "+" (startChat, then the new conversation in chat), its Open button (the dot's screen) and its
 * long-press menu. Session rows inside come from the caller, so they behave like every other row.
 */
export function DotsDrawerBlock({
  block,
  machine,
  navigation,
  sidebarBackground,
  renderChild,
  onToggle,
  onProgress,
  onError,
}: {
  block: Extract<DrawerBlock, { kind: 'dotsHome' } | { kind: 'dot' }>;
  machine: MachineRecord | null;
  navigation: DotsNavigation;
  sidebarBackground: string;
  renderChild: (child: DrawerItem) => ReactElement | null;
  onToggle: () => void;
  onProgress: (message: string | null) => void;
  onError: (message: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  if (block.kind === 'dotsHome') {
    return (
      <OpenDotsRow
        needsYou={block.needsYou}
        dotCount={block.dotCount}
        onPress={() => navigation.navigate('DotsHome', { machineId: block.machineId })}
      />
    );
  }
  const { dot } = block;
  const newChat = (): void => {
    if (machine === null || dot.dotId.length === 0) return;
    onProgress(`Starting a chat with ${dot.name}…`);
    void startDotChat(navigation, machine, dot, undefined, onError)
      .catch((error: unknown) => onError(error instanceof Error ? error.message : String(error)))
      .finally(() => onProgress(null));
  };
  const openTab = (tab: 'chats' | 'computer' | 'setup'): void => {
    setMenuOpen(false);
    if (dot.dotId.length === 0) return;
    navigation.navigate('DotDetail', { machineId: block.machineId, dotId: dot.dotId, tab });
  };
  const lifecycle = (action: 'pause' | 'resume' | 'stop'): void => {
    setMenuOpen(false);
    if (machine === null || dot.dotId.length === 0) return;
    const call = action === 'pause' ? pauseDot : action === 'resume' ? resumeDot : stopDot;
    void call(machine, dot.dotId)
      .then(() => {
        void useDotsStore.getState().refresh(machine);
        return useInventoryStore.getState().refreshMachine(machine);
      })
      .catch((error: unknown) => onError(error instanceof Error ? error.message : String(error)));
  };
  return (
    <>
      <DotCard
        card={block.card}
        dot={dot}
        sidebarBackground={sidebarBackground}
        renderChild={renderChild}
        onToggle={onToggle}
        onNewChat={newChat}
        onOpen={() => openTab('chats')}
        onMenu={() => setMenuOpen(true)}
      />
      {menuOpen ? (
        <ContextMenu
          visible
          title={dot.name}
          subtitle={dotStatusLabel(dot.status)}
          items={[
            {
              kind: 'item',
              key: 'new-chat',
              label: `New chat with ${dot.name}`,
              disabled: dot.dotId.length === 0,
              onPress: () => {
                setMenuOpen(false);
                newChat();
              },
            },
            { kind: 'item', key: 'chats', label: 'Chats', onPress: () => openTab('chats') },
            { kind: 'item', key: 'computer', label: 'Computer', onPress: () => openTab('computer') },
            { kind: 'item', key: 'setup', label: 'Setup', onPress: () => openTab('setup') },
            { kind: 'separator', key: 'lifecycle' },
            dot.status === 'paused'
              ? { kind: 'item', key: 'resume', label: 'Resume', onPress: () => lifecycle('resume') }
              : { kind: 'item', key: 'pause', label: 'Pause', onPress: () => lifecycle('pause') },
            ...(dot.status === 'working'
              ? [
                  {
                    kind: 'item' as const,
                    key: 'stop',
                    label: 'Stop',
                    destructive: true,
                    onPress: () => lifecycle('stop'),
                  },
                ]
              : []),
          ]}
          onClose={() => setMenuOpen(false)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  homeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ds(10),
    minHeight: ds(40),
    marginLeft: ds(3),
    marginRight: ds(5),
    marginBottom: ds(10),
    paddingHorizontal: ds(10),
    paddingVertical: ds(6),
    borderRadius: ds(7),
    borderWidth: 1,
    borderColor: SidebarPalette.HEADER_BUTTON_BORDER,
    backgroundColor: SidebarPalette.HEADER_BUTTON_BG,
  },
  homeIcon: {
    width: ds(22),
    alignItems: 'center',
  },
  homeText: {
    flex: 1,
    minWidth: 0,
  },
  rowPressed: {
    backgroundColor: 'rgba(200,205,213,0.06)',
  },
  title: {
    flexShrink: 1,
    color: TITLE_COLOR,
    fontSize: ds(15.55),
    fontWeight: '700',
    letterSpacing: 0.2,
    lineHeight: ds(20),
  },
  subtitle: {
    color: SidebarPalette.MUTED,
    fontSize: ds(11),
    lineHeight: ds(14),
  },
  badge: {
    minWidth: ds(18),
    height: ds(18),
    paddingHorizontal: ds(5),
    borderRadius: ds(9),
    backgroundColor: DOT_STATUS_COLORS.waiting,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#1c1622',
    fontSize: ds(11),
    fontWeight: '700',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginLeft: ds(3),
    marginRight: ds(5),
    marginBottom: ds(10),
  },
  cardBody: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: ds(34),
    paddingHorizontal: ds(6),
    paddingVertical: ds(2),
    borderRadius: ds(5),
    gap: ds(8),
  },
  headerText: {
    flexShrink: 1,
    minWidth: 0,
  },
  statusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ds(4),
  },
  statusText: {
    color: SidebarPalette.MUTED,
    fontSize: ds(10),
    lineHeight: ds(13),
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    marginStart: 'auto',
    gap: ds(4),
  },
  button: {
    width: ds(22),
    height: ds(22),
    borderRadius: ds(6),
    backgroundColor: SidebarPalette.HEADER_BUTTON_BG,
    borderWidth: 1,
    borderColor: SidebarPalette.HEADER_BUTTON_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    backgroundColor: 'rgba(200,205,213,0.10)',
    borderColor: 'rgba(200,205,213,0.28)',
  },
  sessions: {
    paddingHorizontal: ds(3),
    paddingBottom: ds(3),
  },
});
