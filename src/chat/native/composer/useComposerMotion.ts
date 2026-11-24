/**
 * The chat box's motion, desktop's `apps/desktop/src/app/native_chat/composer_animation.rs`.
 *
 * The card tweens its height whenever its content changes shape (a collapse, an expansion, the
 * field growing a line, a queue or attachment strip arriving): the content keeps its natural
 * height and the card clips it while the height walks there. An interrupted tween continues from
 * the value on screen. A collapse closes the card over the expanded content first and switches to
 * the one-line row when it lands; an expansion switches at once and opens the card over the
 * expanded content, cross-fading the expanded footer and compact inline controls smoothly from
 * the animated height.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

/** `packages/gx-chat-core/visual/composer-animation.json`. */
const MOTION = {
  durationMs: 240,
  minDeltaPx: 0.5,
  arrivalTranslateYPx: 4,
};
const EASING = Easing.bezier(0.22, 0.61, 0.36, 1);

function smoothstep(t: number): number {
  'worklet';
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * CDXC:SessionChat 2026-09-28 DECISION: User: the collapsed composer shows one line of the draft or placeholder, and the text is never faded; the line animates into place instead. A collapse closes the card over the expanded content, so the lines below the first slide out of view under its edge, and the one-line row takes over when the card lands. An expansion opens the card over the expanded content, revealing them.
 * CDXC:SessionChat 2026-09-28 SEE-ALSO: `apps/desktop/src/app/native_chat/composer_animation.rs` runs the same sequence in the GPUI chat.
 *
 * `requested` is the core's `composerCollapsed`; `collapsed` is the shape to draw, which trails a
 * collapse until the card has closed. `border` is the border width on the animated view itself
 * (`0` when the outer card owns the border around the strip and body); `collapsedEstimate` is the
 * collapsed height before the first collapse measured it.
 */
export function useComposerMotion(requested: boolean, border: number, collapsedEstimate: number) {
  const reduceMotion = useReducedMotion();
  const [collapsed, setCollapsed] = useState(requested);
  const [showCompactOverlay, setShowCompactOverlay] = useState(false);
  const shown = useRef(collapsed);
  shown.current = collapsed;
  const height = useSharedValue(-1);
  const shapeTransition = useSharedValue(0);
  const expandedNatural = useSharedValue(-1);
  const collapsedNatural = useSharedValue(-1);
  const measured = useRef(false);
  const target = useRef(-1);
  const natural = useRef({ expanded: -1, collapsed: -1 });
  const closing = useRef(false);
  const generation = useRef(0);

  const finishClose = useCallback((gen: number) => {
    if (generation.current !== gen) return;
    closing.current = false;
    setShowCompactOverlay(false);
    setCollapsed(true);
  }, []);

  const finishExpand = useCallback((gen: number) => {
    if (generation.current !== gen) return;
    setShowCompactOverlay(false);
  }, []);

  const walkTo = useCallback(
    (value: number, options?: { shape?: boolean; closeGen?: number; expandGen?: number }) => {
      target.current = value;
      const shape = options?.shape === true;
      let duration = MOTION.durationMs;
      if (shape) {
        const col = natural.current.collapsed > 0 ? natural.current.collapsed : collapsedEstimate;
        const full = Math.max(0, natural.current.expanded - col);
        const current = height.value >= 0 ? height.value : value;
        if (full > 1) {
          const ratio = Math.max(0, Math.min(1, Math.abs(value - current) / full));
          duration = MOTION.durationMs * Math.max(0.5, Math.min(1, Math.sqrt(ratio)));
        }
      }
      const closeGen = options?.closeGen;
      const expandGen = options?.expandGen;
      height.value = withTiming(value, { duration, easing: EASING }, (finished) => {
        'worklet';
        if (!finished) return;
        if (shape) {
          shapeTransition.value = 0;
        }
        if (closeGen !== undefined) {
          runOnJS(finishClose)(closeGen);
        } else if (expandGen !== undefined) {
          runOnJS(finishExpand)(expandGen);
        }
      });
    },
    [collapsedEstimate, finishClose, finishExpand, height, shapeTransition],
  );

  useEffect(() => {
    if (requested === collapsed) {
      // Reversed before the card closed: it opens again over the same content.
      if (closing.current) {
        closing.current = false;
        const gen = ++generation.current;
        shapeTransition.value = 1;
        setShowCompactOverlay(true);
        walkTo(natural.current.expanded, { shape: true, expandGen: gen });
      }
      return;
    }
    if (!requested) {
      const gen = ++generation.current;
      if (!reduceMotion && measured.current) {
        shapeTransition.value = 1;
        setShowCompactOverlay(true);
        if (natural.current.expanded > 0) {
          walkTo(natural.current.expanded, { shape: true, expandGen: gen });
        }
      } else {
        shapeTransition.value = 0;
        setShowCompactOverlay(false);
      }
      setCollapsed(false);
      return;
    }
    // The first layout of a chat has nothing to move from.
    if (reduceMotion || !measured.current) {
      shapeTransition.value = 0;
      setShowCompactOverlay(false);
      setCollapsed(true);
      return;
    }
    closing.current = true;
    const gen = ++generation.current;
    shapeTransition.value = 1;
    setShowCompactOverlay(true);
    walkTo(natural.current.collapsed > 0 ? natural.current.collapsed : collapsedEstimate, {
      shape: true,
      closeGen: gen,
    });
  }, [collapsed, collapsedEstimate, reduceMotion, requested, shapeTransition, walkTo]);

  const onContentLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const next = event.nativeEvent.layout.height + border * 2;
      if (shown.current) {
        natural.current.collapsed = next;
        collapsedNatural.value = next;
      } else {
        natural.current.expanded = next;
        expandedNatural.value = next;
      }
      // The expanded content stays under a closing card; only the row it lands on is measured anew.
      if (closing.current) return;
      if (Math.abs(next - target.current) < MOTION.minDeltaPx) return;
      if (!measured.current || reduceMotion) {
        measured.current = true;
        target.current = next;
        shapeTransition.value = 0;
        setShowCompactOverlay(false);
        cancelAnimation(height);
        height.value = next;
        return;
      }
      const inShape = shapeTransition.value === 1;
      walkTo(next, inShape ? { shape: true, expandGen: generation.current } : undefined);
    },
    [border, collapsedNatural, expandedNatural, height, reduceMotion, shapeTransition, walkTo],
  );

  const cardStyle = useAnimatedStyle(() => (height.value < 0 ? {} : { height: height.value }));
  const controlsStyle = useAnimatedStyle(() => {
    if (shapeTransition.value !== 1 || height.value < 0) {
      return { opacity: 1, transform: [{ translateY: 0 }] };
    }
    const hCol = collapsedNatural.value > 0 ? collapsedNatural.value : collapsedEstimate;
    const hExp = Math.max(expandedNatural.value, hCol + 1);
    const collapseProgress = Math.max(0, Math.min(1, (hExp - height.value) / (hExp - hCol)));
    const opacity = smoothstep(1 - collapseProgress / 0.45);
    return {
      opacity,
      transform: [{ translateY: MOTION.arrivalTranslateYPx * (1 - opacity) }],
    };
  });
  const compactControlsStyle = useAnimatedStyle(() => {
    if (shapeTransition.value !== 1 || height.value < 0) {
      return { opacity: 0 };
    }
    const hCol = collapsedNatural.value > 0 ? collapsedNatural.value : collapsedEstimate;
    const hExp = Math.max(expandedNatural.value, hCol + 1);
    const collapseProgress = Math.max(0, Math.min(1, (hExp - height.value) / (hExp - hCol)));
    return {
      opacity: smoothstep((collapseProgress - 0.6) / 0.4),
    };
  });

  return { collapsed, showCompactOverlay, onContentLayout, cardStyle, controlsStyle, compactControlsStyle };
}
