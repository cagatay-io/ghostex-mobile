/**
 * Sheets and dialogs off the knick while the iPhone Duo is half folded like a laptop: sheets, dialogs and full-screen
 * views that would cross the division are laid out with the laptop pose, as the designs show ("menus and
 * sheets avoid the fold"). The form (the design's fold-free rule): a bottom sheet starts below the fold
 * and its list scrolls inside; a
 * centred card (a dialog, a compact alert, a progress card) stands below the fold when it fits there, otherwise
 * above it. With the keyboard up the keyboard-avoiding layer already keeps them above the fold
 * (`laptopCoverTop`). Nothing changes in any other pose or on any other iPhone: every hook here returns its
 * neutral value without a laptop fold.
 */

import { useCallback, useRef, useState, type RefObject } from 'react';
import { useWindowDimensions, type LayoutChangeEvent, type ViewInstance, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardTop } from './keyboard/keyboardFrame';
import { FOLD_CLEARANCE, foldCardRegion, foldSheetMaxHeight } from './verticalBar/layout';
import { useLaptopFold } from './verticalBar/laptopFold';

/**
 * A bottom sheet's height limit in the laptop pose (see `foldSheetMaxHeight`). `avoidsKeyboard`: the sheet sits in
 * a keyboard-avoiding layer, which lifts it above the fold while the keyboard is up, so no limit then.
 */
export function useFoldSheetMaxHeight({ avoidsKeyboard }: { avoidsKeyboard: boolean }): number | undefined {
  const fold = useLaptopFold();
  const { height } = useWindowDimensions();
  const keyboardUp = useKeyboardTop() !== null;
  return keyboardUp && avoidsKeyboard ? undefined : foldSheetMaxHeight(fold, height);
}

/**
 * Where a full-height sheet card (a viewer that fills the window between its margins) starts in the laptop pose:
 * `FOLD_CLEARANCE` below the fold, so it takes the lower half and its content scrolls inside; null elsewhere.
 */
export function useFoldSheetTop(): number | null {
  const fold = useLaptopFold();
  return fold === null ? null : fold.bottom + FOLD_CLEARANCE;
}

/**
 * A centred card's place in the laptop pose: `style` for the layer that centres it (its top and bottom padding
 * confine the centring to the chosen band), `maxHeight` for a card that sets its own numeric limit,
 * `onCardLayout` for the card's own `onLayout`. `avoidsKeyboard`: the layer sits in a keyboard-avoiding one,
 * which already keeps the card above the fold while the keyboard is up. `belowSafeAreaTop`: the layer starts under
 * its parent's top safe-area padding (`KeyboardAvoidingContainer safeAreaTop`), not at the window's top; it
 * reaches the window's bottom edge either way. `measuresLayer`: the layer covers a screen's area, not the window
 * (the chat's account-switch card); it takes `layerRef` and `onLayerLayout`, its window frame is read from them, and
 * the bands are taken inside that frame (no placement until it is read). `style` and `maxHeight` are null outside
 * the laptop pose and then change nothing.
 */
export function useFoldCardPlacement({
  avoidsKeyboard,
  belowSafeAreaTop = false,
  measuresLayer = false,
}: {
  avoidsKeyboard: boolean;
  belowSafeAreaTop?: boolean;
  measuresLayer?: boolean;
}): {
  style: ViewStyle | null;
  maxHeight: number | null;
  onCardLayout: (event: LayoutChangeEvent) => void;
  layerRef: RefObject<ViewInstance | null>;
  onLayerLayout: () => void;
} {
  const fold = useLaptopFold();
  const { height } = useWindowDimensions();
  const topInset = useSafeAreaInsets().top;
  const keyboardUp = useKeyboardTop() !== null;
  const [cardHeight, setCardHeight] = useState<number | null>(null);
  const [wasAbove, setWasAbove] = useState(false);
  const onCardLayout = useCallback((event: LayoutChangeEvent) => setCardHeight(event.nativeEvent.layout.height), []);
  const layerRef = useRef<ViewInstance | null>(null);
  const [measuredLayer, setMeasuredLayer] = useState<{ top: number; bottom: number } | null>(null);
  const onLayerLayout = useCallback(() => {
    layerRef.current?.measureInWindow((_x, y, _width, layerHeight) =>
      setMeasuredLayer((current) =>
        current?.top === y && current.bottom === y + layerHeight ? current : { top: y, bottom: y + layerHeight },
      ),
    );
  }, []);
  // The layer's frame in the window.
  const layer = measuresLayer ? measuredLayer : { top: belowSafeAreaTop ? topInset : 0, bottom: height };
  const region =
    (keyboardUp && avoidsKeyboard) || layer === null
      ? null
      : foldCardRegion(
          fold,
          { height: layer.bottom, topInset: Math.max(topInset, layer.top) },
          cardHeight,
          keyboardUp,
          wasAbove,
        );
  // Remembered for the next measurement; the keyboard's own choice of the band above does not count.
  const nowAbove = region !== null && region.above && !keyboardUp;
  if (nowAbove !== wasAbove) setWasAbove(nowAbove);
  return {
    style:
      region === null || layer === null
        ? null
        : {
            justifyContent: 'center',
            paddingTop: Math.max(0, region.top - layer.top),
            paddingBottom: layer.bottom - region.bottom,
          },
    maxHeight: region === null ? null : region.bottom - region.top,
    onCardLayout,
    layerRef,
    onLayerLayout,
  };
}
