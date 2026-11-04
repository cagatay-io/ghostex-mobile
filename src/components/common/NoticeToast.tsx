/**
 * A short message at the bottom of a screen that fades in and out on its own: a copied path, a page's
 * notes, or a failure. Each new `notice` (a new `id`) shows anew. A
 * `lasting` notice (a file being fetched for Share…) stays until the next notice replaces it or `null` clears it.
 * With the system's Reduce Motion on (followed live) a notice appears and leaves at once, without a fade.
 */

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, StyleSheet, Text, View } from 'react-native';

import { GhostexPalette } from '../../theme/palette';
import { useReduceMotion } from './reduceMotion';

export type Notice = {
  id: number;
  title?: string;
  message: string;
  error: boolean;
  lasting?: boolean;
  /** Reading time before the shared fade-out; omitted keeps the file screens' duration. */
  durationMs?: number;
  /** An accessible alert, with an explicit iOS announcement where live regions do not apply. */
  announce?: boolean;
};

/** How long a notice stays before it fades out. */
const NOTICE_SHOWN_MS = 3200;

export default function NoticeToast({ notice, bottom }: { notice: Notice | null; bottom: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState<Notice | null>(null);
  const reduceMotion = useReduceMotion();
  // Read when a notice comes or goes, so switching the setting does not show the current notice again.
  const reducesMotion = useEffectEvent(() => reduceMotion);
  useEffect(() => {
    // Only a fade that ran to its end hides the toast: one stopped by the next notice leaves that notice shown.
    const hide = () => {
      if (reducesMotion()) {
        opacity.stopAnimation();
        opacity.setValue(0);
        setShown(null);
        return;
      }
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setShown(null);
      });
    };
    if (notice === null) {
      hide();
      return undefined;
    }
    setShown(notice);
    if (notice.announce === true && Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(
        notice.title === undefined ? notice.message : `${notice.title}. ${notice.message}`,
      );
    }
    if (reducesMotion()) {
      opacity.stopAnimation();
      opacity.setValue(1);
    } else {
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    }
    if (notice.lasting === true) return undefined;
    // The notice's reading time, then it leaves.
    const timer = setTimeout(hide, notice.durationMs ?? NOTICE_SHOWN_MS);
    return () => clearTimeout(timer);
  }, [notice, opacity]);
  if (shown === null) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.toastRow, { bottom, opacity }]}
      accessible={shown.announce === true ? true : undefined}
      accessibilityRole={shown.announce === true ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.toast}>
        {shown.title !== undefined ? <Text style={styles.toastTitle}>{shown.title}</Text> : null}
        <Text style={[styles.toastText, shown.error && styles.toastError]} numberOfLines={3}>
          {shown.message}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toastRow: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: {
    maxWidth: 420,
    borderWidth: 1,
    borderColor: GhostexPalette.BORDER,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 2,
    backgroundColor: '#1f1f1f',
  },
  toastTitle: { color: GhostexPalette.FOREGROUND, fontSize: 13, fontWeight: '600' },
  toastText: { color: GhostexPalette.MUTED, fontSize: 13, lineHeight: 18 },
  toastError: { color: GhostexPalette.DANGER },
});
