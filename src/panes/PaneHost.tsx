/**
 * The pane host: two panes in the pane container (the area below the terminal screen's header), the divider between
 * them and their title bars. Where they stand is `paneGeometry`'s; what they show is the caller's (`renderContent`).
 *
 * - Each pane has a title bar: the grip, the type icon and title (a tap opens the pane type menu, which sets what the
 *   pane shows), the close button. The pane tapped last is active: its title bar in the accent colour; the other's
 *   grey.
 * - Dragging a pane by its title bar (the grip is part of it) onto the other slot swaps the two. While the finger
 *   moves, a copy of the title bar follows it and the other pane shows where a release swaps; the panes themselves
 *   stay put, so their terminals are never moved or remounted (a terminal can be in one place only). While the
 *   chooser is one of the two, neither moves (the chooser is a picker, never stored): no grip, no drag, the grip's
 *   space kept.
 * - Dragging the divider handle resizes both panes, 25-75 %; the handle is there only while the keyboard is down.
 * - A gesture that starts in a pane's content is never a pane gesture: nothing here takes a touch there, so the
 *   terminal's own selection, scrolling and pinch stay as they are.
 * - Half folded like a book the content may run across the fold, but nothing to touch stands on it: the handle moves
 *   beside the fold, the title bars and the selected session's accessory keep off it, and a body other than a
 *   terminal gets where its own controls keep off it (`PaneFrame.controlInset`).
 * The cards are drawn in the order of what they show, never of their slot: a swap only changes their frames, and
 * their native views keep their place in the view tree.
 */

import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  type ViewInstance,
} from 'react-native';

import type { WindowRect } from '../../modules/ghostex-native/src/GhostexNative.types';
import { measureInWindow } from '../components/common/measureInWindow';
import ContextMenu from '../components/sessions/ContextMenu';
import { ChevronDownIcon, CloseIcon, GripIcon } from '../components/terminal/icons';
import { PanesCopy, SessionCopy, UsageCopy } from '../copy';
import { useInventoryStore } from '../inventory/store';
import { machineDisplayLabel, useMachinesStore } from '../machines/store';
import { useTerminalStore } from '../terminal/sessions';
import { colorWithOpacity, GhostexPalette, GhostexRadii } from '../theme/palette';
import { remoteDisplayAddress } from '../webPreview/urls';
import { clampDividerRatio, MAX_DIVIDER_RATIO, MIN_DIVIDER_RATIO } from './divider';
import {
  PANE_HANDLE_SIZE,
  PANE_TITLE_HEIGHT,
  paneGeometry,
  type PaneBarInset,
  type PaneGeometry,
  type PaneGeometryInput,
  type PaneIndex,
  type PaneRect,
  type PaneSize,
} from './geometry';
import type { PaneArrangement } from './layout';
import { usePaneProject } from './paneProject';
import { AVAILABLE_PANE_TYPES } from './paneTypes';
import { machineOfSessionKey, type PaneContent } from './resolve';
import { usePaneStore } from './store';
import type { SettablePaneType } from './usePaneHost';

/** How far a finger moves on a title bar before it drags the pane (a shorter touch is a tap). */
const DRAG_SLOP = 8;
/** A VoiceOver swipe on the divider handle moves it by this share. */
const ACCESSIBLE_STEP = 0.05;
const DIVIDER_ACTIONS = [{ name: 'increment' }, { name: 'decrement' }] as const;
const GRIP_ACTIONS = [{ name: 'activate' }] as const;

/**
 * What a body is given: its terminal's size and what the keyboard rules hide of it, whether its pane is active, and
 * how far its own controls stay off its edges to keep off a book fold (`paneGeometry`'s `controlInsets`).
 */
export type PaneFrame = { view: PaneSize; covered: number; active: boolean; controlInset: PaneBarInset };

export type PaneHostProps = {
  /** Where the panes stand (`paneGeometry`'s input: the window's shape, the container, the stored divider, the
   * active pane, the keyboard's cover, the editor and the fold). */
  layout: PaneGeometryInput;
  slots: readonly [PaneContent, PaneContent];
  renderContent: (content: PaneContent, frame: PaneFrame) => ReactNode;
  /** Shown in the body of the pane in `accessorySlot` (the queued prompts of the selected session, in its pane). */
  accessory?: ReactNode;
  accessorySlot: PaneIndex;
  /** Whether the pane type menu offers this type for the slot now (`usePaneHost`'s `typeOffered`). */
  typeOffered: (slot: PaneIndex, type: SettablePaneType) => boolean;
  /** A type picked in a pane's type menu. */
  onSetType: (slot: PaneIndex, type: SettablePaneType) => void;
  onActivate: (slot: PaneIndex) => void;
  onClose: (slot: PaneIndex) => void;
  onSwap: () => void;
  /** A divider drag ended there. */
  onRatio: (ratio: number) => void;
};

