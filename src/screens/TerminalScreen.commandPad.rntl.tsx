/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. The Befehlspad on the real terminal screen, with its real stores, key input, layers
 * and text editor: the pad replacing the key bar and the upload button, the setting that shows and hides it (and,
 * with the pad off, the round upload button as today), the 3x3 field, a key changed in Settings, the pad staying
 * open, Upload up to the terminal menu's source choice, every old function of the key bar reached from the pad, the
 * layer in the keyboard's place with cross and ring standing still, the pen's keyboard hand-over, and the text editor's
 * draft kept per session through every close until Send.
 *
 * On the device these checks read the accessibility tree; here the same questions are asked of the rendered
 * component tree (labels, presence, the calls that reach the native module). Device behaviour (the keyboard really
 * staying up on the pen, the iOS paste prompt, the picker opening) stays with the end test on the iPhone. Mocked
 * are the boundaries only: the native module, haptics, storage, the safe area, navigation focus, the chat screen,
 * the voice button and the file picker. Frames of an iPhone 17: 402x874, home indicator inset 34, keyboard 336 pt
 * tall (top 538).
 *
 * The mocks, frames and helpers are shared with the pad's other screen tests in
 * `TerminalScreen.commandPadHarness.tsx`: moving the pad, too little room for it, turns and folds, and the transition
 * matrix have their own `TerminalScreen.commandPad*.rntl.tsx` files.
 */

import {
  ACCESSIBILITY_ACTIVATION,
  ACTIONS,
  AGENT_TAB,
  DEFAULT_LABELS,
  EDITOR,
  HIDDEN_TOO,
  IPHONE_TURNED,
  IPHONE_UPRIGHT,
  KEYBOARD,
  KEY_BAR_LABELS,
  NO_MODS,
  SHELL_TAB,
  TOGGLE,
  WINDOW,
  bottomOf,
  keyboardComesUp,
  keyboardWillHide,
  keyboardWillShow,
  matrixStep,
  mockNative,
  mockPickAndSend,
  mockPickImageAndSend,
  mockSelectionHaptic,
  navigation,
  numberAt,
  openPad,
  parentOf,
  renderPose,
  renderScreen,
  requiredNumber,
  setSettings,
  shownNow,
  tapKey,
  terminalTop,
  type Pose,
} from './TerminalScreen.commandPadHarness';

import { AccessibilityInfo, Alert, Animated, StyleSheet } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import { DEFAULT_COMMAND_PAD_KEYS } from '../settings/commandPad';
import { useExtraKeysStore } from '../settings/extraKeys';
import { useTerminalStore, type TerminalTab } from '../terminal/sessions';

describe('the floating pad replaces the key bar and the upload button', () => {
  test('with the keyboard dismissed the pad toggle exists', async () => {
    await renderScreen();
    expect(screen.getByLabelText(TOGGLE)).toBeTruthy();
  });

  test('with the keyboard shown no key bar element exists, the pad toggle does', async () => {
    await renderScreen();
    await keyboardWillShow();
    for (const label of KEY_BAR_LABELS.filter((name) => name !== 'Dismiss keyboard')) {
      expect(screen.queryByLabelText(label, HIDDEN_TOO)).toBeNull();
    }
    // The one Dismiss keyboard is the round button beside the closed pad (one tap hides the keyboard, below).
    expect(screen.getAllByLabelText('Dismiss keyboard', HIDDEN_TOO)).toHaveLength(1);
    expect(screen.getByLabelText(TOGGLE)).toBeTruthy();
  });

  test('no separate upload button exists outside the pad, closed or open', async () => {
    await renderScreen();
    expect(screen.queryByLabelText('Upload Image or File', HIDDEN_TOO)).toBeNull();
    await openPad();
    expect(screen.queryByLabelText('Upload Image or File', HIDDEN_TOO)).toBeNull();
    expect(screen.getAllByLabelText('Upload')).toHaveLength(1);
  });

  test('keyboard hidden, pad open, Down tapped: the terminal receives Down', async () => {
    await renderScreen();
    await openPad();
    await tapKey('Down');
    expect(mockNative.sendKey.mock.calls).toEqual([['shell-1', 'down', NO_MODS]]);
  });

  test('a session in the chat view has no pad element', async () => {
    useTerminalStore.setState({ sessionViewModeBySessionKey: { 'agent-1': 'chat' } });
    await renderScreen(AGENT_TAB);
    expect(screen.queryByLabelText(TOGGLE, HIDDEN_TOO)).toBeNull();
    for (const label of DEFAULT_LABELS) expect(screen.queryByLabelText(label, HIDDEN_TOO)).toBeNull();
  });

  test('the toggle stands above the keyboard while it is up and in the corner while it is down', async () => {
    await renderScreen();
    expect(bottomOf(screen.getByLabelText(TOGGLE))).toBe(16);
    await keyboardWillShow();
    // 336 - 34 of the terminal area covered, 12 above it.
    expect(bottomOf(screen.getByLabelText(TOGGLE))).toBe(314);
    await keyboardWillHide();
    expect(bottomOf(screen.getByLabelText(TOGGLE))).toBe(16);
  });
});

