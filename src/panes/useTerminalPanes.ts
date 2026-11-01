/**
 * The terminal screen's pane controller, beside the pane state of `usePaneHost`: what a touch in a pane, a pick in the
 * chooser, a row of the agents or attention list pane and the header's Panes button do, the keyboard following the
 * active pane, Back from a question opened in the attention list pane, and the active pane's content opening full
 * screen when the Duo folds. `paneLayoutInput` places the two panes in the terminal area from the keyboard, the text
 * editor and the fold. `TerminalScreen` calls the hook once its keyboard and editor state are known.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { LayoutRectangle } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { GhostexNative } from '../../modules/ghostex-native/src';
import type { FoldDivision } from '../../modules/ghostex-native/src/GhostexNative.types';
import { sessionDeepLink } from '../app/deepLinkHandler';
import type * as DeepLinksModule from '../app/deepLinks';
import type { LaptopFold } from '../components/common/verticalBar/layout';
import { laptopEditorInset, laptopObstruction } from '../components/terminal/laptopMode';
import { TEXT_EDITOR_HEIGHT } from '../components/terminal/TerminalTextEditor';
import type { GhostexSession } from '../contract/mobileSummary';
import { useInventoryStore } from '../inventory/store';
import type { RootStackParamList } from '../navigation/types';
import type { OpenSessionTarget } from '../notifications/AttentionList';
import { machineTargetFor } from '../screens/terminal-screen/session-lookups';
import { acknowledgeSessionAttention } from '../terminal/attention';
import { attachSessionKey, useTerminalStore, type TerminalTab } from '../terminal/sessions';
import { PANE_FOLD_CLEARANCE, paneGeometry, type PaneGeometryInput, type PaneIndex } from './geometry';
import type { PaneArrangement } from './layout';
import { openPaneFullScreen } from './openFullScreen';
import type { PaneContent, PaneDisplay } from './resolve';
import { usePaneStore } from './store';
import type { PaneHost } from './usePaneHost';

type TerminalNavigation = NativeStackScreenProps<RootStackParamList, 'Terminal'>['navigation'];
type TwoPanes = Extract<PaneDisplay, { kind: 'panes' }>;

/**
 * Where the stack's full-width swipe back may begin: from `start` to `end` points across the screen. A start past the
 * end leaves no point, so the swipe does not begin anywhere (used while the swipe is off, `swipeBackOff`).
 */
const NO_SWIPE_BACK_START = { start: 1, end: 0 } as const;

export type TerminalPanesInput = {
  /** The pane state (`usePaneHost`). */
  panes: PaneHost;
  navigation: TerminalNavigation;
  isFocused: boolean;
  /** The window has pane slots and the selected tab is an agent session shown as a terminal (`usePaneHost`'s). */
  panesOffered: boolean;
  /** The window has pane slots (the fold's divisions), offered or not. */
  hasPaneSlots: boolean;
  tabs: readonly TerminalTab[];
  selectedSessionKey: string | null;
  /** The computer of the selected tab. */
  activeMachineId: string | null;
  chatModeActive: boolean;
  /** The terminal on screen with one pane. */
  mountedTerminalSessionKey: string | null;
  keyboardVisible: boolean;
  /** The text editor is open: it keeps the keyboard. */
  editorShown: boolean;
  dismissKeyboard: () => void;
  /** The screen's way back to Sessions. */
  showSessions: () => void;
  /**
   * A finger is on the command pad's toggle (`CommandPad`'s `onHold`): the stack's swipe back does not start
   * meanwhile, not even for that finger's own touch.
   */
  padHeld: boolean;
};

export type TerminalPanes = {
  /** The screen's Back (button and side bar entry): to the panes after a question opened from the attention list. */
  goBack: () => void;
  /** A touch in a pane. */
  activatePane: (slot: PaneIndex) => void;
  /** A session picked in the chooser or the agents pane, on the selected tab's computer. */
  pickPaneSession: (session: GhostexSession) => void;
  /** A row opened in the attention list pane. */
  openAttentionTarget: (target: OpenSessionTarget) => void;
  /** The header's Panes button. */
  togglePanes: () => void;
  showsTwoPanes: boolean;
  /** The slot of the chooser, or null. */
  chooserSlot: PaneIndex | null;
  /** The slot of the selected session's pane (else the active one): the queued prompts stand there. */
  selectedPaneSlot: PaneIndex;
};

