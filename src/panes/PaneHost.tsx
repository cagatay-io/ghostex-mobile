/**
 * The pane host: two panes in the pane container (the area below the terminal screen's header), the divider between
 * them and their title bars. Where they stand is `paneGeometry`'s; what they show is the caller's (`renderContent`).
 *
 * - Each pane has a title bar: the grip, the type icon and title (a tap opens the pane type menu, which sets what the
 *   pane shows; on a session pane beside another its checked Session opens the chooser there, to switch the session),
 *   the close button; a session pane showing its chat view has the chat's icon and is named a chat. The
 *   pane tapped last is active: its title bar in the accent colour; the other's grey.
 * - Dragging a pane by its title bar (the grip is part of it) onto the other slot swaps the two. While the finger
 *   moves, a copy of the title bar follows it and the other pane shows where a release swaps; the panes themselves
 *   stay put, so their terminals are never moved or remounted (a terminal can be in one place only). While the
 *   chooser is one of the two, neither moves (the chooser is a picker, never stored): no grip, no drag, the grip's
 *   space kept.
 * - Dragging the divider handle resizes both panes, 25-75 %; the handle is there only while the keyboard is down. The
 *   drag follows the finger at most once per frame, and a pane's body is drawn again only when what it is given
 *   changes (`PaneBody`): a terminal its size, which it gets when the finger lets go (each new size measures its grid
 *   again and, row by row, resizes the computer's terminal), any other body nothing of the card's size, which it fills
 *   by layout.
 * - A gesture that starts in a pane's content is never a pane gesture: nothing here takes a touch there, so the
 *   terminal's own selection, scrolling and pinch stay as they are.
 * - Half folded like a book the content may run across the fold, but nothing to touch stands on it: the handle moves
 *   beside the fold, the title bars and the selected session's accessory keep off it, and a body other than a
 *   terminal gets where its own controls keep off it (`PaneFrame.controlInset`).
 * The cards are drawn in the order of what they show, never of their slot: a swap only changes their frames, and
 * their native views keep their place in the view tree.
 */