describe('the setting shows and hides the pad', () => {
  test('setting off: no pad toggle with or without the keyboard; Upload is the round button as today', async () => {
    await setSettings({ extraKeysToolbarVisible: false });
    await renderScreen();
    expect(screen.queryByLabelText(TOGGLE, HIDDEN_TOO)).toBeNull();
    expect(screen.getByLabelText('Upload Image or File')).toBeTruthy();
    await keyboardWillShow();
    expect(screen.queryByLabelText(TOGGLE, HIDDEN_TOO)).toBeNull();
  });

  test('with the pad off, Advanced > Show file upload button still hides the round button', async () => {
    await setSettings({ extraKeysToolbarVisible: false, fileUploadButtonVisible: false });
    await renderScreen();
    expect(screen.queryByLabelText('Upload Image or File', HIDDEN_TOO)).toBeNull();
  });

  test('setting on: the pad toggle exists', async () => {
    await setSettings({ extraKeysToolbarVisible: true });
    await renderScreen();
    expect(screen.getByLabelText(TOGGLE)).toBeTruthy();
  });
});

describe('the pad toggle opens the floating 3x3 field', () => {
  test('open with default settings: exactly nine pad keys, arrows around Enter, Esc, ^C, Tab, Upload in the corners', async () => {
    await renderScreen();
    expect(screen.queryByLabelText('Up')).toBeNull();
    await openPad();
    const field = screen.getByLabelText('Up').parent as TestInstance;
    const keys = field.children.filter((child): child is TestInstance => typeof child !== 'string');
    expect(keys.map((key) => key.props.accessibilityLabel)).toEqual(DEFAULT_LABELS);
    expect(screen.getByLabelText(TOGGLE).props.accessibilityState).toMatchObject({ expanded: true });
  });

  test('keyboard hidden, Esc tapped in the pad: the terminal receives Escape', async () => {
    await renderScreen();
    await openPad();
    await tapKey('Esc');
    expect(mockNative.sendKey.mock.calls).toEqual([['shell-1', 'escape', NO_MODS]]);
  });

  test('Ctrl+C is sent as c with the Ctrl modifier', async () => {
    await renderScreen();
    await openPad();
    await tapKey('Ctrl+C');
    expect(mockNative.sendKey.mock.calls).toEqual([['shell-1', 'c', { ctrl: true, alt: false, shift: false }]]);
  });
});

describe('a key changed in Settings shows in its position', () => {
  test('the centre key changed to Home: that position is labelled Home', async () => {
    const changed = [...DEFAULT_COMMAND_PAD_KEYS];
    changed[4] = 'key:home';
    await setSettings({ commandPadKeys: changed });
    await renderScreen();
    await openPad();
    const field = screen.getByLabelText('Up').parent as TestInstance;
    const keys = field.children.filter((child): child is TestInstance => typeof child !== 'string');
    expect(keys[4].props.accessibilityLabel).toBe('Home');
    expect(screen.queryByLabelText('Enter')).toBeNull();
  });
});

describe('the pad stays open until its toggle is tapped again', () => {
  test('after a pad key tap the pad is still there', async () => {
    await renderScreen();
    await openPad();
    await tapKey('Left');
    expect(screen.getByLabelText('Left')).toBeTruthy();
    await keyboardWillShow();
    await keyboardWillHide();
    expect(screen.getByLabelText('Left')).toBeTruthy();
  });

  test('a second tap on the toggle closes the pad', async () => {
    await renderScreen();
    await openPad();
    await openPad();
    for (const label of DEFAULT_LABELS) expect(screen.queryByLabelText(label)).toBeNull();
    expect(screen.getByLabelText(TOGGLE).props.accessibilityState).toMatchObject({ expanded: false });
  });
});

describe('Upload from the pad', () => {
  test('Upload offers Photo Library and File as the terminal menu does, and sends the chosen one for this session', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await renderScreen();
    await openPad();
    await tapKey('Upload');
    expect(mockPickAndSend).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledTimes(1);
    const [title, , buttons] = alert.mock.calls[0];
    expect(title).toBe('Send & Attach File');
    expect(buttons?.map((button) => button.text)).toEqual(['Photo Library', 'Choose File', 'Cancel']);
    await act(async () => buttons?.[1].onPress?.());
    expect(mockPickAndSend.mock.calls).toEqual([['m1', 'shell-1', undefined]]);
    await act(async () => buttons?.[0].onPress?.());
    expect(mockPickImageAndSend.mock.calls).toEqual([['m1', 'shell-1', undefined]]);
  });

  test('no open session: Upload is disabled and starts nothing', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await renderScreen({ ...SHELL_TAB, state: 'opening' });
    await openPad();
    expect(screen.getByLabelText('Upload').props.accessibilityState).toMatchObject({ disabled: true });
    await tapKey('Upload');
    expect(alert).not.toHaveBeenCalled();
    expect(mockPickAndSend).not.toHaveBeenCalled();
  });
});

