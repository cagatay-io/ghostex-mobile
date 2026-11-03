/**
 * A Befehlspad layer in the software keyboard's place (cross and ring stay
 * where they are while a layer takes the keyboard's place, like iOS switching keyboards):
 * - Keys: "Extra keys", the user's two rows of the extra-keys layout (built-in keys with repeat on hold,
 *   Ctrl/Alt/Shift one-shot or locked, custom actions), and "More keys", the former KEYS page (terminal hotkeys,
 *   Insert, Delete, PgUp, PgDn); "Pad settings" opens Settings > Keyboard (show/hide, key vibration).
 * - Agent: the hotkeys of the session's agent (Codex, Claude Code, Pi), sent as their sequences.
 * Page keys and agent hotkeys send on release and explain themselves while held, in the hint line, as the key
 * bar's pages did. Sections stand side by side where the panel is wide enough (the iPhone Duo unfolded in
 * landscape) and one under the other elsewhere. A layer that stands in for the open pad (it leaves the open pad no
 * room above it, even over the header) has its own close button at the head's end, a 44 pt target.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CommandPadCopy } from '../../copy';
import { AGENT_NAMES, useAgentHotkeysStore, type ConfigurableAgentId } from '../../settings/agentHotkeys';
import { resolveExtraKeysLayout, useExtraKeysStore, type ResolvedExtraKey } from '../../settings/extraKeys';
import { CommandPadPalette, GhostexPalette } from '../../theme/palette';
import { ArrowIcon, CloseIcon, GearIcon, ReturnIcon } from './icons';
import { agentKeyPage, EXTRA_KEYS_PAGE, type KeyPageItem } from './keyBarPages';
import { pressFromTouch, type ModifierState, type TerminalKeyInput } from './terminalKeyInput';

export type CommandPadLayerKind = 'keys' | 'agent';

const MODIFIER_LONG_PRESS_MS = 450;
const HINT_LONG_PRESS_MS = 350;
const HINT_TIMEOUT_MS = 3500;

export type CommandPadLayerProps = {
  kind: CommandPadLayerKind;
  input: TerminalKeyInput;
  modifiers: ModifierState;
  /** Resolved agent id of the shown session (`''` / `'terminal'` when none). */
  agentId: string;
  onOpenSettings: () => void;
  /**
   * The keyboard's last height in this window: the layer takes exactly that frame, so cross and ring stay where
   * they stood, and its keys scroll when they need more; its own height while none is known.
   */
  height?: number;
  /** Space kept free at the bottom (the home indicator on iOS). */
  bottomInset: number;
  onHeightChange: (height: number) => void;
  /**
   * Given only while the layer stands in for the open pad because the two do not fit together: its own close
   * button, since the pad's ring is not shown then. Without it the layer closes from the ring as always.
   */
  onClose?: () => void;
};

