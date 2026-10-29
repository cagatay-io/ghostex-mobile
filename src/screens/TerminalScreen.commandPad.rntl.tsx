/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. The Befehlspad on the real terminal screen, with its real stores, key input, layers
 * and text editor: REQ-KEY-001 AC1-AC5, REQ-KEY-002 AC1/AC2 (and, with the pad off, the round upload button as
 * today: owner answer U1, D-033), REQ-KEY-003 AC1-AC3, REQ-KEY-006 AC1, REQ-KEY-007 AC1/AC2, REQ-KEY-009 AC1-AC4
 * up to the screen's upload call, REQ-KEY-010 AC5-AC13 (where each old function is reached from the pad), the
 * layer in the keyboard's place with cross and ring standing still (owner D-037), and the pen's keyboard
 * hand-over (REQ-NFR-001 AC1, owner report "pen", 2026-10-27T14:44:42Z).
 *
 * The REQ criteria marked "WDA" read the device's accessibility tree; here the same questions are asked of the
 * rendered component tree (labels, presence, the calls that reach the native module). Device behaviour (the
 * keyboard really staying up on the pen, the iOS paste prompt, the picker opening) stays with the owner's end test
 * on the iPhone (D-057, D-059). Mocked are the boundaries only: the native module, haptics, storage, the safe area,
 * navigation focus, the chat screen, the voice button and the file picker. Frames of an iPhone 17: 402x874, home
 * indicator inset 34, keyboard 336 pt tall (top 538).
 */