describe('every function of the key bar is reached from the pad', () => {
  test('Keys layer: the extra keys rows with modifiers and the KEYS page with hold-to-see descriptions', async () => {
    await renderScreen();
    await openPad();
    await fireEvent.press(screen.getByLabelText('Keys'));
    expect(screen.getByText('Extra keys')).toBeTruthy();
    expect(screen.getByText('More keys')).toBeTruthy();
    // The default extra-keys rows (extraKeys.ts) and the KEYS page (keyBarPages.ts).
    for (const label of ['ESC', 'SHIFT', 'CTRL', 'ALT', 'HOME', 'END', 'PGUP', 'PGDN', 'New line']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    const interrupt = screen.getByLabelText('Ctrl+C · Interrupt the running program');
    await fireEvent(interrupt, 'longPress');
    expect(screen.getByText('^C: Ctrl+C · Interrupt the running program')).toBeTruthy();
    await fireEvent.press(interrupt);
    expect(mockNative.sendKey.mock.calls).toEqual([['shell-1', 'c', { ctrl: true, alt: false, shift: false }]]);
  });

  test('Ctrl tapped in the Keys layer applies once to the next pad key, its chip shows while armed', async () => {
    await renderScreen();
    await openPad();
    await fireEvent.press(screen.getByLabelText('Keys'));
    await fireEvent.press(screen.getByLabelText('CTRL'));
    expect(mockNative.setKeyModifiers.mock.calls.at(-1)).toEqual([
      'shell-1',
      { ctrl: true, alt: false, shift: false, ctrlLocked: false, altLocked: false, shiftLocked: false },
    ]);
    expect(screen.getByText('Ctrl')).toBeTruthy();
    await tapKey('Up');
    await tapKey('Up');
    expect(mockNative.sendKey.mock.calls).toEqual([
      ['shell-1', 'up', { ctrl: true, alt: false, shift: false }],
      ['shell-1', 'up', NO_MODS],
    ]);
    expect(screen.queryByText('Ctrl')).toBeNull();
  });

  test('Agent layer: the session agent hotkeys, sent as their sequence; no agent, no Agent layer', async () => {
    useTerminalStore.setState({ sessionViewModeBySessionKey: { 'agent-1': 'terminal' } });
    await renderScreen(AGENT_TAB);
    await openPad();
    await fireEvent.press(screen.getByLabelText('Agent hotkeys'));
    expect(screen.getByText('Claude Code')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Ctrl+C then Ctrl+C · EXIT'));
    expect(mockNative.sendKey.mock.calls).toEqual([['agent-1', 'c', { ctrl: true }]]);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(120);
    });
    expect(mockNative.sendKey.mock.calls).toEqual([
      ['agent-1', 'c', { ctrl: true }],
      ['agent-1', 'c', { ctrl: true }],
    ]);
  });

  test('a shell session has no agent hotkeys: the Agent button is unavailable and says why', async () => {
    await renderScreen();
    await openPad();
    const agent = screen.getByLabelText('Agent hotkeys');
    expect(agent.props.accessibilityState).toMatchObject({ disabled: true });
    expect(agent.props.accessibilityHint).toBe("This session's agent has no agent hotkeys");
  });

  test('a tap on the unavailable Agent button shows why beside the toggle, opens no layer, and the line goes after the hint timeout', async () => {
    await renderScreen();
    await openPad();
    const reason = "This session's agent has no agent hotkeys";
    await fireEvent.press(screen.getByLabelText('Agent hotkeys'));
    expect(screen.getByText(reason)).toBeTruthy();
    expect(screen.getByLabelText('Agent hotkeys').props.accessibilityState).toMatchObject({ disabled: true });
    // No layer: neither its title nor its hold-to-see line.
    expect(screen.queryByText('Agent hotkeys')).toBeNull();
    expect(screen.queryByText('Hold a key to see what it does')).toBeNull();
    await act(() => jest.advanceTimersByTime(3499));
    expect(screen.getByText(reason)).toBeTruthy();
    await act(() => jest.advanceTimersByTime(1));
    expect(screen.queryByText(reason)).toBeNull();
  });

  test('three locked modifiers in a 320 pt window: the reason stands in its own row inside the window, chips, ring and keys stay put', async () => {
    const window = { width: 320, height: 568 };
    await renderScreen(SHELL_TAB, window);
    await openPad();
    await fireEvent.press(screen.getByLabelText('Keys'));
    for (const modifier of ['CTRL', 'ALT', 'SHIFT']) await fireEvent(screen.getByLabelText(modifier), 'longPress');
    const chipRow = () => StyleSheet.flatten(parentOf(screen.getByText('Ctrl locked')).props.style);
    const placeOf = (label: string) => StyleSheet.flatten(screen.getByLabelText(label).props.style);
    const before = { chips: chipRow(), keys: placeOf('Keys'), up: placeOf('Up') };
    expect(['Ctrl locked', 'Alt locked', 'Shift locked'].map((chip) => screen.getByText(chip))).toHaveLength(3);

    await fireEvent.press(screen.getByLabelText('Agent hotkeys'));
    const line = screen.getByText("This session's agent has no agent hotkeys");
    // The whole sentence, never cut to one line.
    expect(line.props.numberOfLines).toBeUndefined();
    // Its row is bounded on both sides by the pad's 16 pt margin and the toggle's column: inside the window.
    const row = StyleSheet.flatten(parentOf(line).props.style);
    const left = numberAt(row, 'left') ?? -1;
    const right = numberAt(row, 'right') ?? -1;
    expect(left).toBeGreaterThanOrEqual(0);
    expect(right).toBeGreaterThanOrEqual(0);
    expect(window.width - left - right).toBeGreaterThan(0);
    // Above the chips' row (22 pt tall), not in it.
    expect(requiredNumber(row, 'bottom')).toBeGreaterThanOrEqual(requiredNumber(before.chips, 'bottom') + 22);
    expect({ chips: chipRow(), keys: placeOf('Keys'), up: placeOf('Up') }).toEqual(before);
  });

  test('the keyboard button shows the keyboard and, while it is up, dismisses it', async () => {
    await renderScreen();
    await openPad();
    await fireEvent.press(screen.getByLabelText('Show keyboard'));
    expect(mockNative.focusTerminal).toHaveBeenCalledWith('shell-1');
    await keyboardWillShow();
    await fireEvent.press(screen.getByLabelText('Hide keyboard'));
    expect(mockNative.blurTerminal).toHaveBeenCalledWith('shell-1');
  });

  test('Pad settings in the Keys layer opens Settings > Keyboard', async () => {
    await renderScreen();
    await openPad();
    await fireEvent.press(screen.getByLabelText('Keys'));
    await fireEvent.press(screen.getByLabelText('Pad settings'));
    expect(navigation.navigate).toHaveBeenCalledWith('SettingsPage', { page: 'keyboard' });
  });
});

