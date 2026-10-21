/**
 * The full-size image preview over the whole chat. Port of desktop `image_viewer/` (React's
 * `session-chat-image-viewer.tsx`): the picture fitted to the screen, pinch or double tap to zoom,
 * a tap outside it closes, next / previous across the message's pictures, and Copy path / Copy
 * image with a tick once done. Desktop's Save image goes through the app shell's Downloads
 * writer, which the phone does not have, so it is not offered.
 */

import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withDecay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RustChat } from '../../rust/useRustChat';
import { Glyph, type GlyphName } from './icons';
import { ImageUnavailable } from './ImageUnavailable';
import { themedStyles, useTranscriptTheme } from '../transcript/theme';
import { useChatImage, type ChatImageFailure } from './useChatImage';
import { useChatOverlayStore } from './overlayStore';

export function ImageViewer({ chat }: { chat: RustChat }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const viewer = useChatOverlayStore((state) => state.imageViewer);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [completed, setCompleted] = useState<string | null>(null);
  /** The zoom: scale and offset of the picture's centre from the stage's centre, in stage points. */
  const scale = useSharedValue(1);
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const stageWidth = useSharedValue(0);
  const stageHeight = useSharedValue(0);
  const start = useSharedValue({ scale: 1, x: 0, y: 0, focalX: 0, focalY: 0 });
  const zoomStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offsetX.value }, { translateY: offsetY.value }, { scale: scale.value }],
  }));
  const image = viewer === null ? null : (viewer.images[viewer.index] ?? null);
  const source = useChatImage(chat, image);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  /**
   * The picture failed to draw: only the `<Image>` that shows it decides that, never a separate
   * size probe.
   *
   * CDXC:SessionChat 2026-10-15 WHY:
   * `Image.getSize` on Android reads the size through Fresco's encoded-image metadata, a different
   * path from the decode `<Image>` does, and it rejected a valid 1080x2520 phone JPEG the composer
   * thumbnail drew fine, so a picture the phone had just attached opened as "damaged". The size now
   * comes from the `<Image>`'s own `onLoad`, and a draw failure says the phone cannot show the
   * picture rather than calling the file damaged, because nothing here has read its bytes.
   */
  const [broken, setBroken] = useState(false);
  const uri = source.status === 'ready' && !broken ? source.uri : null;
  const readyUri = source.status === 'ready' ? source.uri : null;

  useEffect(() => {
    setCompleted(null);
    scale.value = 1;
    offsetX.value = 0;
    offsetY.value = 0;
    setNatural(null);
    setBroken(false);
  }, [readyUri]);

  if (viewer === null || image === null) return null;
  const close = () => useChatOverlayStore.setState({ imageViewer: null });
  const step = (delta: number) => {
    const count = viewer.images.length;
    useChatOverlayStore.setState({
      imageViewer: { images: viewer.images, index: (viewer.index + delta + count) % count },
    });
  };
  const frameWidth = width - 32;
  const frameHeight = height - insets.top - insets.bottom - 120;
  const fitted = fit(natural, frameWidth, frameHeight);
  const failure: ChatImageFailure | null =
    source.status === 'unavailable' ? source.failure : broken ? { reason: 'unsupported', error: '' } : null;
  const copyPath = failure === null && typeof image.copyPath === 'string' ? image.copyPath : '';
  const base64 = uri !== null && uri.startsWith('data:') ? uri.slice(uri.indexOf(',') + 1) : null;

  /**
   * CDXC:SessionChat 2026-10-21 WHY:
   * The zoom used to be a `ScrollView` with `maximumZoomScale` and `scrollResponderZoomTo`, which only
   * iOS implements: on Android pinch did nothing and a double tap threw "zoomToRect is not
   * implemented" and crashed the app. Pinch, pan and double tap are now gesture-handler gestures on a
   * surface covering the stage, driving a reanimated transform, the same on both platforms. The
   * surface also takes the tap outside the picture that closes the viewer, because it sits over the
   * backdrop.
   */
  const maxOffset = (s: number) => {
    'worklet';
    return {
      x: Math.max(0, (fitted.width * s - stageWidth.value) / 2),
      y: Math.max(0, (fitted.height * s - stageHeight.value) / 2),
    };
  };
  const clamp = (value: number, limit: number) => {
    'worklet';
    return Math.min(limit, Math.max(-limit, value));
  };
  const insidePicture = (x: number, y: number) => {
    'worklet';
    const dx = x - stageWidth.value / 2 - offsetX.value;
    const dy = y - stageHeight.value / 2 - offsetY.value;
    return Math.abs(dx) <= (fitted.width * scale.value) / 2 && Math.abs(dy) <= (fitted.height * scale.value) / 2;
  };
  const pinch = Gesture.Pinch()
    .onStart((event) => {
      start.value = {
        scale: scale.value,
        x: offsetX.value,
        y: offsetY.value,
        focalX: event.focalX,
        focalY: event.focalY,
      };
    })
    .onUpdate((event) => {
      const from = start.value;
      const next = Math.min(MAX_ZOOM, Math.max(1, from.scale * event.scale));
      // Keep the point of the picture that was under the fingers under them as they move.
      const pointX = (from.focalX - stageWidth.value / 2 - from.x) / from.scale;
      const pointY = (from.focalY - stageHeight.value / 2 - from.y) / from.scale;
      const limit = maxOffset(next);
      scale.value = next;
      offsetX.value = clamp(event.focalX - stageWidth.value / 2 - next * pointX, limit.x);
      offsetY.value = clamp(event.focalY - stageHeight.value / 2 - next * pointY, limit.y);
    });
  const pan = Gesture.Pan()
    .maxPointers(1)
    .onStart(() => {
      start.value = { ...start.value, x: offsetX.value, y: offsetY.value };
    })
    .onUpdate((event) => {
      const limit = maxOffset(scale.value);
      offsetX.value = clamp(start.value.x + event.translationX, limit.x);
      offsetY.value = clamp(start.value.y + event.translationY, limit.y);
    })
    .onEnd((event) => {
      const limit = maxOffset(scale.value);
      if (limit.x > 0) offsetX.value = withDecay({ velocity: event.velocityX, clamp: [-limit.x, limit.x] });
      if (limit.y > 0) offsetY.value = withDecay({ velocity: event.velocityY, clamp: [-limit.y, limit.y] });
    });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((event, success) => {
      if (!success) return;
      if (scale.value > 1.01) {
        scale.value = withTiming(1);
        offsetX.value = withTiming(0);
        offsetY.value = withTiming(0);
        return;
      }
      if (!insidePicture(event.x, event.y)) return;
      // Zoom in around the tapped point.
      const limit = maxOffset(DOUBLE_TAP_ZOOM);
      const pointX = event.x - stageWidth.value / 2 - offsetX.value;
      const pointY = event.y - stageHeight.value / 2 - offsetY.value;
      scale.value = withTiming(DOUBLE_TAP_ZOOM);
      offsetX.value = withTiming(clamp(offsetX.value - (DOUBLE_TAP_ZOOM - 1) * pointX, limit.x));
      offsetY.value = withTiming(clamp(offsetY.value - (DOUBLE_TAP_ZOOM - 1) * pointY, limit.y));
    });
  const tapOutside = Gesture.Tap().onEnd((event, success) => {
    if (success && !insidePicture(event.x, event.y)) runOnJS(close)();
  });
  const gestures = Gesture.Simultaneous(pinch, pan, doubleTap, tapOutside);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      {/* A Modal is its own native root on Android, so its gestures need their own root view. */}
      <GestureHandlerRootView style={styles.backdrop}>
        <Pressable accessibilityLabel="Close image preview" style={StyleSheet.absoluteFill} onPress={close} />
        <View style={[styles.toolbar, { top: insets.top + 8 }]}>
          {viewer.images.length > 1 ? (
            <Text style={styles.counter}>{`${viewer.index + 1} / ${viewer.images.length}`}</Text>
          ) : null}
          <View style={styles.toolbarSpacer} />
          <View style={styles.actions}>
            {copyPath.length > 0 ? (
              <ToolbarButton
                label="Copy path"
                icon={completed === 'Path copied' ? 'check' : 'copy'}
                onPress={() => {
                  void Clipboard.setStringAsync(copyPath).then(() => setCompleted('Path copied'));
                }}
              />
            ) : null}
            {base64 !== null ? (
              <ToolbarButton
                label="Copy image"
                icon={completed === 'Image copied' ? 'check' : 'photo'}
                onPress={() => {
                  void Clipboard.setImageAsync(base64).then(() => setCompleted('Image copied'));
                }}
              />
            ) : null}
            <ToolbarButton label="Close" icon="x" onPress={close} />
          </View>
        </View>
        <View style={styles.stage} pointerEvents="box-none">
          {uri === null ? (
            failure !== null ? (
              <View style={styles.unavailable} pointerEvents="box-none">
                <ImageUnavailable
                  image={image}
                  failure={failure}
                  copied={completed === 'Path copied'}
                  onCopied={() => setCompleted('Path copied')}
                />
              </View>
            ) : (
              <ActivityIndicator color={P.muted} />
            )
          ) : (
            <GestureDetector gesture={gestures}>
              <View
                collapsable={false}
                accessible
                accessibilityLabel={image.alt || image.label || 'Image'}
                style={[StyleSheet.absoluteFill, styles.zoomSurface]}
                onLayout={(event) => {
                  stageWidth.value = event.nativeEvent.layout.width;
                  stageHeight.value = event.nativeEvent.layout.height;
                }}
              >
                <Animated.View pointerEvents="none" style={zoomStyle}>
                  <Image
                    source={{ uri }}
                    style={{ width: fitted.width, height: fitted.height }}
                    resizeMode="contain"
                    onLoad={(event) => {
                      const { width: w, height: h } = event.nativeEvent.source;
                      if (w > 0 && h > 0 && (natural?.width !== w || natural?.height !== h))
                        setNatural({ width: w, height: h });
                    }}
                    onError={() => setBroken(true)}
                  />
                </Animated.View>
              </View>
            </GestureDetector>
          )}
        </View>
        {viewer.images.length > 1 ? (
          <View style={[styles.stepRow, { bottom: insets.bottom + 16 }]} pointerEvents="box-none">
            <ToolbarButton label="Previous image" icon="chevron-left" onPress={() => step(-1)} />
            <ToolbarButton label="Next image" icon="chevron-right" onPress={() => step(1)} />
          </View>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

const MAX_ZOOM = 4;
const DOUBLE_TAP_ZOOM = 2.5;

/** The picture's size inside the frame at its own aspect ratio, never enlarged past its pixels. */
function fit(natural: { width: number; height: number } | null, maxWidth: number, maxHeight: number) {
  if (natural === null || natural.width <= 0 || natural.height <= 0) return { width: maxWidth, height: maxHeight };
  const scale = Math.min(1, maxWidth / natural.width, maxHeight / natural.height);
  return { width: natural.width * scale, height: natural.height * scale };
}

function ToolbarButton({ label, icon, onPress }: { label: string; icon: GlyphName; onPress: () => void }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.toolbarButton, pressed && { backgroundColor: P.input }]}
    >
      <Glyph name={icon} size={16} color={P.primary} />
    </Pressable>
  );
}

const useStyles = themedStyles((P) => ({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.86)',
  },
  toolbar: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  toolbarSpacer: {
    flex: 1,
  },
  counter: {
    color: P.muted,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  actions: {
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: P.border,
    backgroundColor: P.background,
  },
  toolbarButton: {
    width: 40,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomSurface: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  unavailable: {
    width: '100%',
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  stepRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
  },
}));
