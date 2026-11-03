/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. The project file browser's shared document viewer (`DocViewerScreen`) wiring: a file over 2 MB
 * shows its name and size, no content is read, and Copy Full Path puts its full path on the clipboard; bytes that are
 * not UTF-8 text show name and size, not decoded source; its Share… fetches the file by its path in the project
 * under a progress notice and hands it to the share sheet, as the design's info view does; and the source
 * view's header offers Add to Session Context only in a preview opened from an agent session. Stand-ins: gxserver's `runProjectDocsAction`, the SSH file read (its base64 decoded by the real
 * decoder), the native mirror filesystem, share sheet, session inputs, clipboard and native chrome.
 */

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { WebViewProps } from 'react-native-webview';

import VerticalBarArea from '../components/common/verticalBar/VerticalBarArea';
import { DocsCopy } from '../copy';
import type { ContextSession, SessionInputs } from '../files/sessionContext';
import type { ShareSheet } from '../files/share';
import type { RootStackParamList } from '../navigation/types';
import DocViewerScreen from './DocViewerScreen';

jest.mock('../../modules/ghostex-native/src', () => ({
  GhostexNative: {
    addListener: () => ({ remove: () => undefined }),
    observeBarLayout: () =>
      Promise.resolve({
        id: 1,
        layout: { windowWidth: 393, windowHeight: 852, safeTop: 59, safeLeft: 0, safeRight: 0, marginTop: 59 },
      }),
    stopObservingBarLayout: () => Promise.resolve(),
  },
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true, useRoute: () => ({ key: 'file' }) }));
jest.mock('../docs/mediaStream', () => ({ viewerProject: () => null }));
// This suite exercises source, metadata and HTML, not Markdown. Fail if that renderer is reached.
// Marked is ESM-only and is outside the existing Jest preset's transform allowlist.
jest.mock('../docs/markdownDocument', () => ({
  renderMarkdownDocument: () => { throw new Error('Markdown rendering is outside this suite'); },
}));
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
const mockWritten = new Map<string, string>();
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache' },
  Directory: class {
    uri: string;
    exists = false;
    constructor(...parts: string[]) { this.uri = parts.join('/'); }
    create() {}
  },
  File: class {
    uri: string;
    constructor(uri: string) { this.uri = uri; }
    create() {}
    writeSync(content: string) { mockWritten.set(this.uri, content); }
  },
}));
// The native WebView boundary exposes its source and script policy, without executing a browser here.
let mockLastWebView: WebViewProps | null = null;
jest.mock('react-native-webview', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return {
    WebView: (props: WebViewProps) => {
      mockLastWebView = props;
      return <MockView testID="document" accessibilityLabel={props.accessibilityLabel} />;
    },
  };
});
const mockSent: Record<string, unknown>[] = [];
let mockStatSize = 21;
const mockRpc = (_method: string, params: Record<string, unknown>) => {
  mockSent.push(params);
  if (params.action === 'stat') return Promise.resolve({ result: { file: { size: mockStatSize } }, error: null });
  if (params.action === 'addToSessionContext') {
    return Promise.resolve({ result: { contextPrompt: '\nFile context: src/index.ts\n' }, error: null });
  }
  return Promise.resolve({ result: { dataBase64: 'aGVsbG8=' }, error: null });
};
jest.mock('../files/machine', () => ({
  currentMachine: (id: string) => ({ id }),
  useProjectDocsRpc: () => mockRpc,
}));
// The SSH read is a stand-in; what it read is decoded by the app's own decoder.
const mockRead = jest.fn<Promise<unknown[]>, [unknown, readonly string[], number]>(() => Promise.resolve([]));
jest.mock('../docs/remoteFiles', () => ({
  ...jest.requireActual('../docs/remoteFiles'),
  readRemoteFiles: (machine: unknown, paths: readonly string[], limit: number) => mockRead(machine, paths, limit),
}));

const mockClipboard = jest.fn((_text: string) => Promise.resolve(true));
jest.mock('expo-clipboard', () => ({ setStringAsync: (text: string) => mockClipboard(text) }));

const mockShared: { kept: string[]; opened: string[] } = { kept: [], opened: [] };
const mockSheet: ShareSheet = {
  keepCopy: (name) => {
    mockShared.kept.push(name);
    return Promise.resolve({ uri: `file:///cache/files-share/${name}`, drop: () => undefined });
  },
  open: (uri) => {
    mockShared.opened.push(uri);
    return Promise.resolve();
  },
};
// Read when called: the module is loaded (by the screen's import) before this file's constants exist.
jest.mock('../files/shareSheet', () => ({
  canShareFiles: true,
  appShareSheet: {
    keepCopy: (name: string, base64: string) => mockSheet.keepCopy(name, base64),
    open: (uri: string, name: string) => mockSheet.open(uri, name),
  },
}));

