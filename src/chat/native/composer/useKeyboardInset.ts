/**
 * How far the software keyboard reaches over a view that sits at the bottom of the screen, so the
 * composer can lift itself above it. iOS only: Android resizes the window for the keyboard
 * (Expo's default `softwareKeyboardLayoutMode: resize`), so the composer is already above it there.
 *
 * `gap` is the distance from the view's bottom edge to the bottom of the window with no keyboard
 * (a tab bar or a home indicator strip below the chat); the lift is the keyboard height minus it.
 *
 * The overlap follows the keyboard's last reported frame, recomputed on each keyboard event, on each
 * change of the window's height (a fold, an unfold or a rotation can resize the window without a
 * keyboard event, in either order: FL-LAY-11), and when the view's own layout changes (`onAnchorLayout`
 * for the view's `onLayout`).
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Keyboard, LayoutAnimation, Platform, useWindowDimensions, type ViewInstance } from 'react-native';

import { keyboardFrameTop, keyboardTopInWindow } from '../../../components/common/keyboard/keyboardTop';

export type KeyboardInset = {
  /** The lift in points: how far the keyboard reaches over the view, 0 without one. */
  readonly inset: number;
  /** For the view's `onLayout`: its frame changed, so the overlap is measured again. */
  readonly onAnchorLayout: () => void;
};

export function useKeyboardInset(anchor: RefObject<ViewInstance | null>): KeyboardInset {
  const windowHeight = useWindowDimensions().height;
  const [inset, setInset] = useState(0);
  const insetRef = useRef(0);
  // The keyboard's last reported top edge (null while hidden) and the window height it is read against.
  const frameTopRef = useRef<number | null>(null);
  const windowHeightRef = useRef(windowHeight);

  const apply = useCallback((next: number, duration: number): void => {
    if (next === insetRef.current) return;
    insetRef.current = next;
    if (duration > 0) {
      LayoutAnimation.configureNext({
        duration,
        update: { type: LayoutAnimation.Types.keyboard },
      });
    }
    setInset(next);
  }, []);

  const recompute = useCallback(
    (duration: number): void => {
      const keyboardTop = keyboardTopInWindow(frameTopRef.current, windowHeightRef.current);
      if (keyboardTop === null) {
        apply(0, duration);
        return;
      }
      const view = anchor.current;
      if (view === null) {
        apply(windowHeightRef.current - keyboardTop, duration);
        return;
      }
      view.measureInWindow((_x, y, _width, height) => {
        // The lift is padding inside the view, so its bottom edge stays put. Taking the lift off
        // again hid the composer when the keyboard changed height while open (its suggestion row
        // returning after a menu sheet closed, or a switch to the emoji keyboard).
        const bottom = y + height;
        apply(Math.max(0, bottom - keyboardTop), duration);
      });
    },
    [anchor, apply],
  );

  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;
    const show = Keyboard.addListener('keyboardWillChangeFrame', (event) => {
      frameTopRef.current = keyboardFrameTop(event.endCoordinates.screenY, event.endCoordinates.height);
      recompute(event.duration);
    });
    const hide = Keyboard.addListener('keyboardWillHide', (event) => {
      frameTopRef.current = null;
      apply(0, event.duration);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [apply, recompute]);

  // The window's height changed, with or without a keyboard event: the same keyboard frame against
  // the new window (synchronizes with the native view's new frame).
  useEffect(() => {
    windowHeightRef.current = windowHeight;
    if (Platform.OS === 'ios') recompute(0);
  }, [windowHeight, recompute]);

  const onAnchorLayout = useCallback(() => {
    if (Platform.OS === 'ios') recompute(0);
  }, [recompute]);

  return { inset, onAnchorLayout };
}
