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