const mockInserted: { session: string; text: string }[] = [];
const mockInputs: SessionInputs = {
  showsChat: () => true,
  appendToChatDraft: (session, text) => {
    mockInserted.push({ session: session.sessionId, text });
    return true;
  },
  pasteIntoTerminal: () => Promise.reject(new Error('not in terminal view')),
  // Still open on the phone and live with its agent on the computer.
  current: () => ({
    tab: { kind: 'attach', ghostexSessionId: 'session-7', state: 'open' },
    record: { isLive: true, agentIcon: 'claude', agentName: 'Claude', agent: 'claude' },
  }),
};
jest.mock('../files/sessionInputs', () => ({ appSessionInputs: () => mockInputs }));

type Props = NativeStackScreenProps<RootStackParamList, 'DocViewer'>;
const SESSION: ContextSession = {
  sessionKey: 'machine-1:session-7',
  sessionId: 'session-7',
  title: 'Duo layout spike',
  chatCapable: true,
};

/** The screen with the header it sets drawn above it, as the stack navigator draws `headerRight`. */
function WithHeader({ params }: { params: Props['route']['params'] }) {
  const [header, setHeader] = useState<ReactNode>(null);
  // Of the navigator only `setOptions` is called; the stand-in is cast (any other member fails the test).
  const navigation = useMemo(
    () =>
      ({
        setOptions: (options: { headerRight?: () => ReactNode }) => setHeader(options.headerRight?.() ?? null),
      }) as unknown as Props['navigation'],
    [],
  );
  return (
    <VerticalBarArea>
      <View testID="header">{header}</View>
      <DocViewerScreen navigation={navigation} route={{ key: 'file', name: 'DocViewer', params }} />
    </VerticalBarArea>
  );
}

function headerLabels(): string[] {
  return within(screen.getByTestId('header'))
    .getAllByRole('button')
    .map((button) => String(button.props.accessibilityLabel));
}

beforeEach(() => {
  mockSent.length = 0;
  mockInserted.length = 0;
  mockRead.mockReset();
  mockRead.mockResolvedValue([]);
  mockClipboard.mockClear();
  mockShared.kept.length = 0;
  mockShared.opened.length = 0;
  mockWritten.clear();
  mockLastWebView = null;
  mockStatSize = 21;
});

test('a 3 MB file shows name and size, copies its full path and shares', async () => {
  await render(
    <WithHeader
      params={{
        machineId: 'machine-1',
        projectId: 'project-1',
        entryPath: 'logs/build.log',
        path: '/Users/me/ghostex-mobile/logs/build.log',
        size: 3_000_000,
      }}
    />,
  );

  expect(await screen.findByText(DocsCopy.cantPreview)).toBeTruthy();
  expect(screen.getByText('build.log')).toBeTruthy();
  expect(screen.getByText(DocsCopy.infoMeta('3.0 MB', DocsCopy.infoKind('log', false)))).toBeTruthy();
  expect(screen.getByText(DocsCopy.infoWhy.large)).toBeTruthy();
  expect(mockRead).not.toHaveBeenCalled();

  await act(async () => {
    fireEvent.press(screen.getByText(DocsCopy.copyFullPath));
  });
  expect(mockClipboard.mock.calls).toEqual([['/Users/me/ghostex-mobile/logs/build.log']]);

  await act(async () => {
    fireEvent.press(screen.getByText(DocsCopy.share));
  });
  expect(mockSent).toEqual([
    expect.objectContaining({
      projectId: 'project-1',
      scope: 'project',
      action: 'readResource',
      path: 'logs/build.log',
    }),
  ]);
  expect(mockShared.kept).toEqual(['build.log']);
  expect(mockShared.opened).toEqual(['file:///cache/files-share/build.log']);
});

/** The text the SSH read answers, as the base64 of its bytes. */
function readAnswers(bytes: Uint8Array): void {
  mockRead.mockResolvedValueOnce([
    { status: 'ok', bytes: bytes.length, base64: Buffer.from(bytes).toString('base64') },
  ]);
}

const SOURCE = {
  machineId: 'machine-1',
  projectId: 'project-1',
  entryPath: 'src/index.ts',
  path: '/Users/me/ghostex-mobile/src/index.ts',
  size: 21,
};

test('bytes that are not UTF-8 text (no NUL among them) show name and size, not source', async () => {
  // FF FE: no NUL byte, but no UTF-8 either (gxserver's preview refuses it too, file_ops.rs "not valid UTF-8 text").
  readAnswers(Uint8Array.from([0xff, 0xfe]));
  await render(
    <WithHeader
      params={{
        machineId: 'machine-1',
        projectId: 'project-1',
        entryPath: 'sample.dat',
        path: '/p/sample.dat',
        size: 2,
      }}
    />,
  );
  expect(await screen.findByText(DocsCopy.infoWhy.binary)).toBeTruthy();
  expect(screen.getByText(DocsCopy.infoMeta('2 B', DocsCopy.infoKind('dat', false)))).toBeTruthy();
  expect(screen.queryByLabelText(DocsCopy.sourceView('sample.dat'))).toBeNull();
});

