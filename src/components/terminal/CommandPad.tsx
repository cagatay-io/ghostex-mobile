/**
 * The Befehlspad over the terminal, in its approved form: a round toggle
 * in the bottom right corner, and while it is open the 3x3 field of the user's nine keys above it with the four
 * function buttons on an arc around the field's upper left corner: Keys and Agent (the layers in the keyboard's
 * place), the text editor, and the keyboard. The pad stays open until the toggle is tapped again; it floats with
 * and without the software keyboard and takes no room from the terminal. Armed modifiers show as a chip beside
 * the toggle. Opening fades and grows the pad out of the toggle, at once with Reduce Motion on.
 *
 * Moving it: holding the toggle for 0.3 s picks the whole pad up (toggle, field, ring);
 * it follows the finger and, let go, snaps to the nearer side edge at the released height inside the allowed area
 * (`padPlacementAt`), at once with Reduce Motion on (also when that is turned on during the snap). Only a drag
 * stores a new place: a hold let go without one (the finger never more than 10 pt from where it went down) puts
 * the pad back where it stood, so a place that only a cover pushed it to never becomes its resting place. A
 * shorter tap still opens and closes it. VoiceOver gets the same through the toggle's actions "Move to the left
 * side" and "Move to the right side". On the left edge the pad is drawn mirrored: the toggle at that edge, the ring
 * and the modifier chip on the field's other side; the field keeps its order, so every arrow still points its way.
 * Where the terminal area is too short for the open pad, it is drawn reaching over the header (`reach`).
 */

import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
  type GestureResponderEvent,
} from 'react-native';
import { BlurView } from 'expo-blur';

import { CommandPadCopy } from '../../copy';
import type { CommandPadPlacement } from '../../settings/commandPad';
import type { ExtraKeyModifier } from '../../settings/extraKeys';
import { CommandPadPalette, GhostexPalette } from '../../theme/palette';
import { useReduceMotion } from '../common/reduceMotion';
import { useReduceTransparency } from '../common/reduceTransparency';
import CommandPadKeyFace from './CommandPadKeyFace';
import type { CommandPadLayerKind } from './CommandPadLayer';
import {
  DEFAULT_PAD_PLACEMENT,
  PAD_CHIP_OFFSET,
  PAD_FIELD_OFFSET,
  PAD_KEY,
  PAD_KEY_GAP,
  PAD_MARGIN,
  PAD_RING_BUTTON,
  PAD_RING_OFFSETS,
  PAD_TOGGLE,
  padAnchor,
  padPlacementAt,
  padToggleLeft,
  type PadAnchor,
  type PadArea,
  type PadOffset,
} from './commandPadLayout';
import type { CommandPadKey } from './commandPadKeys';
import { AgentSparkIcon, HashIcon, KeyboardDismissIcon, KeyboardIcon, PadIcon, PencilIcon } from './icons';
import { pressFromTouch, TerminalKeyInput, type ModifierState, type PadUpload } from './terminalKeyInput';

/** Holding a modifier this long locks it (the key bar's value). */
const MODIFIER_LONG_PRESS_MS = 450;
/** Holding the toggle this long picks the pad up to move it (about 0.3 s: long enough not to be a tap). */
const PAD_MOVE_HOLD_MS = 300;
/**
 * How far a lifted pad's finger may stray from where it went down and still count as held, not dragged: the
 * distance Pressability allows a held finger before it gives up the long press (its 10 pt default).
 */
const PAD_DRAG_MIN_DISTANCE = 10;
const OPEN_MOTION_MS = 140;
const PAD_KEY_RADIUS = 16;
const MODIFIER_ORDER: readonly ExtraKeyModifier[] = ['ctrl', 'alt', 'shift'];
/** The toggle's accessibility actions besides activating it. */
const MOVE_ACTIONS = [
  { name: 'moveLeft', label: CommandPadCopy.moveLeft },
  { name: 'moveRight', label: CommandPadCopy.moveRight },
];

