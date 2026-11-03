/**
 * The Befehlspad's state on the terminal screen: open or closed, the layer in the keyboard's place, the text
 * editor, the key input, and the nine keys from Settings. The rules between them follow the designs:
 * - The pad stays open until its toggle is tapped again. Closing it closes a layer and drops armed
 *   modifiers, so nothing stays armed out of sight.
 * - A layer (Keys, Agent) takes the keyboard's place: opening one while the keyboard is up hides the keyboard;
 *   tapping the same layer button again brings back what was there before; the keyboard button, or the keyboard
 *   coming up any other way (a tap on the terminal), ends the layer. A layer that waits for the keyboard stays
 *   until the keyboard is up, so the pad does not drop and rise again in between.
 * - The text editor lives on the keyboard: it opens with the pen (closing a layer), and the keyboard going away
 *   closes it.
 * - Switching sessions closes the layer and the editor and starts with no armed modifier.
 * - Where the user moved the pad is stored per layout (`commandPadPosition`); layers, the editor and the keyboard
 *   never change it: they move the pad only while it would stand under them.
 * - Where the open pad does not fit above the keyboard even reaching over the header (a phone in landscape),
 *   opening it lowers the keyboard and closing it brings the keyboard back, as a layer takes the keyboard's place.
 *   Asking for the keyboard while the pad holds it down (the ring's keyboard button, a tap on the terminal) closes
 *   the pad first: the two do not fit together. Likewise, whenever the keyboard is up and the open pad has no room
 *   above it, the pad closes and the keyboard stays, and armed modifiers go with the pad: when the keyboard comes up
 *   (a tap on the terminal, the ring's keyboard button, the text editor taking the focus, any other way), and when a
 *   turn, fold or resize takes the room while both are up. The pad wins only while the person is opening it. What
 *   the person asks for is judged at once, also while the room waits to settle (below): the iOS keyboard brought up
 *   from hidden (`keyboardAppearances`), the text editor opening on it. A keyboard request while a turn runs with the
 *   keyboard up brings no keyboard up and belongs to the turn: the ring's keyboard button, shown for a moment while
 *   the old keyboard frame lies outside the new window, or a tap on the terminal is judged with the turn's wait. A
 *   turn, fold or resize is not judged while it is under way: the system reports the window's size, its safe area,
 *   the keyboard's frame and the terminal area's layout separately and in any order, and a mix of old and new reports
 *   can show too little room where the new pose has enough, or the reverse. So the room is judged once none of these
 *   has changed for `PAD_ROOM_SETTLE_MS`, from their latest values (`roomInputs`, `keyboardOverlap`); until then the
 *   pad stays as it was, open even where the new pose has no room for it, possibly cut off for that moment. A
 *   person's request during that wait does not end it: it is judged from the values reported so far, and the wait
 *   still judges the room once it has settled.
 * - Where a Keys or Agent layer opened from the ring leaves the open pad no room above it, even reaching over the
 *   header (the pad holding the keyboard down, or a phone in landscape whose keyboard was down when the pad opened),
 *   the screen draws the pad closed and gives the layer its own close button (`closeLayer`): the layer wins because
 *   nothing of it or of the pad is cut off that way. The pad stays open underneath, so closing the layer, or tapping
 *   the toggle, shows it again and the keyboard stays down; armed modifiers stay armed, their chip stays beside the
 *   toggle. Where the keyboard was up when the layer came (a rotation took the room after it opened), the pad then
 *   holds the keyboard down, as the two do not fit together. The keyboard coming back while the layer stands in for
 *   the pad ends the layer and closes the pad. Whether the pad fits is the screen's to say, each render
 *   (`padGaveWay`), so a rotation or window change that makes room shows the pad above the layer again (and the
 *   layer behaves as any other), and one that takes the room away hands the place back to the layer.
 * The geometry (how far the pad stands above the covered part, where a place lies in the area) stays with the
 * screen and `commandPadLayout.ts`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { useAgentHotkeysStore } from '../../settings/agentHotkeys';
import type { CommandPadLayoutKind, CommandPadPlacement } from '../../settings/commandPad';
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

/**
 * How long the room the open pad is judged in (`roomInputs`, `keyboardOverlap`) must stay unchanged before the pad's
 * room above the keyboard is judged. A turn, fold or resize reports the window's size, its safe area, the keyboard's
 * frame and the terminal area's layout separately and in any order; each report starts the wait again, so it bridges
 * the gaps between them, not their whole span. The reports of one change are expected within a few frames of each
 * other (how React Native delivers them; not measured on a device): 250 ms leaves a wide margin over that, and it is
 * as long as the keyboard's own hide motion. A pad without room in the new pose stays on screen, possibly cut off, for
 * at most that long after the last report; reports further apart than that are judged as separate changes.
 */
