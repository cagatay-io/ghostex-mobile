/**
 * The Befehlspad over the terminal (REQ-KEY-001, -003, -007, -010; approved form D-034, D-037): a round toggle
 * in the bottom right corner, and while it is open the 3x3 field of the user's nine keys above it with the four
 * function buttons on an arc around the field's upper left corner: Keys and Agent (the layers in the keyboard's
 * place), the text editor, and the keyboard. The pad stays open until the toggle is tapped again; it floats with
 * and without the software keyboard and takes no room from the terminal. Armed modifiers show as a chip beside
 * the toggle. Opening fades and grows the pad out of the toggle, at once with Reduce Motion on.
 */

import { memo, useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';

import { CommandPadCopy } from '../../copy';
import type { ExtraKeyModifier } from '../../settings/extraKeys';
import { CommandPadPalette, GhostexPalette } from '../../theme/palette';
import { useReduceMotion } from '../common/reduceMotion';
import { useReduceTransparency } from '../common/reduceTransparency';
import CommandPadKeyFace from './CommandPadKeyFace';
import type { CommandPadLayerKind } from './CommandPadLayer';
import {
  PAD_CHIP_OFFSET,
  PAD_FIELD_OFFSET,
  PAD_KEY,
  PAD_KEY_GAP,
  PAD_MARGIN,
  PAD_RING_BUTTON,
  PAD_RING_OFFSETS,
  PAD_TOGGLE,
} from './commandPadLayout';
import type { CommandPadKey } from './commandPadKeys';
import { AgentSparkIcon, HashIcon, KeyboardDismissIcon, KeyboardIcon, PadIcon, PencilIcon } from './icons';
import { pressFromTouch, TerminalKeyInput, type ModifierState, type PadUpload } from './terminalKeyInput';

/** Holding a modifier this long locks it (the key bar's value). */
const MODIFIER_LONG_PRESS_MS = 450;
const OPEN_MOTION_MS = 140;
const PAD_KEY_RADIUS = 16;
const MODIFIER_ORDER: readonly ExtraKeyModifier[] = ['ctrl', 'alt', 'shift'];

export type CommandPadProps = {
  open: boolean;
  onToggle: () => void;
  keys: readonly CommandPadKey[];
  input: TerminalKeyInput;
  modifiers: ModifierState;
  upload: PadUpload & { uploading: boolean };
  /** The toggle's bottom edge above the terminal area's bottom (`padAnchorBottom`). */
  bottom: number;
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
  bottom,
  layer,
  onLayer,
  agentAvailable,
  editorOpen,
  onEditor,
  keyboardVisible,
  onKeyboard,
}: CommandPadProps) {
  const reduceMotion = useReduceMotion();
  // Frosted glass as in the approved mockup (owner D-062); opaque with Reduce Transparency on.
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
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {open ? (
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.reveal, { opacity: reveal, transform: [{ scale }] }]}
          pointerEvents="box-none"
        >
          <View
            style={[
              styles.field,
              { right: PAD_MARGIN + PAD_FIELD_OFFSET.right, bottom: bottom + PAD_FIELD_OFFSET.bottom },
            ]}
          >
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
                {
                  right: PAD_MARGIN + PAD_RING_OFFSETS[index].right,
                  bottom: bottom + PAD_RING_OFFSETS[index].bottom,
                },
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
        <View
          accessibilityLiveRegion="polite"
          style={[styles.chips, { right: PAD_MARGIN + PAD_CHIP_OFFSET.right, bottom: bottom + PAD_CHIP_OFFSET.bottom }]}
        >
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
        style={({ pressed }) => [
          styles.toggle,
          { right: PAD_MARGIN, bottom },
          open && styles.active,
          opaque && styles.opaque,
          pressed && (opaque ? styles.opaquePressed : styles.pressed),
        ]}
        onPress={onToggle}
      >
        <Frost radius={PAD_TOGGLE / 2} opaque={opaque} />
        <PadIcon size={20} color={open ? GhostexPalette.ACCENT : GhostexPalette.FOREGROUND} />
      </Pressable>
    </View>
  );
}

/** Re-renders only when its own inputs change, not with every terminal screen update. */
export default memo(CommandPad);

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
 * One position. A key sends on touch-down (and repeats while held when it repeats, REQ-KEY-008); text, agent
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
  // Grow out of the toggle's corner.
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
