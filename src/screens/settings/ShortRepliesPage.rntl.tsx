/// <reference types="jest" />
/**
 * Run with `bunx jest src/screens/settings/ShortRepliesPage.rntl.tsx`. The short-replies requirement on the page
 * itself: on Settings › Short Replies the user adds, edits and removes entries, and the stored list (`shortReplies` in
 * `settings.v1`, read back by a reload of the settings) equals the list the page shows; an entry left empty is not
 * kept. The real page, the real settings store and the storage mock of the storage package; only the page frame (safe
 * area, scroll view, header) is stubbed, and the native module.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { defaultSettings, useSettingsStore } from '../../settings/store';
import ShortRepliesPage from './ShortRepliesPage';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../../../modules/ghostex-native/src', () => ({
  GhostexNative: { addListener: () => ({ remove: () => undefined }) },
}));
jest.mock('./SettingsControls', () => {
  const { createElement } = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    ...jest.requireActual('./SettingsControls'),
    SettingsScreenLayout: ({ children }: { children: unknown }) => createElement(View, null, children),
  };
});

/** The entries as the page shows them, top to bottom. */
const shown = () => screen.queryAllByLabelText(/^Short reply \d+$/).map((field) => field.props.value as string);

async function stored(): Promise<{ saved: unknown; reloaded: string[] }> {
  const saved = JSON.parse((await AsyncStorage.getItem('settings.v1')) ?? '{}').shortReplies;
  await act(async () => {
    useSettingsStore.setState({ hydrated: false });
    await useSettingsStore.getState().hydrate();
  });
  return { saved, reloaded: useSettingsStore.getState().settings.shortReplies };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  useSettingsStore.setState({ hydrated: true, settings: defaultSettings() });
});

test('a fresh install shows "continue" and "yes"', async () => {
  await render(<ShortRepliesPage />);
  expect(shown()).toEqual(['continue', 'yes']);
});

test('after adding, editing and removing entries the stored list equals the shown list', async () => {
  await render(<ShortRepliesPage />);
  await fireEvent.press(screen.getByLabelText('Add Reply'));
  await fireEvent.changeText(screen.getByLabelText('Short reply 3'), 'passt');
  await fireEvent.changeText(screen.getByLabelText('Short reply 1'), 'mach weiter');
  await fireEvent.press(screen.getByLabelText('Remove “yes”'));
  expect(shown()).toEqual(['mach weiter', 'passt']);
  expect(await stored()).toEqual({ saved: shown(), reloaded: shown() });
});

test('an entry left empty is not kept and leaves the page', async () => {
  await render(<ShortRepliesPage />);
  await fireEvent.press(screen.getByLabelText('Add Reply'));
  expect(shown()).toEqual(['continue', 'yes', '']);
  await fireEvent(screen.getByLabelText('Short reply 3'), 'blur');
  expect(shown()).toEqual(['continue', 'yes']);
  expect(useSettingsStore.getState().settings.shortReplies).toEqual(['continue', 'yes']);
});