describe('a layer takes the keyboard place, cross and ring stay where they are', () => {
  test('a layer opened over the keyboard hides it and stands where it stood; the terminal and the pad do not move', async () => {
    await renderScreen();
    await fireEvent(screen.getByTestId('terminal-view').parent as TestInstance, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: WINDOW.width, height: 700 } },
    });
    await keyboardWillShow();
    await openPad();
    const toggleBottom = bottomOf(screen.getByLabelText(TOGGLE));
    const upBottom = bottomOf(screen.getByLabelText('Up').parent as TestInstance);
    expect(terminalTop()).toBe(-302);

    await fireEvent.press(screen.getByLabelText('Keys'));
    expect(mockNative.blurTerminal).toHaveBeenCalledWith('shell-1');
    await keyboardWillHide();
    expect(screen.getByText('More keys')).toBeTruthy();
    expect(bottomOf(screen.getByLabelText(TOGGLE))).toBe(toggleBottom);
    expect(bottomOf(screen.getByLabelText('Up').parent as TestInstance)).toBe(upBottom);
    expect(terminalTop()).toBe(-302);
  });

  test('the same layer button again brings the keyboard back; the layer stays until the keyboard is up', async () => {
    await renderScreen();
    await keyboardWillShow();
    await openPad();
    await fireEvent.press(screen.getByLabelText('Keys'));
    await keyboardWillHide();
    mockNative.focusTerminal.mockClear();

    await fireEvent.press(screen.getByLabelText('Keys'));
    expect(mockNative.focusTerminal).toHaveBeenCalledWith('shell-1');
    expect(screen.getByText('More keys')).toBeTruthy();
    await keyboardWillShow();
    expect(screen.queryByText('More keys')).toBeNull();
  });

  test('a layer opened without the keyboard closes on a second tap without bringing it', async () => {
    await renderScreen();
    await openPad();
    await fireEvent.press(screen.getByLabelText('Keys'));
    expect(screen.getByText('More keys')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Keys'));
    expect(screen.queryByText('More keys')).toBeNull();
    expect(mockNative.focusTerminal).not.toHaveBeenCalled();
  });
});

