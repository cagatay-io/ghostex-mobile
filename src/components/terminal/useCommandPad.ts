/**
 * The Befehlspad's state on the terminal screen: open or closed, the layer in the keyboard's place, the text
 * editor, the key input, and the nine keys from Settings. The rules between them follow the approved mockups
 * (`mockups/befehlspad`, D-034, D-037):
 * - The pad stays open until its toggle is tapped again (REQ-KEY-007). Closing it closes a layer and drops armed
 *   modifiers, so nothing stays armed out of sight.
 * - A layer (Keys, Agent) takes the keyboard's place: opening one while the keyboard is up hides the keyboard;
 *   tapping the same layer button again brings back what was there before; the keyboard button, or the keyboard
 *   coming up any other way (a tap on the terminal), ends the layer. A layer that waits for the keyboard stays
 *   until the keyboard is up, so the pad does not drop and rise again in between.
 * - The text editor lives on the keyboard: it opens with the pen (closing a layer), and the keyboard going away
 *   closes it.
 * - Switching sessions closes the layer and the editor and starts with no armed modifier.
 * The geometry (how far the pad stands above the covered part) stays with the screen.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { useAgentHotkeysStore } from '../../settings/agentHotkeys';
import { useExtraKeysStore } from '../../settings/extraKeys';
import { useSettingsStore } from '../../settings/store';
import type { CommandPadLayerKind } from './CommandPadLayer';
import { resolveCommandPadKeys, type CommandPadKey } from './commandPadKeys';
import { agentKeyPage } from './keyBarPages';
import type { ModifierState, TerminalKeyInput } from './terminalKeyInput';
import { useTerminalKeyInput } from './useTerminalKeyInput';
import { useTerminalTextEditor } from './TerminalTextEditor';

/** How long a layer waits for the keyboard it asked for before it goes anyway (a refused focus). */
const LAYER_KEYBOARD_WAIT_MS = 1500;

type LayerState = {
  kind: CommandPadLayerKind;
  /** The keyboard was up when the layer took its place. */
  restoreKeyboard: boolean;
  /** The keyboard was asked for; the layer leaves once it is up. */
  leaving: boolean;
};

export type CommandPadOptions = {
  /** The terminal the pad is shown over; null while there is none (pad switched off, no tab, chat view). */
  sessionKey: string | null;
  /** Resolved agent id of the shown session (`''` / `'terminal'` when none), for the Agent layer. */
  agentId: string;
  keyboardVisible: boolean;
  /** How far the keyboard reaches into the window while it is up (0 while it is down). */
  keyboardOverlap: number;
  /** The window's width: a keyboard height is only reused in the window it was measured in. */
  windowWidth: number;
  showKeyboard: () => void;
  dismissKeyboard: () => void;
};

export type CommandPadState = {
  input: TerminalKeyInput;
  modifiers: ModifierState;
  keys: CommandPadKey[];
  open: boolean;
  toggle: () => void;
  layer: CommandPadLayerKind | null;
  /** The session's agent has hotkeys for the Agent layer. */
  agentAvailable: boolean;
  selectLayer: (kind: CommandPadLayerKind) => void;
  /** The keyboard's last height in this window, for a layer in its place; undefined while unknown. */
  layerMinHeight: number | undefined;
  editorVisible: boolean;
  toggleEditor: () => void;
  /** The ring's keyboard button: hides the keyboard, or brings it back (ending a layer). */
  toggleKeyboard: () => void;
};

