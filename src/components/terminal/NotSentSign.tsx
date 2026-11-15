/**
 * The "not sent" sign: a frosted card above the keyboard, beside the command pad's toggle (or, without the pad, beside
 * the round buttons), naming how many keys typed while the terminal's link was replaced went nowhere: Return,
 * Backspace and Esc by name with their own counts, every other key only as a count, never what was typed
 * (notSentKeys.ts). It appears with the first such key, stays once the terminal is attached again and then has a
 * close button; the next key that is sent removes it. Opaque with Reduce Transparency on. VoiceOver reads it as a
 * status and hears it once as it appears.
 */

import { BlurView } from 'expo-blur';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { NotSentCopy } from '../../copy/terminal';
import type { TerminalTab } from '../../terminal/sessions';
import { clearKeysNotSent, useNotSentKeysStore } from '../../terminal/notSentKeys';
import { GhostexPalette } from '../../theme/palette';
import { useAppearance } from '../../theme/useAppearance';
import { useReduceTransparency } from '../common/reduceTransparency';
import { PAD_LEFT_MARGIN, PAD_MARGIN, PAD_TOGGLE } from './commandPadLayout';
import { CloseIcon, WarningTriangleIcon } from './icons';

/** The gap between the card and the toggle or buttons it stands beside. */
const BESIDE_GAP = 12;

export type NotSentSignProps = {
  tab: TerminalTab;
  /** The tab's computer's name, as the sign says it. */
  computer: string | null;
  /** The card's bottom edge above the terminal area's bottom: the toggle's (or the round buttons') bottom edge. */
  bottom: number;
  /** The edge the toggle or the round buttons stand at; the card takes the rest of the width. */
  side: 'left' | 'right';
  /** The card's height while shown, 0 once gone, so "Connecting..." can stand clear of it. */
  onHeight: (height: number) => void;
};

export default function NotSentSign({ tab, computer, bottom, side, onHeight }: NotSentSignProps) {
  const appearance = useAppearance();
  const opaque = useReduceTransparency();
  const counts = useNotSentKeysStore((state) => state.bySession[tab.sessionKey]);
  const shown = counts !== undefined;
  const name = computer ?? NotSentCopy.computerFallback;
  const back = tab.state === 'open';
  const body = back
    ? NotSentCopy.back(name)
    : tab.state === 'opening' || tab.state === 'detached'
      ? NotSentCopy.reconnecting(name)
      : NotSentCopy.waiting;
  const title = counts === undefined ? '' : NotSentCopy.title(counts);
  const label = `${title}. ${body}`;

  // Heard once as it appears (iOS has no live region); a later count change is read when focused.
  const announced = useRef(false);
  useEffect(() => {
    if (!shown) {
      announced.current = false;
      onHeight(0);
      return;
    }
    if (announced.current) return;
    announced.current = true;
    AccessibilityInfo.announceForAccessibility(label);
  }, [shown, label, onHeight]);

  if (counts === undefined) return null;
  const toggleRoom = (side === 'left' ? PAD_LEFT_MARGIN : PAD_MARGIN) + PAD_TOGGLE + BESIDE_GAP;
  const place = side === 'right' ? { left: PAD_MARGIN, right: toggleRoom } : { left: toggleRoom, right: PAD_MARGIN };
  return (
    <View
      style={[
        styles.card,
        place,
        { bottom, borderColor: appearance.border },
        opaque && { backgroundColor: appearance.card },
      ]}
      onLayout={(event: LayoutChangeEvent) => onHeight(event.nativeEvent.layout.height)}
    >
      {opaque ? null : (
        <BlurView
          tint={appearance.light ? 'light' : 'dark'}
          intensity={60}
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.frost]}
        />
      )}
      <View style={styles.content} role="status" accessible accessibilityLabel={label}>
        <WarningTriangleIcon size={18} color={GhostexPalette.DANGER} />
        <View style={styles.words}>
          <Text style={[styles.title, { color: appearance.foreground }]}>{title}</Text>
          <Text style={[styles.body, { color: appearance.muted }]}>{body}</Text>
        </View>
      </View>
      {back ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={NotSentCopy.close}
          style={styles.close}
          onPress={() => clearKeysNotSent(tab.sessionKey)}
        >
          <CloseIcon size={14} color={appearance.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  frost: {
    borderRadius: 14,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 12,
  },
  words: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
  },
  body: {
    fontSize: 12,
    lineHeight: 16,
  },
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