describe('the text editor with Send, and the pen hand-over', () => {
  let editorMountedAtHandOver: boolean[] = [];
  let handOver: PromiseWithResolvers<boolean> | null = null;
  let warnSpy: jest.SpyInstance<void, Parameters<typeof console.warn>>;

  beforeEach(() => {
    editorMountedAtHandOver = [];
    handOver = null;
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  async function openEditor(): Promise<void> {
    await renderScreen();
    await openPad();
    await fireEvent.press(screen.getByLabelText('Text editor'));
    expect(screen.getByLabelText(EDITOR)).toBeTruthy();
    mockNative.focusTerminal.mockImplementation(() => {
      editorMountedAtHandOver.push(screen.queryByLabelText(EDITOR, HIDDEN_TOO) !== null);
      handOver = Promise.withResolvers<boolean>();
      return handOver.promise;
    });
  }

  test('Send with an empty draft sends Enter, with text inserts the text', async () => {
    await openEditor();
    await fireEvent.press(screen.getByLabelText('Send Enter to terminal'));
    await fireEvent.changeText(screen.getByLabelText(EDITOR), 'ls -la');
    await fireEvent.press(screen.getByLabelText('Insert text into terminal'));
    expect(mockNative.sendKey.mock.calls).toEqual([['shell-1', 'enter', {}]]);
    expect(mockNative.sendText.mock.calls).toEqual([['shell-1', 'ls -la']]);
  });

  test('the pen asks the terminal for focus while the editor still holds it; the editor goes after the answer', async () => {
    await openEditor();
    await fireEvent.press(screen.getByLabelText('Text editor'));
    expect(mockNative.focusTerminal).toHaveBeenCalledWith('shell-1');
    expect(editorMountedAtHandOver).toEqual([true]);
    expect(screen.queryByLabelText(EDITOR, HIDDEN_TOO)).not.toBeNull();
    // A second pen press while the hand-over is pending does not ask again.
    await fireEvent.press(screen.getByLabelText('Text editor'));
    expect(mockNative.focusTerminal).toHaveBeenCalledTimes(1);
    await act(async () => {
      handOver?.resolve(true);
    });
    await act(() => jest.advanceTimersByTime(300));
    expect(screen.queryByLabelText(EDITOR, HIDDEN_TOO)).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('a refused hand-over still closes the editor and is logged', async () => {
    await openEditor();
    await fireEvent.press(screen.getByLabelText('Text editor'));
    await act(async () => {
      handOver?.resolve(false);
    });
    await act(() => jest.advanceTimersByTime(300));
    expect(screen.queryByLabelText(EDITOR, HIDDEN_TOO)).toBeNull();
    expect(warnSpy.mock.calls).toEqual([[expect.stringMatching(/refused the keyboard focus for session shell-1/)]]);
  });

  test('a failed hand-over still closes the editor and is logged with its error', async () => {
    const failure = new Error('no terminal');
    await openEditor();
    await fireEvent.press(screen.getByLabelText('Text editor'));
    await act(async () => {
      handOver?.reject(failure);
    });
    await act(() => jest.advanceTimersByTime(300));
    expect(screen.queryByLabelText(EDITOR, HIDDEN_TOO)).toBeNull();
    expect(warnSpy.mock.calls).toEqual([[expect.stringMatching(/failed for session shell-1/), failure]]);
  });
});

/*
 * The fade itself runs on the native animation driver, which the test renderer does not run: what is shown here is
 * the two symbols, the moment the keyboard starts (no change yet) and the fade asked for (its target and length);
 * how it looks next to the keyboard stays with the device.
 */
describe('the ring keyboard symbol crossfades over the keyboard motion', () => {
  /** The opacities of the keyboard button's two symbols: [show keyboard, hide keyboard]. */
  function keyboardSymbols(): number[] {
    return screen
      .getByLabelText(/^(Show|Hide) keyboard$/)
      .queryAll((node) => typeof node.type === 'string' && StyleSheet.flatten(node.props.style)?.opacity !== undefined)
      .map((node) => StyleSheet.flatten(node.props.style).opacity);
  }

  /** The fades started since `timing` was last cleared: their target and length. */
  function fades(timing: jest.SpyInstance<Animated.CompositeAnimation, Parameters<typeof Animated.timing>>) {
    return timing.mock.calls.map(([, config]) => ({ toValue: config.toValue, duration: config.duration }));
  }

  test('the keyboard coming up fades from the show symbol to the hide symbol over its 580 ms motion, and back over the 250 ms hide', async () => {
    const timing = jest.spyOn(Animated, 'timing');
    await renderScreen();
    await openPad();
    expect(keyboardSymbols()).toEqual([1, 0]);
    timing.mockClear();

    await keyboardWillShow();
    // Where the keyboard starts its motion, the symbol has not changed yet; it fades over the motion.
    expect(keyboardSymbols()).toEqual([1, 0]);
    expect(fades(timing)).toEqual([{ toValue: 1, duration: 580 }]);
    timing.mockClear();

    await keyboardWillHide();
    expect(fades(timing)).toEqual([{ toValue: 0, duration: 250 }]);
  });

  test('with Reduce Motion on the symbol changes at once, without a fade', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => Promise.resolve(true));
    const timing = jest.spyOn(Animated, 'timing');
    await renderScreen();
    await openPad();
    timing.mockClear();
    await keyboardWillShow();
    expect(keyboardSymbols()).toEqual([0, 1]);
    await keyboardWillHide();
    expect(keyboardSymbols()).toEqual([1, 0]);
    expect(fades(timing)).toEqual([]);
  });
});

describe('one tap hides the keyboard while the pad is off or closed', () => {
  const DISMISS = 'Dismiss keyboard';

  test('pad closed, keyboard up: a dismiss button stands above the toggle and hides the keyboard', async () => {
    await renderScreen();
    expect(screen.queryByLabelText(DISMISS)).toBeNull();
    await keyboardWillShow();
    const dismiss = screen.getByLabelText(DISMISS);
    // The toggle stands 314 pt up (above the keyboard); the button 12 pt above its 46 pt.
    expect(bottomOf(parentOf(dismiss))).toBe(314 + 46 + 12);
    await fireEvent.press(dismiss);
    expect(mockNative.blurTerminal).toHaveBeenCalledWith('shell-1');
    await keyboardWillHide();
    expect(screen.queryByLabelText(DISMISS)).toBeNull();
  });

  test('pad open, keyboard up: the ring keyboard button hides it, no second dismiss button', async () => {
    await renderScreen();
    await keyboardWillShow();
    await openPad();
    expect(screen.queryByLabelText(DISMISS)).toBeNull();
    expect(screen.getByLabelText('Hide keyboard')).toBeTruthy();
  });

  test('pad closed, keyboard up: only the dismiss button joins the pad, the optional refresh button stays hidden', async () => {
    useTerminalStore.setState({ sessionViewModeBySessionKey: { 'agent-1': 'terminal' } });
    await setSettings({ refreshButtonVisible: true });
    await renderScreen(AGENT_TAB);
    expect(screen.getByLabelText('Refresh terminal')).toBeTruthy();
    await keyboardWillShow();
    expect(screen.getByLabelText(DISMISS)).toBeTruthy();
    expect(screen.queryByLabelText('Refresh terminal')).toBeNull();
  });

  test('pad switched off, keyboard up: the dismiss button shows without the keyboard button setting and hides the keyboard', async () => {
    await setSettings({ extraKeysToolbarVisible: false, keyboardButtonVisible: false });
    await renderScreen();
    expect(screen.queryByLabelText(DISMISS)).toBeNull();
    expect(screen.queryByLabelText('Show keyboard')).toBeNull();
    await keyboardWillShow();
    await fireEvent.press(screen.getByLabelText(DISMISS));
    expect(mockNative.blurTerminal).toHaveBeenCalledWith('shell-1');
  });

  test('pad switched off, an iPhone in landscape with the keyboard up: Refresh, Upload and the dismiss button all stand whole in the terminal area above the keyboard', async () => {
    await setSettings({
      extraKeysToolbarVisible: false,
      keyboardButtonVisible: false,
      fileUploadButtonVisible: true,
      refreshButtonVisible: true,
    });
    await renderPose(IPHONE_TURNED);
    await keyboardComesUp();
    const buttons = ['Refresh terminal', 'Upload Image or File', DISMISS].map((label) => screen.getByLabelText(label));
    const stack = parentOf(buttons[2]);
    for (const button of buttons) expect(parentOf(button)).toBe(stack);
    const style = StyleSheet.flatten(stack.props.style);
    const across = style.flexDirection === 'row';
    const sizes = buttons.map((button) => StyleSheet.flatten(button.props.style));
    const length = sizes.reduce((sum, size) => sum + (across ? size.width : size.height), 0) + 2 * style.gap;
    const { width, height } = IPHONE_TURNED.area;
    // 200 pt keyboard less the 21 pt home inset cover the area's bottom 179 pt.
    expect(style.bottom).toBeGreaterThanOrEqual(179);
    expect(height - style.bottom - (across ? 44 : length)).toBeGreaterThanOrEqual(0);
    expect(width - style.right - (across ? length : 44)).toBeGreaterThanOrEqual(0);
  });
});

describe('Paste on iOS uses the terminal edit-menu paste', () => {
  test('a pad position set to Paste calls the native paste for the shown session', async () => {
    const withPaste = [...DEFAULT_COMMAND_PAD_KEYS];
    withPaste[8] = 'paste';
    await setSettings({ commandPadKeys: withPaste });
    await renderScreen();
    await openPad();
    await tapKey('Paste');
    expect(mockNative.pasteFromClipboard.mock.calls).toEqual([['shell-1']]);
  });
});

describe('fixed regressions', () => {
  test('a pad key activated without a touch-down (VoiceOver, Switch Control) sends once', async () => {
    await renderScreen();
    await openPad();
    // React Native delivers an accessibility activation as the press alone, an event without touches
    // (Pressability's non-pointer click); a finger's release carries `changedTouches`.
    await fireEvent(screen.getByLabelText('Down'), 'press', ACCESSIBILITY_ACTIVATION);
    expect(mockNative.sendKey.mock.calls).toEqual([['shell-1', 'down', NO_MODS]]);
    // A physical touch (down, up, press) still sends exactly once.
    await tapKey('Down');
    expect(mockNative.sendKey.mock.calls).toEqual([
      ['shell-1', 'down', NO_MODS],
      ['shell-1', 'down', NO_MODS],
    ]);
  });

  test('a draft typed in one session never goes to another one (tab switch within the editor linger) and is there again back in its own', async () => {
    const second: TerminalTab = { ...SHELL_TAB, sessionKey: 'shell-2', title: 'second' };
    await renderScreen();
    await act(() => useTerminalStore.setState({ tabs: [SHELL_TAB, second] }));
    await keyboardWillShow();
    await openPad();
    await fireEvent.press(screen.getByLabelText('Text editor'));
    await fireEvent.changeText(screen.getByLabelText(EDITOR), 'draft for A');
    await act(() => useTerminalStore.getState().selectTab('shell-2'));
    // Within KeyBarDock's 250 ms linger the pen opens the editor again.
    await act(() => jest.advanceTimersByTime(100));
    await fireEvent.press(screen.getByLabelText('Text editor'));
    expect(screen.getByLabelText(EDITOR).props.value).toBe('');
    await fireEvent.press(screen.getByLabelText('Send Enter to terminal'));
    expect(mockNative.sendText).not.toHaveBeenCalled();
    expect(mockNative.sendKey.mock.calls).toEqual([['shell-2', 'enter', {}]]);
    // Back in the first session the switch closed the editor and kept that session's draft for it.
    await act(() => useTerminalStore.getState().selectTab('shell-1'));
    await act(() => jest.advanceTimersByTime(1000));
    expect(screen.queryByLabelText(EDITOR, HIDDEN_TOO)).toBeNull();
    await fireEvent.press(screen.getByLabelText('Text editor'));
    expect(screen.getByLabelText(EDITOR).props.value).toBe('draft for A');
    expect(mockNative.sendText).not.toHaveBeenCalled();
  });

  test('the pen closing the editor keeps its unsent draft for the same session; Send then inserts it and clears it', async () => {
    await renderScreen();
    await keyboardWillShow();
    await openPad();
    await fireEvent.press(screen.getByLabelText('Text editor'));
    await fireEvent.changeText(screen.getByLabelText(EDITOR), 'finish this after reading the output');
    // The pen hands the keyboard back to the terminal; the editor leaves with its motion and is gone.
    await fireEvent.press(screen.getByLabelText('Text editor'));
    await act(() => jest.advanceTimersByTime(1000));
    expect(screen.queryByLabelText(EDITOR, HIDDEN_TOO)).toBeNull();
    await fireEvent.press(screen.getByLabelText('Text editor'));
    expect(screen.getByLabelText(EDITOR).props.value).toBe('finish this after reading the output');
    expect(mockNative.sendText).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Insert text into terminal'));
    expect(mockNative.sendText.mock.calls).toEqual([['shell-1', 'finish this after reading the output']]);
    expect(screen.getByLabelText(EDITOR).props.value).toBe('');
  });

  test('the keyboard going away keeps the draft: the editor opens with it again; Send then inserts it and clears it', async () => {
    await renderScreen();
    await keyboardWillShow();
    await openPad();
    await fireEvent.press(screen.getByLabelText('Text editor'));
    await fireEvent.changeText(screen.getByLabelText(EDITOR), 'not sent');
    await keyboardWillHide();
    await act(() => jest.advanceTimersByTime(1000));
    expect(screen.queryByLabelText(EDITOR, HIDDEN_TOO)).toBeNull();
    await keyboardWillShow();
    await fireEvent.press(screen.getByLabelText('Text editor'));
    expect(screen.getByLabelText(EDITOR).props.value).toBe('not sent');
    expect(mockNative.sendText).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Insert text into terminal'));
    expect(mockNative.sendText.mock.calls).toEqual([['shell-1', 'not sent']]);
    await keyboardWillHide();
    await act(() => jest.advanceTimersByTime(1000));
    await keyboardWillShow();
    await fireEvent.press(screen.getByLabelText('Text editor'));
    expect(screen.getByLabelText(EDITOR).props.value).toBe('');
  });

  test('opening and closing the Keys and Agent layers ticks like the key bar page toggles, only with Key vibration on', async () => {
    useTerminalStore.setState({ sessionViewModeBySessionKey: { 'agent-1': 'terminal' } });
    await renderScreen(AGENT_TAB);
    await openPad();
    await fireEvent.press(screen.getByLabelText('Keys'));
    await fireEvent.press(screen.getByLabelText('Keys'));
    await fireEvent.press(screen.getByLabelText('Agent hotkeys'));
    expect(mockSelectionHaptic).toHaveBeenCalledTimes(3);
    await setSettings({ keyBarHapticsEnabled: false });
    await fireEvent.press(screen.getByLabelText('Agent hotkeys'));
    expect(mockSelectionHaptic).toHaveBeenCalledTimes(3);
  });

  test('a layer whose keys need more room than the keyboard keeps its frame and scrolls; the pad stays put', async () => {
    await renderScreen();
    await keyboardWillShow();
    await openPad();
    const toggleBottom = bottomOf(screen.getByLabelText(TOGGLE));
    await fireEvent.press(screen.getByLabelText('Keys'));
    await keyboardWillHide();
    let panel: TestInstance | null = screen.getByText('More keys');
    while (panel !== null && panel.props.onLayout === undefined) panel = panel.parent;
    if (panel === null) throw new Error('no layer panel');
    expect(StyleSheet.flatten(panel.props.style)?.height).toBe(KEYBOARD.height);
    // A natural height above the keyboard's (the native Duo Keys panel measured 284 pt against a 265 pt keyboard).
    await fireEvent(panel, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: WINDOW.width, height: 400 } } });
    expect(bottomOf(screen.getByLabelText(TOGGLE))).toBe(toggleBottom);
    // The keys sit in a scroll view inside that frame, so the rows the frame cuts off stay reachable.
    let scroller: TestInstance | null = screen.getByText('More keys');
    while (scroller !== null && scroller.props.contentContainerStyle === undefined) scroller = scroller.parent;
    expect(scroller).not.toBeNull();
  });
});

