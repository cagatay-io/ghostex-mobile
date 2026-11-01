/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. Settings > Keyboard > Pad keys with the real picker and the real settings store: a
 * key changed in Settings, up to the stored key (a position changed through the picker holds the chosen key, which
 * the pad then shows: TerminalScreen.commandPad.rntl.tsx), and Reset in the header as in the approved Pad keys
 * mockup. Mocked are the boundaries only: navigation (its header options are captured), storage, the safe area, the
 * Settings columns frame and scroll view (layout chrome), and the system alert.
 */

import type { ReactNode } from 'react';
import { Alert, View } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { DEFAULT_COMMAND_PAD_KEYS } from '../settings/commandPad';
import { useSettingsStore } from '../settings/store';
import CommandPadKeysEditorScreen from './CommandPadKeysEditorScreen';

let mockHeaderRight: (() => ReactNode) | undefined;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    setOptions: (options: { headerRight?: () => ReactNode }) => {
      if (options.headerRight !== undefined) mockHeaderRight = options.headerRight;
    },
  }),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return {
    SafeAreaView: MockView,
    useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
  };
});
jest.mock('./settings/SettingsColumns', () => ({
  SettingsColumnsFrame: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('./settings/SettingsControls', () => {
  const { ScrollView: MockScrollView } = jest.requireActual('react-native');
  return { SettingsPageScrollView: MockScrollView };
});
jest.mock('../components/common/verticalBar/VerticalBarArea', () => ({
  useVerticalBarSpace: () => ({ left: 0, right: 0, margin: {} }),
}));

const initialSettings = useSettingsStore.getState().settings;

beforeEach(() => {
  mockHeaderRight = undefined;
  useSettingsStore.setState({ settings: { ...initialSettings, commandPadKeys: [...DEFAULT_COMMAND_PAD_KEYS] } });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('every pad key is changeable in Settings', () => {
  test('the centre changed to Home through the picker is stored and shown in that position', async () => {
    await render(<CommandPadKeysEditorScreen />);
    await fireEvent.press(screen.getByLabelText('Centre: Enter'));
    expect(screen.getByText('Centre key')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Home'));
    expect(useSettingsStore.getState().settings.commandPadKeys[4]).toBe('key:home');
    expect(
      useSettingsStore.getState().settings.commandPadKeys.filter((id, i) => id !== DEFAULT_COMMAND_PAD_KEYS[i]),
    ).toEqual(['key:home']);
    expect(screen.getByLabelText('Centre: Home')).toBeTruthy();
  });

  test('the picker offers Paste and Upload and the agent hotkeys', async () => {
    await render(<CommandPadKeysEditorScreen />);
    await fireEvent.press(screen.getByLabelText('Top left: Esc'));
    for (const label of ['Paste', 'Upload', 'Ctrl', 'Claude Code: EXIT', 'Codex: HISTORY', 'Pi: EDITOR']) {
      expect(screen.getAllByLabelText(label).length).toBeGreaterThan(0);
    }
  });

  test('Reset sits in the header (approved mockup) and puts the default nine back after confirming', async () => {
    const changed = [...DEFAULT_COMMAND_PAD_KEYS];
    changed[0] = 'key:f1';
    useSettingsStore.setState({ settings: { ...useSettingsStore.getState().settings, commandPadKeys: changed } });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<CommandPadKeysEditorScreen />);
    expect(screen.queryByText('Reset')).toBeNull();
    expect(mockHeaderRight).toBeDefined();
    await render(<View>{mockHeaderRight?.()}</View>);
    await fireEvent.press(screen.getByText('Reset'));
    const buttons = alert.mock.calls[0][2] ?? [];
    await act(() => buttons.find((button) => button.style === 'destructive')?.onPress?.());
    expect(useSettingsStore.getState().settings.commandPadKeys).toEqual([...DEFAULT_COMMAND_PAD_KEYS]);
  });
});