import { AccessibilityInfo, Dimensions, Platform, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import { keyboardFixture } from '../components/common/keyboard/keyboardEventFixtures';
import { DEFAULT_COMMAND_PAD_KEYS } from '../settings/commandPad';
import { useExtraKeysStore } from '../settings/extraKeys';
import { useSettingsStore } from '../settings/store';
import { useTerminalStore, type TerminalTab } from '../terminal/sessions';
import TerminalScreen from './TerminalScreen';

const mockNative = {
  sendKey: jest.fn((_sessionKey: string, _key: string, _mods?: object) => Promise.resolve()),
  sendText: jest.fn((_sessionKey: string, _text: string) => Promise.resolve()),
  setKeyModifiers: jest.fn((_sessionKey: string, _mods: object) => Promise.resolve()),
  pasteFromClipboard: jest.fn((_sessionKey: string) => Promise.resolve()),
  focusTerminal: jest.fn((_sessionKey: string): Promise<boolean> => Promise.resolve(true)),
  blurTerminal: jest.fn((_sessionKey: string) => Promise.resolve()),
};
const mockPickAndSend = jest.fn((_machineId: string, _sessionKey: string, _sink?: unknown) => Promise.resolve('sent'));
const mockSelectionHaptic = jest.fn(() => Promise.resolve());

jest.mock('../../modules/ghostex-native/src', () => {
  const { View: MockView } = jest.requireActual('react-native');
  const React = jest.requireActual('react');
  return {
    GhostexNative: {
      addListener: () => ({ remove: () => undefined }),
      setKeepScreenOn: () => Promise.resolve(),
      scrollToBottom: () => Promise.resolve(),
      sendKey: (...args: [string, string, object?]) => mockNative.sendKey(...args),
      sendText: (...args: [string, string]) => mockNative.sendText(...args),
      setKeyModifiers: (...args: [string, object]) => mockNative.setKeyModifiers(...args),
      pasteFromClipboard: (sessionKey: string) => mockNative.pasteFromClipboard(sessionKey),
      focusTerminal: (sessionKey: string) => mockNative.focusTerminal(sessionKey),
      blurTerminal: (sessionKey: string) => mockNative.blurTerminal(sessionKey),
      observeBarLayout: () =>
        Promise.resolve({
          id: 1,
          layout: { windowWidth: 402, windowHeight: 874, safeTop: 59, safeLeft: 0, safeRight: 0, marginTop: 59 },
        }),
      stopObservingBarLayout: () => Promise.resolve(),
    },
    GhostexTerminalView: (props: object) => React.createElement(MockView, { testID: 'terminal-view', ...props }),
  };
});
jest.mock('../components/terminal/uploads', () => ({
  ...jest.requireActual('../components/terminal/uploads'),
  pickAndSendAttachment: (...args: [string, string, unknown?]) => mockPickAndSend(...args),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-haptics', () => ({
  impactAsync: () => Promise.resolve(),
  notificationAsync: () => Promise.resolve(),
  selectionAsync: () => mockSelectionHaptic(),
  performAndroidHapticsAsync: () => Promise.resolve(),
  AndroidHaptics: { Keyboard_Tap: 'keyboard-tap', Context_Click: 'context-click' },
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy', Rigid: 'rigid' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('../chat/native/NativeChatScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('../voice/VoiceButton', () => ({ VoiceButton: () => null }));
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
  useFocusEffect: () => undefined,
  useNavigation: () => ({ navigate: () => undefined }),
}));

const WINDOW = { width: 402, height: 874 };
const KEYBOARD = { top: 538, height: 336 };
const HIDDEN_TOO = { hidden: true };
const TOGGLE = 'Command pad';
const EDITOR = 'Terminal text editor';
/** The nine default keys by the names REQ-KEY-003 AC2 lists. */
const DEFAULT_LABELS = ['Esc', 'Up', 'Ctrl+C', 'Left', 'Enter', 'Right', 'Tab', 'Down', 'Upload'];
/** Accessibility labels of the former key bar's own controls (TerminalKeyBar.tsx at 7acb819). */
const KEY_BAR_LABELS = ['Extra keys', 'Open text editor', 'Dismiss keyboard', 'ESC', 'SHIFT', 'NEWLN', 'PGUP'];
const NO_MODS = { ctrl: false, alt: false, shift: false };

const navigation = { setOptions: () => undefined, popTo: () => undefined, navigate: jest.fn() };

const SHELL_TAB: TerminalTab = { sessionKey: 'shell-1', machineId: 'm1', title: 'shell', kind: 'shell', state: 'open' };
const AGENT_TAB: TerminalTab = {
  sessionKey: 'agent-1',
  machineId: 'm1',
  title: 'agent',
  kind: 'attach',
  ghostexSessionId: 's1',
  ghostexProjectId: 'p1',
  ghostexAgentId: 'claude',
  state: 'open',
};

const keyboard = keyboardFixture({ width: WINDOW.width, height: WINDOW.height });
const initialSettings = useSettingsStore.getState().settings;

async function renderScreen(tab: TerminalTab = SHELL_TAB): Promise<void> {
  await act(() => {
    Dimensions.set({ window: { ...WINDOW, scale: 3, fontScale: 1 }, screen: { ...WINDOW, scale: 3, fontScale: 1 } });
  });
  useTerminalStore.setState({ tabs: [tab], selectedSessionKey: tab.sessionKey });
  await render(
    <TerminalScreen
      navigation={navigation as never}
      route={{ key: 'terminal', name: 'Terminal', params: { sessionKey: tab.sessionKey, machineId: 'm1' } }}
    />,
  );
  await act(async () => undefined);
}

async function setSettings(patch: Partial<typeof initialSettings>): Promise<void> {
  await act(() => useSettingsStore.setState({ settings: { ...useSettingsStore.getState().settings, ...patch } }));
}

async function keyboardWillShow(): Promise<void> {
  await act(() => keyboard.show(KEYBOARD.top, KEYBOARD.height, 250));
}

async function keyboardWillHide(): Promise<void> {
  await act(() => keyboard.hide(250));
}

async function openPad(): Promise<void> {
  await fireEvent.press(screen.getByLabelText(TOGGLE));
}

/** A pad key's touch: down, up, and the press that completes it. */
async function tapKey(label: string): Promise<void> {
  const key = screen.getByLabelText(label);
  await fireEvent(key, 'pressIn');
  await fireEvent(key, 'pressOut');
  await fireEvent.press(key);
}

function bottomOf(instance: TestInstance): number | undefined {
  return StyleSheet.flatten(instance.props.style)?.bottom;
}

function terminalTop(): number {
  return (StyleSheet.flatten(screen.getByTestId('terminal-view').props.style)?.top ?? 0) + 0;
}

beforeEach(() => {
  jest.useFakeTimers();
  Object.values(mockNative).forEach((mock) => mock.mockClear());
  mockNative.focusTerminal.mockImplementation(() => Promise.resolve(true));
  mockPickAndSend.mockClear();
  mockSelectionHaptic.mockClear();
  navigation.navigate.mockClear();
  useSettingsStore.setState({ settings: { ...initialSettings, commandPadKeys: [...DEFAULT_COMMAND_PAD_KEYS] } });
  useTerminalStore.setState({ sessionViewModeBySessionKey: {} });
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => Promise.resolve(false));
});

