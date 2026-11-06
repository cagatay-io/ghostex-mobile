/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. The Docs viewer (`DocViewerScreen`) half folded like a laptop: its content area (the
 * page, the failure state with Retry and the loading state) ends 8 pt above the fold, as the Web Preview's and the
 * chat page sheet's do (`foldUpperHalfInset`): the page is the computer's Markdown or HTML with controls of its own
 * (links, an HTML page's own buttons and fields, the annotation tool) that the app cannot move off the knick. A stack
 * screen stands below its header, so the area's bottom edge is read in window points (`measureInWindow`, answered
 * here with the area's frame). Flat (inactive division) and in the book pose the area fills the screen as before.
 * Stand-ins: the page builder, the web view (a plain view), the machines store, the link openers and the native
 * chrome.
 */

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Dimensions, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import type { BarLayout, FoldDivision } from '../../modules/ghostex-native/src/GhostexNative.types';
import { useBarGeometryStore } from '../components/common/verticalBar/barGeometry';
import VerticalBarArea from '../components/common/verticalBar/VerticalBarArea';
import { DocsCopy } from '../copy';
import type { RootStackParamList } from '../navigation/types';
import DocViewerScreen from './DocViewerScreen';

const mockNativeMethods = jest.requireActual<{ default: { measureInWindow: jest.Mock } }>(
  '@react-native/jest-preset/jest/MockNativeMethods',
).default;
let mockBarLayout: BarLayout | null = null;

jest.mock('../../modules/ghostex-native/src', () => ({
  GhostexNative: {
    addListener: () => ({ remove: () => undefined }),
    observeBarLayout: () => Promise.resolve({ id: 1, layout: mockBarLayout }),
    stopObservingBarLayout: () => Promise.resolve(),
  },
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 80, bottom: 20, left: 0, right: 0 }),
}));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true, useRoute: () => ({ key: 'doc' }) }));
// The page's web view, drawn as a plain view.
jest.mock('react-native-webview', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return { WebView: ({ accessibilityLabel }: { accessibilityLabel?: string }) => <MockView testID="doc-page" accessibilityLabel={accessibilityLabel} /> };
});
// The page builder: the test decides what it answers.
const mockBuild = jest.fn<Promise<unknown>, []>(() => new Promise(() => undefined));
jest.mock('../docs/page', () => ({
  buildDocPage: () => mockBuild(),
  mirrorPathsToRemote: () => [],
  mirrorRequestedAssets: () => Promise.resolve(),
  remotePathForMirrorUrl: () => null,
}));
jest.mock('../docs/mediaStream', () => ({ viewerProject: () => null }));
jest.mock('../docs/openComputerFile', () => ({ openComputerFile: () => undefined }));
jest.mock('../webPreview/machineLinks', () => ({
  classifyMachineLink: () => ({ kind: 'external' }),
  holdComputerForward: () => Promise.resolve(),
  openComputerForward: () => Promise.resolve(),
  releaseComputerForward: () => Promise.resolve(),
}));
jest.mock('../webPreview/useOpenMachineLink', () => ({ useOpenMachineLink: () => () => undefined }));
jest.mock('../machines/store', () => ({
  useMachinesStore: (pick: (state: { machines: { id: string }[] }) => unknown) =>
    pick({ machines: [{ id: 'machine-1' }] }),
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: () => Promise.resolve(true) }));
// One stand-in for every render, as the real hook keeps one per computer.
const mockRpc = () => Promise.resolve({ result: null, error: null });
jest.mock('../files/machine', () => ({
  currentMachine: (id: string) => ({ id }),
  useProjectDocsRpc: () => mockRpc,
}));
jest.mock('../files/shareSheet', () => ({
  canShareFiles: true,
  appShareSheet: { keepCopy: () => Promise.reject(new Error('unused')), open: () => Promise.resolve() },
}));

const PORTRAIT = { width: 669, height: 951 };
const LANDSCAPE = { width: 951, height: 669 };
const LAPTOP: FoldDivision = { x: 0, y: 455.5, width: 669, height: 40, active: true };
const FOLD = { top: 455.5, bottom: 495.5 };
/** The content area's frame in the window: below the status band and the header, above the home indicator. */
const AREA = { top: 132, bottom: 931 };

function barLayout(division: FoldDivision, window: { width: number; height: number }): BarLayout {
  return {
    windowWidth: window.width,
    windowHeight: window.height,
    safeTop: 80,
    safeLeft: 0,
    safeRight: 0,
    marginTop: 88,
    topBar: { x: 0, y: 26, width: 466, height: 44 },
    divisions: [division],
  };
}

type Props = NativeStackScreenProps<RootStackParamList, 'DocViewer'>;

async function openDoc(
  division: FoldDivision = LAPTOP,
  window: { width: number; height: number } = PORTRAIT,
  fileSize?: number,
): Promise<void> {
  mockBarLayout = barLayout(division, window);
  await act(() => {
    Dimensions.set({ window: { ...window, scale: 3, fontScale: 1 }, screen: { ...window, scale: 3, fontScale: 1 } });
  });
  // Of the navigator only `setOptions` (header) is called here; the stand-in is cast.
  const navigation = { setOptions: jest.fn() } as unknown as Props['navigation'];
  const params = fileSize === undefined
    ? { machineId: 'machine-1', path: '/Users/me/ghostex-mobile/docs/plan.md' }
    : { machineId: 'machine-1', projectId: 'project-1', entryPath: 'logs/build.log', path: '/Users/me/ghostex-mobile/logs/build.log', size: fileSize };
  await render(
    <VerticalBarArea>
      <DocViewerScreen navigation={navigation} route={{ key: 'doc', name: 'DocViewer', params }} />
    </VerticalBarArea>,
  );
  // The system's bar layout (with its division) arrives after the first render.
  await act(async () => undefined);
  const area = screen.getByTestId('doc-content').parent;
  if (area === null) throw new Error('no area around the content');
  await fireEvent(area, 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: window.width, height: AREA.bottom - AREA.top } },
  });
}