function contentKey(content: PaneContent): string {
  switch (content.kind) {
    case 'session':
      return content.sessionKey;
    case 'files':
    case 'git':
    case 'usage':
      return `${content.kind}:${content.origin}`;
    default:
      return content.kind;
  }
}

/**
 * The title a pane's bar shows: a session's name as the session list has it, else its tab's; a browser pane's page
 * (the type's name at the Web Preview's start); a files or Git changes pane's project; a usage pane's computer;
 * the type's name for the agents and attention list panes.
 */
function usePaneTitle(content: PaneContent): string {
  const sessionKey = content.kind === 'session' ? content.sessionKey : null;
  const tab = useTerminalStore((state) =>
    sessionKey === null ? null : (state.tabs.find((entry) => entry.sessionKey === sessionKey) ?? null),
  );
  const displayTitle = useInventoryStore((state) =>
    tab === null || tab.ghostexSessionId === undefined
      ? ''
      : (state.inventoriesByMachineId[tab.machineId]?.summary?.sessions.find(
          (session) => session.sessionId === tab.ghostexSessionId,
        )?.displayTitle ?? ''),
  );
  const project = usePaneProject(content.kind === 'files' || content.kind === 'git' ? content.origin : '');
  const usageMachine = useMachinesStore((state) =>
    content.kind === 'usage'
      ? (state.machines.find((machine) => machine.id === machineOfSessionKey(content.origin)) ?? null)
      : null,
  );
  const page = usePaneStore((state) => (content.kind === 'browser' ? (state.browserPage?.page ?? null) : null));
  switch (content.kind) {
    case 'chooser':
      return PanesCopy.newPane;
    case 'browser':
      if (page === null) return PanesCopy.browserType;
      if (page.url !== undefined) return page.url;
      return page.path === undefined || page.path === '/'
        ? `localhost:${page.remotePort}`
        : remoteDisplayAddress(page.remotePort, page.path);
    case 'agents':
      return PanesCopy.agentsType;
    case 'attention':
      return PanesCopy.attentionType;
    case 'usage':
      return usageMachine === null ? PanesCopy.usageType : UsageCopy.title(machineDisplayLabel(usageMachine));
    case 'files':
    case 'git':
      return project.kind === 'project' && project.project.projectName.length > 0
        ? project.project.projectName
        : content.kind === 'files'
          ? PanesCopy.filesType
          : PanesCopy.gitType;
    case 'session':
      if (displayTitle.length > 0) return displayTitle;
      return tab !== null && tab.title.length > 0 ? tab.title : SessionCopy.fallbackTitle;
  }
}

type SwapDrag = { slot: PaneIndex; dx: number; dy: number };

/** Where the dragged title bar's middle stands now, and whether that is inside the other slot. */
function overOtherSlot(geometry: PaneGeometry, drag: SwapDrag): boolean {
  const card = geometry.cards[drag.slot];
  const other = geometry.slots[drag.slot === 0 ? 1 : 0];
  const x = card.x + card.width / 2 + drag.dx;
  const y = card.y + PANE_TITLE_HEIGHT / 2 + drag.dy;
  return x >= other.x && x <= other.x + other.width && y >= other.y && y <= other.y + other.height;
}

function rectStyle(rect: PaneRect) {
  return { left: rect.x, top: rect.y, width: rect.width, height: rect.height };
}