export type CommandPadProps = {
  open: boolean;
  onToggle: () => void;
  keys: readonly CommandPadKey[];
  input: TerminalKeyInput;
  modifiers: ModifierState;
  upload: PadUpload & { uploading: boolean };
  /** Where the toggle stands in the terminal area (`padAnchor` of the user's place). */
  anchor: PadAnchor;
  /**
   * The pad's room once measured (the terminal area within the window's safe area across); a drag needs it to find
   * the place it snaps to.
   */
  area: PadArea | null;
  /** How far the pad's room reaches above the terminal area, over the header (0 when it fits in the area). */
  reach: number;
  /** How much of the area's bottom is covered (keyboard, text editor, layer); the pad stays above it. */
  cover: number;
  /** The user's place in this layout (undefined: the default); the accessibility moves keep its height. */
  placement: CommandPadPlacement | undefined;
  /** Stores a new place. */
  onMove: (placement: CommandPadPlacement) => void;
  layer: CommandPadLayerKind | null;
  onLayer: (layer: CommandPadLayerKind) => void;
  /** The session's agent has hotkeys (otherwise the Agent button is unavailable). */
  agentAvailable: boolean;
  editorOpen: boolean;
  onEditor: () => void;
  keyboardVisible: boolean;
  onKeyboard: () => void;
};

