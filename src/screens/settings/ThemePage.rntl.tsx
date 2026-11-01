/// <reference types="jest" />
/**
 * Run with `bunx jest src/screens/settings/ThemePage.rntl.tsx`. Settings › Interface and Settings › Terminal through
 * the real settings store and the real pages: a preset is one save of the desktop's patch and its card shows as
 * selected; picking light mode's colour on purpose keeps a dark preset from writing light mode until the page is
 * opened again; a manual edit unselects the card; Chat theme and Terminal theme take the desktop's four values;
 * the status bar ink follows a light page; Custom terminal background seeds the desktop's colour. Expectations come
 * from the desktop (`theme_preset_choice`, `select_preset`, `SESSION_CHAT_THEME_OPTIONS`, General › Terminal) and
 * the preset files, not from the page. Only native modules are replaced: storage (AsyncStorage's own mock), the
 * app's native module and the native status bar manager (the test preset's mock).
 */

import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { NativeModules } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { transcriptThemeFor } from '../../chat/native/transcript/theme';
import type { RootStackParamList } from '../../navigation/types';
import { defaultSettings, useSettingsStore } from '../../settings/store';
import { THEME_PRESETS, themePresetMatches } from '../../theme/presets';
import { resolveThemeAreas, stepTowardHex } from '../../theme/sidebarAppearance';
import SettingsPageScreen from './SettingsPageScreen';

const nativeStatusStyle = (): jest.Mock => NativeModules.StatusBarManager.setStyle as jest.Mock;
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../../../modules/ghostex-native/src/GhostexNativeModule', () => ({ __esModule: true, default: {} }));
// Settings' page switch also imports the Licences page, which bundles the notices file; these pages never read it.
jest.mock('../../../THIRD_PARTY_NOTICES.md', () => 1);

const Stack = createNativeStackNavigator<RootStackParamList>();

function Page({ page }: { page: 'theme' | 'terminal' }) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 402, height: 874 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen name="SettingsPage" component={SettingsPageScreen} initialParams={{ page }} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const preset = (id: string) => THEME_PRESETS.find((entry) => entry.id === id)!;
const card = (id: string, selected?: boolean) =>
  screen.getByRole('button', {
    name: `${preset(id).name}, ${preset(id).mode} preset`,
    ...(selected === undefined ? {} : { selected }),
  });
const settings = () => useSettingsStore.getState().settings;

beforeEach(() => {
  nativeStatusStyle().mockClear();
  useSettingsStore.setState({ hydrated: true, settings: defaultSettings() });
});

test('a preset is one save of its patch, its card is selected, and a manual edit unselects it', async () => {
  await render(<Page page="theme" />);
  expect(screen.getAllByRole('button', { name: /preset$/ })).toHaveLength(20);

  await act(async () => fireEvent.press(card('mocha')));
  // The file's light-follows patch, exactly (the desktop's Mocha literal is checked in presets.test.ts).
  expect(settings()).toMatchObject(preset('mocha').patches.lightFollows);
  expect(card('mocha', true)).toBeTruthy();
  expect(THEME_PRESETS.filter((entry) => themePresetMatches(settings(), entry)).map((entry) => entry.id)).toEqual([
    'mocha',
  ]);

  // Choosing a dark colour square is a manual edit of an always-written key: no card stays selected.
  await act(async () => fireEvent.press(screen.getByRole('radio', { name: 'Blue, dark mode colour' })));
  expect(settings().darkThemePreset).toBe('blue');
  expect(screen.queryByRole('button', { name: /preset$/, selected: true })).toBeNull();
});

test('a light colour picked on purpose keeps a dark preset out of light mode until the page reopens', async () => {
  const first = await render(<Page page="theme" />);
  await act(async () => fireEvent.press(screen.getByRole('radio', { name: 'Teal, light mode colour' })));
  expect(settings().lightThemePreset).toBe('teal');

  await act(async () => fireEvent.press(card('dracula')));
  expect(settings()).toMatchObject(preset('dracula').patches.lightPickedOnPurpose);
  expect(settings().lightThemePreset).toBe('teal');
  expect(settings().terminalGhosttyLightTheme).toBe('GitHub Light Default');

  // Opening the page again starts a new page session: the dark preset brings its light partner.
  await first.unmount();
  await render(<Page page="theme" />);
  await act(async () => fireEvent.press(card('dracula')));
  expect(settings()).toMatchObject(preset('dracula').patches.lightFollows);
  expect(settings().customSidebarTitlebarLightBackgroundTintColor).toBe(preset('alucard').tintColor);
});