export default function PaneHost(props: PaneHostProps) {
  const { layout, slots } = props;
  const { arrangement, active } = layout;
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  const [swapDrag, setSwapDrag] = useState<SwapDrag | null>(null);
  const [menu, setMenu] = useState<{ slot: PaneIndex; anchor: WindowRect } | null>(null);
  const ratio = dragRatio ?? layout.ratio;
  const geometry = paneGeometry({ ...layout, ratio });
  const hovering = swapDrag !== null && overOtherSlot(geometry, swapDrag);
  const order: PaneIndex[] = contentKey(slots[0]) < contentKey(slots[1]) ? [0, 1] : [1, 0];
  const swappable = slots.every((content) => content.kind !== 'chooser');

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {order.map((slot) => (
        <PaneCard
          key={contentKey(slots[slot])}
          slot={slot}
          content={slots[slot]}
          geometry={geometry}
          active={slot === active}
          swappable={swappable}
          dropTarget={hovering && swapDrag.slot !== slot}
          onSwapDrag={setSwapDrag}
          menuOpen={menu?.slot === slot}
          onMenu={(anchor) => setMenu({ slot, anchor })}
          renderContent={props.renderContent}
          accessory={slot === props.accessorySlot ? props.accessory : undefined}
          onActivate={props.onActivate}
          onClose={props.onClose}
          onSwap={props.onSwap}
        />
      ))}
      <Divider
        arrangement={arrangement}
        geometry={geometry}
        ratio={clampDividerRatio(ratio)}
        length={arrangement === 'stacked' ? layout.height : layout.width}
        dragging={dragRatio !== null}
        onDrag={setDragRatio}
        onRatio={props.onRatio}
      />
      {swapDrag !== null ? (
        <SwapGhost geometry={geometry} drag={swapDrag} content={slots[swapDrag.slot]} hovering={hovering} />
      ) : null}
      <ContextMenu
        visible={menu !== null}
        title={PanesCopy.typeMenuTitle}
        subtitle={PanesCopy.typeMenuSubtitle}
        items={AVAILABLE_PANE_TYPES.map((definition) => ({
          kind: 'item' as const,
          key: definition.type,
          label: definition.label,
          icon: definition.icon(18, GhostexPalette.FOREGROUND),
          selected: menu !== null && slots[menu.slot].kind === definition.type,
          selectedPresentation: 'check' as const,
          disabled: menu === null || !props.typeOffered(menu.slot, definition.type),
          onPress: () => {
            setMenu(null);
            if (menu !== null && slots[menu.slot].kind !== definition.type) props.onSetType(menu.slot, definition.type);
          },
        }))}
        onClose={() => setMenu(null)}
        rowAnchor={menu?.anchor}
      />
    </View>
  );
}

type PaneCardProps = {
  slot: PaneIndex;
  content: PaneContent;
  geometry: PaneGeometry;
  active: boolean;
  /** Its title bar drags it onto the other slot (`PaneHost`: not while the chooser is one of the two). */
  swappable: boolean;
  dropTarget: boolean;
  onSwapDrag: (drag: SwapDrag | null) => void;
  menuOpen: boolean;
  onMenu: (anchor: WindowRect) => void;
  renderContent: PaneHostProps['renderContent'];
  accessory: ReactNode;
  onActivate: (slot: PaneIndex) => void;
  onClose: (slot: PaneIndex) => void;
  onSwap: () => void;
};