/*
 * Every way the text editor closes keeps its draft for the next opening in the same session. The pose's system
 * keyboard follows the app's requests (`matrixStep`): a focus brings it up, a blur or the system lowers it.
 */
describe('the text editor keeps its draft however it closes', () => {
  const DRAFT = 'git log --oneline -5';

  // As in the transition matrix, the pad stands at its end state at once (Reduce Motion on): its native-driven
  // motions do not run in this renderer, and the draft does not depend on them.
  beforeEach(() => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => Promise.resolve(true));
  });

  /** In `pose`: the pad opened with the keyboard down, the pen's editor brought up with it, the draft typed. */
  async function typeDraft(pose: Pose): Promise<void> {
    await renderPose(pose);
    await matrixStep(ACTIONS.toggle);
    await matrixStep(ACTIONS.pen);
    await fireEvent.changeText(screen.getByLabelText(EDITOR), DRAFT);
  }

  /** The pen opens the editor again (from a pad drawn open), and it shows the draft. */
  async function penShowsDraft(): Promise<void> {
    await matrixStep(ACTIONS.pen);
    expect(screen.getByLabelText(EDITOR).props.value).toBe(DRAFT);
    expect(mockNative.sendText).not.toHaveBeenCalled();
  }

  test('the keyboard going away', async () => {
    await typeDraft(IPHONE_UPRIGHT);
    await matrixStep(ACTIONS['keyboard away']);
    expect(shownNow()).toMatchObject({ keyboard: false, editor: false, pad: 'open' });
    await penShowsDraft();
  });

  test('the pad toggle lowering the keyboard where the open pad and the keyboard do not fit together', async () => {
    await typeDraft(IPHONE_TURNED);
    // The editor opening on the keyboard closed the pad: the toggle is the one control left beside the editor.
    expect(shownNow()).toMatchObject({ keyboard: true, editor: true, pad: 'closed' });
    await matrixStep(ACTIONS.toggle);
    expect(shownNow()).toMatchObject({ keyboard: false, editor: false, pad: 'open' });
    await penShowsDraft();
  });

  test.each(['Keys', 'Agent'] as const)('the %s layer taking the keyboard’s place', async (layer) => {
    await typeDraft(IPHONE_UPRIGHT);
    await matrixStep(ACTIONS[layer]);
    expect(shownNow()).toMatchObject({ keyboard: false, editor: false, layer });
    // The same layer button again brings the keyboard back.
    await matrixStep(ACTIONS[layer]);
    expect(shownNow()).toMatchObject({ keyboard: true, editor: false, layer: 'none' });
    await penShowsDraft();
  });

  test('the pen', async () => {
    await typeDraft(IPHONE_UPRIGHT);
    await matrixStep(ACTIONS.pen);
    expect(shownNow()).toMatchObject({ keyboard: true, editor: false, pad: 'open' });
    await penShowsDraft();
  });

  test('leaving the terminal screen and opening it again', async () => {
    await typeDraft(IPHONE_UPRIGHT);
    await act(() => screen.unmount());
    // The keyboard leaves with the screen; the screen opens again with its pad closed.
    await ACTIONS['keyboard away']();
    await renderPose(IPHONE_UPRIGHT);
    await matrixStep(ACTIONS.toggle);
    await penShowsDraft();
    // Send inserts it and empties it; the next opening starts empty.
    await fireEvent.press(screen.getByLabelText('Insert text into terminal'));
    expect(mockNative.sendText.mock.calls).toEqual([['agent-1', DRAFT]]);
    await matrixStep(ACTIONS.pen);
    await matrixStep(ACTIONS.pen);
    expect(screen.getByLabelText(EDITOR).props.value).toBe('');
  });
});