export const PAD_ROOM_SETTLE_MS = 250;

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
  /** The layout whose stored place the pad uses: `flat`; laptop mode passes `laptop`. */
  layout: CommandPadLayoutKind;
  keyboardVisible: boolean;
  /** How far the keyboard reaches into the window while it is up (0 while it is down). */
  keyboardOverlap: number;
  /** The window's width: a keyboard height is only reused in the window it was measured in. */
  windowWidth: number;
  showKeyboard: () => void;
  dismissKeyboard: () => void;
  /**
   * The screen drew the open pad closed in its last render because it has no room above the layer shown
   * (`padGivesWay` in `TerminalScreen.tsx`); the keyboard coming back then closes the pad.
   */
  padGaveWay: boolean;
  /**
   * Whether the open pad has room above the keyboard as it is now, with the text editor on it when `editorOpen`,
   * reaching over the header if it must; the pad closes on a false answer while the keyboard is up, once the room
   * has settled (`roomInputs`), or at once as the person brings the keyboard up or opens the text editor on it.
   */
  openPadFitsAboveKeyboard: (editorOpen: boolean) => boolean;
  /**
   * What the room above the keyboard is read from besides the keyboard's overlap (`keyboardOverlap`): the window's
   * size, its safe area and the terminal area's frame. A turn, fold or resize changes them, reported one by one; the
   * room is judged once neither these nor the keyboard's overlap while it is up have changed for `PAD_ROOM_SETTLE_MS`.
   */
  roomInputs: readonly number[];
  /**
   * How often the keyboard has come up from hidden (iOS: the shared keyboard store's count; a turn or fold of a
   * keyboard that is up is none). Each new one is the person's request (a tap on the terminal, the ring's keyboard
   * button, the text editor taking the focus) and is judged at once, also while the room waits to settle. A request
   * while the keyboard is still up, as during a turn, adds none and is judged with the turn's wait.
   */
  keyboardAppearances: number;
};

export type CommandPadState = {
  input: TerminalKeyInput;
  modifiers: ModifierState;
  keys: CommandPadKey[];
  open: boolean;
  /**
   * Opens or closes the pad. `openPadFits`: whether the open pad fits above what covers the terminal now (reaching
   * over the header if it must); when it does not, opening it lowers the keyboard.
   */
  toggle: (openPadFits?: boolean) => void;
  layer: CommandPadLayerKind | null;
  /** The session's agent has hotkeys for the Agent layer. */
  agentAvailable: boolean;
  selectLayer: (kind: CommandPadLayerKind) => void;
  /** The keyboard's last height in this window, for a layer in its place; undefined while unknown. */
  layerMinHeight: number | undefined;
  /**
   * Closes the layer that stands in for the open pad (its own close button, or the toggle): the pad shows again and
   * the keyboard stays down.
   */
  closeLayer: () => void;
  editorVisible: boolean;
  toggleEditor: () => void;
  /** The ring's keyboard button: hides the keyboard, or brings it back (ending a layer). */
  toggleKeyboard: () => void;
  /** The user's place for this layout; undefined: the default (bottom right). */
  placement: CommandPadPlacement | undefined;
  /** Stores a new place for this layout. */
  movePad: (placement: CommandPadPlacement) => void;
};

