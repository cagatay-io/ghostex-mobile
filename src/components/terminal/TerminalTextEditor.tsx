/**
 * The terminal's text editor, opened by the pen in the Befehlspad's ring and docked above
 * the software keyboard (`KeyBarDock`): a multiline draft with the full text keyboard (emoji, dictation,
 * suggestions) and Send. Send inserts the draft into the terminal and clears it; with an empty draft it sends
 * Enter. Return in the keyboard adds a newline to the draft. Backspace or Delete on an empty draft go to the
 * terminal (terminal-screen.md §2 "Text editor"). The draft belongs to its session and is kept in the terminal store
 * (`textEditorDraftBySessionKey`), in memory only: however the editor closes (the pen, the keyboard going away, the pad
 * lowering the keyboard, a layer taking its place, a session switch, leaving the terminal screen), that session's
 * next opening shows it again; only Send empties it.
 * Half folded like a laptop the screen docks it above the fold instead (`laptopMode.ts`).
 *
 * Closing it with the pen hands the keyboard back to the terminal: the terminal is asked for first responder
 * while the editor, which holds it, is still mounted, so UIKit moves the responder straight over and the
 * keyboard stays up; the editor goes once the native call has answered. A refusal or an error still closes it
 * (the keyboard then hides with the editor) and is logged, so the failure is not silent.
 *
 * While the pad is closed because the open pad has no room above the keyboard and the editor, even over the header
 * (a phone in landscape; in the laptop pose an upper half too short for the pad above the editor), the pen is out of
 * reach: the editor then has its own close button at its end, the layer's (`CommandPadCloseButton`), which does what
 * the pen does.
 */

import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { GhostexNative } from '../../../modules/ghostex-native/src';
import { CommandPadCopy } from '../../copy';
import { useTerminalStore } from '../../terminal/sessions';
import { CommandPadPalette, GhostexPalette } from '../../theme/palette';
import { CommandPadCloseButton } from './CommandPadLayer';
import { ArrowIcon, SendIcon } from './icons';

export type TerminalTextEditorState = {
  visible: boolean;
  /** Pen: opens the editor, or hands the keyboard back to the terminal and closes it. */
  toggle: () => void;
  /** Closes it without a hand-over (the keyboard went away, a layer took its place); the draft stays. */
  dismiss: () => void;
};

/** Whether the editor is open for the shown session; a session switch closes it and keeps each session's draft. */
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

export type TerminalTextEditorProps = {
  sessionKey: string;
  /**
   * Given only while the pad is closed for lack of room above the keyboard and the editor: its own close button,
   * since the pen in the pad's ring is not shown then. It closes the editor as the pen does.
   */
  onClose?: () => void;
  /** Called after Send has sent the draft (laptop mode: the pad that gave way to the editor opens again). */
  onSent?: () => void;
};

/** The editor's height with one line of text: the dock's height until it has laid out. */
export const TEXT_EDITOR_HEIGHT = 56;

// A failed call means the terminal entry closed or failed; the terminal's state overlay shows that.
const ignoreClosedTerminal = (): void => undefined;

export default function TerminalTextEditor({ sessionKey, onClose, onSent }: TerminalTextEditorProps) {
  // The session's draft (`textEditorDraftBySessionKey`): the editor starts with it and keeps it up to date. Only the
  // editor reads it, and only as it opens, so typing redraws the editor alone.
  const [text, setShownText] = useState(
    () => useTerminalStore.getState().textEditorDraftBySessionKey[sessionKey] ?? '',
  );
  const setText = (next: string): void => {
    useTerminalStore.getState().setTextEditorDraft(sessionKey, next);
    setShownText(next);
  };

  const send = (): void => {
    if (text.length === 0) void GhostexNative.sendKey(sessionKey, 'enter', {}).catch(ignoreClosedTerminal);
    else void GhostexNative.sendText(sessionKey, text).catch(ignoreClosedTerminal);
    setText('');
    onSent?.();
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
      {onClose !== undefined ? (
        <CommandPadCloseButton
          accessibilityLabel={CommandPadCopy.closeEditor}
          accessibilityHint={CommandPadCopy.closeEditorHint}
          style={styles.close}
          onPress={onClose}
        />
      ) : null}
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
  // The 44 pt target's extra height lies over the bar's padding, so the bar keeps its height; its face centres on Send.
  close: {
    marginVertical: -2,
  },
});