function CommandPad({
  open,
  onToggle,
  keys,
  input,
  modifiers,
  upload,
  anchor,
  area,
  reach,
  cover,
  placement,
  onMove,
  layer,
  onLayer,
  agentAvailable,
  editorOpen,
  onEditor,
  keyboardVisible,
  onKeyboard,
}: CommandPadProps) {
  const reduceMotion = useReduceMotion();
  // Frosted glass as in the approved mockup; opaque with Reduce Transparency on.
  const opaque = useReduceTransparency();
  // One value and its interpolation for the pad's life: nothing animated is rebuilt per render.
  const [{ reveal, scale }] = useState(() => {
    const value = new Animated.Value(1);
    return { reveal: value, scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) };
  });
  useEffect(() => {
    if (!open || reduceMotion) {
      reveal.setValue(1);
      return;
    }
    reveal.setValue(0);
    const motion = Animated.timing(reveal, {
      toValue: 1,
      duration: OPEN_MOTION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    motion.start();
    return () => motion.stop();
  }, [open, reduceMotion, reveal]);

  // The whole pad's offset from its anchor: the finger's while it is lifted, then the snap back to zero.
  const [{ drag, dragTransform }] = useState(() => {
    const value = new Animated.ValueXY({ x: 0, y: 0 });
    return { drag: value, dragTransform: value.getTranslateTransform() };
  });
  const [lifted, setLifted] = useState(false);
  const gesture = useRef<{ startX: number; startY: number; dx: number; dy: number; dragged: boolean } | null>(null);
  // Where a dropped pad's toggle was let go (its left and bottom edge in the area), until its new anchor is rendered;
  // the snap starts there.
  const released = useRef<{ left: number; bottom: number } | null>(null);

  // Before paint, with the new anchor: the pad stays where the finger let it go and snaps from there.
  useLayoutEffect(() => {
    const at = released.current;
    if (at === null || area === null) return;
    released.current = null;
    springHome(
      drag,
      { x: at.left - padToggleLeft(anchor.side, area.width), y: anchor.bottom - at.bottom },
      reduceMotion,
    );
  }, [anchor, area, drag, reduceMotion]);

  // Reduce Motion turned on while the pad springs home: it stands there at once, as Reduce Motion asks of every
  // motion, also one already running. A lifted pad stays under the finger; its drop places it at once.
  useEffect(() => {
    if (!reduceMotion || gesture.current !== null) return;
    drag.stopAnimation();
    drag.setValue({ x: 0, y: 0 });
  }, [drag, reduceMotion]);

  const pickUp = (event: GestureResponderEvent): void => {
    drag.stopAnimation();
    drag.setValue({ x: 0, y: 0 });
    released.current = null;
    gesture.current = {
      startX: event.nativeEvent.pageX,
      startY: event.nativeEvent.pageY,
      dx: 0,
      dy: 0,
      dragged: false,
    };
    setLifted(true);
    input.pickUpFeedback();
  };

  const follow = (event: GestureResponderEvent): void => {
    const current = gesture.current;
    if (current === null) return;
    current.dx = event.nativeEvent.pageX - current.startX;
    current.dy = event.nativeEvent.pageY - current.startY;
    drag.setValue({ x: current.dx, y: current.dy });
    if (Math.hypot(current.dx, current.dy) > PAD_DRAG_MIN_DISTANCE) current.dragged = true;
  };

  const drop = (): void => {
    const current = gesture.current;
    if (current === null) return;
    gesture.current = null;
    setLifted(false);
    input.selectionFeedback();
    const from = { x: current.dx, y: current.dy };
    if (area === null || !current.dragged) {
      // Not measured yet (nowhere to snap to), or held without a drag: back to where it was, nothing stored.
      springHome(drag, from, reduceMotion);
      return;
    }
    const at = { left: padToggleLeft(anchor.side, area.width) + current.dx, bottom: anchor.bottom - current.dy };
    const next = padPlacementAt({ side: anchor.side, ...at }, area, cover);
    const target = padAnchor(next, area, cover);
    onMove(next);
    if (target.side === anchor.side && target.bottom === anchor.bottom) springHome(drag, from, reduceMotion);
    else released.current = at;
  };

  const moveBy = (event: AccessibilityActionEvent): void => {
    const { actionName } = event.nativeEvent;
    if (actionName !== 'moveLeft' && actionName !== 'moveRight') return;
    const height = (placement ?? DEFAULT_PAD_PLACEMENT).height;
    onMove({ side: actionName === 'moveLeft' ? 'left' : 'right', height });
  };

  const ring: {
    key: string;
    label: string;
    selected: boolean;
    disabled?: boolean;
    icon: ReactNode;
    onPress: () => void;
  }[] = [
    {
      key: 'keys',
      label: CommandPadCopy.keysLayer,
      selected: layer === 'keys',
      icon: <HashIcon size={18} color={layer === 'keys' ? GhostexPalette.ACCENT : GhostexPalette.FOREGROUND} />,
      onPress: () => onLayer('keys'),
    },
    {
      key: 'agent',
      label: CommandPadCopy.agentLayer,
      selected: layer === 'agent',
      disabled: !agentAvailable,
      icon: (
        <AgentSparkIcon
          size={18}
          color={
            layer === 'agent'
              ? GhostexPalette.ACCENT
              : !agentAvailable && opaque
                ? CommandPadPalette.FACE_DISABLED
                : GhostexPalette.FOREGROUND
          }
        />
      ),
      onPress: () => onLayer('agent'),
    },
    {
      key: 'editor',
      label: CommandPadCopy.editor,
      selected: editorOpen,
      icon: <PencilIcon size={18} color={editorOpen ? GhostexPalette.ACCENT : GhostexPalette.FOREGROUND} />,
      onPress: onEditor,
    },
    {
      key: 'keyboard',
      label: keyboardVisible ? CommandPadCopy.hideKeyboard : CommandPadCopy.showKeyboard,
      selected: false,
      icon: keyboardVisible ? (
        <KeyboardDismissIcon size={18} color={GhostexPalette.FOREGROUND} />
      ) : (
        <KeyboardIcon size={18} color={GhostexPalette.FOREGROUND} />
      ),
      onPress: onKeyboard,
    },
  ];
  const armed = MODIFIER_ORDER.filter((modifier) => modifiers[modifier] !== 'off');

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { transform: dragTransform }]} pointerEvents="box-none">
      {open ? (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            styles.reveal,
            // Grow out of the toggle's corner, wherever the pad is (its room reaches `reach` above the area).
            area !== null && {
              transformOrigin: [
                anchor.side === 'left' ? PAD_MARGIN : area.width - PAD_MARGIN,
                area.height + reach - anchor.bottom,
                0,
              ],
            },
            { opacity: reveal, transform: [{ scale }] },
          ]}
          pointerEvents="box-none"
        >
          <View style={[styles.field, placeAt(anchor, PAD_FIELD_OFFSET)]}>
            {keys.map((padKey, position) => (
              <PadKey
                // Positions are fixed; the same key may sit in two of them.
                key={position}
                padKey={padKey}
                input={input}
                modifiers={modifiers}
                upload={upload}
                opaque={opaque}
              />
            ))}
          </View>
          {ring.map((button, index) => (
            <Pressable
              key={button.key}
              accessibilityRole="button"
              accessibilityLabel={button.label}
              accessibilityState={{ selected: button.selected, disabled: button.disabled === true }}
              disabled={button.disabled}
              style={({ pressed }) => [
                styles.ringButton,
                placeAt(anchor, PAD_RING_OFFSETS[index]),
                button.selected && styles.active,
                opaque && styles.opaque,
                pressed && (opaque ? styles.opaquePressed : styles.pressed),
                // Opaque (Reduce Transparency): the backplate stays solid and only the icon dims.
                button.disabled === true && !opaque && styles.disabled,
              ]}
              onPress={button.onPress}
            >
              <Frost radius={PAD_RING_BUTTON / 2} opaque={opaque} />
              {button.icon}
            </Pressable>
          ))}
        </Animated.View>
      ) : null}
      {armed.length > 0 ? (
        <View accessibilityLiveRegion="polite" style={[styles.chips, placeAt(anchor, PAD_CHIP_OFFSET)]}>
          {armed.map((modifier) => {
            const name = CommandPadCopy.modifierNames[modifier];
            const locked = modifiers[modifier] === 'locked';
            return (
              <Text key={modifier} style={[styles.chip, locked ? styles.chipLocked : styles.chipOneShot]}>
                {locked ? CommandPadCopy.modifierLocked(name) : name}
              </Text>
            );
          })}
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={CommandPadCopy.toggle}
        accessibilityState={{ expanded: open }}
        accessibilityActions={MOVE_ACTIONS}
        onAccessibilityAction={moveBy}
        delayLongPress={PAD_MOVE_HOLD_MS}
        // Lifted, the finger may go anywhere without cancelling the drag.
        pressRetentionOffset={lifted ? Number.POSITIVE_INFINITY : undefined}
        style={({ pressed }) => [
          styles.toggle,
          placeAt(anchor, AT_TOGGLE),
          open && styles.active,
          opaque && styles.opaque,
          pressed && (opaque ? styles.opaquePressed : styles.pressed),
          lifted && styles.lifted,
        ]}
        onPress={onToggle}
        onLongPress={pickUp}
        onPressMove={follow}
        onPressOut={drop}
      >
        <Frost radius={PAD_TOGGLE / 2} opaque={opaque} />
        <PadIcon size={20} color={open ? GhostexPalette.ACCENT : GhostexPalette.FOREGROUND} />
      </Pressable>
    </Animated.View>
  );
}

