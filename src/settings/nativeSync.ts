/**
 * Push settings into the native terminal engines.
 * - setTerminalSettings applies auto scroll, cursor style/blink, soft-keyboard
 *   policy, URL-tap opening and the terminal colours to every live/warm
 *   terminal immediately and to all future opens (both platforms; the colours
 *   are read on iOS). The colours follow the device appearance too (Terminal
 *   theme or the app's appearance set to System), so a device appearance
 *   change re-syncs as well.
 * - A global font-size change updates every open tab that has no per-session
 *   pinch-zoom override; overridden sessions keep their own size.
 */

import { Appearance } from 'react-native';

import { GhostexNative } from '../../modules/ghostex-native/src';
import type { TerminalRuntimeSettings } from '../../modules/ghostex-native/src/GhostexNative.types';
import { useTerminalStore } from '../terminal/sessions';
import { terminalColours } from '../theme/terminalColours';
import { useSettingsStore, type GhostexSettings } from './store';

let installed = false;
let lastRuntimeJson = '';
let lastFontSize: number | null = null;

function runtimeSettings(settings: GhostexSettings, systemIsLight: boolean): TerminalRuntimeSettings {
  return {
    autoScroll: settings.autoScroll,
    cursorStyle: settings.cursorStyle,
    cursorBlink: settings.cursorBlink,
    softKeyboardEnabled: settings.softKeyboardEnabled,
    openUrlsOnTap: settings.openUrlsOnTap,
    colors: terminalColours(settings, systemIsLight),
  };
}

function syncRuntimeSettings(settings: GhostexSettings, systemIsLight: boolean): void {
  const runtime = runtimeSettings(settings, systemIsLight);
  const json = JSON.stringify(runtime);
  if (json === lastRuntimeJson) return;
  lastRuntimeJson = json;
  void GhostexNative.setTerminalSettings(runtime).catch(() => {
    // The module may not be ready during teardown; the next change re-syncs.
  });
}

function syncDefaultFontSize(settings: GhostexSettings): void {
  if (settings.fontSize === lastFontSize) return;
  const isFirstSync = lastFontSize === null;
  lastFontSize = settings.fontSize;
  // Native entries opened before this run already got their initial size from
  // openTerminal; only live changes need to be pushed.
  if (isFirstSync) return;
  const { tabs, fontSizeBySessionKey } = useTerminalStore.getState();
  for (const tab of tabs) {
    if (fontSizeBySessionKey[tab.sessionKey] !== undefined) continue;
    void GhostexNative.setFontSize(tab.sessionKey, settings.fontSize).catch(() => undefined);
  }
}

/** Install once at app startup; re-applies whenever settings or the device appearance change. */
export function initSettingsNativeSync(): void {
  if (installed) return;
  installed = true;
  const apply = (): void => {
    const state = useSettingsStore.getState();
    if (!state.hydrated) return;
    syncRuntimeSettings(state.settings, Appearance.getColorScheme() === 'light');
    syncDefaultFontSize(state.settings);
  };
  useSettingsStore.subscribe(apply);
  Appearance.addChangeListener(apply);
  apply();
}