import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
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
import { ChatBubbleIcon, ChevronDownIcon, CloseIcon, GripIcon } from '../components/terminal/icons';
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
 * how far its own controls stay off its edges to keep off a book fold (`paneGeometry`'s `controlInsets`). `view` and
 * `covered` are a terminal's (during a divider drag those where the drag started): every other body fills its card by
 * layout and is not drawn again when only they change.
 */
export type PaneFrame = { view: PaneSize; covered: number; active: boolean; controlInset: PaneBarInset };

type PaneBodyProps = {
  content: PaneContent;
  frame: PaneFrame;
  renderContent: PaneHostProps['renderContent'];
};

/** Whether a body would draw the same: the frame's size and cover count only for a session's terminal. */
function sameBody(before: PaneBodyProps, after: PaneBodyProps): boolean {
  if (before.content !== after.content || before.renderContent !== after.renderContent) return false;
  const was = before.frame;
  const is = after.frame;
  if (
    was.active !== is.active ||
    was.controlInset.left !== is.controlInset.left ||
    was.controlInset.right !== is.controlInset.right
  ) {
    return false;
  }
  return (
    after.content.kind !== 'session' ||
    (was.view.width === is.view.width && was.view.height === is.view.height && was.covered === is.covered)
  );
}

/** A pane's body, drawn again only when what it reads changes, so a divider drag redraws no more than it resizes. */
const PaneBody = memo(function PaneBody({ content, frame, renderContent }: PaneBodyProps) {
  return renderContent(content, frame);
}, sameBody);

export type PaneHostProps = {
  /** Where the panes stand (`paneGeometry`'s input: the window's shape, the container, the stored divider, the
   * active pane, the keyboard's cover, the editor and the fold). */
  layout: PaneGeometryInput;
  slots: readonly [PaneContent, PaneContent];
  /** The session whose pane shows its chat view (`usePaneHost`): its title bar names it a chat. */
  chatSessionKey: string | null;
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

/** A title bar's drag: its slot and how far the finger has moved it. */
type SwapDrag = { slot: PaneIndex; dx: number; dy: number };
/** What a drag shows apart from where its copy stands: whose title bar it is, and whether it is over the other slot. */
type SwapShown = { slot: PaneIndex; hovering: boolean };

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
  const [swapShown, setSwapShown] = useState<SwapShown | null>(null);
  // The dragged title bar's copy follows the finger by this offset from its card, set per move without drawing the
  // panes again; only crossing into or out of the other slot changes what they show.
  const [swapOffset] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));
  const [menu, setMenu] = useState<{ slot: PaneIndex; anchor: WindowRect } | null>(null);
  const ratio = dragRatio ?? layout.ratio;
  const geometry = paneGeometry({ ...layout, ratio });
  // The terminals' sizes: where the divider stands, or, while it is dragged, where the drag started.
  const terminalGeometry = dragRatio === null ? geometry : paneGeometry(layout);
  const order: PaneIndex[] = contentKey(slots[0]) < contentKey(slots[1]) ? [0, 1] : [1, 0];
  const swappable = slots.every((content) => content.kind !== 'chooser');
  const onSwapDrag = (drag: SwapDrag | null): void => {
    if (drag === null) {
      setSwapShown(null);
      return;
    }
    swapOffset.setValue({ x: drag.dx, y: drag.dy });
    const hovering = overOtherSlot(geometry, drag);
    if (swapShown?.slot !== drag.slot || swapShown.hovering !== hovering) setSwapShown({ slot: drag.slot, hovering });
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {order.map((slot) => (
        <PaneCard
          key={contentKey(slots[slot])}
          slot={slot}
          content={slots[slot]}
          geometry={geometry}
          terminalGeometry={terminalGeometry}
          active={slot === active}
          chat={slots[slot].kind === 'session' && contentKey(slots[slot]) === props.chatSessionKey}
          swappable={swappable}
          dropTarget={swapShown !== null && swapShown.hovering && swapShown.slot !== slot}
          onSwapDrag={onSwapDrag}
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
      {swapShown !== null ? (
        <SwapGhost
          geometry={geometry}
          slot={swapShown.slot}
          offset={swapOffset}
          content={slots[swapShown.slot]}
          hovering={swapShown.hovering}
        />
      ) : null}
      <ContextMenu
        visible={menu !== null}
        title={PanesCopy.typeMenuTitle}
        subtitle={PanesCopy.typeMenuSubtitle}
        items={AVAILABLE_PANE_TYPES.map((definition) => {
          const current = menu !== null && slots[menu.slot].kind === definition.type;
          // A session pane beside another: its own type opens the chooser there (`onSetType`), to switch the session.
          const switchesSession =
            current &&
            definition.type === 'session' &&
            menu !== null &&
            slots[menu.slot === 0 ? 1 : 0].kind === 'session';
          return {
            kind: 'item' as const,
            key: definition.type,
            label: definition.label,
            icon: definition.icon(18, GhostexPalette.FOREGROUND),
            selected: current,
            selectedPresentation: 'check' as const,
            hint: switchesSession ? PanesCopy.switchSessionHint : undefined,
            disabled: menu === null || !props.typeOffered(menu.slot, definition.type),
            onPress: () => {
              setMenu(null);
              if (menu !== null && (!current || switchesSession)) props.onSetType(menu.slot, definition.type);
            },
          };
        })}
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
  /** Where its terminal's size comes from (`PaneHost`: while the divider is dragged, where the drag started). */
  terminalGeometry: PaneGeometry;
  active: boolean;
  /** A session pane showing its chat view: the chat's icon and name in the title bar, the type menu as a session's. */
  chat: boolean;
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
  const typeLabel = props.chat ? PanesCopy.chatType : (typeDefinition?.label ?? PanesCopy.newPane);
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
          {props.chat ? <ChatBubbleIcon size={16} color={tint} /> : typeDefinition?.icon(16, tint)}
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
        <PaneBody
          content={content}
          renderContent={props.renderContent}
          frame={{
            view: props.terminalGeometry.views[slot],
            covered: props.terminalGeometry.covered[slot],
            active,
            controlInset: geometry.controlInsets[slot],
          }}
        />
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

/** The title bar of the pane being dragged, under the finger: its card's place moved by `offset`. */
function SwapGhost({
  geometry,
  slot,
  offset,
  content,
  hovering,
}: {
  geometry: PaneGeometry;
  slot: PaneIndex;
  offset: Animated.ValueXY;
  content: PaneContent;
  hovering: boolean;
}) {
  const title = usePaneTitle(content);
  const card = geometry.cards[slot];
  return (
    <Animated.View
      testID="pane-swap-ghost"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.ghost,
        hovering && styles.ghostOver,
        {
          left: card.x,
          top: card.y,
          width: card.width,
          height: PANE_TITLE_HEIGHT,
          transform: offset.getTranslateTransform(),
        },
      ]}
    >
      <GripIcon size={18} color={GhostexPalette.FOREGROUND} />
      <Text style={[styles.titleText, styles.titleActive, { color: GhostexPalette.ACCENT }]} numberOfLines={1}>
        {title}
      </Text>
    </Animated.View>
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
  // The finger's newest position waits for the next frame: the panes follow it at most once per frame however often
  // the touch reports a move, and the terminals keep their size until the drag ends. Letting go waits for that frame
  // too, so the end of a drag never resizes a second time in a frame that has already resized (`end`: the drag's state
  // is cleared then, and the released position is stored, the terminals sized to it once). Losing the touch ends the
  // drag at that frame without a position (`ratio` null, also over a move still waiting): nothing is stored, the panes
  // show the stored position again and the terminals keep their size.
  const nextFrame = useRef<{ request: number; ratio: number | null; end: boolean } | null>(null);
  const onFrame = (ratio: number | null, end: boolean): void => {
    if (nextFrame.current !== null) {
      nextFrame.current.ratio = ratio;
      nextFrame.current.end = end;
      return;
    }
    const request = requestAnimationFrame(() => {
      const due = nextFrame.current;
      nextFrame.current = null;
      if (due === null) return;
      if (!due.end) {
        if (due.ratio !== null) onDrag(due.ratio);
        return;
      }
      // Stored first, then the drag let go, in one render: the panes stand where the finger left them.
      if (due.ratio !== null) onRatio(due.ratio);
      onDrag(null);
    });
    nextFrame.current = { request, ratio, end };
  };
  // A released position not yet stored when the divider goes away with the panes is stored then.
  const storeRatio = useRef(onRatio);
  useEffect(() => {
    storeRatio.current = onRatio;
  }, [onRatio]);
  useEffect(
    () => () => {
      const due = nextFrame.current;
      if (due === null) return;
      cancelAnimationFrame(due.request);
      nextFrame.current = null;
      if (due.end && due.ratio !== null) storeRatio.current(due.ratio);
    },
    [],
  );
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
            // A drag let go less than a frame ago is stored now; the new one starts where the panes stand.
            const due = nextFrame.current;
            if (due !== null) {
              cancelAnimationFrame(due.request);
              nextFrame.current = null;
              if (due.end && due.ratio !== null) onRatio(due.ratio);
            }
            grab.current = { position: position(event), ratio };
            onDrag(ratio);
          }}
          onResponderMove={(event) => {
            const next = ratioAt(event);
            if (next !== null) onFrame(next, false);
          }}
          onResponderRelease={(event) => {
            const next = ratioAt(event);
            grab.current = null;
            onFrame(next, true);
          }}
          onResponderTerminate={() => {
            grab.current = null;
            onFrame(null, true);
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