test('UTF-8 text that holds a replacement character itself is still shown as source', async () => {
  readAnswers(new TextEncoder().encode('const marker = "\uFFFD";\n'));
  await render(<WithHeader params={SOURCE} />);
  expect(await screen.findByLabelText(DocsCopy.sourceView('index.ts'))).toBeTruthy();
  expect(mockRead.mock.calls[0]?.slice(1)).toEqual([['/Users/me/ghostex-mobile/src/index.ts'], 2_000_000]);
  expect(mockLastWebView).toEqual(expect.objectContaining({
    javaScriptEnabled: false,
    allowFileAccess: false,
    allowFileAccessFromFileURLs: false,
    source: { html: expect.stringContaining('<span class="ln">1</span>const marker = &#34;�&#34;;') },
  }));
  expect(mockLastWebView?.injectedJavaScript).toBeUndefined();
  expect(mockLastWebView?.injectedJavaScriptBeforeContentLoaded).toBeUndefined();
  expect(mockLastWebView?.onMessage).toBeUndefined();
  expect(mockWritten.size).toBe(0);
});

test('a source preview from an agent session offers Add to Session Context in its header', async () => {
  readAnswers(new TextEncoder().encode('export const a = 1;\n'));
  await render(<WithHeader params={{ ...SOURCE, session: SESSION }} />);
  await screen.findByLabelText(DocsCopy.sourceView('index.ts'));
  // The design's preview header: Copy Full Path, Add to Session Context, Share, Reload.
  expect(headerLabels()).toEqual([
    DocsCopy.copyFullPath,
    DocsCopy.addToSessionContext,
    DocsCopy.shareButton,
    DocsCopy.reload,
  ]);

  await act(async () => {
    fireEvent.press(within(screen.getByTestId('header')).getByLabelText(DocsCopy.addToSessionContext));
  });
  expect(mockSent.filter((params) => params.action === 'addToSessionContext')).toEqual([
    expect.objectContaining({ projectId: 'project-1', scope: 'project', path: 'src/index.ts' }),
  ]);
  expect(mockInserted).toEqual([{ session: 'session-7', text: '\nFile context: src/index.ts\n' }]);
  expect(await screen.findByText(DocsCopy.contextAdded('Duo layout spike'))).toBeTruthy();
  expect(screen.getByText(DocsCopy.contextNotSent)).toBeTruthy();
});

test('a preview opened without a session has no Add to Session Context in its header', async () => {
  readAnswers(new TextEncoder().encode('export const a = 1;\n'));
  await render(<WithHeader params={SOURCE} />);
  await screen.findByLabelText(DocsCopy.sourceView('index.ts'));
  expect(headerLabels()).toEqual([DocsCopy.copyFullPath, DocsCopy.shareButton, DocsCopy.reload]);
});

test('the info view as in the design: name and size only, so its header keeps only Reload even from an agent session', async () => {
  await render(
    <WithHeader params={{ ...SOURCE, entryPath: 'big.log', path: '/p/big.log', size: 3_000_000, session: SESSION }} />,
  );
  await screen.findByText(DocsCopy.cantPreview);
  expect(headerLabels()).toEqual([DocsCopy.reload]);
});

