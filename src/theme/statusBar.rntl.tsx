/// <reference types="jest" />
/**
 * Run with `bunx jest src/theme/statusBar.rntl.tsx`. A focused screen painted light gets dark status bar ink, even
 * though the app mounts a fixed light `StatusBar` at its root (App.tsx), and leaving it gives the fixed-dark screens
 * their light ink back.
 *
 * The real `useStatusBarStyle`, the real Expo `StatusBar` component App.tsx mounts, React Native's status bar stack and
 * a real navigator; only the native status bar manager is the test preset's mock, and its last call is the ink the
 * phone shows. (It reproduces the case where a light screen's ink lost to the root entry.)
 */

import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, render } from '@testing-library/react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { NativeModules, Text } from 'react-native';

import { useStatusBarStyle } from './statusBar';

type Routes = { Light: undefined; Dark: undefined };
const Stack = createNativeStackNavigator<Routes>();

function LightScreen() {
  useStatusBarStyle(true);
  return <Text>light screen</Text>;
}

/** A fixed-dark screen: it asks nothing and draws under the app's light ink. */
function DarkScreen() {
  return <Text>dark screen</Text>;
}

const nativeStyle = (): jest.Mock => NativeModules.StatusBarManager.setStyle as jest.Mock;
const lastInk = (): unknown => nativeStyle().mock.calls.at(-1)?.[0];
/** React Native sends the merged stack to the native side at the end of the frame. */
const endOfFrame = () =>
  act(async () => {
    const { promise, resolve } = Promise.withResolvers<void>();
    setImmediate(resolve);
    await promise;
  });

beforeEach(() => nativeStyle().mockClear());

test('a light screen keeps dark ink over the root light StatusBar from the first mount', async () => {
  await render(
    <NavigationContainer>
      <ExpoStatusBar style="light" />
      <Stack.Navigator>
        <Stack.Screen name="Light" component={LightScreen} />
      </Stack.Navigator>
    </NavigationContainer>,
  );
  await endOfFrame();
  expect(lastInk()).toBe('dark-content');
});

test('a light screen mounted after the root StatusBar has settled takes dark ink', async () => {
  const mounted = await render(<ExpoStatusBar style="light" />);
  await endOfFrame();
  nativeStyle().mockClear();
  await mounted.rerender(
    <>
      <ExpoStatusBar style="light" />
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen name="Light" component={LightScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </>,
  );
  await endOfFrame();
  expect(lastInk()).toBe('dark-content');
});

test('leaving the light screen for a fixed-dark one gives the light ink back', async () => {
  const navigation = createNavigationContainerRef<Routes>();
  await render(
    <NavigationContainer ref={navigation}>
      <ExpoStatusBar style="light" />
      <Stack.Navigator>
        <Stack.Screen name="Light" component={LightScreen} />
        <Stack.Screen name="Dark" component={DarkScreen} />
      </Stack.Navigator>
    </NavigationContainer>,
  );
  await endOfFrame();
  await act(async () => navigation.navigate('Dark'));
  await endOfFrame();
  expect(lastInk()).toBe('light-content');
});