export default function CommandPadLayer({
  kind,
  input,
  modifiers,
  agentId,
  onOpenSettings,
  height,
  bottomInset,
  onHeightChange,
  onClose,
}: CommandPadLayerProps) {
  const layout = useExtraKeysStore((state) => state.layout);
  const profiles = useAgentHotkeysStore((state) => state.profiles);
  const extraRows = useMemo(() => resolveExtraKeysLayout(layout), [layout]);
  const agentRows = useMemo(() => agentKeyPage(agentId, profiles), [agentId, profiles]);
  const [hint, setHint] = useState<{ itemId: string; text: string } | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showHint = useCallback((itemId: string, text: string): void => {
    clearTimeout(hintTimer.current ?? undefined);
    setHint({ itemId, text });
    hintTimer.current = setTimeout(() => setHint(null), HINT_TIMEOUT_MS);
  }, []);
  useEffect(() => () => clearTimeout(hintTimer.current ?? undefined), []);
  // Gone, it covers nothing any more.
  useEffect(() => () => onHeightChange(0), [onHeightChange]);

  const renderExtraKey = (item: ResolvedExtraKey) => {
    if (item.kind === 'modifier') {
      const mode = modifiers[item.modifier];
      return (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          accessibilityHint={CommandPadCopy.modifierHint}
          accessibilityState={{ selected: mode !== 'off' }}
          delayLongPress={MODIFIER_LONG_PRESS_MS}
          style={({ pressed }) => [
            styles.pill,
            pressed && styles.pillPressed,
            mode === 'oneShot' && styles.pillOneShot,
            mode === 'locked' && styles.pillLocked,
          ]}
          onPress={() => input.toggleModifier(item.modifier, false)}
          onLongPress={() => input.toggleModifier(item.modifier, true)}
        >
          <Text style={[styles.pillLabel, mode !== 'off' && styles.pillLabelActive]} numberOfLines={1}>
            {item.label}
          </Text>
        </Pressable>
      );
    }
    if (item.kind === 'text') {
      return (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
          onPress={() => input.insertText(item.text, item.sendEnter)}
        >
          <Text style={styles.pillLabel} numberOfLines={1}>
            {item.label}
          </Text>
        </Pressable>
      );
    }
    return (
      <Pressable
        key={item.id}
        accessibilityRole="button"
        accessibilityLabel={item.returnGlyph === true ? CommandPadCopy.newLine : item.label}
        style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
        onPressIn={() => input.pressKey(item.key, item.mods, item.repeatable === true)}
        onPressOut={() => input.stopRepeat()}
        // A touch sent on touch-down; an activation without one (VoiceOver, Switch Control) sends here, once.
        onPress={(event) => {
          if (!pressFromTouch(event)) input.pressKey(item.key, item.mods, false);
        }}
      >
        {item.arrow !== undefined ? (
          <ArrowIcon direction={item.arrow} size={14} color={GhostexPalette.MUTED} />
        ) : item.returnGlyph === true ? (
          <ReturnIcon size={15} color={GhostexPalette.MUTED} />
        ) : (
          <Text style={styles.pillLabel} numberOfLines={1}>
            {item.label}
          </Text>
        )}
      </Pressable>
    );
  };

  /** Page keys and agent hotkeys send on release; the hold belongs to the hint, so they do not repeat. */
  const renderPageKey = (item: KeyPageItem) => (
    <Pressable
      key={item.id}
      accessibilityRole="button"
      accessibilityLabel={item.description}
      accessibilityHint={CommandPadCopy.holdHint}
      delayLongPress={HINT_LONG_PRESS_MS}
      style={({ pressed }) => [styles.pill, (pressed || hint?.itemId === item.id) && styles.pillHeld]}
      onPress={() => {
        if (item.kind === 'sequence') input.sendSequence(item.steps);
        else if (item.kind === 'key') input.pressKey(item.key, item.mods, false);
      }}
      onLongPress={() => showHint(item.id, `${item.label}: ${item.description}`)}
    >
      <Text style={styles.pillLabel} numberOfLines={1}>
        {item.label}
      </Text>
    </Pressable>
  );

  const title =
    kind === 'keys'
      ? CommandPadCopy.keysLayer
      : (AGENT_NAMES[agentId as ConfigurableAgentId] ?? CommandPadCopy.agentLayer);

  return (
    <View
      style={[styles.panel, { height, paddingBottom: bottomInset + 8 }]}
      onLayout={(event) => onHeightChange(event.nativeEvent.layout.height)}
    >
      <View style={styles.head}>
        <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.hint, hint === null && styles.hintIdle]}
          numberOfLines={1}
        >
          {hint?.text ?? CommandPadCopy.holdHintIdle}
        </Text>
        {kind === 'keys' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={CommandPadCopy.padSettings}
            style={({ pressed }) => [styles.settings, pressed && styles.pillPressed]}
            onPress={onOpenSettings}
          >
            <GearIcon size={14} color={GhostexPalette.MUTED} strokeWidth={1.8} />
            <Text style={styles.settingsLabel}>{CommandPadCopy.padSettings}</Text>
          </Pressable>
        ) : null}
        {onClose !== undefined ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={CommandPadCopy.closeLayer}
            accessibilityHint={CommandPadCopy.closeLayerHint}
            style={styles.close}
            onPress={onClose}
          >
            {({ pressed }) => (
              <View style={[styles.closeFace, pressed && styles.pillPressed]}>
                <CloseIcon size={14} color={GhostexPalette.MUTED} strokeWidth={1.8} />
              </View>
            )}
          </Pressable>
        ) : null}
      </View>
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} bounces={false}>
        {kind === 'keys' ? (
          <View style={styles.sections}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{CommandPadCopy.extraKeys}</Text>
              {extraRows.map((row, index) => (
                <View key={`extra-${index}`} style={styles.row}>
                  {row.map(renderExtraKey)}
                </View>
              ))}
            </View>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{CommandPadCopy.moreKeys}</Text>
              {EXTRA_KEYS_PAGE.map((row, index) => (
                <View key={`more-${index}`} style={styles.row}>
                  {row.map(renderPageKey)}
                </View>
              ))}
            </View>
          </View>
        ) : (
          (agentRows ?? []).map((row, index) => (
            <View key={`agent-${index}`} style={styles.row}>
              {row.map(renderPageKey)}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: CommandPadPalette.LAYER_PANEL,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 10,
    paddingHorizontal: 12,
    gap: 6,
  },
  // Takes what the frame leaves below the head and scrolls the rest; without a frame, its content's height.
  body: {
    flexGrow: 0,
    flexShrink: 1,
  },
  bodyContent: {
    gap: 6,
  },
  head: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: GhostexPalette.MUTED,
  },
  hint: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    lineHeight: 16,
    color: GhostexPalette.FOREGROUND,
  },
  hintIdle: {
    color: GhostexPalette.MUTED,
    opacity: 0.6,
  },
  settings: {
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: CommandPadPalette.CHIP_FILL,
  },
  settingsLabel: {
    fontSize: 12,
    color: GhostexPalette.MUTED,
  },
  // A 44 pt target whose extra height lies over the panel's top padding and the gap below the head, so the head
  // keeps its height and the keys keep their room; the face matches the Pad settings chip.
  close: {
    width: 44,
    height: 44,
    marginTop: -10,
    marginBottom: -6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeFace: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CommandPadPalette.CHIP_FILL,
  },
  // Side by side once two sections of seven pills fit with their labels whole.
  sections: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 16,
    rowGap: 6,
  },
  section: {
    flexGrow: 1,
    flexBasis: 380,
    gap: 6,
  },
  sectionTitle: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: GhostexPalette.MUTED,
  },
  row: {
    flexDirection: 'row',
    gap: 4,
  },
  pill: {
    flex: 1,
    minWidth: 0,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    backgroundColor: CommandPadPalette.PILL,
    borderWidth: 1,
    borderColor: CommandPadPalette.PILL_LINE,
  },
  pillPressed: {
    backgroundColor: CommandPadPalette.PILL_PRESSED,
  },
  pillHeld: {
    backgroundColor: CommandPadPalette.PILL_HELD,
  },
  pillOneShot: {
    backgroundColor: CommandPadPalette.MODIFIER_ONE_SHOT,
    borderColor: 'transparent',
  },
  pillLocked: {
    backgroundColor: CommandPadPalette.MODIFIER_LOCKED,
    borderColor: CommandPadPalette.MODIFIER_LOCKED_LINE,
  },
  pillLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    color: GhostexPalette.MUTED,
  },
  pillLabelActive: {
    color: '#FFFFFF',
  },
});