afterEach(async () => {
  await act(() => keyboard.hide(0));
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('REQ-KEY-001: the floating pad replaces the key bar and the upload button', () => {
  test('REQ-KEY-001 AC1: with the keyboard dismissed the pad toggle exists', async () => {
    await renderScreen();
    expect(screen.getByLabelText(TOGGLE)).toBeTruthy();
  });

  test('REQ-KEY-001 AC2: with the keyboard shown no key bar element exists, the pad toggle does', async () => {
    await renderScreen();
    await keyboardWillShow();
    for (const label of KEY_BAR_LABELS) expect(screen.queryByLabelText(label, HIDDEN_TOO)).toBeNull();
    expect(screen.getByLabelText(TOGGLE)).toBeTruthy();
  });

  test('REQ-KEY-001 AC3: no separate upload button exists outside the pad, closed or open', async () => {
    await renderScreen();
    expect(screen.queryByLabelText('Upload Image or File', HIDDEN_TOO)).toBeNull();
    await openPad();
    expect(screen.queryByLabelText('Upload Image or File', HIDDEN_TOO)).toBeNull();
    expect(screen.getAllByLabelText('Upload')).toHaveLength(1);
  });

  test('REQ-KEY-001 AC4: keyboard hidden, pad open, Down tapped: the terminal receives Down', async () => {
    await renderScreen();
    await openPad();
    await tapKey('Down');
    expect(mockNative.sendKey.mock.calls).toEqual([['shell-1', 'down', NO_MODS]]);
  });

  test('REQ-KEY-001 AC5: a session in the chat view has no pad element', async () => {
    useTerminalStore.setState({ sessionViewModeBySessionKey: { 'agent-1': 'chat' } });
    await renderScreen(AGENT_TAB);
    expect(screen.queryByLabelText(TOGGLE, HIDDEN_TOO)).toBeNull();
    for (const label of DEFAULT_LABELS) expect(screen.queryByLabelText(label, HIDDEN_TOO)).toBeNull();
  });

  test('REQ-KEY-001: the toggle stands above the keyboard while it is up and in the corner while it is down', async () => {
    await renderScreen();
    expect(bottomOf(screen.getByLabelText(TOGGLE))).toBe(16);
    await keyboardWillShow();
    // 336 - 34 of the terminal area covered, 12 above it.
    expect(bottomOf(screen.getByLabelText(TOGGLE))).toBe(314);
    await keyboardWillHide();
    expect(bottomOf(screen.getByLabelText(TOGGLE))).toBe(16);
  });
});

describe('REQ-KEY-002: the setting shows and hides the pad', () => {
  test('REQ-KEY-002 AC1: setting off: no pad toggle with or without the keyboard; Upload is the round button as today (U1)', async () => {
    await setSettings({ extraKeysToolbarVisible: false });
    await renderScreen();
    expect(screen.queryByLabelText(TOGGLE, HIDDEN_TOO)).toBeNull();
    expect(screen.getByLabelText('Upload Image or File')).toBeTruthy();
    await keyboardWillShow();
    expect(screen.queryByLabelText(TOGGLE, HIDDEN_TOO)).toBeNull();
  });

  test('REQ-KEY-002 AC1: with the pad off, Advanced > Show file upload button still hides the round button', async () => {
    await setSettings({ extraKeysToolbarVisible: false, fileUploadButtonVisible: false });
    await renderScreen();
    expect(screen.queryByLabelText('Upload Image or File', HIDDEN_TOO)).toBeNull();
  });

  test('REQ-KEY-002 AC2: setting on: the pad toggle exists', async () => {
    await setSettings({ extraKeysToolbarVisible: true });
    await renderScreen();
    expect(screen.getByLabelText(TOGGLE)).toBeTruthy();
  });
});

describe('REQ-KEY-003: the pad toggle opens the floating 3x3 field', () => {
  test('REQ-KEY-003 AC1/AC2: open with default settings: exactly nine pad keys, arrows around Enter, Esc, ^C, Tab, Upload in the corners', async () => {
    await renderScreen();
    expect(screen.queryByLabelText('Up')).toBeNull();
    await openPad();
    const field = screen.getByLabelText('Up').parent as TestInstance;
    const keys = field.children.filter((child): child is TestInstance => typeof child !== 'string');
    expect(keys.map((key) => key.props.accessibilityLabel)).toEqual(DEFAULT_LABELS);
    expect(screen.getByLabelText(TOGGLE).props.accessibilityState).toMatchObject({ expanded: true });
  });

  test('REQ-KEY-003 AC3: keyboard hidden, Esc tapped in the pad: the terminal receives Escape', async () => {
    await renderScreen();
    await openPad();
    await tapKey('Esc');
    expect(mockNative.sendKey.mock.calls).toEqual([['shell-1', 'escape', NO_MODS]]);
  });

  test('REQ-KEY-004: Ctrl+C is sent as c with the Ctrl modifier', async () => {
    await renderScreen();
    await openPad();
    await tapKey('Ctrl+C');
    expect(mockNative.sendKey.mock.calls).toEqual([['shell-1', 'c', { ctrl: true, alt: false, shift: false }]]);
  });
});

describe('REQ-KEY-006: a key changed in Settings shows in its position', () => {
  test('REQ-KEY-006 AC1: the centre key changed to Home: that position is labelled Home', async () => {
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

describe('REQ-KEY-007: the pad stays open until its toggle is tapped again', () => {
  test('REQ-KEY-007 AC1: after a pad key tap the pad is still there', async () => {
    await renderScreen();
    await openPad();
    await tapKey('Left');
    expect(screen.getByLabelText('Left')).toBeTruthy();
    await keyboardWillShow();
    await keyboardWillHide();
    expect(screen.getByLabelText('Left')).toBeTruthy();
  });

  test('REQ-KEY-007 AC2: a second tap on the toggle closes the pad', async () => {
    await renderScreen();
    await openPad();
    await openPad();
    for (const label of DEFAULT_LABELS) expect(screen.queryByLabelText(label)).toBeNull();
    expect(screen.getByLabelText(TOGGLE).props.accessibilityState).toMatchObject({ expanded: false });
  });
});

describe('REQ-KEY-009: Upload from the pad', () => {
  test('REQ-KEY-009 AC1/AC4: Upload starts the upload the round button started, once, for this session', async () => {
    await renderScreen();
    await openPad();
    await tapKey('Upload');
    expect(mockPickAndSend.mock.calls).toEqual([['m1', 'shell-1', undefined]]);
  });

  test('REQ-KEY-009 AC2/AC3: no open session: Upload is disabled and starts nothing', async () => {
    await renderScreen({ ...SHELL_TAB, state: 'opening' });
    await openPad();
    expect(screen.getByLabelText('Upload').props.accessibilityState).toMatchObject({ disabled: true });
    await tapKey('Upload');
    expect(mockPickAndSend).not.toHaveBeenCalled();
  });
});

describe('REQ-KEY-010: every function of the key bar is reached from the pad', () => {
  test('REQ-KEY-010 AC5/AC6/AC8: Keys layer: the extra keys rows with modifiers and the KEYS page with hold-to-see descriptions', async () => {
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

  test('REQ-KEY-010 AC6: Ctrl tapped in the Keys layer applies once to the next pad key, its chip shows while armed', async () => {
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

  test('REQ-KEY-010 AC8: Agent layer: the session agent hotkeys, sent as their sequence; no agent, no Agent layer', async () => {
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

  test('REQ-KEY-010 AC8: a shell session has no agent hotkeys: the Agent button is unavailable', async () => {
    await renderScreen();
    await openPad();
    expect(screen.getByLabelText('Agent hotkeys').props.accessibilityState).toMatchObject({ disabled: true });
  });

  test('REQ-KEY-010 AC10: the keyboard button shows the keyboard and, while it is up, dismisses it', async () => {
    await renderScreen();
    await openPad();
    await fireEvent.press(screen.getByLabelText('Show keyboard'));
    expect(mockNative.focusTerminal).toHaveBeenCalledWith('shell-1');
    await keyboardWillShow();
    await fireEvent.press(screen.getByLabelText('Hide keyboard'));
    expect(mockNative.blurTerminal).toHaveBeenCalledWith('shell-1');
  });

  test('REQ-KEY-010 AC7/AC11/AC12: Pad settings in the Keys layer opens Settings > Keyboard', async () => {
    await renderScreen();
    await openPad();
    await fireEvent.press(screen.getByLabelText('Keys'));
    await fireEvent.press(screen.getByLabelText('Pad settings'));
    expect(navigation.navigate).toHaveBeenCalledWith('SettingsPage', { page: 'keyboard' });
  });
});

describe('owner D-037: a layer takes the keyboard place, cross and ring stay where they are', () => {
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

describe('REQ-KEY-010 AC9: the text editor with Send, and the pen hand-over (REQ-NFR-001 AC1, owner report "pen")', () => {
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

  test('REQ-KEY-010 AC9: Send with an empty draft sends Enter, with text inserts the text', async () => {
    await openEditor();
    await fireEvent.press(screen.getByLabelText('Send Enter to terminal'));
    await fireEvent.changeText(screen.getByLabelText(EDITOR), 'ls -la');
    await fireEvent.press(screen.getByLabelText('Insert text into terminal'));
    expect(mockNative.sendKey.mock.calls).toEqual([['shell-1', 'enter', {}]]);
    expect(mockNative.sendText.mock.calls).toEqual([['shell-1', 'ls -la']]);
  });

  test('REQ-NFR-001 AC1: the pen asks the terminal for focus while the editor still holds it; the editor goes after the answer', async () => {
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

  test('REQ-NFR-001 AC1: a refused hand-over still closes the editor and is logged', async () => {
    await openEditor();
    await fireEvent.press(screen.getByLabelText('Text editor'));
    await act(async () => {
      handOver?.resolve(false);
    });
    await act(() => jest.advanceTimersByTime(300));
    expect(screen.queryByLabelText(EDITOR, HIDDEN_TOO)).toBeNull();
    expect(warnSpy.mock.calls).toEqual([[expect.stringMatching(/refused the keyboard focus for session shell-1/)]]);
  });

  test('REQ-NFR-001 AC1: a failed hand-over still closes the editor and is logged with its error', async () => {
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

describe('REQ-NFR-005: Android keeps its flow path for the pad', () => {
  const ios = Platform.OS;
  beforeEach(() => {
    Platform.OS = 'android';
  });
  afterEach(() => {
    Platform.OS = ios;
  });

  test('the pad works there too and Paste is not offered (no native path on Android)', async () => {
    const withPaste = [...DEFAULT_COMMAND_PAD_KEYS];
    withPaste[8] = 'paste';
    await setSettings({ commandPadKeys: withPaste });
    await renderScreen();
    await openPad();
    // The bottom right position falls back to its default key.
    expect(screen.queryByLabelText('Paste')).toBeNull();
    expect(screen.getByLabelText('Upload')).toBeTruthy();
    await tapKey('Right');
    expect(mockNative.sendKey.mock.calls).toEqual([['shell-1', 'right', NO_MODS]]);
  });
});

describe('REQ-KEY-004: Paste on iOS uses the terminal edit-menu paste', () => {
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

/** The press event of an accessibility activation: no touches (Pressability's non-pointer click). */
const ACCESSIBILITY_ACTIVATION = { nativeEvent: { target: 1 } };

describe('review r1 regressions (K-1, K-2, K-4)', () => {
  test('REQ-KEY-004 AC1 / REQ-KEY-001 AC4: a pad key activated without a touch-down (VoiceOver, Switch Control) sends once', async () => {
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

  test('REQ-KEY-010 AC9: a draft typed in one session never goes to another one (tab switch within the editor linger)', async () => {
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
  });

  test('REQ-KEY-010 AC4/AC8: opening and closing the Keys and Agent layers ticks like the key bar page toggles, only with Key vibration on', async () => {
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

  test('owner D-037: a layer whose keys need more room than the keyboard keeps its frame and scrolls; the pad stays put', async () => {
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

describe('owner D-062 and the accessibility floor', () => {
  test('REQ-KEY-010 AC5: an extra-keys pill of the Keys layer activated without a touch sends once; a touch sends once', async () => {
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

  test('REQ-KEY-006 (D-062): a pad key follows its custom action; deleted, it shows "Not available" and sends nothing', async () => {
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

describe('owner D-062: frosted glass as in the approved mockup, opaque with Reduce Transparency', () => {
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

describe('review r2: Reduce Transparency order and disabled controls', () => {
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

  test('owner D-062: a change notification that arrives before the first read wins over that older read', async () => {
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

  test('owner D-062: with Reduce Transparency on, disabled controls keep their opaque backplate (Agent, Not available, Upload)', async () => {
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
