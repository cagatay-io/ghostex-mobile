/**
 * The terminal screen's ways to the software keyboard, besides the native terminal's own rule that no touch on it
 * brings the keyboard: the startup keyboard ("Hide keyboard on startup" off), the bottom bar's keyboard button and empty
 * room, the round keyboard button (`TerminalFloatingControls`), and where the command pad stands. `TerminalScreen`
 * calls `useKeyboardEntry` once its keyboard, pad and bar state are known, and hands `padOpen` and `touchSelected` to
 * the pane controller (`useTerminalPanes`).
 */

import { useCallback, useEffect, useRef } from 'react';

import { GhostexNative } from '../../../modules/ghostex-native/src';
import type { PaneContent } from '../../panes/resolve';
import type { TerminalTab } from '../../terminal/sessions';

export type PadPlaceInput = {
  /** The two panes' slots and the active one, or null with one content area. */
  panes: { slots: readonly PaneContent[]; active: number } | null;
  /** The session whose pane shows its chat view (two panes only). */
  paneChatKey: string | null;
  /** The pad is switched on (`extraKeysToolbarVisible`). */
  padSwitchedOn: boolean;
  activeTab: TerminalTab | null;
  /** iOS terminal layout, where the terminal slides with the keyboard (`slidesWithKeyboard`). */
  slides: boolean;
};

/**
 * Whether a terminal is the active content, and the session the Befehlspad stands over. A pane without a terminal
 * (browser, files, Git changes, agents, attention list, usage, a session's chat view) tapped last is the active one:
 * the pad's keys, the text editor and Upload would reach no terminal there, so they are not shown (the approved panes
 * mockup). The pad stands over the shown terminal while it is switched on, where the terminal slides with the keyboard
 * (iOS; never in chat view).
 */
export function padPlace(input: PadPlaceInput): { terminalPaneActive: boolean; padSessionKey: string | null } {
  const activePaneContent = input.panes === null ? null : input.panes.slots[input.panes.active];
  const terminalPaneActive =
    input.panes === null ||
    (activePaneContent?.kind === 'session' && activePaneContent.sessionKey !== input.paneChatKey);
  const padSessionKey =
    input.padSwitchedOn && input.activeTab !== null && input.slides && terminalPaneActive
      ? input.activeTab.sessionKey
      : null;
  return { terminalPaneActive, padSessionKey };
}

/**
 * Whether the terminal screen's round keyboard button (`TerminalFloatingControls`) shows, where the floating controls
 * stand over a terminal or a chat pane. While the terminal's bottom bar is on screen its own keyboard button stands in
 * for it. Otherwise it shows with "Show keyboard button" on; as the dismiss while the keyboard is up for a chat in the
 * active pane; and on iOS while the keyboard is up (its dismiss), and whenever neither the bottom bar nor the command
 * pad is there to bring the keyboard (two panes, the iPhone Duo's band or rail header, the laptop pose, with the pad
 * switched off), whatever the setting.
 *
 * CDXC:Terminal 2026-11-21 DECISION:
 * User: on the iPhone no touch on a terminal brings the keyboard, so where neither the bottom bar nor the pad is there
 * to bring it, the round keyboard button shows whatever "Show keyboard button" says; otherwise the terminal would have
 * no way on screen to the keyboard.
 */
export type TerminalKeyboardButtonInput = {
  /** The bottom bar stands under the terminal now (keyboard down). */
  barShown: boolean;
  /** The screen has the bottom bar in this layout (one pane, header on top, not the laptop pose). */
  barPlace: boolean;
  /** The command pad stands over the active terminal (switched on; open or closed). */
  padShown: boolean;
  /** iOS terminal layout, where the terminal slides with the keyboard (`slidesWithKeyboard`). */
  slides: boolean;
  keyboardVisible: boolean;
  /** "Show keyboard button" in Settings. */
  setting: boolean;
  /** A chat in the active pane while the keyboard is up. */
  chatPaneKeyboardUp: boolean;
};

export function terminalKeyboardButtonShown(input: TerminalKeyboardButtonInput): boolean {
  if (input.barShown) return false;
  if (input.chatPaneKeyboardUp || input.setting) return true;
  return input.slides && (input.keyboardVisible || (!input.barPlace && !input.padShown));
}

