/**
 * The Befehlspad's key input for the shown session (`terminalKeyInput.ts`) wired to the native module, the
 * platform haptics and the key haptics setting. One input per session: switching tabs starts with no armed
 * modifier, as the key bar did; the native view's report that a software-keyboard key used a one-shot
 * modifier clears it here too.
 */

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import * as Haptics from 'expo-haptics';

import { GhostexNative } from '../../../modules/ghostex-native/src';
import { useSettingsStore } from '../../settings/store';
import { TerminalKeyInput, type ModifierState } from './terminalKeyInput';

const haptics = {
  click: (): void => {
    void Haptics.selectionAsync().catch(() => undefined);
  },
  // A distinct, crisp second click when a held modifier locks, so arming is felt without looking.
  lock: (): void => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => undefined);
  },
};

const hapticsEnabled = (): boolean => useSettingsStore.getState().settings.keyBarHapticsEnabled;

export type TerminalKeyInputState = { input: TerminalKeyInput; modifiers: ModifierState };

/** `sessionKey` null: no terminal is shown; the input exists but nothing renders that uses it. */
export function useTerminalKeyInput(sessionKey: string | null): TerminalKeyInputState {
  const input = useMemo(
    () => new TerminalKeyInput({ sessionKey: sessionKey ?? '', native: GhostexNative, haptics, hapticsEnabled }),
    [sessionKey],
  );
  useEffect(() => {
    if (sessionKey === null) return;
    input.clearModifiers();
    const subscription = GhostexNative.addListener('onKeyModifiersConsumed', (event) => {
      if (event.sessionKey === sessionKey) input.modifiersConsumed();
    });
    return () => {
      subscription.remove();
      input.dispose();
    };
  }, [input, sessionKey]);
  const modifiers = useSyncExternalStore(input.subscribe, input.getModifiers, input.getModifiers);
  return { input, modifiers };
}