describe('custom action references and touch-free activation', () => {
  test('an extra-keys pill of the Keys layer activated without a touch sends once; a touch sends once', async () => {
    await renderScreen();
    await openPad();
    await fireEvent.press(screen.getByLabelText('Keys'));
    const home = screen.getByLabelText('HOME');
    await fireEvent(home, 'press', ACCESSIBILITY_ACTIVATION);
    await fireEvent(home, 'pressIn');
    await fireEvent(home, 'pressOut');
    await fireEvent.press(home);
    expect(mockNative.sendKey.mock.calls).toEqual([
      ['shell-1', 'home', NO_MODS],
      ['shell-1', 'home', NO_MODS],
    ]);
  });

  test('a pad key follows its custom action; deleted, it shows "Not available" and sends nothing', async () => {
    const before = useExtraKeysStore.getState().layout;
    const action = { type: 'text' as const, id: 'custom-gs', label: 'GS', text: 'git status', sendEnter: false };
    const ids = [...DEFAULT_COMMAND_PAD_KEYS];
    ids[0] = 'custom:custom-gs';
    try {
      useExtraKeysStore.setState({ layout: [[action], [{ type: 'builtin', id: 'esc' }]] });
      await setSettings({ commandPadKeys: ids });
      await renderScreen();
      await openPad();
      await act(() =>
        useExtraKeysStore.setState({ layout: [[{ ...action, text: 'git diff' }], [{ type: 'builtin', id: 'esc' }]] }),
      );
      await tapKey('GS');
      expect(mockNative.sendText.mock.calls).toEqual([['shell-1', 'git diff']]);

      await act(() =>
        useExtraKeysStore.setState({ layout: [[{ type: 'builtin', id: 'tab' }], [{ type: 'builtin', id: 'esc' }]] }),
      );
      const gone = screen.getByLabelText('Not available');
      expect(gone.props.accessibilityState).toMatchObject({ disabled: true });
      await tapKey('Not available');
      expect(mockNative.sendText).toHaveBeenCalledTimes(1);
      expect(mockNative.sendKey).not.toHaveBeenCalled();
    } finally {
      useExtraKeysStore.setState({ layout: before });
    }
  });
});