export type KeyboardEntryInput = {
  /** "Hide keyboard on startup". */
  hideKeyboardOnStartup: boolean;
  isFocused: boolean;
  activeTab: TerminalTab | null;
  /** The screen's optimistic keyboard state until the keyboard's frame arrives. */
  setTapKeyboardHint: (shown: boolean) => void;
  /** The screen's keyboard request for the selected terminal (`focusTerminal`). */
  showKeyboard: () => void;
  /** The pad over the active terminal is open (`padPlace`'s session and the pad's own state). */
  padOpen: boolean;
  /** The round keyboard button's situation (`terminalKeyboardButtonShown`). */
  floatingButton: TerminalKeyboardButtonInput;
};

export type KeyboardEntry = {
  padOpen: boolean;
  /** The bottom bar's keyboard button and empty room. */
  barKeyboard: () => void;
  /** The round keyboard button shows. */
  floatingKeyboardButton: boolean;
  /** A touch in a pane selected this session (`useTerminalPanes`'s `activatePane`). */
  touchSelected: (sessionKey: string) => void;
};

export function useKeyboardEntry({
  hideKeyboardOnStartup,
  isFocused,
  activeTab,
  setTapKeyboardHint,
  showKeyboard,
  padOpen,
  floatingButton,
}: KeyboardEntryInput): KeyboardEntry {
  /** Session keys already auto-focused this visit (hide-keyboard-on-startup off). */
  const autoFocusedSessionsRef = useRef<Set<string>>(new Set());
  /**
   * The session a touch in a pane selected, and how far the touch's own selection has been seen: `null` until the
   * screen shows that session selected, then the terminal's state then (`opening` or `open`), for as long as the
   * terminal stays in that opening.
   */
  const touchHoldRef = useRef<{ sessionKey: string; seen: 'opening' | 'open' | null } | null>(null);

  // Hide keyboard on startup OFF → explicitly focus a terminal once it opens,
  // at most once per session per visit (a deliberate dismissal stays dismissed).
  useEffect(() => {
    // The touch's own selection ends when another session is selected, or when its terminal leaves the opening it
    // was in at the touch (a terminal that was not attached and attaches later, a reattach, a failed open's Retry).
    const hold = touchHoldRef.current;
    if (hold !== null && (hold.seen !== null || activeTab?.sessionKey === hold.sessionKey)) {
      const state = activeTab?.sessionKey === hold.sessionKey ? activeTab.state : null;
      if (state === 'open' && hold.seen !== null) hold.seen = 'open';
      else if ((state === 'opening' || state === 'open') && hold.seen === null) hold.seen = state;
      else if (state !== 'opening' || hold.seen !== 'opening') touchHoldRef.current = null;
    }
    if (hideKeyboardOnStartup || !isFocused) return;
    if (activeTab === null || activeTab.state !== 'open') return;
    if (autoFocusedSessionsRef.current.has(activeTab.sessionKey)) return;
    if (touchHoldRef.current?.sessionKey === activeTab.sessionKey) return;
    autoFocusedSessionsRef.current.add(activeTab.sessionKey);
    setTapKeyboardHint(true);
    void GhostexNative.focusTerminal(activeTab.sessionKey).catch(() => setTapKeyboardHint(false));
  }, [hideKeyboardOnStartup, isFocused, activeTab, setTapKeyboardHint]);

  // CDXC:Terminal 2026-11-21 DECISION:
  // User: no touch on a terminal brings the keyboard up. A touch that selects a pane's session is not an opening:
  // the startup keyboard is for a terminal that opens or attaches while selected, so the touch holds it back for its
  // own selection, the terminal open or opening as the touch found it, also for a pane that opened in the background
  // and was never selected while open. The touch does not use up the session's turn: an attach that starts after the
  // touch (Terminal View on a chat whose terminal was not attached, a reattach, Retry) is an opening again and brings
  // it if the session has not had it this visit, once, as before; a session that already had it gets none again.
  const touchSelected = useCallback((sessionKey: string): void => {
    touchHoldRef.current = { sessionKey, seen: null };
  }, []);

  // While the pad is open only its own keyboard button raises and lowers the keyboard; the bar's keyboard button and
  // empty room do not (the bar stands under the pad with one pane while the keyboard is down).
  const barKeyboard = useCallback((): void => {
    if (!padOpen) showKeyboard();
  }, [padOpen, showKeyboard]);

  return {
    padOpen,
    barKeyboard,
    floatingKeyboardButton: terminalKeyboardButtonShown(floatingButton),
    touchSelected,
  };
}
