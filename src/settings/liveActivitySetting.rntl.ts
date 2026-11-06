/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. The Live Activity switch rests on the stored setting `liveActivityEnabled` (default
 * true, an invalid value falls back to the default). The real settings store reads `settings.v1` through its hydrate
 * path, so a payload written before the switch existed keeps every setting it had and gets the switch on.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { useSettingsStore } from './store';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const STORAGE_KEY = 'settings.v1';

async function hydrateFrom(stored: Record<string, unknown>) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  useSettingsStore.setState({ hydrated: false });
  await useSettingsStore.getState().hydrate();
  return useSettingsStore.getState().settings;
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

test('a settings payload from before the switch keeps its values and has the Live Activity on', async () => {
  const settings = await hydrateFrom({ doneNotificationSound: false, fontSize: 14, keepScreenOn: true });
  expect(settings.liveActivityEnabled).toBe(true);
  expect(settings).toMatchObject({ doneNotificationSound: false, fontSize: 14, keepScreenOn: true });
});

test('a stored "off" stays off across launches', async () => {
  useSettingsStore.getState().setSetting('liveActivityEnabled', false);
  // setSetting writes in the background; let that write land before reading it back.
  const written = Promise.withResolvers<void>();
  setImmediate(written.resolve);
  await written.promise;
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  expect(raw === null ? null : JSON.parse(raw).liveActivityEnabled).toBe(false);
  const settings = await hydrateFrom(raw === null ? {} : JSON.parse(raw));
  expect(settings.liveActivityEnabled).toBe(false);
});

test('an invalid stored value falls back to the default (on)', async () => {
  const settings = await hydrateFrom({ liveActivityEnabled: 'yes' });
  expect(settings.liveActivityEnabled).toBe(true);
});
