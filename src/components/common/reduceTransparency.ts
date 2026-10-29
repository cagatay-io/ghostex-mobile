/**
 * The system's Reduce Transparency setting (iOS Accessibility > Display & Text Size), read from React. It follows
 * `AccessibilityInfo.isReduceTransparencyEnabled()` and `reduceTransparencyChanged` while at least one subscriber
 * is mounted, like `reduceMotion.ts`; until the first read resolves, and on platforms without the setting, the
 * value is false. Frosted surfaces (the Befehlspad's keys) turn opaque while it is on (owner D-062).
 */

import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, type EmitterSubscription } from 'react-native';

let value = false;
const listeners = new Set<() => void>();
let following: EmitterSubscription | null = null;
/**
 * Invalidates a read that is still pending when following stops, or when a change notification arrived first:
 * the notification is newer than the read that was asked for before it.
 */
let generation = 0;

function set(next: boolean): void {
  if (next === value) return;
  value = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    const mine = ++generation;
    void AccessibilityInfo.isReduceTransparencyEnabled()
      .then((enabled) => {
        if (mine === generation) set(enabled);
      })
      .catch(() => undefined);
    following = AccessibilityInfo.addEventListener('reduceTransparencyChanged', (enabled: boolean) => {
      generation += 1;
      set(enabled);
    });
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    generation += 1;
    following?.remove();
    following = null;
    value = false;
  };
}

function snapshot(): boolean {
  return value;
}

/** The system's Reduce Transparency setting, followed while mounted. */
export function useReduceTransparency(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
