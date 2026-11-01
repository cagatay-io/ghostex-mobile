import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import type { TerminalColors } from '../../modules/ghostex-native/src/GhostexNative.types';
import { useSettingsStore } from '../settings/store';
import { terminalChrome, terminalColours, type TerminalChrome, type TerminalColourSettings } from './terminalColours';

/**
 * The terminal's colours (`terminalColours`) and the chrome over its background, for the React surfaces around the
 * native terminal; they change together with the colours `nativeSync` sends the terminal.
 */
export function useTerminalColours(): { colors: TerminalColors; chrome: TerminalChrome } {
  const settings = useSettingsStore(
    useShallow(({ settings }): TerminalColourSettings => ({
      darkThemePreset: settings.darkThemePreset,
      lightThemePreset: settings.lightThemePreset,
      customSidebarTitlebarBackgroundTintColor: settings.customSidebarTitlebarBackgroundTintColor,
      customSidebarTitlebarLightBackgroundTintColor: settings.customSidebarTitlebarLightBackgroundTintColor,
      customSidebarTitlebarBackgroundDarknessPercent: settings.customSidebarTitlebarBackgroundDarknessPercent,
      customSidebarTitlebarLightBackgroundLightnessPercent:
        settings.customSidebarTitlebarLightBackgroundLightnessPercent,
      themeSidebarContrast: settings.themeSidebarContrast,
      themeWorkAreaContrast: settings.themeWorkAreaContrast,
      sidebarTheme: settings.sidebarTheme,
      terminalColorScheme: settings.terminalColorScheme,
      terminalGhosttyTheme: settings.terminalGhosttyTheme,
      terminalGhosttyLightTheme: settings.terminalGhosttyLightTheme,
      terminalBackgroundMode: settings.terminalBackgroundMode,
      workspaceBackgroundColor: settings.workspaceBackgroundColor,
    })),
  );
  const systemIsLight = useColorScheme() === 'light';
  return useMemo(() => {
    const colors = terminalColours(settings, systemIsLight);
    return { colors, chrome: terminalChrome(colors.background) };
  }, [settings, systemIsLight]);
}
