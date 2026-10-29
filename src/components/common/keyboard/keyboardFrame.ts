/**
 * Where the software keyboard's top edge is in the app's window, shared by every keyboard-aware container,
 * and the keyboard's last reported frame, from which the iPhone Duo's side bar learns the keyboard
 * height of a window (`useKeyboardFrame`).
 *
 * Android: a React Native `Modal` is its own edge-to-edge dialog window, which the system does not
 * resize for the keyboard (the activity's `adjustResize` only covers the main window, and not on
 * every build once edge-to-edge is on; see useKeyboardMetrics). So containers measure their own
 * frame and compare it with the keyboard's top instead of trusting a resize: a window that did
 * shrink ends above the keyboard and gets no extra room, one that did not gets exactly the overlap.
 *
 * The chat composer keeps its own `useKeyboardInset`; this store is for everything else.
 */

import { useSyncExternalStore } from 'react';
import { Keyboard, LayoutAnimation, Platform, useWindowDimensions, type KeyboardEvent } from 'react-native';

import { keyboardFrameOf, keyboardTopInWindow, type KeyboardFrame } from './keyboardTop';

/** The keyboard's last reported frame; whether it reaches into the window is the hooks' call. */
let frame: KeyboardFrame | null = null;
const listeners = new Set<() => void>();
let subscribed = false;

function publish(next: KeyboardFrame | null): void {
  if (next?.top === frame?.top && next?.height === frame?.height && next?.width === frame?.width) return;
  frame = next;
  for (const listener of listeners) listener();
}

function frameFromEvent(event: KeyboardEvent): KeyboardFrame | null {
  const { screenY, height, width } = event.endCoordinates;
  return keyboardFrameOf(screenY, height, width);
}

function ensureSubscribed(): void {
  if (subscribed) return;
  subscribed = true;
  const metrics = Keyboard.metrics();
  if (metrics != null) frame = keyboardFrameOf(metrics.screenY, metrics.height, metrics.width);
  if (Platform.OS === 'ios') {
    // iOS reports the frame before it animates, so containers move with the keyboard.
    const animate = (duration: number): void => {
      if (duration > 0) {
        LayoutAnimation.configureNext({ duration, update: { type: LayoutAnimation.Types.keyboard } });
      }
    };
    Keyboard.addListener('keyboardWillChangeFrame', (event) => {
      const next = frameFromEvent(event);
      if (next?.top !== frame?.top) animate(event.duration);
      publish(next);
    });
    Keyboard.addListener('keyboardWillHide', (event) => {
      if (frame !== null) animate(event.duration);
      publish(null);
    });
  } else {
    // Android only reports after the fact; keyboardDidShow re-fires when the keyboard's height changes.
    Keyboard.addListener('keyboardDidShow', (event) => publish(frameFromEvent(event)));
    Keyboard.addListener('keyboardDidHide', () => publish(null));
  }
}

function subscribe(listener: () => void): () => void {
  ensureSubscribed();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): KeyboardFrame | null {
  return frame;
}

function topSnapshot(): number | null {
  return frame?.top ?? null;
}

/** The keyboard's last reported frame, or null while it is hidden; the same object until it changes. */
export function useKeyboardFrame(): KeyboardFrame | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** The keyboard's top edge in window points, or null while it is hidden. */
export function useKeyboardTop(): number | null {
  const top = useSyncExternalStore(subscribe, topSnapshot, topSnapshot);
  return keyboardTopInWindow(top, useWindowDimensions().height);
}
