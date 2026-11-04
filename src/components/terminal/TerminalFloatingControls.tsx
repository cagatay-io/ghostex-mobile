/**
 * Floating bottom-right terminal controls (terminal-screen.md §1):
 * - Refresh button (settings.refreshButtonVisible, zmx attach tabs only):
 *   explicit native ZMX viewport refresh.
 * - Upload button (settings.fileUploadButtonVisible, hourglass while
 *   uploading); not while the Befehlspad is shown (iOS), whose Upload key
 *   replaces it.
 * - Keyboard button (`showKeyboardButton`): while the soft keyboard is up it
 *   is the dismiss control. The screen shows it per
 *   settings.keyboardButtonVisible, and on iOS also without that setting while
 *   the keyboard is up and the pad is off or closed, and alone while the
 *   keyboard is up for a chat in the active pane; on Android with the key
 *   bar and this setting off nothing here dismisses the keyboard.
 * The buttons stand in a column; where the column needs more height than
 * `maxHeight` (a phone in landscape with the keyboard up), they stand in a row
 * instead, the keyboard button still nearest the corner.
 */

import { useMemo } from 'react';
import { useAppearance, type Appearance } from '../../theme/useAppearance';
import { Pressable, StyleSheet, View } from 'react-native';

import { GhostexStrokeWidth } from '../../theme/palette';
import { HourglassIcon, KeyboardDismissIcon, KeyboardIcon, PaperclipIcon, RefreshIcon } from './icons';

const BUTTON_SIZE = 44;
const BUTTON_GAP = 12;

export type TerminalFloatingControlsProps = {
  showKeyboardButton: boolean;
  showUploadButton: boolean;
  showRefreshButton: boolean;
  uploadEnabled: boolean;
  uploading: boolean;
  refreshEnabled: boolean;
  /** True while the soft keyboard is visible: the keyboard button dismisses. */
  keyboardShown: boolean;
  bottomOffset: number;
  /** The height the stack may take above `bottomOffset`; undefined: no limit. */
  maxHeight?: number;
  onKeyboard: () => void;
  onDismissKeyboard: () => void;
  onUpload: () => void;
  onRefresh: () => void;
};

export default function TerminalFloatingControls({
  showKeyboardButton,
  showUploadButton,
  showRefreshButton,
  uploadEnabled,
  uploading,
  refreshEnabled,
  keyboardShown,
  bottomOffset,
  maxHeight,
  onKeyboard,
  onDismissKeyboard,
  onUpload,
  onRefresh,
}: TerminalFloatingControlsProps) {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  const count = Number(showKeyboardButton) + Number(showUploadButton) + Number(showRefreshButton);
  if (count === 0) return null;
  const across = maxHeight !== undefined && count * BUTTON_SIZE + (count - 1) * BUTTON_GAP > maxHeight;

  return (
    <View style={[styles.stack, across && styles.row, { bottom: bottomOffset }]} pointerEvents="box-none">
      {showRefreshButton && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh terminal"
          disabled={!refreshEnabled}
          style={[styles.button, !refreshEnabled && styles.buttonDisabled]}
          onPress={onRefresh}
        >
          <RefreshIcon size={18} color={appearance.foreground} />
        </Pressable>
      )}
      {showUploadButton && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Upload Image or File"
          disabled={!uploadEnabled || uploading}
          style={[styles.button, (!uploadEnabled || uploading) && styles.buttonDisabled]}
          onPress={onUpload}
        >
          {uploading ? (
            <HourglassIcon size={18} color={appearance.foreground} />
          ) : (
            <PaperclipIcon size={18} color={appearance.foreground} />
          )}
        </Pressable>
      )}
      {showKeyboardButton && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={keyboardShown ? 'Dismiss keyboard' : 'Show keyboard'}
          style={styles.button}
          onPress={keyboardShown ? onDismissKeyboard : onKeyboard}
        >
          {keyboardShown ? (
            <KeyboardDismissIcon size={18} color={appearance.foreground} />
          ) : (
            <KeyboardIcon size={18} color={appearance.foreground} />
          )}
        </Pressable>
      )}
    </View>
  );
}

const createStyles = (appearance: Appearance) => StyleSheet.create({
  stack: {
    position: 'absolute',
    right: 16,
    alignItems: 'center',
    gap: BUTTON_GAP,
  },
  row: {
    flexDirection: 'row',
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: appearance.cardActive,
    borderWidth: GhostexStrokeWidth,
    borderColor: appearance.border,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
});
