/**
 * The terminal's text editor (REQ-KEY-010 item 5), opened by the pen in the Befehlspad's ring and docked above
 * the software keyboard (`KeyBarDock`): a multiline draft with the full text keyboard (emoji, dictation,
 * suggestions) and Send. Send inserts the draft into the terminal and clears it; with an empty draft it sends
 * Enter. Return in the keyboard adds a newline to the draft. Backspace or Delete on an empty draft go to the
 * terminal (terminal-screen.md §2 "Text editor").
 *
 * Closing it with the pen hands the keyboard back to the terminal: the terminal is asked for first responder
 * while the editor, which holds it, is still mounted, so UIKit moves the responder straight over and the
 * keyboard stays up; the editor goes once the native call has answered. A refusal or an error still closes it
 * (the keyboard then hides with the editor) and is logged, so the failure is not silent.
 */

import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { GhostexNative } from '../../../modules/ghostex-native/src';
import { CommandPadCopy } from '../../copy';
import { CommandPadPalette, GhostexPalette } from '../../theme/palette';
import { ArrowIcon, SendIcon } from './icons';

export type TerminalTextEditorState = {
  visible: boolean;
  /** Pen: opens the editor, or hands the keyboard back to the terminal and closes it. */
  toggle: () => void;
  /** Closes it without a hand-over (the keyboard went away, a layer took its place). */
  dismiss: () => void;
};

/** Whether the editor is open for the shown session; a session switch closes it. */
export function useTerminalTextEditor(sessionKey: string | null): TerminalTextEditorState {
  const [visible, setVisible] = useState(false);
  const [openFor, setOpenFor] = useState(sessionKey);
  if (openFor !== sessionKey) {
    setOpenFor(sessionKey);
    setVisible(false);
  }
  /** A hand-over to the terminal is in flight; the pen ignores further presses until it answers. */
  const handOverPending = useRef(false);

  const toggle = useCallback((): void => {
    if (!visible) {
      setVisible(true);
      return;
    }
    if (handOverPending.current || sessionKey === null) return;
    handOverPending.current = true;
    void (async () => {
      try {
        if (!(await GhostexNative.focusTerminal(sessionKey))) {
          console.warn(`Terminal text editor: the terminal refused the keyboard focus for session ${sessionKey}.`);
        }
      } catch (error) {
        console.warn(
          `Terminal text editor: handing the keyboard to the terminal failed for session ${sessionKey}.`,
          error,
        );
      }
      handOverPending.current = false;
      setVisible(false);
    })();
  }, [visible, sessionKey]);

  const dismiss = useCallback((): void => setVisible(false), []);

  return { visible, toggle, dismiss };
}

export type TerminalTextEditorProps = { sessionKey: string };

/** The editor's height with one line of text: the dock's height until it has laid out. */
export const TEXT_EDITOR_HEIGHT = 56;

// A failed call means the terminal entry closed or failed; the terminal's state overlay shows that.
const ignoreClosedTerminal = (): void => undefined;

export default function TerminalTextEditor({ sessionKey }: TerminalTextEditorProps) {
  const [text, setText] = useState('');

  const send = (): void => {
    if (text.length === 0) void GhostexNative.sendKey(sessionKey, 'enter', {}).catch(ignoreClosedTerminal);
    else void GhostexNative.sendText(sessionKey, text).catch(ignoreClosedTerminal);
    setText('');
  };

  const forwardEditingKey = (key: string): void => {
    // Once the draft is empty, editing keys keep their terminal meaning; held keys repeat their events.
    if (text.length !== 0) return;
    if (key === 'Backspace') void GhostexNative.sendKey(sessionKey, 'backspace', {}).catch(ignoreClosedTerminal);
    if (key === 'Delete') void GhostexNative.sendKey(sessionKey, 'delete', {}).catch(ignoreClosedTerminal);
  };

  return (
    <View style={styles.bar}>
      <TextInput
        autoFocus
        accessibilityLabel={CommandPadCopy.editorField}
        autoCapitalize="none"
        autoCorrect
        keyboardType="default"
        multiline
        placeholder={CommandPadCopy.editorPlaceholder}
        placeholderTextColor={GhostexPalette.MUTED}
        selectionColor={CommandPadPalette.SELECTION}
        spellCheck
        style={styles.field}
        submitBehavior="newline"
        value={text}
        onChangeText={setText}
        onKeyPress={(event) => forwardEditingKey(event.nativeEvent.key)}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={text.length === 0 ? CommandPadCopy.sendEnter : CommandPadCopy.insertText}
        style={({ pressed }) => [styles.send, pressed && styles.sendPressed]}
        onPress={send}
      >
        {text.length === 0 ? (
          <SendIcon size={18} color={GhostexPalette.ACCENT_FOREGROUND} />
        ) : (
          <ArrowIcon direction="up" size={18} color={GhostexPalette.ACCENT_FOREGROUND} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: GhostexPalette.TERMINAL_BACKGROUND,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CommandPadPalette.EDITOR_LINE,
  },
  field: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: CommandPadPalette.PILL_LINE,
    backgroundColor: CommandPadPalette.PILL,
    color: GhostexPalette.FOREGROUND,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GhostexPalette.ACCENT,
  },
  sendPressed: {
    opacity: 0.8,
  },
});
