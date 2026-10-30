/**
 * A short message at the bottom of a file screen that fades in and out on its own: a copied path, a page's
 * notes, a failure (the Docs viewer and the project file browser). Each new `notice` (a new `id`) shows anew. A
 * `lasting` notice (a file being fetched for Share…) stays until the next notice replaces it or `null` clears it.
 * With the system's Reduce Motion on (followed live, FL-A11Y-05) a notice appears and leaves at once, without a fade.
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { GhostexPalette } from '../../theme/palette';
import { useReduceMotion } from './reduceMotion';

export type Notice = { id: number; title?: string; message: string; error: boolean; lasting?: boolean };

/** How long a notice stays before it fades out. */
const NOTICE_SHOWN_MS = 3200;

export default function NoticeToast({ notice, bottom }: { notice: Notice | null; bottom: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState<Notice | null>(null);
  const reduceMotion = useReduceMotion();
  // Read when a notice comes or goes, so switching the setting does not show the current notice again.
  const reduceMotionRef = useRef(reduceMotion);
  reduceMotionRef.current = reduceMotion;
  useEffect(() => {
    // Only a fade that ran to its end hides the toast: one stopped by the next notice leaves that notice shown.
    const hide = () => {
      if (reduceMotionRef.current) {
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
    if (reduceMotionRef.current) {
      opacity.stopAnimation();
      opacity.setValue(1);
    } else {
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    }
    if (notice.lasting === true) return undefined;
    // The notice's reading time, then it leaves.
    const timer = setTimeout(hide, NOTICE_SHOWN_MS);
    return () => clearTimeout(timer);
  }, [notice, opacity]);
  if (shown === null) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.toastRow, { bottom, opacity }]} accessibilityLiveRegion="polite">
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
