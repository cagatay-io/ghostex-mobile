/**
 * The chat's short-lived toast ("Copied", a link's error), shown at the top of the screen that holds
 * it: the session chat (`NativeChatScreen.tsx`) and the voice screen, whose copied lines say so the
 * same way. It floats over the transcript on a frosted surface (opaque with Reduce Transparency on);
 * an error leads with the tone cards' rose alert mark, its words in the calm text colours.
 *
 * CDXC:Dictate 2026-11-13 DECISION: User: "make all of the other errors also look nice", and no black or near-black fills on glass. Supersedes the toast's #1f1f1f fill and its whole-red error text.
 */

import { BlurView } from 'expo-blur';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { useReduceTransparency } from '../../components/common/reduceTransparency';
import { errorHue } from './cards/ErrorLine';
import { Glyph } from './cards/icons';
import { useTranscriptTheme } from './transcript/theme';

/** One toast; a new `id` shows it again even with the same words. One with an `action` (the
 * Inbox's Undo) shows its button at its end and stays `durationMs`. */
export type Toast = {
  id: number;
  title?: string;
  message: string;
  error: boolean;
  action?: { label: string; onPress: () => void };
  durationMs?: number;
} | null;

/** A short-lived toast at the top of the chat. */
export function ChatToast({ toast }: { toast: Toast }) {
  const theme = useTranscriptTheme();
  const opaque = useReduceTransparency();
  const opacity = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState<Toast>(null);
  useEffect(() => {
    if (toast === null) return undefined;
    setShown(toast);
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setShown(null));
    }, toast.durationMs ?? 2600);
    return () => clearTimeout(timer);
  }, [opacity, toast]);
  if (shown === null) return null;
  const action = shown.action;
  return (
    <Animated.View
      pointerEvents={action === undefined ? 'none' : 'box-none'}
      style={[styles.toastRow, { opacity }]}
      accessibilityLiveRegion="polite"
    >
      <View
        style={[
          styles.toast,
          {
            backgroundColor: opaque
              ? theme.light
                ? '#ffffff'
                : '#2a2a2c'
              : theme.light
                ? 'rgba(255,255,255,0.72)'
                : 'rgba(64,64,68,0.55)',
            borderColor: theme.light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)',
          },
        ]}
      >
        {opaque ? null : (
          <BlurView
            tint={theme.light ? 'light' : 'dark'}
            intensity={60}
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, styles.frost]}
          />
        )}
        {shown.error ? (
          <View style={styles.mark}>
            <Glyph name="alert-circle" size={15} color={errorHue(theme.light)} />
          </View>
        ) : null}
        <View style={styles.words}>
          {shown.title !== undefined ? (
            <Text style={[styles.toastTitle, { color: theme.foreground }]}>{shown.title}</Text>
          ) : null}
          <Text
            style={[
              styles.toastText,
              { color: shown.title === undefined ? theme.foreground : theme.cardMuted },
            ]}
          >
            {shown.message}
          </Text>
        </View>
        {action !== undefined ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => {
              action.onPress();
              setShown(null);
            }}
            style={({ pressed }) => [
              styles.action,
              { backgroundColor: pressed ? theme.neutralFillPressed : theme.neutralFill },
            ]}
          >
            <Text style={[styles.actionText, { color: theme.foreground }]}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toastRow: { position: 'absolute', top: 8, left: 16, right: 16, alignItems: 'center' },
  toast: {
    maxWidth: 420,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    overflow: 'hidden',
  },
  frost: { borderRadius: 14 },
  mark: { paddingTop: 1.5 },
  words: { flexShrink: 1, gap: 2 },
  toastTitle: { fontSize: 13, fontWeight: '600' },
  toastText: { fontSize: 13, lineHeight: 18 },
  action: { marginVertical: -3, paddingHorizontal: 11, paddingVertical: 4, borderRadius: 7 },
  actionText: { fontSize: 13, fontWeight: '600' },
});