describe('frosted glass as in the design, opaque with Reduce Transparency', () => {
  function blurViews(): number {
    let count = 0;
    const walk = (node: unknown): void => {
      if (node === null || typeof node !== 'object') return;
      const element = node as { type?: string; children?: unknown[] };
      if (typeof element.type === 'string' && /blur/i.test(element.type)) count += 1;
      (element.children ?? []).forEach(walk);
    };
    const tree = screen.toJSON();
    (Array.isArray(tree) ? tree : [tree]).forEach(walk);
    return count;
  }

  test('the toggle, nine keys and four ring buttons blur the output behind them', async () => {
    await renderScreen();
    await openPad();
    expect(blurViews()).toBe(14);
    expect(StyleSheet.flatten(screen.getByLabelText('Up').props.style)?.backgroundColor).toBe('rgba(255,255,255,0.17)');
  });

  test('with Reduce Transparency on nothing blurs and the keys are opaque; the setting is followed live', async () => {
    const listeners: ((enabled: boolean) => void)[] = [];
    jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockImplementation(() => Promise.resolve(true));
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
      name: string,
      listener: (enabled: boolean) => void,
    ) => {
      if (name === 'reduceTransparencyChanged') listeners.push(listener);
      return { remove: () => undefined };
    }) as never);
    await renderScreen();
    await openPad();
    expect(blurViews()).toBe(0);
    expect(StyleSheet.flatten(screen.getByLabelText('Up').props.style)?.backgroundColor).toBe('#3A3A3C');
    await act(() => listeners.forEach((listener) => listener(false)));
    expect(blurViews()).toBe(14);
  });
});

describe('Reduce Transparency order and disabled controls', () => {
  function followTransparency(initial: Promise<boolean>): ((enabled: boolean) => void)[] {
    const listeners: ((enabled: boolean) => void)[] = [];
    jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockImplementation(() => initial);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
      name: string,
      listener: (enabled: boolean) => void,
    ) => {
      if (name === 'reduceTransparencyChanged') listeners.push(listener);
      return { remove: () => undefined };
    }) as never);
    return listeners;
  }

  test('a change notification that arrives before the first read wins over that older read', async () => {
    const read = Promise.withResolvers<boolean>();
    const listeners = followTransparency(read.promise);
    await renderScreen();
    await openPad();
    await act(() => listeners.forEach((listener) => listener(true)));
    expect(StyleSheet.flatten(screen.getByLabelText('Up').props.style)?.backgroundColor).toBe('#3A3A3C');
    await act(async () => {
      read.resolve(false);
      await read.promise;
    });
    expect(StyleSheet.flatten(screen.getByLabelText('Up').props.style)?.backgroundColor).toBe('#3A3A3C');
  });

  test('with Reduce Transparency on, disabled controls keep their opaque backplate (Agent, Not available, Upload)', async () => {
    followTransparency(Promise.resolve(true));
    const ids = [...DEFAULT_COMMAND_PAD_KEYS];
    ids[0] = 'custom:custom-gone';
    await setSettings({ commandPadKeys: ids });
    await renderScreen({ ...SHELL_TAB, state: 'opening' });
    await openPad();
    for (const label of ['Agent hotkeys', 'Not available', 'Upload']) {
      const style = StyleSheet.flatten(screen.getByLabelText(label).props.style);
      expect(screen.getByLabelText(label).props.accessibilityState).toMatchObject({ disabled: true });
      expect(style?.opacity ?? 1).toBe(1);
      expect(style?.backgroundColor).toBe('#3A3A3C');
    }
  });
});
