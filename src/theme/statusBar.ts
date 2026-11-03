import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { StatusBar } from 'react-native';

/**
 * Dark status bar text over a light screen while the calling screen is focused; leaving it gives the light text back
 * that the app's fixed dark screens draw under (App.tsx's root `StatusBar`). A screen painted from the theme colours
 * calls this with whether its top edge is light.
 *
 * CDXC:Theming WHY: With the light presets the screens can be light, and the app no longer forces the
 * dark interface style (app.json), so the status bar ink follows the screen beneath it.
 *
 * CDXC:Theming WHY: The focused screen's ink is an entry on React Native's status bar stack, pushed on focus
 * and popped on blur. The earlier imperative `setStatusBarStyle` only set a default, so on the first mount of a light
 * screen the root `StatusBar style="light"` entry was merged in after it and won. A later entry
 * wins the merge, and popping it leaves the root's light ink for the fixed-dark screens.
 */
export function useStatusBarStyle(light: boolean): void {
  useFocusEffect(
    useCallback(() => {
      const entry = StatusBar.pushStackEntry({ barStyle: light ? 'dark-content' : 'light-content', animated: true });
      return () => StatusBar.popStackEntry(entry);
    }, [light]),
  );
}