export function useCommandPad({
  sessionKey,
  agentId,
  keyboardVisible,
  keyboardOverlap,
  windowWidth,
  showKeyboard,
  dismissKeyboard,
}: CommandPadOptions): CommandPadState {
  const { input, modifiers } = useTerminalKeyInput(sessionKey);
  const {
    visible: editorVisible,
    toggle: toggleEditorOpen,
    dismiss: dismissEditor,
  } = useTerminalTextEditor(sessionKey);
  const storedKeys = useSettingsStore((state) => state.settings.commandPadKeys);
  const agentProfiles = useAgentHotkeysStore((state) => state.profiles);
  const extraKeysLayout = useExtraKeysStore((state) => state.layout);
  const keys = useMemo(
    () => resolveCommandPadKeys(storedKeys, { agentProfiles, extraKeysLayout, pasteSupported: Platform.OS === 'ios' }),
    [storedKeys, agentProfiles, extraKeysLayout],
  );
  const agentAvailable = useMemo(() => agentKeyPage(agentId, agentProfiles) !== null, [agentId, agentProfiles]);
  const [open, setOpen] = useState(false);
  const [layer, setLayer] = useState<LayerState | null>(null);

  // Adjusted while rendering, so no frame shows a stale layer or editor.
  const [seen, setSeen] = useState({ sessionKey, keyboardVisible });
  if (seen.sessionKey !== sessionKey || seen.keyboardVisible !== keyboardVisible) {
    setSeen({ sessionKey, keyboardVisible });
    if (seen.sessionKey !== sessionKey) setLayer(null);
    // No pad shown any more (switched off, chat view): it starts closed next time.
    if (sessionKey === null) {
      setOpen(false);
      dismissEditor();
    }
    // The keyboard takes its place back from a layer; the editor lives on the keyboard.
    if (keyboardVisible && !seen.keyboardVisible) setLayer(null);
    if (!keyboardVisible && seen.keyboardVisible) dismissEditor();
  }

  const [restingKeyboard, setRestingKeyboard] = useState<{ width: number; overlap: number } | null>(null);
  if (keyboardOverlap > 0 && (restingKeyboard?.overlap !== keyboardOverlap || restingKeyboard.width !== windowWidth)) {
    setRestingKeyboard({ width: windowWidth, overlap: keyboardOverlap });
  }
  const layerMinHeight = restingKeyboard?.width === windowWidth ? restingKeyboard.overlap : undefined;

  const leaving = layer?.leaving === true;
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setLayer(null), LAYER_KEYBOARD_WAIT_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  const leaveLayer = useCallback(
    (current: LayerState): void => {
      if (!current.restoreKeyboard) {
        setLayer(null);
        return;
      }
      setLayer({ ...current, leaving: true });
      showKeyboard();
    },
    [showKeyboard],
  );

  const toggle = useCallback((): void => {
    if (!open) {
      setOpen(true);
      return;
    }
    setOpen(false);
    input.stopRepeat();
    input.clearModifiers();
    if (layer !== null) leaveLayer(layer);
  }, [open, input, layer, leaveLayer]);

  const selectLayer = useCallback(
    (kind: CommandPadLayerKind): void => {
      // The tick the key bar's KEYS / AGENT page toggles gave, opening or closing (keyBarHapticsEnabled).
      input.selectionFeedback();
      if (layer !== null && layer.kind === kind) {
        leaveLayer(layer);
        return;
      }
      dismissEditor();
      setLayer({ kind, restoreKeyboard: layer?.restoreKeyboard ?? keyboardVisible, leaving: false });
      if (keyboardVisible) dismissKeyboard();
    },
    [input, layer, leaveLayer, dismissEditor, keyboardVisible, dismissKeyboard],
  );

  const toggleEditor = useCallback((): void => {
    input.stopRepeat();
    input.clearModifiers();
    if (!editorVisible) setLayer(null);
    toggleEditorOpen();
  }, [input, editorVisible, toggleEditorOpen]);

  const toggleKeyboard = useCallback((): void => {
    if (keyboardVisible) {
      dismissKeyboard();
      return;
    }
    if (layer !== null) setLayer({ ...layer, leaving: true });
    showKeyboard();
  }, [keyboardVisible, dismissKeyboard, layer, showKeyboard]);

  return {
    input,
    modifiers,
    keys,
    open,
    toggle,
    layer: layer?.kind ?? null,
    agentAvailable,
    selectLayer,
    layerMinHeight,
    editorVisible,
    toggleEditor,
    toggleKeyboard,
  };
}
