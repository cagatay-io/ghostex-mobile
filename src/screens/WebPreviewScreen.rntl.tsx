/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. Web Preview's side bar "…"
 * (its menu holds Forward, Desktop Site and Open in Browser) stays open when the Duo is turned from
 * landscape (side bar) to portrait (status band), where the toolbar holds those buttons again and the
 * menu is centred (no Effect closes it on a pose
 * change). The page's connection is a stand-in that never connects; the chrome is the real
 * `VerticalBarArea`.
 * Half folded like a laptop, the page area (the page, its connecting and its failure surface with Retry) ends 8 pt
 * above the fold, as the chat's page sheet does; flat and in the book pose it fills the screen below the toolbar.
 */

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Dimensions, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import type { BarLayout } from '../../modules/ghostex-native/src/GhostexNative.types';
import { useBarGeometryStore } from '../components/common/verticalBar/barGeometry';
import VerticalBarArea from '../components/common/verticalBar/VerticalBarArea';
import { DuoChromeCopy, WebPreviewCopy } from '../copy';
import type { RootStackParamList } from '../navigation/types';
import { useMachinesStore } from '../machines/store';
import WebPreviewScreen from './WebPreviewScreen';

let mockReport: ((layout: BarLayout) => void) | null = null;
let mockFirstLayout: ((value: { id: number; layout: BarLayout }) => void) | null = null;
let mockInsets = { top: 10, bottom: 20, left: 0, right: 81 };

jest.mock('../../modules/ghostex-native/src', () => ({
  GhostexNative: {
    addListener: (event: string, listener: (layout: BarLayout) => void) => {
      if (event === 'onBarLayoutChange') mockReport = listener;
      return { remove: () => undefined };
    },
    observeBarLayout: () => {
      const { promise, resolve } = Promise.withResolvers<{ id: number; layout: BarLayout }>();
      mockFirstLayout = resolve;
      return promise;
    },
    stopObservingBarLayout: () => Promise.resolve(),
  },
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => mockInsets }));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true, useFocusEffect: () => undefined }));
jest.mock('react-native-webview', () => ({ WebView: () => null }));
jest.mock('../inventory/client', () => ({ ensureConnected: () => Promise.withResolvers().promise }));
jest.mock('../machines/credentials', () => ({ hasPassword: () => Promise.resolve(false) }));
jest.mock('../webPreview/forwards', () => ({
  startWebPreviewForward: () => Promise.withResolvers().promise,
  describeForwardFailure: () => '',
}));
jest.mock('../webPreview/machineLinks', () => ({
  holdComputerForward: () => Promise.resolve(),
  releaseComputerForward: () => Promise.resolve(),
}));
// A pressed button's window frame: the side bar's "…" (the test renderer measures nothing).
jest.mock('../components/common/measureInWindow', () => ({
  measureInWindow: (_ref: unknown, onFrame: (frame: object) => void) =>
    onFrame({ x: 880, y: 290, width: 46, height: 46 }),
}));

const LANDSCAPE: BarLayout = {
  windowWidth: 951,
  windowHeight: 669,
  safeTop: 10,
  safeLeft: 0,
  safeRight: 81,
  marginTop: 18,
  edge: 'trailing',
  sideBar: { x: 880, y: 116, width: 46, height: 520 },
  topBar: { x: 0, y: 10, width: 870, height: 44 },
  divisions: [],
};
const PORTRAIT: BarLayout = {
  windowWidth: 669,
  windowHeight: 951,
  safeTop: 80,
  safeLeft: 0,
  safeRight: 0,
  marginTop: 88,
  topBar: { x: 0, y: 26, width: 466, height: 44 },
  divisions: [],
};

async function setWindow(width: number, height: number): Promise<void> {
  await act(() => {
    Dimensions.set({
      window: { width, height, scale: 3, fontScale: 1 },
      screen: { width, height, scale: 3, fontScale: 1 },
    });
  });
}