/** Re-renders only when its own inputs change, not with every terminal screen update. */
export default memo(CommandPad);

/** The toggle's own place among the offsets. */
const AT_TOGGLE: PadOffset = { right: 0, bottom: 0 };

/**
 * Where a control `offset` from the toggle at `anchor` is drawn: measured from the side edge the pad stands at, so
 * on the left edge everything beside the toggle lies mirrored, towards the area's middle.
 */
function placeAt(
  anchor: PadAnchor,
  offset: PadOffset,
): { left: number; bottom: number } | { right: number; bottom: number } {
  const inset = PAD_MARGIN + offset.right;
  const bottom = anchor.bottom + offset.bottom;
  return anchor.side === 'left' ? { left: inset, bottom } : { right: inset, bottom };
}

/** Springs the pad home from `from` (its offset from its anchor); with Reduce Motion it is placed at once. */
function springHome(drag: Animated.ValueXY, from: { x: number; y: number }, reduceMotion: boolean): void {
  if (reduceMotion) {
    drag.setValue({ x: 0, y: 0 });
    return;
  }
  drag.setValue(from);
  Animated.spring(drag, { toValue: { x: 0, y: 0 }, stiffness: 300, damping: 30, useNativeDriver: false }).start();
}

/** Intensity of the blur behind the glass (the mockup's `blur(12px)` under a light fill). */
const FROST_INTENSITY = 30;

/** The blurred output behind a glass control, clipped to its shape; nothing with Reduce Transparency on. */
function Frost({ radius, opaque }: { radius: number; opaque: boolean }) {
  if (opaque) return null;
  return (
    <BlurView
      tint="dark"
      intensity={FROST_INTENSITY}
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}
    />
  );
}

type PadKeyProps = {
  padKey: CommandPadKey;
  input: TerminalKeyInput;
  modifiers: ModifierState;
  upload: PadUpload & { uploading: boolean };
  opaque: boolean;
};

/**
 * One position. A key sends on touch-down (and repeats while held when it repeats); text, agent
 * hotkeys, Paste, Upload and modifier taps act on release; a held modifier locks.
 */
