/**
 * Drag-to-close for a bottom sheet's grabber. Spread `grabber` on the strip around the grabber and add
 * `offset` to the panel's vertical position. The panel follows the finger down (never up); let go at
 * least `GRABBER_CLOSE_DISTANCE` below where it started, or while flicking down at
 * `GRABBER_CLOSE_VELOCITY` or faster, and the sheet's `onClose` runs; otherwise the panel springs back.
 * Only the grabber strip takes the gesture, so lists inside the sheet keep scrolling.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder } from 'react-native';

/** How far the grabber must be dragged down before letting go closes the sheet. */
export const GRABBER_CLOSE_DISTANCE = 80;
/** How fast (pt per ms) a downward flick must still be moving when let go to close the sheet. */
export const GRABBER_CLOSE_VELOCITY = 0.5;
/**
 * The strip's touch area reaches this far above the panel, so with the sheets' 20–26 pt strips it is at
 * least 44 pt tall (the platform's smallest touch target) without changing the layout.
 */
const GRABBER_HIT_SLOP = { top: 24 };
/** A touch that moves less than this is a tap, not a drag. */
const TAP_SLOP = 10;

function springBack(offset: Animated.Value) {
  Animated.spring(offset, { toValue: 0, overshootClamping: true, useNativeDriver: true }).start();
}

export function useGrabberDrag(visible: boolean, onClose: () => void) {
  const offset = useRef(new Animated.Value(0)).current;
  const latestOnClose = useRef(onClose);
  latestOnClose.current = onClose;
  // Whether the touch began above the panel, where the touch area lies over the backdrop.
  const startedAbovePanel = useRef(false);
  // Set when a gesture asked to close; the render it causes shows whether the sheet's owner closed it.
  const [closeAsked, setCloseAsked] = useState(false);

  const grabber = useMemo(
    () => ({
      hitSlop: GRABBER_HIT_SLOP,
      ...PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event) => {
          startedAbovePanel.current = event.nativeEvent.locationY < 0;
        },
        onPanResponderMove: (_, gesture) => offset.setValue(Math.max(0, gesture.dy)),
        onPanResponderRelease: (_, { dx, dy, vy }) => {
          const flicked = dy > 0 && vy >= GRABBER_CLOSE_VELOCITY;
          // Above the panel a tap is still the backdrop's tap, which closes the sheet.
          const tappedBackdrop = startedAbovePanel.current && Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP;
          if (dy < GRABBER_CLOSE_DISTANCE && !flicked && !tappedBackdrop) {
            springBack(offset);
            return;
          }
          // The panel stays where the finger left it while the sheet closes from there.
          setCloseAsked(true);
          latestOnClose.current();
        },
        onPanResponderTerminate: () => springBack(offset),
      }).panHandlers,
    }),
    [offset],
  );

  useEffect(() => {
    if (!closeAsked) return;
    setCloseAsked(false);
    // The owner keeps the sheet open (it is busy), so the panel goes back into place.
    if (visible) springBack(offset);
  }, [closeAsked, visible, offset]);

  useEffect(() => {
    // A sheet opening again starts with its panel in place.
    if (visible) offset.setValue(0);
  }, [visible, offset]);

  return { offset, grabber };
}