export function useCommandPad({
  sessionKey,
  agentId,
  layout,
  keyboardVisible,
  keyboardOverlap,
  windowWidth,
  showKeyboard,
  dismissKeyboard,
  padGaveWay,
  openPadFitsAboveKeyboard,
  roomInputs,
  keyboardAppearances,
}: CommandPadOptions): CommandPadState {
  const { input, modifiers } = useTerminalKeyInput(sessionKey);
  const {
    visible: editorVisible,
    toggle: toggleEditorOpen,
    dismiss: dismissEditor,
  } = useTerminalTextEditor(sessionKey);
  const storedKeys = useSettingsStore((state) => state.settings.commandPadKeys);
  const placement = useSettingsStore((state) => state.settings.commandPadPosition[layout]);
  const agentProfiles = useAgentHotkeysStore((state) => state.profiles);
  const extraKeysLayout = useExtraKeysStore((state) => state.layout);
  const keys = useMemo(
    () => resolveCommandPadKeys(storedKeys, { agentProfiles, extraKeysLayout, pasteSupported: Platform.OS === 'ios' }),
    [storedKeys, agentProfiles, extraKeysLayout],
  );
  const agentAvailable = useMemo(() => agentKeyPage(agentId, agentProfiles) !== null, [agentId, agentProfiles]);
  const [open, setOpen] = useState(false);
  const [layer, setLayer] = useState<LayerState | null>(null);
  // The pad lowered the keyboard when it opened; it gives the keyboard back when it closes.
  const [heldKeyboard, setHeldKeyboard] = useState(false);
  // How often the keyboard came back while the pad held it down and so closed the pad; what closing drops goes too.
  const [keyboardClosings, setKeyboardClosings] = useState(0);

  // Adjusted while rendering, so no frame shows a stale layer or editor.
  let keyboardClosesPad = false;
  const [seen, setSeen] = useState({ sessionKey, keyboardVisible });
  if (seen.sessionKey !== sessionKey || seen.keyboardVisible !== keyboardVisible) {
    setSeen({ sessionKey, keyboardVisible });
    if (seen.sessionKey !== sessionKey) setLayer(null);
    // No pad shown any more (switched off, chat view): it starts closed next time.
    if (sessionKey === null) {
      setOpen(false);
      setHeldKeyboard(false);
      dismissEditor();
    }
    // The keyboard takes its place back from a layer; the editor lives on the keyboard.
    if (keyboardVisible && !seen.keyboardVisible) {
      setLayer(null);
      // Back while the pad held it down or a layer stood in for it: the pad closes.
      if (heldKeyboard || (open && padGaveWay)) keyboardClosesPad = true;
    }
    if (!keyboardVisible && seen.keyboardVisible) dismissEditor();
  }
  // The room the open pad is judged in, and whether it has stood still for PAD_ROOM_SETTLE_MS since it last moved. A
  // keyboard that comes up or goes down is the person's doing and does not move it; a keyboard that changes its frame
  // while up does (a turn, a fold, a resize, a taller keyboard). Each move starts the wait again.
  const [room, setRoom] = useState({ inputs: roomInputs, keyboardOverlap, still: true });
  const roomMoved =
    room.inputs.length !== roomInputs.length || room.inputs.some((value, index) => value !== roomInputs[index]);
  const keyboardMoved = room.keyboardOverlap > 0 && keyboardOverlap > 0 && room.keyboardOverlap !== keyboardOverlap;
  if (roomMoved || room.keyboardOverlap !== keyboardOverlap) {
    setRoom({ inputs: roomInputs, keyboardOverlap, still: room.still && !roomMoved && !keyboardMoved });
  }
  useEffect(() => {
    if (room.still) return;
    const timer = setTimeout(() => setRoom((current) => ({ ...current, still: true })), PAD_ROOM_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [room]);
  // The person's own request in this render, judged at once even while the room waits to settle: the keyboard brought
  // up from hidden, or the text editor opened on it.
  const [asked, setAsked] = useState({ keyboardAppearances, editorVisible });
  let personAsked = false;
  if (asked.keyboardAppearances !== keyboardAppearances || asked.editorVisible !== editorVisible) {
    setAsked({ keyboardAppearances, editorVisible });
    personAsked = asked.keyboardAppearances !== keyboardAppearances || (editorVisible && !asked.editorVisible);
  }
  // The keyboard up and the open pad without room above it, even over the header, however that came about (the
  // keyboard came up, the text editor opened on it, a turn, fold or resize took the room): the pad closes and the
  // keyboard stays. Judged in a room that has settled, so from the latest values of all its reports, or at once on the
  // person's request; a pending wait goes on either way. Not while the pad holds the keyboard down: the person opened
  // it there, and the keyboard is on its way down.
  const roomSettled = room.still && !roomMoved && !keyboardMoved;
  if (
    (roomSettled || personAsked) &&
    open &&
    keyboardVisible &&
    !heldKeyboard &&
    !openPadFitsAboveKeyboard(editorVisible)
  ) {
    keyboardClosesPad = true;
  }
  if (keyboardClosesPad) {
    setHeldKeyboard(false);
    setOpen(false);
    setKeyboardClosings((count) => count + 1);
  }

  useEffect(() => {
    if (keyboardClosings === 0) return;
    input.stopRepeat();
    input.clearModifiers();
  }, [keyboardClosings, input]);

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

  const closePad = useCallback((): void => {
    setOpen(false);
    input.stopRepeat();
    input.clearModifiers();
    if (layer !== null) leaveLayer(layer);
    if (heldKeyboard) {
      setHeldKeyboard(false);
      showKeyboard();
    }
  }, [input, layer, leaveLayer, heldKeyboard, showKeyboard]);

  const toggle = useCallback(
    (openPadFits = true): void => {
      if (open) {
        closePad();
        return;
      }
      setOpen(true);
      if (keyboardVisible && !openPadFits) {
        setHeldKeyboard(true);
        dismissKeyboard();
      }
    },
    [open, closePad, keyboardVisible, dismissKeyboard],
  );

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

  const closeLayer = useCallback((): void => {
    if (layer === null) return;
    input.selectionFeedback();
    // The keyboard was up when the layer came: it stays down for the pad, which gives it back when it closes.
    if (layer.restoreKeyboard) setHeldKeyboard(true);
    setLayer(null);
  }, [input, layer]);

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
    // The pad holds the keyboard down: it closes, and closing brings the keyboard back.
    if (heldKeyboard) {
      closePad();
      return;
    }
    if (layer !== null) setLayer({ ...layer, leaving: true });
    showKeyboard();
  }, [keyboardVisible, dismissKeyboard, heldKeyboard, closePad, layer, showKeyboard]);

  const movePad = useCallback(
    (next: CommandPadPlacement): void => {
      const { settings, setSetting } = useSettingsStore.getState();
      setSetting('commandPadPosition', { ...settings.commandPadPosition, [layout]: next });
    },
    [layout],
  );

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
    closeLayer,
    editorVisible,
    toggleEditor,
    toggleKeyboard,
    placement,
    movePad,
  };
}
