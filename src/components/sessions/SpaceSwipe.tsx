/**
 * A horizontal swipe on the Sessions list switches Space, one at a time, in the Space row's order
 * (SpaceTabs.tsx `spaceRowOrder`): a swipe left shows the next Space, a swipe right the previous
 * one, and at either end nothing happens. The switch is the tile's own tap (`onSelect`), so the
 * row shows it, and the list slides in a little from the side the finger came from.
 *
 * CDXC:Spaces 2026-11-17 DECISION: User: swipe left or right on the sessions list to move between
 * Spaces, one at a time, in the tab row's order; nothing at either end. Vertical scrolling keeps
 * working, so the swipe starts only on a clearly horizontal drag (it activates after 24pt sideways
 * and fails after 16pt vertically, and it switches only past 48pt at under about 27 degrees, or on
 * a sideways flick), and it leaves a 24pt band at each screen edge to the Android back gesture.
 *
 * WHY a gesture-handler Pan rather than a PanResponder: the list's FlatList owns the JS responder
 * while it scrolls, and the rows are Pressables with a long press; a native Pan beside them waits
 * for its offsets before it takes the touch, so a tap, a long press and a vertical scroll never
 * see it. It is the stack SwipeRevealRow.tsx already uses.
 */

import { useRef, type ReactNode } from 'react';
import { useWindowDimensions, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

/** The band at each screen edge left to the system back gesture. */
const EDGE_ZONE = 24;
/** Sideways travel before the swipe takes the touch. */
const ACTIVATE_X = 24;
/** Vertical travel that rules the swipe out before it takes the touch (keeps the start under ~34 degrees). */
const FAIL_Y = 16;
/** Sideways travel that switches Space on release. */
const COMMIT_X = 48;
/** The most vertical drift a committed swipe may have, as a share of its sideways travel (~27 degrees). */
const MAX_SLOPE = 0.5;
/** A sideways flick switches even short of COMMIT_X. */
const FLICK_VELOCITY = 600;
/** How far the list starts aside when it slides in, and how long it takes. */
const SLIDE_DISTANCE = 24;
const SLIDE_MS = 160;

export default function SpaceSwipe({
  order,
  selectedId,
  onSelect,
  enabled,
  style,
  onLayout,
  children,
}: {
  /** Space ids in the row's order. */
  order: readonly string[];
  selectedId: string;
  onSelect: (spaceId: string) => void;
  /** Off where the list has no Space row (no Spaces, the Unified list, an extension's mode). */
  enabled: boolean;
  style?: StyleProp<ViewStyle>;
  onLayout?: (event: LayoutChangeEvent) => void;
  children: ReactNode;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const slide = useSharedValue(0);
  const fromEdge = useSharedValue(false);

  // The latest props, for a release that lands after a re-render.
  const latest = useRef({ order, selectedId, onSelect });
  latest.current = { order, selectedId, onSelect };

  /** Step one Space along the row (+1 next, -1 previous); nothing past either end. */
  const step = (direction: 1 | -1): void => {
    const { order: ids, selectedId: current, onSelect: select } = latest.current;
    const index = ids.indexOf(current);
    const next = index < 0 ? undefined : ids[index + direction];
    if (next === undefined) return;
    select(next);
    // The new Space comes in from the side the finger moved away from.
    slide.value = direction * SLIDE_DISTANCE;
    slide.value = withTiming(0, { duration: SLIDE_MS });
  };

  const pan = usePanGesture({
    enabled: enabled && order.length > 1,
    activeOffsetX: [-ACTIVATE_X, ACTIVATE_X],
    failOffsetY: [-FAIL_Y, FAIL_Y],
    // The detector spans the list, which runs edge to edge; the band at each edge stays the system's.
    hitSlop: { left: -EDGE_ZONE, right: -EDGE_ZONE },
    onBegin: (event) => {
      // And by the screen itself, in case the list is inset from an edge by less than the band.
      fromEdge.value = event.absoluteX < EDGE_ZONE || event.absoluteX > windowWidth - EDGE_ZONE;
    },
    onDeactivate: (event) => {
      if (event.canceled || fromEdge.value) return;
      const dx = event.translationX;
      const dy = event.translationY;
      const horizontal = Math.abs(dy) <= Math.abs(dx) * MAX_SLOPE;
      const far = Math.abs(dx) >= COMMIT_X;
      const flick =
        Math.abs(dx) >= ACTIVATE_X &&
        Math.abs(event.velocityX) >= FLICK_VELOCITY &&
        Math.abs(event.velocityY) <= Math.abs(event.velocityX) * MAX_SLOPE &&
        Math.sign(event.velocityX) === Math.sign(dx);
      if (!horizontal || !(far || flick)) return;
      // A swipe left (finger moving left) shows the next Space.
      runOnJS(step)(dx < 0 ? 1 : -1);
    },
  });

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slide.value }],
    opacity: 1 - (Math.abs(slide.value) / SLIDE_DISTANCE) * 0.4,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[style, slideStyle]} onLayout={onLayout}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