test('one share at a time: while its share runs, the source header Share is dimmed and starts nothing', async () => {
  readAnswers(new TextEncoder().encode('export const a = 1;\n'));
  await render(<WithHeader params={SOURCE} />);
  await screen.findByLabelText(DocsCopy.sourceView('index.ts'));
  const shareButton = () => within(screen.getByTestId('header')).getByLabelText(DocsCopy.shareButton);
  expect(shareButton().props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
  // The sheet stays open until the test closes it.
  const sheetClosed = Promise.withResolvers<void>();
  const open = mockSheet.open;
  mockSheet.open = () => sheetClosed.promise;
  try {
    await act(async () => {
      fireEvent.press(shareButton());
    });
    expect(shareButton().props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await act(async () => {
      fireEvent.press(shareButton());
    });
    expect(mockSent.filter((params) => params.action === 'readResource')).toHaveLength(1);
    await act(async () => {
      sheetClosed.resolve();
    });
    expect(shareButton().props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
  } finally {
    mockSheet.open = open;
  }
});

test('an image shows its metadata without reading content and keeps only Reload in the header', async () => {
  await render(<WithHeader params={{ ...SOURCE, entryPath: 'icon.png', path: '/p/icon.png', size: 339_015 }} />);
  expect(await screen.findByText(DocsCopy.infoWhy.image)).toBeTruthy();
  expect(screen.getByText(DocsCopy.infoMeta('339 KB', DocsCopy.infoKind('png', true)))).toBeTruthy();
  expect(mockRead).not.toHaveBeenCalled();
  expect(headerLabels()).toEqual([DocsCopy.reload]);
});

test('Reload measures an info file again and opens its new text through the same viewer', async () => {
  await render(<WithHeader params={{ ...SOURCE, size: 3_000_000 }} />);
  await screen.findByText(DocsCopy.infoWhy.large);
  readAnswers(new TextEncoder().encode('const fresh = true;\n'));
  await act(async () => { fireEvent.press(screen.getByLabelText(DocsCopy.reload)); });
  await screen.findByLabelText(DocsCopy.sourceView('index.ts'));
  expect(mockSent).toEqual([expect.objectContaining({ action: 'stat', path: 'src/index.ts' })]);
  expect(headerLabels()).toEqual([DocsCopy.copyFullPath, DocsCopy.shareButton, DocsCopy.reload]);
});

test('a file that grew past the read limit shows info instead of decoded content', async () => {
  mockRead.mockResolvedValueOnce([{ status: 'tooLarge' }]);
  await render(<WithHeader params={SOURCE} />);
  expect(await screen.findByText(DocsCopy.infoWhy.large)).toBeTruthy();
  expect(screen.queryByTestId('document')).toBeNull();
});

test('a missing file uses the shared failure surface and Retry reads it again', async () => {
  mockRead.mockResolvedValueOnce([{ status: 'missing' }]);
  await render(<WithHeader params={SOURCE} />);
  expect(await screen.findByText(DocsCopy.fileMissing)).toBeTruthy();
  readAnswers(new TextEncoder().encode('restored\n'));
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: DocsCopy.retry })); });
  await screen.findByLabelText(DocsCopy.sourceView('index.ts'));
  expect(mockRead).toHaveBeenCalledTimes(2);
  expect(mockSent).toContainEqual(expect.objectContaining({ action: 'stat', path: 'src/index.ts' }));
});

test('a superseded read cannot replace the page loaded by Reload', async () => {
  const slow = Promise.withResolvers<unknown[]>();
  mockRead.mockReturnValueOnce(slow.promise);
  await render(<WithHeader params={SOURCE} />);
  expect(screen.getByText(DocsCopy.readingFile)).toBeTruthy();
  readAnswers(new TextEncoder().encode('new version\n'));
  await act(async () => { fireEvent.press(screen.getByLabelText(DocsCopy.reload)); });
  await screen.findByLabelText(DocsCopy.sourceView('index.ts'));
  await act(async () => { slow.resolve([{ status: 'missing' }]); });
  expect(screen.getByLabelText(DocsCopy.sourceView('index.ts'))).toBeTruthy();
  expect(screen.queryByText(DocsCopy.openFailed)).toBeNull();
});

test('a large HTML file stays in info mode without annotation controls or reading content', async () => {
  await render(<WithHeader params={{ ...SOURCE, path: '/p/page.html', entryPath: 'page.html', size: 3_000_000 }} />);
  await screen.findByText(DocsCopy.infoWhy.large);
  expect(headerLabels()).toEqual([DocsCopy.reload]);
  expect(mockRead).not.toHaveBeenCalled();
});

test('an HTML document keeps its authored page, asset loader and annotation control', async () => {
  readAnswers(new TextEncoder().encode('<h1>Preview</h1>'));
  await render(<WithHeader params={{ ...SOURCE, path: '/p/page.html', entryPath: 'page.html' }} />);
  await screen.findByTestId('document');
  expect(mockLastWebView?.javaScriptEnabled).toBe(true);
  expect(mockLastWebView?.injectedJavaScriptBeforeContentLoaded).toEqual(expect.any(String));
  expect(mockLastWebView?.injectedJavaScript).toEqual(expect.any(String));
  expect(headerLabels()).toContain(DocsCopy.annotateOn);
});

test('a chat image keeps its zoomable picture page rather than the browser info policy', async () => {
  readAnswers(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]));
  await render(<WithHeader params={{ machineId: 'machine-1', path: '/p/icon.png' }} />);
  await screen.findByTestId('document');
  expect(mockRead.mock.calls[0]?.slice(1)).toEqual([['/p/icon.png'], 12 * 1024 * 1024]);
  expect(mockLastWebView?.javaScriptEnabled).toBe(true);
  expect([...mockWritten.values()].some((html) => html.includes('function toggle(x, y)'))).toBe(true);
  expect(screen.queryByText(DocsCopy.cantPreview)).toBeNull();
  expect(headerLabels()).toEqual([DocsCopy.copyPath, DocsCopy.reload]);
});
