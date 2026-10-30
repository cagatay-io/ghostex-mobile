/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. Settings › Licences reads the notices file bundled with the app once per app run:
 * the list shows a reading state, then either the components or why the read failed with a way to try again, and
 * an entry page opened from the list shows that component's licence without reading the file again. Only native
 * modules are replaced: the bundled asset and the file read, the settings storage the app's theme reads
 * (AsyncStorage's own in-memory mock) and the app's native module, which these screens import but never call. The
 * hook, the parser, the Settings page and the entry screen are the real ones, and the read returns the real
 * THIRD_PARTY_NOTICES.md.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LicencesCopy } from '../../copy';
import type { RootStackParamList } from '../../navigation/types';
import LicenceNoticeScreen from '../LicenceNoticeScreen';
import SettingsPageScreen from './SettingsPageScreen';

const mockDownload = jest.fn();
const mockRead = jest.fn();
jest.mock('../../../THIRD_PARTY_NOTICES.md', () => 1);
jest.mock('expo-asset', () => ({
  Asset: { fromModule: () => ({ downloadAsync: mockDownload }) },
}));
jest.mock('expo-file-system', () => ({
  File: class {
    readonly uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    text() {
      return mockRead(this.uri);
    }
  },
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../../../modules/ghostex-native/src/GhostexNativeModule', () => ({ __esModule: true, default: {} }));

const NOTICES = readFileSync(path.join(__dirname, '../../../THIRD_PARTY_NOTICES.md'), 'utf8');
const Stack = createNativeStackNavigator<RootStackParamList>();

function Licences() {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 402, height: 874 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen name="SettingsPage" component={SettingsPageScreen} initialParams={{ page: 'licences' }} />
          <Stack.Screen name="LicenceNotice" component={LicenceNoticeScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

test('the list reads the bundled notices once, recovers from a failed read and shares the read with an entry page', async () => {
  const firstDownload = Promise.withResolvers<{ localUri: string }>();
  mockDownload.mockReturnValueOnce(firstDownload.promise);

  // Reading: the list says so, and leaving and reopening the page keeps the one pending read.
  const first = await render(<Licences />);
  expect(first.getByText(LicencesCopy.loading)).toBeTruthy();
  await first.unmount();
  const screen = await render(<Licences />);
  expect(screen.getByText(LicencesCopy.loading)).toBeTruthy();
  expect(mockDownload).toHaveBeenCalledTimes(1);

  // The read fails: the page names the failure and offers Retry.
  await act(async () => firstDownload.reject(new Error('The bundled notices could not be opened.')));
  expect(screen.getByText(LicencesCopy.loadFailed)).toBeTruthy();
  expect(screen.getByText('The bundled notices could not be opened.')).toBeTruthy();

  // Retry reads again and shows the components of the real file.
  mockDownload.mockResolvedValue({ localUri: 'file:///bundle/THIRD_PARTY_NOTICES.md' });
  mockRead.mockResolvedValue(NOTICES);
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: LicencesCopy.retry }));
  });
  expect(screen.queryByText(LicencesCopy.loadFailed)).toBeNull();
  expect(screen.getByText('Ghostty')).toBeTruthy();
  expect(mockDownload).toHaveBeenCalledTimes(2);
  expect(mockRead).toHaveBeenCalledTimes(1);
  expect(mockRead).toHaveBeenCalledWith('file:///bundle/THIRD_PARTY_NOTICES.md');

  // Opening an entry shows its licence from the same read.
  await act(async () => {
    fireEvent.press(screen.getByText('Ghostty'));
  });
  expect(screen.getByRole('header', { name: /^Ghostty · / })).toBeTruthy();
  expect(screen.getByText(/Permission is hereby granted, free of charge/)).toBeTruthy();
  expect(mockDownload).toHaveBeenCalledTimes(2);
  expect(mockRead).toHaveBeenCalledTimes(1);
});