test('the side bar "…" menu stays open when the Duo turns to portrait', async () => {
  useBarGeometryStore.setState({ hydrated: false, keyboardHeights: {}, layouts: {} });
  await useBarGeometryStore.getState().hydrate();
  await setWindow(951, 669);
  type Props = NativeStackScreenProps<RootStackParamList, 'WebPreview'>;
  const route: Props['route'] = {
    key: 'preview',
    name: 'WebPreview',
    params: { machineId: 'machine', remotePort: 3000 },
  };
  // TS-03: of the navigator only `goBack`, the one member Web Preview calls; a navigator is not mounted
  // in this test, so the stand-in is cast (the screen calling any other member fails this test with a
  // TypeError, not silently).
  const navigation = { goBack: jest.fn() } as unknown as Props['navigation'];
  const props: Props = { navigation, route };

  await render(
    <VerticalBarArea>
      <WebPreviewScreen {...props} />
    </VerticalBarArea>,
  );
  await act(async () => {
    mockFirstLayout?.({ id: 1, layout: LANDSCAPE });
  });
  await fireEvent.press(screen.getByLabelText(DuoChromeCopy.more));
  expect(screen.getByText(WebPreviewCopy.forwardLabel)).toBeTruthy();

  mockInsets = { top: 80, bottom: 20, left: 0, right: 0 };
  await setWindow(669, 951);
  await act(async () => {
    mockReport?.(PORTRAIT);
  });
  expect(screen.getByText(WebPreviewCopy.forwardLabel)).toBeTruthy();
  expect(screen.getByText(WebPreviewCopy.openInBrowserLabel)).toBeTruthy();
});

describe('half folded like a laptop the page area ends above the fold', () => {
  const LAPTOP_WINDOW = { width: 669, height: 951 };
  const FOLD = { top: 455.5, bottom: 495.5 };
  /** The page area's frame in the window: below the toolbar and the address bar, above the home indicator. */
  const CONTENT = { top: 190, bottom: 931 };
  const laptopLayout = (divisions: BarLayout['divisions']): BarLayout => ({ ...PORTRAIT, divisions });
  const LAPTOP_DIVISION = { x: 0, y: FOLD.top, width: 669, height: FOLD.bottom - FOLD.top, active: true };

  async function renderPreview(layout: BarLayout, window = LAPTOP_WINDOW): Promise<void> {
    useBarGeometryStore.setState({ hydrated: false, keyboardHeights: {}, layouts: {} });
    await useBarGeometryStore.getState().hydrate();
    mockInsets = { top: 80, bottom: 20, left: 0, right: 0 };
    await setWindow(window.width, window.height);
    type Props = NativeStackScreenProps<RootStackParamList, 'WebPreview'>;
    const route: Props['route'] = {
      key: 'preview',
      name: 'WebPreview',
      params: { machineId: 'machine', remotePort: 3000 },
    };
    const navigation = { goBack: jest.fn() } as unknown as Props['navigation'];
    await render(
      <VerticalBarArea>
        <WebPreviewScreen navigation={navigation} route={route} />
      </VerticalBarArea>,
    );
    await act(async () => {
      mockFirstLayout?.({ id: 1, layout });
    });
    const content = screen.getByTestId('preview-content');
    await fireEvent(content.parent as TestInstance, 'layout', {
      nativeEvent: { layout: { x: 0, y: CONTENT.top, width: window.width, height: CONTENT.bottom - CONTENT.top } },
    });
  }

  function marginBottom(): unknown {
    return StyleSheet.flatten(screen.getByTestId('preview-content').props.style)?.marginBottom;
  }

  function inContent(element: TestInstance): boolean {
    const content = screen.getByTestId('preview-content');
    for (let node: TestInstance | null = element; node !== null; node = node.parent) if (node === content) return true;
    return false;
  }

  afterEach(async () => {
    await act(() => useMachinesStore.setState({ machines: [] }));
  });

  test('the failure surface with Retry ends 8 pt above the fold', async () => {
    // No saved machine of that id: the forward fails at once.
    await renderPreview(laptopLayout([LAPTOP_DIVISION]));
    expect(inContent(screen.getByText(WebPreviewCopy.retryButton))).toBe(true);
    expect(marginBottom()).toBe(CONTENT.bottom - (FOLD.top - 8));
  });

  test('the connecting surface ends 8 pt above the fold', async () => {
    useMachinesStore.setState({
      machines: [
        { id: 'machine', name: 'synthetic', host: 'synthetic.invalid', port: 22, username: 'synthetic' },
      ] as never,
    });
    await renderPreview(laptopLayout([LAPTOP_DIVISION]));
    expect(inContent(screen.getByText(WebPreviewCopy.connecting(3000)))).toBe(true);
    expect(marginBottom()).toBe(CONTENT.bottom - (FOLD.top - 8));
  });

  test.each([
    ['flat', laptopLayout([{ ...LAPTOP_DIVISION, active: false }]), LAPTOP_WINDOW],
    [
      'book pose',
      { ...LANDSCAPE, divisions: [{ x: 455.5, y: 0, width: 40, height: 669, active: true }] },
      { width: 951, height: 669 },
    ],
  ])('%s: the page area fills the screen below the toolbar as before', async (_pose, layout, window) => {
    await renderPreview(layout, window);
    expect(marginBottom()).toBeUndefined();
  });
});