function PaneCard(props: PaneCardProps) {
  const { slot, content, geometry, active } = props;
  const title = usePaneTitle(content);
  const titleRef = useRef<ViewInstance>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const card = geometry.cards[slot];
  const inset = geometry.bodyInsets[slot];
  const typeDefinition = AVAILABLE_PANE_TYPES.find((definition) => definition.type === content.kind);
  const typeLabel = typeDefinition?.label ?? PanesCopy.newPane;
  const tint = active ? GhostexPalette.ACCENT : GhostexPalette.MUTED;
  const delta = (event: GestureResponderEvent) => ({
    dx: event.nativeEvent.pageX - (start.current?.x ?? event.nativeEvent.pageX),
    dy: event.nativeEvent.pageY - (start.current?.y ?? event.nativeEvent.pageY),
  });

  return (
    <View
      testID={`pane:${contentKey(content)}`}
      style={[styles.card, rectStyle(card), props.dropTarget && styles.dropTarget]}
      // Any touch in a pane makes it the active one; it takes no touch away from what it lands on.
      onTouchStart={() => props.onActivate(slot)}
    >
      <View
        testID={`pane-bar:${contentKey(content)}`}
        style={[
          styles.bar,
          active && styles.barActive,
          geometry.collapsed[slot] && styles.barCollapsed,
          // Half folded like a book it keeps off the fold and the handle beside it (`paneGeometry`).
          { marginLeft: geometry.barInsets[slot].left, marginRight: geometry.barInsets[slot].right },
        ]}
        onTouchStart={(event) => {
          start.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
        }}
        onMoveShouldSetResponder={(event) => {
          const { dx, dy } = delta(event);
          return props.swappable && start.current !== null && Math.hypot(dx, dy) > DRAG_SLOP;
        }}
        onResponderGrant={(event) => props.onSwapDrag({ slot, ...delta(event) })}
        onResponderMove={(event) => props.onSwapDrag({ slot, ...delta(event) })}
        onResponderRelease={(event) => {
          const drag = { slot, ...delta(event) };
          props.onSwapDrag(null);
          start.current = null;
          if (overOtherSlot(geometry, drag)) props.onSwap();
        }}
        onResponderTerminate={() => {
          props.onSwapDrag(null);
          start.current = null;
        }}
        onResponderTerminationRequest={() => false}
      >
        {props.swappable ? (
          <View
            accessible
            accessibilityRole="button"
            accessibilityLabel={PanesCopy.move(title)}
            accessibilityActions={GRIP_ACTIONS}
            onAccessibilityAction={props.onSwap}
            style={styles.barButton}
          >
            <GripIcon size={18} color={active ? GhostexPalette.FOREGROUND : GhostexPalette.MUTED} />
          </View>
        ) : (
          <View style={styles.barButton} />
        )}
        <Pressable
          ref={titleRef}
          accessibilityRole="button"
          accessibilityLabel={PanesCopy.title(title, typeLabel)}
          accessibilityState={{ selected: active, expanded: typeDefinition === undefined ? undefined : props.menuOpen }}
          disabled={typeDefinition === undefined}
          style={styles.title}
          onPress={() => measureInWindow(titleRef, props.onMenu)}
        >
          {typeDefinition?.icon(16, tint)}
          <Text style={[styles.titleText, { color: tint }, active && styles.titleActive]} numberOfLines={1}>
            {title}
          </Text>
          {typeDefinition !== undefined ? <ChevronDownIcon size={12} color={tint} /> : null}
        </Pressable>
        <View style={styles.fill} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={PanesCopy.close(title)}
          style={styles.barButton}
          onPress={() => props.onClose(slot)}
        >
          <CloseIcon size={14} color={active ? GhostexPalette.FOREGROUND : GhostexPalette.MUTED} />
        </Pressable>
      </View>
      <View style={[styles.body, { left: inset.left, right: inset.right, bottom: inset.bottom }]}>
        {props.renderContent(content, {
          view: geometry.views[slot],
          covered: geometry.covered[slot],
          active,
          controlInset: geometry.controlInsets[slot],
        })}
        {props.accessory !== undefined && props.accessory !== null ? (
          // Half folded like a book it starts past a fold in the body's leading half (`paneGeometry`).
          <View style={[StyleSheet.absoluteFill, { left: geometry.accessoryLeft[slot] }]} pointerEvents="box-none">
            {props.accessory}
          </View>
        ) : null}
      </View>
      {props.dropTarget ? (
        <View style={styles.dropLabel} pointerEvents="none">
          <Text style={styles.dropLabelText}>{PanesCopy.releaseToSwap}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** The title bar of the pane being dragged, under the finger. */
function SwapGhost({
  geometry,
  drag,
  content,
  hovering,
}: {
  geometry: PaneGeometry;
  drag: SwapDrag;
  content: PaneContent;
  hovering: boolean;
}) {
  const title = usePaneTitle(content);
  const card = geometry.cards[drag.slot];
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.ghost,
        hovering && styles.ghostOver,
        { left: card.x + drag.dx, top: card.y + drag.dy, width: card.width, height: PANE_TITLE_HEIGHT },
      ]}
    >
      <GripIcon size={18} color={GhostexPalette.FOREGROUND} />
      <Text style={[styles.titleText, styles.titleActive, { color: GhostexPalette.ACCENT }]} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

function Divider({
  arrangement,
  geometry,
  ratio,
  length,
  dragging,
  onDrag,
  onRatio,
}: {
  arrangement: PaneArrangement;
  geometry: PaneGeometry;
  ratio: number;
  length: number;
  dragging: boolean;
  onDrag: (ratio: number | null) => void;
  onRatio: (ratio: number) => void;
}) {
  const grab = useRef<{ position: number; ratio: number } | null>(null);
  const across = arrangement === 'sideBySide';
  const position = (event: GestureResponderEvent) => (across ? event.nativeEvent.pageX : event.nativeEvent.pageY);
  const ratioAt = (event: GestureResponderEvent): number | null => {
    const from = grab.current;
    if (from === null || length <= 0) return null;
    return clampDividerRatio(from.ratio + (position(event) - from.position) / length);
  };
  const adjust = useCallback(
    (event: AccessibilityActionEvent) => {
      const step = event.nativeEvent.actionName === 'increment' ? ACCESSIBLE_STEP : -ACCESSIBLE_STEP;
      onRatio(clampDividerRatio(ratio + step));
    },
    [onRatio, ratio],
  );
  const percent = Math.round(ratio * 100);
  const { divider, handle } = geometry;
  return (
    <View style={[styles.divider, rectStyle(divider)]} pointerEvents="box-none">
      {geometry.handleShown ? (
        <View
          testID="pane-divider-handle"
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={PanesCopy.resize}
          accessibilityValue={{ min: MIN_DIVIDER_RATIO * 100, max: MAX_DIVIDER_RATIO * 100, now: percent }}
          accessibilityActions={DIVIDER_ACTIONS}
          onAccessibilityAction={adjust}
          style={[
            styles.handle,
            // Centred on the divider, reaching into both panes, whose bodies keep clear of it; half folded like a
            // book, beside the fold rather than on it (`paneGeometry`).
            { left: handle.x - divider.x, top: handle.y - divider.y },
          ]}
          onStartShouldSetResponder={() => true}
          onResponderGrant={(event) => {
            grab.current = { position: position(event), ratio };
            onDrag(ratio);
          }}
          onResponderMove={(event) => {
            const next = ratioAt(event);
            if (next !== null) onDrag(next);
          }}
          onResponderRelease={(event) => {
            const next = ratioAt(event);
            grab.current = null;
            onDrag(null);
            if (next !== null) onRatio(next);
          }}
          onResponderTerminate={() => {
            grab.current = null;
            onDrag(null);
          }}
          onResponderTerminationRequest={() => false}
        >
          <View style={[across ? styles.grabberAcross : styles.grabber, dragging && styles.grabberDragging]} />
        </View>
      ) : null}
      {dragging ? (
        <View pointerEvents="none" style={across ? styles.sharesAcross : styles.shares}>
          <Text style={styles.sharesText}>
            {PanesCopy.shares(percent, 100 - percent, ratio <= MIN_DIVIDER_RATIO || ratio >= MAX_DIVIDER_RATIO)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** The active pane's title bar: the accent over the card colour, its bottom line stronger (the design's). */
const ACTIVE_BAR = colorWithOpacity(GhostexPalette.ACCENT, 24);
const ACTIVE_LINE = colorWithOpacity(GhostexPalette.ACCENT, 55);
const GRABBER = colorWithOpacity(GhostexPalette.FOREGROUND, 34);

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    overflow: 'hidden',
    borderRadius: GhostexRadii.section,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: GhostexPalette.BORDER,
    backgroundColor: GhostexPalette.TERMINAL_BACKGROUND,
  },
  dropTarget: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: GhostexPalette.ACCENT,
  },
  bar: {
    height: PANE_TITLE_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GhostexPalette.CARD,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GhostexPalette.BORDER,
  },
  barActive: {
    backgroundColor: ACTIVE_BAR,
    borderBottomColor: ACTIVE_LINE,
  },
  barCollapsed: {
    borderBottomWidth: 0,
  },
  barButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flexShrink: 1,
    minWidth: 0,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 8,
  },
  titleText: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  titleActive: {
    fontWeight: '700',
  },
  fill: {
    flex: 1,
    alignSelf: 'stretch',
  },
  body: {
    position: 'absolute',
    top: PANE_TITLE_HEIGHT,
    overflow: 'hidden',
  },
  dropLabel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 24,
    alignItems: 'center',
  },
  dropLabelText: {
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: GhostexPalette.ACCENT,
    color: GhostexPalette.ACCENT_FOREGROUND,
    fontSize: 14,
    fontWeight: '700',
  },
  ghost: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 13,
    borderRadius: GhostexRadii.section,
    backgroundColor: GhostexPalette.CARD_ACTIVE,
    shadowColor: '#000000',
    shadowOpacity: 0.6,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 24 },
  },
  ghostOver: {
    borderWidth: 2,
    borderColor: GhostexPalette.ACCENT,
  },
  divider: {
    position: 'absolute',
  },
  handle: {
    position: 'absolute',
    width: PANE_HANDLE_SIZE,
    height: PANE_HANDLE_SIZE,
    borderRadius: PANE_HANDLE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: GRABBER,
  },
  grabberAcross: {
    width: 5,
    height: 36,
    borderRadius: 3,
    backgroundColor: GRABBER,
  },
  grabberDragging: {
    backgroundColor: GhostexPalette.ACCENT,
  },
  shares: {
    position: 'absolute',
    left: '50%',
    marginLeft: 36,
    top: -11,
  },
  sharesAcross: {
    position: 'absolute',
    top: '50%',
    marginTop: 36,
    left: -60,
    width: 132,
    alignItems: 'center',
  },
  sharesText: {
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: GhostexPalette.ACCENT,
    color: GhostexPalette.ACCENT_FOREGROUND,
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