export function useTerminalPanes({
  panes,
  navigation,
  isFocused,
  panesOffered,
  hasPaneSlots,
  tabs,
  selectedSessionKey,
  activeMachineId,
  chatModeActive,
  mountedTerminalSessionKey,
  keyboardVisible,
  editorShown,
  dismissKeyboard,
  showSessions,
  padHeld,
}: TerminalPanesInput): TerminalPanes {
  const twoPanes: TwoPanes | null = panes.display.kind === 'panes' ? panes.display : null;

  // A question opened from the attention list pane: its chat view stands full screen while the panes wait, and the
  // screen's Back (button and side bar entry) goes back to them instead of to Sessions: the session that was beside the
  // list is selected again, or, when the question was that session's, it shows its terminal again, so the stored
  // layout is there as it was. Over as soon as that chat view is left another way (its terminal view, another session);
  // every other way into a chat (the Notifications screen, a notification tap) keeps Back to Sessions.
  const [paneQuestion, setPaneQuestion] = useState<{ chatSessionKey: string; returnSessionKey: string } | null>(null);
  useEffect(() => {
    if (paneQuestion !== null && (selectedSessionKey !== paneQuestion.chatSessionKey || !chatModeActive)) {
      setPaneQuestion(null);
    }
  }, [paneQuestion, selectedSessionKey, chatModeActive]);
  // The stack's swipe back would leave for Sessions past the waiting panes, so it is not offered while such a chat
  // view stands: Back is the way back there. Turned off rather than caught (`usePreventRemove`), whose iOS path lets
  // the native pop begin, cancels it and puts the screen back into the native stack. A finger on the screen's pad
  // toggle turns it off as well (`padHeld`), so neither the hold nor the drag is taken for it. One writer for both,
  // with both of the stack's options: `gestureEnabled` for touches that begin meanwhile, and an empty
  // `gestureResponseDistance` for the touch already on the toggle, which the stack reads only as the swipe is about to
  // begin. The swipe is off while a finger is on the toggle or such a question stands, so letting the pad go during
  // the question keeps it off; once neither holds, the screen keeps the stack's own swipe.
  const swipeBackOff = padHeld || paneQuestion !== null;
  useLayoutEffect(() => {
    if (!swipeBackOff) return;
    navigation.setOptions({ gestureEnabled: false, gestureResponseDistance: NO_SWIPE_BACK_START });
    return () => navigation.setOptions({ gestureEnabled: undefined, gestureResponseDistance: undefined });
  }, [navigation, swipeBackOff]);
  const goBack = useCallback((): void => {
    const question = paneQuestion;
    setPaneQuestion(null);
    const store = useTerminalStore.getState();
    if (
      question === null ||
      store.selectedSessionKey !== question.chatSessionKey ||
      !store.tabs.some((tab) => tab.sessionKey === question.returnSessionKey)
    ) {
      showSessions();
      return;
    }
    dismissKeyboard();
    if (question.returnSessionKey === question.chatSessionKey) {
      store.setSessionViewMode(question.chatSessionKey, 'terminal');
    } else {
      store.selectTab(question.returnSessionKey);
    }
  }, [paneQuestion, dismissKeyboard, showSessions]);

  // A touch in a pane makes it the active one (the pane tapped last): a session pane's session is selected where it
  // stands, not scrolled, and its attention acknowledged as a tap on its tab does; a pane without a terminal only
  // becomes the active one. The keyboard follows below.
  const activatePane = useCallback(
    (slot: PaneIndex): void => {
      const content = twoPanes?.slots[slot];
      const store = useTerminalStore.getState();
      if (content === undefined || content.kind === 'chooser') return;
      usePaneStore.getState().setActiveSlot(slot);
      if (content.kind !== 'session' || content.sessionKey === store.selectedSessionKey) return;
      const tab = store.tabs.find((entry) => entry.sessionKey === content.sessionKey);
      if (tab?.ghostexSessionId !== undefined) acknowledgeSessionAttention(tab.machineId, tab.ghostexSessionId);
      store.selectTab(content.sessionKey, { scrollToBottom: false });
    },
    [twoPanes],
  );

  // The keyboard follows the active pane. However it changes (a touch in a pane, the tab strip, a link or a
  // notification, a pick in the chooser, the selected tab or the active pane closing, which leaves the other terminal
  // alone on screen), while the keyboard is up the new active terminal takes it, once that terminal is open, so typing
  // never goes to the other pane. The text editor keeps the keyboard while it is open, and a keyboard the person
  // lowered stays down. With one pane a change of tab moves no keyboard, as before. A pane without a terminal
  // becoming the active one takes the keyboard from the terminal: typing goes to the active pane, into a field of
  // its own once one is tapped. From such a pane the keyboard comes back the same way: up in one of its fields, it
  // goes to the terminal that becomes active (a touch in the session pane, the tab strip, a pick in the chooser), or
  // to the session left alone on screen when either pane closes.
  const activePaneContent = twoPanes === null || !isFocused ? null : twoPanes.slots[twoPanes.active];
  const activePaneSessionKey = activePaneContent?.kind === 'session' ? activePaneContent.sessionKey : null;
  const otherPaneActive = activePaneContent !== null && activePaneContent.kind !== 'session';
  // The terminal typing goes to: the active pane's, or with one pane the terminal on screen; and the terminal beside
  // it: the other session pane's, or beside a pane without a terminal the session pane's.
  const typingInPanes = twoPanes !== null;
  const typingSessionKey = typingInPanes ? activePaneSessionKey : mountedTerminalSessionKey;
  const besideContent = otherPaneActive ? twoPanes?.slots.find((content) => content.kind === 'session') : undefined;
  const besideSessionKey = !typingInPanes
    ? null
    : besideContent?.kind === 'session'
      ? besideContent.sessionKey
      : panes.paneSessionKey;
  const typingTerminalOpen = tabs.some((tab) => tab.sessionKey === typingSessionKey && tab.state === 'open');
  const lastTyping = useRef<{ sessionKey: string | null; other: boolean; inPanes: boolean; beside: string | null }>({
    sessionKey: null,
    other: false,
    inPanes: false,
    beside: null,
  });
  const keyboardFollows = useRef<string | null>(null);
  useEffect(() => {
    const previous = lastTyping.current;
    lastTyping.current = {
      sessionKey: typingSessionKey,
      other: otherPaneActive,
      inPanes: typingInPanes,
      beside: besideSessionKey,
    };
    if (typingSessionKey !== previous.sessionKey || typingInPanes !== previous.inPanes) {
      // From one pane to the other, or to the pane left alone on screen when the active one closed; from a browser,
      // files or Git changes pane the same way, except when the Duo folds (its content then opens full screen).
      const fromPane = previous.sessionKey !== null || (previous.other && (typingInPanes || panesOffered));
      const follows =
        fromPane &&
        typingSessionKey !== null &&
        (typingInPanes ? previous.inPanes : typingSessionKey === previous.beside);
      keyboardFollows.current = follows ? typingSessionKey : null;
    }
    // From a terminal pane to a pane without a terminal: the terminal lets the keyboard go.
    if (otherPaneActive && previous.inPanes && previous.sessionKey !== null && keyboardVisible) {
      void GhostexNative.blurTerminal(previous.sessionKey).catch(() => undefined);
    }
    if (!keyboardVisible || editorShown) keyboardFollows.current = null;
    const sessionKey = keyboardFollows.current;
    if (sessionKey === null || !typingTerminalOpen) return;
    keyboardFollows.current = null;
    void GhostexNative.focusTerminal(sessionKey).catch(() => undefined);
  }, [
    typingSessionKey,
    typingInPanes,
    besideSessionKey,
    typingTerminalOpen,
    keyboardVisible,
    editorShown,
    otherPaneActive,
    panesOffered,
  ]);

  // A session opened from a pane goes into the session pane as a terminal (a pane shows no chat): the chooser's pick
  // beside the session on screen, a session of the agents pane or a row of the attention list beside them. Any
  // computer's: the attention list spans them all.
  const openPaneSession = useCallback((machineId: string, sessionId: string): void => {
    const machine = machineTargetFor(machineId);
    if (machine === null) return;
    const store = useTerminalStore.getState();
    const sessionKey = attachSessionKey(machine.id, sessionId);
    if (store.chatModeArmed(sessionKey)) store.setSessionViewMode(sessionKey, 'terminal');
    // The session on screen stays beside a pick: it is the pane's before the pick takes the selection, so making room
    // for the pick at the warm-terminal limit never closes it.
    if (store.selectedSessionKey !== sessionKey) store.setPaneSessionKey(store.selectedSessionKey);
    const record = useInventoryStore
      .getState()
      .inventoriesByMachineId[machine.id]?.summary?.sessions.find((entry) => entry.sessionId === sessionId);
    void store
      .attachSession(machine, {
        sessionId,
        ...(record !== undefined && record.projectId.length > 0 ? { projectId: record.projectId } : {}),
        ...(record !== undefined && record.displayTitle.length > 0 ? { title: record.displayTitle } : {}),
      })
      .catch(() => {
        // The pane shows the failure with Retry (`TerminalStateOverlay`).
      });
  }, []);
  const pickPaneSession = useCallback(
    (session: GhostexSession): void => {
      if (activeMachineId !== null) openPaneSession(activeMachineId, session.sessionId);
    },
    [activeMachineId, openPaneSession],
  );
  // A row of the attention list pane: its session beside it, a question at its question card in the chat view, full
  // screen, as the Notifications screen opens it. The chat view has no panes; Back there (`goBack`) or its terminal
  // view brings the layout back.
  const openAttentionTarget = useCallback(
    (target: OpenSessionTarget): void => {
      if (target.question) {
        // The app's link module (with its navigation container) loads on the first question opened here, as the
        // browser pane's module does: the terminal screen loads without it, as before.
        const { openDeepLink } = require('../app/deepLinks') as typeof DeepLinksModule;
        const returnSessionKey = useTerminalStore.getState().selectedSessionKey;
        openDeepLink(sessionDeepLink({ machineId: target.machineId, sessionId: target.sessionId, view: 'question' }));
        // The chat view came at once (the session is in the computer's list): Back goes back to the panes.
        const store = useTerminalStore.getState();
        const chatSessionKey = attachSessionKey(target.machineId, target.sessionId);
        if (
          returnSessionKey !== null &&
          store.selectedSessionKey === chatSessionKey &&
          store.chatModeArmed(chatSessionKey)
        ) {
          setPaneQuestion({ chatSessionKey, returnSessionKey });
        }
        return;
      }
      openPaneSession(target.machineId, target.sessionId);
    },
    [openPaneSession],
  );

  // The header's Panes button: the chooser in a second slot, or with two panes the second one closed.
  const showsTwoPanes = twoPanes !== null;
  const { openChooser: openPaneChooser, closeSlot: closePaneSlot } = panes;
  const togglePanes = useCallback(
    (): void => (showsTwoPanes ? closePaneSlot(1) : openPaneChooser()),
    [showsTwoPanes, closePaneSlot, openPaneChooser],
  );

  // The slot of the chooser, and of the selected session's pane.
  const chooserSlot =
    twoPanes === null ? null : (([0, 1] as const).find((slot) => twoPanes.slots[slot].kind === 'chooser') ?? null);
  const selectedPaneSlot: PaneIndex =
    ([0, 1] as const).find((slot) => {
      const content = twoPanes?.slots[slot];
      return content?.kind === 'session' && content.sessionKey === selectedSessionKey;
    }) ??
    twoPanes?.active ??
    0;

  // Folded while a pane other than a session is the active one: its content opens full screen, as the screen the app
  // has for it (`openPaneFullScreen`). The layout waits for the unfolded window.
  const lastActivePane = useRef<PaneContent | null>(null);
  useEffect(() => {
    if (twoPanes !== null) {
      lastActivePane.current = twoPanes.slots[twoPanes.active];
      return;
    }
    const content = lastActivePane.current;
    lastActivePane.current = null;
    if (content === null || hasPaneSlots || !isFocused || activeMachineId === null) return;
    openPaneFullScreen(content, navigation, activeMachineId);
  }, [twoPanes, hasPaneSlots, isFocused, navigation, activeMachineId]);

  return {
    goBack,
    activatePane,
    pickPaneSession,
    openAttentionTarget,
    togglePanes,
    showsTwoPanes,
    chooserSlot,
    selectedPaneSlot,
  };
}

