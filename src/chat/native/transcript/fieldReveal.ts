/**
 * Keeps a text field inside the transcript (the question form's note and answer boxes) in view
 * while it is focused: when it takes focus, when the keyboard opens or changes height, and when the
 * box grows to another line.
 *
 * WHY: Android's own scroll-into-view (on focus and on every keystroke, for the cursor) ignores
 * transforms, and the inverted transcript list flips itself and every row with `scale: -1`. Its
 * rectangle came out mirrored inside the row, so typing scrolled the transcript away from the
 * field. The list turns that off (`scrollsChildToFocus={false}`) and this measures the field where
 * it really is on screen (Fabric's `measureInWindow` includes transforms and the scroll offset).
 */

import { createContext, useContext, useEffect, useRef, type RefObject } from 'react';
import { TextInput, type FlatList } from 'react-native';

import { useKeyboardTop } from '../../../components/common/keyboard/keyboardFrame';

/** Space kept between the field and the transcript's edges. */
const REVEAL_MARGIN = 12;

const noop = (): void => undefined;

/** A native view as React Native hands it out; the list's scroll view is one at runtime. */
type HostView = ReturnType<typeof TextInput.State.currentlyFocusedInput>;

/** Brings the focused transcript field into view; a no-op outside the main transcript list. */
export const TranscriptFieldRevealContext = createContext<() => void>(noop);

export function useRevealFocusedField(): () => void {
  return useContext(TranscriptFieldRevealContext);
}

/**
 * The reveal for one inverted transcript list. `offset` is the list's current scroll offset, which
 * for an inverted list is the distance from the bottom.
 */
export function useTranscriptFieldReveal<T>(listRef: RefObject<FlatList<T> | null>, offset: RefObject<number>): () => void {
  const keyboardTop = useKeyboardTop();
  const keyboardTopRef = useRef(keyboardTop);
  keyboardTopRef.current = keyboardTop;

  const revealRef = useRef<() => void>(noop);
  revealRef.current = () => {
    // A frame later, so a resize from the keyboard or a box that just grew is laid out first.
    requestAnimationFrame(() => {
      const list = listRef.current;
      const scroll = list?.getNativeScrollRef() as HostView | null | undefined;
      const input = TextInput.State.currentlyFocusedInput();
      if (list == null || scroll == null || input == null) return;
      // measureLayout fails for a field outside this list (the composer, a sheet): not ours to move.
      input.measureLayout(
        scroll,
        () => {
          scroll.measureInWindow((_lx, listTop, _lw, listHeight) => {
            input.measureInWindow((_x, top, _width, height) => {
              const visibleTop = listTop + REVEAL_MARGIN;
              const visibleBottom = Math.min(listTop + listHeight, keyboardTopRef.current ?? Infinity) - REVEAL_MARGIN;
              const bottom = top + height;
              // How far the rows must move up (positive) or down (negative) on screen.
              let shift = 0;
              if (bottom > visibleBottom) {
                // The cursor is usually at the end, so the box's bottom wins over its top.
                shift = bottom - visibleBottom;
              } else if (top < visibleTop) {
                shift = -Math.min(visibleTop - top, visibleBottom - bottom);
              }
              if (Math.abs(shift) < 1) return;
              // Inverted: moving the rows up shows rows nearer the bottom, a smaller offset.
              list.scrollToOffset({ offset: Math.max(0, offset.current - shift), animated: true });
            });
          });
        },
        noop
      );
    });
  };

  // The keyboard opening (or changing height) can leave the focused field under it.
  useEffect(() => {
    if (keyboardTop !== null) revealRef.current();
  }, [keyboardTop]);

  const stable = useRef(() => revealRef.current());
  return stable.current;
}
