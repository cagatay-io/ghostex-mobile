/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. The composer's sheet slides up only once its panel has been measured,
 * so the slide runs over the panel's real height instead of jumping when the measurement arrives late,
 * and a sheet opened again measures its new content before it slides.
 */

import { Animated, Dimensions, StyleSheet, Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { Sheet } from './Sheet';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('../../../../modules/ghostex-native/src', () => ({ GhostexNative: {} }));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

function panelOffset(): number {
  const { transform } = StyleSheet.flatten(screen.getByTestId('sheet-panel').props.style) as {
    transform: { translateY: number }[];
  };
  return transform[0]!.translateY;
}

function measure(height: number) {
  return fireEvent(screen.getByTestId('sheet-panel'), 'layout', { nativeEvent: { layout: { height } } });
}

function sheet(visible: boolean, text: string) {
  return (
    <Sheet visible={visible} onClose={() => undefined}>
      <Text>{text}</Text>
    </Sheet>
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  // Native-driven animations do not run under Jest; the same timing runs on the JS driver here, so the
  // panel's position can be read.
  const timing = Animated.timing;
  jest
    .spyOn(Animated, 'timing')
    .mockImplementation((value, config) => timing(value, { ...config, useNativeDriver: false }));
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('the panel waits below the screen until it is measured, then slides up over its own height', async () => {
  await render(sheet(true, 'Models'));
  await act(() => jest.advanceTimersByTime(1000));
  expect(panelOffset()).toBe(Dimensions.get('window').height);

  await measure(300);
  expect(panelOffset()).toBe(300);
  await act(() => jest.advanceTimersByTime(130));
  const midway = panelOffset();
  expect(midway).toBeGreaterThan(0);
  expect(midway).toBeLessThan(300);
  await act(() => jest.advanceTimersByTime(1000));
  expect(panelOffset()).toBe(0);
});

test('opened again, the sheet measures its new content before it slides up', async () => {
  await render(sheet(true, 'Models'));
  await measure(300);
  await act(() => jest.advanceTimersByTime(1000));
  await screen.rerender(sheet(false, 'Models'));
  await act(() => jest.advanceTimersByTime(1000));
  expect(screen.queryByText('Models')).toBeNull();

  await screen.rerender(sheet(true, 'Accounts'));
  await act(() => jest.advanceTimersByTime(1000));
  expect(panelOffset()).toBe(Dimensions.get('window').height);
  await measure(420);
  expect(panelOffset()).toBe(420);
  await act(() => jest.advanceTimersByTime(1000));
  expect(panelOffset()).toBe(0);
});