test('a light tint typed into the Custom field counts as a light colour picked on purpose', async () => {
  // After a saved preset both modes are already Custom, so the light hex field shows without a tap on the + square.
  useSettingsStore.setState({ settings: { ...defaultSettings(), ...preset('mocha').patches.lightFollows } });
  await render(<Page page="theme" />);
  const lightField = screen.getAllByLabelText('Custom tint, hex colour')[1]!;
  await act(async () => fireEvent.changeText(lightField, '#aabbcc'));
  expect(settings().customSidebarTitlebarLightBackgroundTintColor).toBe('#aabbcc');

  // The desktop's picker marks light as picked on purpose (tabs/theme/mod.rs), so the next dark preset leaves it.
  await act(async () => fireEvent.press(card('dracula')));
  expect(settings().customSidebarTitlebarLightBackgroundTintColor).toBe('#aabbcc');
});

test('a light preset makes the app light, puts dark status bar ink over it and paints chat from its work area', async () => {
  await render(<Page page="theme" />);
  await act(async () => fireEvent.press(card('latte')));
  expect(settings().sidebarTheme).toBe('plain-light');
  // React Native sends the status bar stack to the native side at the end of the frame.
  await act(async () => {
    const { promise, resolve } = Promise.withResolvers<void>();
    setImmediate(resolve);
    await promise;
  });
  expect(nativeStatusStyle().mock.calls.at(-1)?.[0]).toBe('dark-content');

  // Chat follows the app: its page is Latte's work area and its surfaces are the desktop's steps off it.
  const chat = transcriptThemeFor(settings(), true);
  expect(chat.background).toBe(resolveThemeAreas(settings(), true).workArea);
  expect(chat.background).toBe('#eff1f5');
  expect(chat.input).toBe(stepTowardHex('#eff1f5', false, 0.032));
  expect(chat.composerBackground).toBe(stepTowardHex('#eff1f5', true, 0.3));
  expect(chat.menu).toBe(resolveThemeAreas(settings(), true).menu);
});

test('Chat theme and Terminal theme offer Follow app, System, Light and Dark, and a preset leaves them alone', async () => {
  await render(<Page page="theme" />);
  expect(screen.getAllByRole('radio', { name: /^(Follow app|System|Light|Dark)$/ })).toHaveLength(8);
  // Index 0 is the Appearance card's label; then Chat theme's row, then Terminal theme's.
  await act(async () => fireEvent.press(screen.getAllByText('Dark')[1]!));
  await act(async () => fireEvent.press(screen.getAllByText('System')[2]!));
  expect([settings().sessionChatTheme, settings().terminalColorScheme]).toEqual(['dark', 'system']);

  await act(async () => fireEvent.press(card('latte')));
  expect([settings().sessionChatTheme, settings().terminalColorScheme]).toEqual(['dark', 'system']);
  // An own Dark keeps the chat dark under a light preset.
  expect(transcriptThemeFor(settings(), false).light).toBe(false);
});

test('Custom terminal background seeds the desktop colour once, then takes a typed colour', async () => {
  await render(<Page page="terminal" />);
  await act(async () => fireEvent.press(screen.getByRole('radio', { name: 'Custom color' })));
  expect(settings()).toMatchObject({ terminalBackgroundMode: 'custom', workspaceBackgroundColor: '#111111' });

  await act(async () =>
    fireEvent.changeText(screen.getByLabelText('Terminal background color, hex colour'), '#336699'),
  );
  expect(settings().workspaceBackgroundColor).toBe('#336699');

  await act(async () => fireEvent.press(screen.getByRole('radio', { name: 'Follow theme' })));
  await act(async () => fireEvent.press(screen.getByRole('radio', { name: 'Custom color' })));
  expect(settings()).toMatchObject({ terminalBackgroundMode: 'custom', workspaceBackgroundColor: '#336699' });
});