function marginBottom(): unknown {
  return StyleSheet.flatten(screen.getByTestId('doc-content').props.style)?.marginBottom;
}

function inContent(element: TestInstance): boolean {
  const content = screen.getByTestId('doc-content');
  for (let node: TestInstance | null = element; node !== null; node = node.parent) if (node === content) return true;
  return false;
}

beforeEach(async () => {
  mockBuild.mockReset();
  mockBuild.mockImplementation(() => new Promise(() => undefined));
  mockNativeMethods.measureInWindow.mockImplementation(function (
    this: { props: { children?: { props?: { testID?: unknown } } } },
    onFrame: (...frame: number[]) => void,
  ) {
    // The content area answers its frame; any other view the whole window.
    if (this.props.children?.props?.testID === 'doc-content') onFrame(0, AREA.top, 669, AREA.bottom - AREA.top);
    else onFrame(0, 0, PORTRAIT.width, PORTRAIT.height);
  });
  useBarGeometryStore.setState({ hydrated: false, keyboardHeights: {}, layouts: {} });
  await useBarGeometryStore.getState().hydrate();
});

afterEach(() => {
  mockNativeMethods.measureInWindow.mockReset();
});

describe('half folded like a laptop the Docs viewer ends above the fold', () => {
  test('the page ends 8 pt above the fold', async () => {
    mockBuild.mockResolvedValueOnce({
      uri: 'file:///mirror/docs/plan.md.ghostex-view.html',
      rootUri: 'file:///mirror/',
      kind: 'markdown',
      skippedAssets: 0,
    });
    await openDoc();
    expect(inContent(await screen.findByTestId('doc-page'))).toBe(true);
    expect(marginBottom()).toBe(AREA.bottom - (FOLD.top - 8));
  });

  test('the failure state with Retry ends 8 pt above the fold', async () => {
    mockBuild.mockRejectedValueOnce(new Error('connection lost'));
    await openDoc();
    expect(inContent(await screen.findByRole('button', { name: DocsCopy.retry }))).toBe(true);
    expect(marginBottom()).toBe(AREA.bottom - (FOLD.top - 8));
  });

  test('the loading state ends 8 pt above the fold', async () => {
    await openDoc();
    expect(inContent(screen.getByText(DocsCopy.readingFile))).toBe(true);
    expect(marginBottom()).toBe(AREA.bottom - (FOLD.top - 8));
  });

  test.each([
    ['flat', { ...LAPTOP, active: false }, PORTRAIT],
    ['book pose', { x: 455.5, y: 0, width: 40, height: 669, active: true }, LANDSCAPE],
  ])('%s: the content area fills the screen below the header as before', async (_pose, division, window) => {
    await openDoc(division, window);
    expect(screen.getByText(DocsCopy.readingFile)).toBeTruthy();
    expect(marginBottom()).toBeUndefined();
  });
});

describe('half folded like a laptop a project file in the shared viewer ends above the fold', () => {
  test('the source page ends 8 pt above the fold', async () => {
    mockBuild.mockResolvedValueOnce({ kind: 'source', html: 'first line\nsecond line\n' });
    await openDoc(LAPTOP, PORTRAIT, 23);
    expect(inContent(await screen.findByLabelText(DocsCopy.sourceView('build.log')))).toBe(true);
    expect(marginBottom()).toBe(AREA.bottom - (FOLD.top - 8));
  });

  test('the name-and-size view with Copy Full Path and Share ends 8 pt above the fold', async () => {
    mockBuild.mockResolvedValueOnce({ kind: 'info', reason: 'large', size: 3_000_000 });
    await openDoc(LAPTOP, PORTRAIT, 3_000_000);
    expect(inContent(await screen.findByText(DocsCopy.cantPreview))).toBe(true);
    expect(inContent(screen.getByRole('button', { name: DocsCopy.copyFullPath }))).toBe(true);
    expect(marginBottom()).toBe(AREA.bottom - (FOLD.top - 8));
  });

  test('the failure state with Retry ends 8 pt above the fold', async () => {
    mockBuild.mockRejectedValueOnce(new Error('connection lost'));
    await openDoc(LAPTOP, PORTRAIT, 100);
    expect(inContent(await screen.findByRole('button', { name: DocsCopy.retry }))).toBe(true);
    expect(marginBottom()).toBe(AREA.bottom - (FOLD.top - 8));
  });

  test('the loading state ends 8 pt above the fold', async () => {
    await openDoc(LAPTOP, PORTRAIT, 100);
    expect(inContent(screen.getByText(DocsCopy.readingFile))).toBe(true);
    expect(marginBottom()).toBe(AREA.bottom - (FOLD.top - 8));
  });

  test.each([
    ['flat', { ...LAPTOP, active: false }, PORTRAIT],
    ['book pose', { x: 455.5, y: 0, width: 40, height: 669, active: true }, LANDSCAPE],
  ])('%s: the content area fills the screen below the header as before', async (_pose, division, window) => {
    mockBuild.mockResolvedValueOnce({ kind: 'info', reason: 'large', size: 3_000_000 });
    await openDoc(division, window, 3_000_000);
    expect(await screen.findByText(DocsCopy.cantPreview)).toBeTruthy();
    expect(marginBottom()).toBeUndefined();
  });
});
