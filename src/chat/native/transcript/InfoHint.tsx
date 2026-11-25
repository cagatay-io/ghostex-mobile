/**
 * The small (i) that shows a hint in a bubble on a tap (a hover tooltip on the computer). Out of QuestionForm.tsx so the
 * chat's menu rows (composer/MenuSheet.tsx) and the Switch to Native pill can use it without an import cycle.
 */

import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View, type StyleProp, type ViewInstance, type ViewStyle } from 'react-native';

import { useLaptopFold } from '../../../components/common/verticalBar/laptopFold';
import { Glyph } from './icons';
import { useTranscriptTheme } from './theme';

const HINT_WIDTH = 236;

/**
 * A small (i) icon that shows `hint` in a bubble above it on a tap; a tap anywhere else closes it. Half folded like
 * a laptop a bubble that would reach into the fold's band from below it stands under the icon instead (hints keep
 * off the knick, as menus and sheets do).
 *
 * CDXC:SessionChat 2026-10-24 DECISION: User: "remove the text about skipped (add i icon there for that)". The footer's sentence wrapped into five lines beside the buttons on the phone, so the icon takes its place and the sentence shows on a tap (a hover tooltip on the computer, desktop `ask_info_hint` in ask_card.rs). Skip all and Send answers keep their size and place.
 */
export function InfoHint({
  hint,
  style,
  size = 17,
  color,
}: {
  hint: string;
  style?: StyleProp<ViewStyle>;
  /** The glyph's size (the Switch to Native pill's is 13). */
  size?: number;
  color?: string;
}) {
  // Rendered both in transcript forms and in NoticeCard (outside TranscriptEnvProvider), so read the theme directly.
  const theme = useTranscriptTheme();
  const icon = useRef<ViewInstance>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [bubbleHeight, setBubbleHeight] = useState<number | null>(null);
  const screen = useWindowDimensions();
  const fold = useLaptopFold();
  const close = () => {
    setAnchor(null);
    setBubbleHeight(null);
  };
  const left =
    anchor === null ? 0 : Math.max(12, Math.min(anchor.x + anchor.width / 2 - 24, screen.width - HINT_WIDTH - 12));
  const underIcon =
    anchor !== null &&
    fold !== null &&
    bubbleHeight !== null &&
    anchor.y - 8 > fold.top &&
    anchor.y - 8 - bubbleHeight < fold.bottom;
  return (
    <>
      <Pressable
        ref={icon}
        collapsable={false}
        accessibilityRole="button"
        accessibilityLabel={hint}
        hitSlop={12}
        onPress={() => icon.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }))}
        style={[styles.info, style]}
      >
        <Glyph name="info-circle" size={size} color={color ?? theme.muted} />
      </Pressable>
      {anchor === null ? null : (
        <Modal visible transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close the hint" />
          <View
            pointerEvents="none"
            onLayout={(event) => setBubbleHeight(event.nativeEvent.layout.height)}
            style={[
              styles.bubble,
              {
                left,
                ...(underIcon ? { top: anchor.y + anchor.height + 8 } : { bottom: screen.height - anchor.y + 8 }),
                backgroundColor: theme.light ? '#fefefe' : '#1d1d1d',
                borderColor: theme.light ? '#e5e5e5' : 'rgba(255,255,255,0.1)',
              },
            ]}
          >
            <Text style={[styles.bubbleText, { color: theme.foreground }]}>{hint}</Text>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  info: { alignSelf: 'flex-start', width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  bubble: {
    position: 'absolute',
    width: HINT_WIDTH,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  bubbleText: { fontSize: 13, lineHeight: 18 },
});