export type PaneLayoutSource = {
  /** The two panes on screen, or null. */
  twoPanes: { active: PaneIndex } | null;
  arrangement: PaneArrangement;
  /** The divider's stored position for the window's shape (`usePaneHost`'s `ratio`). */
  ratio: number;
  /** The terminal area's frame in the window: the pane container. */
  terminalArea: LayoutRectangle | null;
  /** The terminal area's bottom edge in the window. */
  terminalAreaBottom: number;
  windowHeight: number;
  /** Half folded like a laptop (iOS terminal mode), else null. */
  laptopFold: LaptopFold | null;
  foldDivisions: readonly FoldDivision[] | undefined;
  editorShown: boolean;
  /** The text editor's measured height (0 until measured). */
  editorHeight: number;
  /** How much of the terminal's bottom the keyboard covers, with the text editor on it when `editorOpen`. */
  keyboardCover: (editorOpen: boolean) => number;
  /** How much of the terminal's bottom a pad layer in the keyboard's place covers. */
  layerCover: number;
};

/**
 * Where the two panes stand in the terminal area (`paneGeometry`'s input), and the text editor's frame across when it
 * stands over the active pane only.
 */
export function paneLayoutInput({
  twoPanes,
  arrangement,
  ratio,
  terminalArea,
  terminalAreaBottom,
  windowHeight,
  laptopFold,
  foldDivisions,
  editorShown,
  editorHeight,
  keyboardCover,
  layerCover,
}: PaneLayoutSource): {
  paneLayout: PaneGeometryInput | null;
  editorDockFrame: { left: number; width: number } | undefined;
} {
  // Two panes in the terminal area (the pane container). Upright, what covers its bottom across the whole width (the
  // keyboard with the text editor riding on it, or a layer in its place) decides the keyboard rules; side by side the
  // editor stands over the active pane only, as wide as it; half folded the panes end above the fold, where the
  // keyboard and the layers below it do not reach them.
  const panesUpright = arrangement === 'stacked';
  const paneCover =
    laptopFold !== null
      ? laptopObstruction({
          fold: laptopFold,
          areaBottom: terminalAreaBottom,
          keyboardCover: keyboardCover(false),
          layerCover,
          editorHeight: 0,
        })
      : Math.max(keyboardCover(panesUpright && editorShown), layerCover);
  // Half folded like a book (an active division down the window; the pose has no layout of its own): the panes'
  // content may run across the fold, their controls keep off it.
  const bookDivision = foldDivisions?.find((division) => division.active && division.height > division.width);
  const paneLayout: PaneGeometryInput | null =
    twoPanes === null || terminalArea === null
      ? null
      : {
          arrangement,
          width: terminalArea.width,
          height: terminalArea.height,
          ratio,
          active: twoPanes.active,
          coverTop: paneCover > 0 ? terminalArea.height - paneCover : null,
          editorTop:
            !editorShown || panesUpright
              ? null
              : laptopFold !== null
                ? windowHeight -
                  laptopEditorInset(laptopFold, windowHeight) -
                  (editorHeight || TEXT_EDITOR_HEIGHT) -
                  terminalArea.y
                : terminalArea.height - keyboardCover(true),
          end: laptopFold === null ? null : laptopFold.top - terminalArea.y - PANE_FOLD_CLEARANCE,
          division:
            bookDivision === undefined
              ? null
              : { start: bookDivision.x - terminalArea.x, end: bookDivision.x + bookDivision.width - terminalArea.x },
        };
  const activePaneCard = paneLayout === null || panesUpright ? null : paneGeometry(paneLayout).cards[paneLayout.active];
  const editorDockFrame =
    activePaneCard === null || terminalArea === null
      ? undefined
      : { left: terminalArea.x + activePaneCard.x, width: activePaneCard.width };
  return { paneLayout, editorDockFrame };
}