function PadKey({ padKey, input, modifiers, upload, opaque }: PadKeyProps) {
  const { action } = padKey;
  const enabled = TerminalKeyInput.isPadKeyEnabled(padKey, upload);
  const modifierMode = action.kind === 'modifier' ? modifiers[action.modifier] : 'off';
  const busy = action.kind === 'upload' && upload.uploading;
  // Disabled with Reduce Transparency on: the solid backplate stays and only the face dims.
  const glyphColor =
    !enabled && opaque
      ? CommandPadPalette.FACE_DISABLED
      : modifierMode === 'off'
        ? GhostexPalette.FOREGROUND
        : '#FFFFFF';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={padKey.label}
      accessibilityHint={action.kind === 'modifier' ? CommandPadCopy.modifierHint : undefined}
      accessibilityState={{ disabled: !enabled, busy, selected: modifierMode !== 'off' }}
      disabled={!enabled}
      delayLongPress={MODIFIER_LONG_PRESS_MS}
      style={({ pressed }) => [
        styles.key,
        opaque && styles.opaque,
        padKey.glyph === 'enter' && (opaque ? styles.opaqueStrong : styles.keyStrong),
        modifierMode === 'oneShot' && styles.modifierOneShot,
        modifierMode === 'locked' && styles.modifierLocked,
        pressed && (opaque ? styles.opaquePressed : styles.pressed),
        !enabled && !opaque && styles.disabled,
      ]}
      onPressIn={() => input.padKeyDown(padKey)}
      onPressOut={() => input.stopRepeat()}
      onPress={(event) => input.padKeyTap(padKey, upload, pressFromTouch(event))}
      onLongPress={action.kind === 'modifier' ? () => input.padKeyLongPress(padKey) : undefined}
    >
      {modifierMode === 'off' ? <Frost radius={PAD_KEY_RADIUS} opaque={opaque} /> : null}
      <CommandPadKeyFace padKey={padKey} color={glyphColor} size={20} busy={busy} />
    </Pressable>
  );
}

const glass = {
  backgroundColor: CommandPadPalette.GLASS,
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: CommandPadPalette.GLASS_LINE,
  boxShadow: '0px 6px 18px rgba(0, 0, 0, 0.3)',
} as const;

const styles = StyleSheet.create({
  // Grow out of the toggle's corner (before the terminal area is measured: the area's corner, near it).
  reveal: {
    transformOrigin: 'bottom right',
  },
  field: {
    position: 'absolute',
    width: 3 * PAD_KEY + 2 * PAD_KEY_GAP,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: PAD_KEY_GAP,
  },
  key: {
    ...glass,
    width: PAD_KEY,
    height: PAD_KEY,
    borderRadius: PAD_KEY_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyStrong: {
    backgroundColor: CommandPadPalette.GLASS_STRONG,
  },
  modifierOneShot: {
    backgroundColor: CommandPadPalette.MODIFIER_ONE_SHOT,
    borderColor: 'transparent',
  },
  modifierLocked: {
    backgroundColor: CommandPadPalette.MODIFIER_LOCKED,
    borderColor: CommandPadPalette.MODIFIER_LOCKED_LINE,
  },
  ringButton: {
    ...glass,
    position: 'absolute',
    width: PAD_RING_BUTTON,
    height: PAD_RING_BUTTON,
    borderRadius: PAD_RING_BUTTON / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggle: {
    ...glass,
    position: 'absolute',
    width: PAD_TOGGLE,
    height: PAD_TOGGLE,
    borderRadius: PAD_TOGGLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  active: {
    backgroundColor: CommandPadPalette.ACTIVE_FILL,
    borderColor: GhostexPalette.ACCENT,
  },
  pressed: {
    backgroundColor: CommandPadPalette.GLASS_PRESSED,
    transform: [{ scale: 0.94 }],
  },
  opaque: {
    backgroundColor: CommandPadPalette.GLASS_OPAQUE,
  },
  opaqueStrong: {
    backgroundColor: CommandPadPalette.GLASS_OPAQUE_STRONG,
  },
  opaquePressed: {
    backgroundColor: CommandPadPalette.GLASS_OPAQUE_PRESSED,
    transform: [{ scale: 0.94 }],
  },
  // Picked up to move: a little larger, edged in the accent.
  lifted: {
    borderColor: GhostexPalette.ACCENT,
    transform: [{ scale: 1.12 }],
  },
  disabled: {
    opacity: 0.4,
  },
  chips: {
    position: 'absolute',
    flexDirection: 'row',
    gap: 6,
  },
  chip: {
    height: 22,
    lineHeight: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    overflow: 'hidden',
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  chipOneShot: {
    backgroundColor: CommandPadPalette.MODIFIER_ONE_SHOT,
  },
  chipLocked: {
    backgroundColor: CommandPadPalette.MODIFIER_LOCKED,
    borderWidth: 1,
    borderColor: CommandPadPalette.MODIFIER_LOCKED_LINE,
  },
});
