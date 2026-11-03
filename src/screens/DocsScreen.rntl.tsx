/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. The project file browser's screen wiring (`DocsScreen`) with the real tree, row
 * menu, Share… and Add to Session Context flows: the project listed in the project scope, a folder's children on a
 * tap, closed again on the next; a long press opens the menu at its row, lifted, and Copy Full Path puts the file's
 * full path on the clipboard; Share… for files only, a progress notice while the file is fetched, then the share
 * sheet, or the host's message; and Add to Session Context only in a browser opened from an agent session, the host's
 * text into that session's input and the notice that names it; a Ghostex page opens as its page in the Web preview.
 * Stand-ins: gxserver's `runProjectDocsAction` and port, the share sheet, the session inputs, the clipboard and the
 * native chrome.
 */

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Dimensions, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import VerticalBarArea from '../components/common/verticalBar/VerticalBarArea';
import { ContextMenuCopy, DocsCopy } from '../copy';
import type { ContextSession, SessionInputs } from '../files/sessionContext';
import type { ShareSheet } from '../files/share';
import { useInventoryStore } from '../inventory/store';
import { useMachinesStore } from '../machines/store';
import type { RootStackParamList } from '../navigation/types';
import DocsScreen from './DocsScreen';

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
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true, useRoute: () => ({ key: 'docs' }) }));

// gxserver: the project-scope requests (`src/files/`), the Docs listing for Recently changed (empty here).
type Answer = { result: unknown; error: { code: string; message: string } | null };
const mockSent: Record<string, unknown>[] = [];
let mockReadAnswer: Promise<Answer> = Promise.resolve({ result: null, error: null });
const mockRpc = (_method: string, params: Record<string, unknown>): Promise<Answer> => {
  mockSent.push(params);
  if (params.action === 'list') {
    const entries =
      params.path === ''
        ? [
            { path: 'src', name: 'src', kind: 'directory' },
            { path: 'README.md', name: 'README.md', kind: 'file', size: 1200 },
          ]
        : params.path === 'src'
          ? [{ path: 'src/index.ts', name: 'index.ts', kind: 'file', size: 300 }]
          : [];
    return Promise.resolve({ result: { action: 'list', progressive: true, entries }, error: null });
  }
  if (params.action === 'addToSessionContext') {
    return Promise.resolve({ result: { contextPrompt: '\nFile context: README.md\n' }, error: null });
  }
  if (params.action === 'readResource') return mockReadAnswer;
  // gxserver's `openPage`: the page an HTML file declares itself to be (`docs/mediaStream.ts` `computerPagePath`).
  if (params.action === 'openPage') {
    const page = String(params.path).endsWith('/board.html') ? { path: '/visual/board-1/' } : null;
    return Promise.resolve({ result: { page }, error: null });
  }
  // gxserver's search rows carry no size (`search_project`, server/src/project_docs/project_scope.rs:193-201 at
  // 86b287b1); its `stat` answers the metadata under `file` (actions.rs:24-40,77-83; file_ops.rs:99-130).
  if (params.action === 'search') {
    const entries = MOCK_FOUND.filter((found) => found.name.includes(String(params.query))).map((found) => ({
      depth: 0,
      displayPath: found.path,
      kind: 'file',
      modifiedAt: null,
      name: found.name,
      path: found.path,
      size: null,
    }));
    return Promise.resolve({ result: { action: 'search', entries, truncated: false, incomplete: false }, error: null });
  }
  if (params.action === 'stat') {
    const found = MOCK_FOUND.find((entry) => entry.path === params.path);
    const file =
      found === undefined
        ? { missing: true, path: params.path }
        : { kind: 'text', modifiedAt: '2026-10-29T08:00:00Z', name: found.name, path: found.path, size: found.size };
    return Promise.resolve({
      result: { action: 'stat', requestId: params.requestId, rootName: 'docs', file },
      error: null,
    });
  }
  return Promise.resolve({ result: { entries: [] }, error: null });
};
/** Files the project search finds, with the size the computer measures. */
const MOCK_FOUND = [
  { path: 'docs/large.md', name: 'large.md', size: 3_000_000 },
  { path: 'assets/icon.png', name: 'icon.png', size: 339_015 },
  { path: 'docs/board.html', name: 'board.html', size: 4_200 },
];
jest.mock('../files/machine', () => ({
  currentMachine: (id: string) => ({ id }),
  useProjectDocsRpc: () => mockRpc,
}));
jest.mock('../chat/rust/transport', () => ({
  sessionChatRpc: (_machine: unknown, method: string, params: Record<string, unknown>) => mockRpc(method, params),
}));
jest.mock('../webPreview/machineLinks', () => ({
  ...jest.requireActual('../webPreview/machineLinks'),
  gxserverComputerPort: () => Promise.resolve(17_421),
}));
jest.mock('../components/sessions/cli', () => ({ runGhostexCli: () => Promise.reject(new Error('no cli')) }));

const mockClipboard = jest.fn((_text: string) => Promise.resolve(true));
jest.mock('expo-clipboard', () => ({ setStringAsync: (text: string) => mockClipboard(text) }));

// A long-pressed row's window frame (the test renderer measures nothing): a full-width row. Measured again on
// every call, so a test can move the row (a window change) while its menu is open.
let mockRowFrame = { x: 0, y: 300, width: 393, height: 44 };
jest.mock('../components/common/measureInWindow', () => ({
  measureInWindow: (_ref: unknown, onFrame: (frame: object) => void) => onFrame({ ...mockRowFrame }),
}));

const mockShared: { kept: { name: string; base64: string }[]; opened: string[]; dropped: number } = {
  kept: [],
  opened: [],
  dropped: 0,
};
const mockSheet: ShareSheet = {
  keepCopy: (name, base64) => {
    mockShared.kept.push({ name, base64 });
    return Promise.resolve({
      uri: `file:///cache/files-share/${name}`,
      drop: () => {
        mockShared.dropped += 1;
      },
    });
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

const mockInserted: { into: 'chat' | 'terminal'; session: string; text: string }[] = [];
const mockInputs: SessionInputs = {
  showsChat: () => true,
  appendToChatDraft: (session, text) => {
    mockInserted.push({ into: 'chat', session: session.sessionId, text });
    return true;
  },
  pasteIntoTerminal: (session, text) => {
    mockInserted.push({ into: 'terminal', session: session.sessionKey, text });
    return Promise.resolve();
  },
  // Still open on the phone and live with its agent on the computer.
  current: () => ({
    tab: { kind: 'attach', ghostexSessionId: 'session-7', state: 'open' },
    record: { isLive: true, agentIcon: 'claude', agentName: 'Claude', agent: 'claude' },
  }),
};
jest.mock('../files/sessionInputs', () => ({ appSessionInputs: () => mockInputs }));

type Props = NativeStackScreenProps<RootStackParamList, 'Docs'>;
const SESSION: ContextSession = {
  sessionKey: 'machine-1:session-7',
  sessionId: 'session-7',
  title: 'Duo layout spike',
  chatCapable: true,
};
const mockPush = jest.fn();
const mockNavigate = jest.fn();

/** The browser for a project of its own (the screen keeps each project's top level between visits). */
async function openBrowser(projectId: string, session?: ContextSession): Promise<void> {
  const route: Props['route'] = {
    key: `docs-${projectId}`,
    name: 'Docs',
    params: {
      machineId: 'machine-1',
      projectId,
      projectName: 'ghostex-mobile',
      projectPath: '/Users/me/ghostex-mobile',
      ...(session !== undefined ? { session } : {}),
    },
  };
  // Of the navigator only `setOptions` (header), `push` (opening a file) and `navigate` (a Ghostex page's Web
  // preview) are called here; a navigator is not mounted, so the stand-in is cast (any other member called fails the
  // test with a TypeError).
  const navigation = {
    setOptions: jest.fn(),
    push: mockPush,
    navigate: mockNavigate,
  } as unknown as Props['navigation'];
  await render(
    <VerticalBarArea>
      <DocsScreen navigation={navigation} route={route} />
    </VerticalBarArea>,
  );
  await screen.findByLabelText('README.md');
}

/**
 * The open menu's commands in order. A command is a button on iOS (`ContextMenu.tsx`), so these are the buttons
 * in the card beside "Close menu".
 */
function menuLabels(): string[] {
  const labels = [DocsCopy.open, DocsCopy.copyFullPath, DocsCopy.addToSessionContext, DocsCopy.share];
  const card = screen
    .getByRole('button', { name: ContextMenuCopy.close })
    .parent?.children.find(
      (child) => typeof child !== 'string' && StyleSheet.flatten(child.props.style)?.maxHeight !== undefined,
    );
  if (card === undefined || typeof card === 'string') throw new Error('no menu card');
  return within(card)
    .getAllByRole('button')
    .map((item) => labels.find((label) => within(item).queryByText(label) !== null) ?? '?');
}

async function longPress(label: string): Promise<void> {
  await act(async () => {
    fireEvent(screen.getByLabelText(label), 'longPress');
  });
}

beforeAll(async () => {
  await act(() => {
    Dimensions.set({
      window: { width: 393, height: 852, scale: 3, fontScale: 1 },
      screen: { width: 393, height: 852, scale: 3, fontScale: 1 },
    });
  });
});

beforeEach(() => {
  mockSent.length = 0;
  mockInserted.length = 0;
  mockShared.kept = [];
  mockShared.opened = [];
  mockShared.dropped = 0;
  mockClipboard.mockClear();
  mockPush.mockClear();
  mockNavigate.mockClear();
  mockRowFrame = { x: 0, y: 300, width: 393, height: 44 };
});

/** Turns the window (the iPhone rotated or the Duo unfolded) and back after `check`. */
async function withWindow(width: number, height: number, check: () => void | Promise<void>): Promise<void> {
  const set = (w: number, h: number) =>
    Dimensions.set({
      window: { width: w, height: h, scale: 3, fontScale: 1 },
      screen: { width: w, height: h, scale: 3, fontScale: 1 },
    });
  try {
    await act(async () => set(width, height));
    await check();
  } finally {
    await act(async () => set(393, 852));
  }
}

/** The window frame an element is drawn at: its own absolute style, or its nearest absolutely placed ancestor's. */
function placedFrame(element: TestInstance): Record<string, unknown> {
  for (let node: TestInstance | null = element; node !== null; node = node.parent) {
    const style = StyleSheet.flatten(node.props.style) as Record<string, unknown> | undefined;
    if (style?.position === 'absolute' && typeof style.top === 'number') return style;
  }
  throw new Error('not placed');
}

test('the project is listed in the project scope, a folder opens to its children and closes again', async () => {
  await openBrowser('project-tree');
  expect(mockSent).toContainEqual(
    expect.objectContaining({ projectId: 'project-tree', scope: 'project', action: 'list', path: '' }),
  );
  expect(screen.queryByLabelText('index.ts')).toBeNull();

  await act(async () => {
    fireEvent.press(screen.getByLabelText('src'));
  });
  expect(mockSent).toContainEqual(expect.objectContaining({ scope: 'project', action: 'list', path: 'src' }));
  expect(await screen.findByLabelText('index.ts')).toBeTruthy();

  await act(async () => {
    fireEvent.press(screen.getByLabelText('src'));
  });
  expect(screen.queryByLabelText('index.ts')).toBeNull();
});

test('a long press opens the menu at its row, and Copy Full Path copies the full path', async () => {
  await openBrowser('project-copy');
  await longPress('README.md');
  // The pressed row, lifted at its own place (a full-width row becomes a card inset 8 pt from the edges).
  const lifted = screen.getByLabelText(DocsCopy.openFile('README.md'));
  expect(StyleSheet.flatten(lifted.props.style)).toEqual(
    expect.objectContaining({
      left: 8,
      top: mockRowFrame.y,
      width: mockRowFrame.width - 16,
      height: mockRowFrame.height,
    }),
  );

  await act(async () => {
    fireEvent.press(screen.getByText(DocsCopy.copyFullPath));
  });
  expect(mockClipboard.mock.calls).toEqual([['/Users/me/ghostex-mobile/README.md']]);
  expect(screen.getByText(DocsCopy.pathCopied)).toBeTruthy();
});

test('opened without a session, a file has no Add to Session Context and a folder no Share…', async () => {
  await openBrowser('project-plain');
  await longPress('README.md');
  expect(menuLabels()).toEqual([DocsCopy.open, DocsCopy.copyFullPath, DocsCopy.share]);
  await act(async () => {
    fireEvent.press(screen.getByLabelText(DocsCopy.openFile('README.md')));
  });

  await longPress('src');
  expect(menuLabels()).toEqual([DocsCopy.copyFullPath]);
});

test('opened from an agent session, Add to Session Context puts the host text into it and names it', async () => {
  await openBrowser('project-context', SESSION);
  await longPress('README.md');
  expect(menuLabels()).toEqual([DocsCopy.open, DocsCopy.copyFullPath, DocsCopy.addToSessionContext, DocsCopy.share]);

  await act(async () => {
    fireEvent.press(screen.getByText(DocsCopy.addToSessionContext));
  });
  expect(mockSent.filter((params) => params.action === 'addToSessionContext')).toEqual([
    expect.objectContaining({ projectId: 'project-context', scope: 'project', path: 'README.md' }),
  ]);
  expect(mockInserted).toEqual([{ into: 'chat', session: 'session-7', text: '\nFile context: README.md\n' }]);
  expect(screen.getByText(DocsCopy.contextAdded('Duo layout spike'))).toBeTruthy();
  expect(screen.getByText(DocsCopy.contextNotSent)).toBeTruthy();
});

test('Share… shows a progress notice while the file is fetched, then hands it to the share sheet', async () => {
  const read = Promise.withResolvers<Answer>();
  mockReadAnswer = read.promise;
  await openBrowser('project-share');
  await longPress('README.md');
  await act(async () => {
    fireEvent.press(screen.getByText(DocsCopy.share));
  });
  expect(mockSent.filter((params) => params.action === 'readResource')).toEqual([
    expect.objectContaining({ projectId: 'project-share', scope: 'project', path: 'README.md' }),
  ]);
  expect(screen.getByText(DocsCopy.shareFetching('README.md'))).toBeTruthy();
  expect(screen.getByText(DocsCopy.shareFetchingDetail('1 KB'))).toBeTruthy();
  expect(mockShared.opened).toEqual([]);

  await act(async () => {
    read.resolve({ result: { dataBase64: 'aGVsbG8=' }, error: null });
  });
  expect(mockShared.kept).toEqual([{ name: 'README.md', base64: 'aGVsbG8=' }]);
  expect(mockShared.opened).toEqual(['file:///cache/files-share/README.md']);
  expect(mockShared.dropped).toBe(1);
  await waitFor(() => expect(screen.queryByText(DocsCopy.shareFetching('README.md'))).toBeNull());
});

test('a file the host refuses opens no share sheet and shows the host message', async () => {
  mockReadAnswer = Promise.resolve({
    result: null,
    error: { code: 'actionFailed', message: 'Resource is unavailable.' },
  });
  await openBrowser('project-refused');
  await longPress('README.md');
  await act(async () => {
    fireEvent.press(screen.getByText(DocsCopy.share));
  });
  expect(await screen.findByText(DocsCopy.shareFailed('README.md'))).toBeTruthy();
  expect(screen.getByText('Resource is unavailable.')).toBeTruthy();
  expect(mockShared.kept).toEqual([]);
  expect(mockShared.opened).toEqual([]);
});

/** Types `term` into the search field and opens the result labelled `label` (its name and folder). */
async function openSearched(term: string, label: string): Promise<void> {
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText(DocsCopy.searchPlaceholder), term);
  });
  const found = await screen.findByLabelText(label);
  await act(async () => {
    fireEvent.press(found);
  });
  await waitFor(() => expect(mockPush).toHaveBeenCalled());
}

test('a 3 MB Markdown file found by search opens by name and size, as the host measured it', async () => {
  await openBrowser('project-search-large');
  await openSearched('large', 'large.md, docs');
  expect(mockSent).toContainEqual(expect.objectContaining({ scope: 'project', action: 'stat', path: 'docs/large.md' }));
  expect(mockPush.mock.calls).toEqual([
    ['DocViewer', expect.objectContaining({ entryPath: 'docs/large.md', size: 3_000_000 })],
  ]);
});

test('a picture found by search shows its size, as the host measured it', async () => {
  await openBrowser('project-search-image');
  await openSearched('icon', 'icon.png, assets');
  expect(mockPush.mock.calls).toEqual([
    ['DocViewer', expect.objectContaining({ entryPath: 'assets/icon.png', size: 339_015 })],
  ]);
});

test('preview header: a file opened in a browser from an agent session carries that session', async () => {
  await openBrowser('project-preview-session', SESSION);
  await act(async () => {
    fireEvent.press(screen.getByLabelText('README.md'));
  });
  await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
  await act(async () => {
    fireEvent.press(screen.getByLabelText('src'));
  });
  await act(async () => {
    fireEvent.press(await screen.findByLabelText('index.ts'));
  });
  await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(2));
  expect(mockPush.mock.calls).toEqual([
    ['DocViewer', expect.objectContaining({ entryPath: 'README.md', session: SESSION })],
    ['DocViewer', expect.objectContaining({ entryPath: 'src/index.ts', session: SESSION })],
  ]);
});

test('preview header: a file opened in a browser without a session carries none', async () => {
  await openBrowser('project-preview-plain');
  await act(async () => {
    fireEvent.press(screen.getByLabelText('README.md'));
  });
  await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
  expect(mockPush.mock.calls[0]?.[1]).not.toHaveProperty('session');
});

test('a Ghostex page found by search opens as its page in the Web preview, not in the viewer', async () => {
  // The computer and the project the page lookup asks (`docs/mediaStream.ts` `viewerProject`); only the fields it
  // reads, so the stand-ins are cast.
  useMachinesStore.setState({ machines: [{ id: 'machine-1' }] } as never);
  useInventoryStore.setState({
    inventoriesByMachineId: {
      'machine-1': { summary: { projects: [{ projectId: 'project-page', path: '/Users/me/ghostex-mobile' }] } },
    },
  } as never);
  await openBrowser('project-page');
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText(DocsCopy.searchPlaceholder), 'board');
  });
  const found = await screen.findByLabelText('board.html, docs');
  await act(async () => {
    fireEvent.press(found);
  });
  await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
  expect(mockSent).toContainEqual(
    expect.objectContaining({ action: 'openPage', path: '/Users/me/ghostex-mobile/docs/board.html' }),
  );
  expect(mockNavigate.mock.calls).toEqual([
    [
      'WebPreview',
      { machineId: 'machine-1', scheme: 'http', remotePort: 17_421, host: '127.0.0.1', path: '/visual/board-1/' },
    ],
  ]);
  expect(mockPush).not.toHaveBeenCalled();
});

test('an open file menu and its lifted row follow the row when the window changes', async () => {
  await openBrowser('project-anchor-file');
  await longPress('README.md');
  mockRowFrame = { x: 0, y: 200, width: 852, height: 44 };
  await withWindow(852, 393, () => {
    const lifted = screen.getByLabelText(DocsCopy.openFile('README.md'));
    expect(StyleSheet.flatten(lifted.props.style)).toEqual(
      expect.objectContaining({ left: 8, top: 200, width: 852 - 16, height: 44 }),
    );
    // The same menu stays open (not reopened or reset).
    expect(menuLabels()).toEqual([DocsCopy.open, DocsCopy.copyFullPath, DocsCopy.share]);
  });
});

test('an open folder menu and its lifted row follow the row when the window changes', async () => {
  await openBrowser('project-anchor-folder');
  await longPress('src');
  mockRowFrame = { x: 0, y: 160, width: 852, height: 44 };
  await withWindow(852, 393, () => {
    const lifted = screen
      .getAllByLabelText('src')
      .map((element) => StyleSheet.flatten(element.props.style) as Record<string, unknown> | undefined)
      .filter((style) => style?.position === 'absolute');
    expect(lifted).toEqual([expect.objectContaining({ left: 8, top: 160, width: 852 - 16, height: 44 })]);
    expect(menuLabels()).toEqual([DocsCopy.copyFullPath]);
  });
});

test('the open type filter menu follows its button when the window changes', async () => {
  await openBrowser('project-anchor-filter');
  await act(async () => {
    fireEvent.press(screen.getByLabelText(DocsCopy.filterByType));
  });
  const before = placedFrame(screen.getByText(DocsCopy.allFiles)).top as number;
  mockRowFrame = { x: 12, y: 120, width: 34, height: 34 };
  await withWindow(852, 393, () => {
    // Hung under the button's new frame: 180 pt higher, and 10 pt less tall than the row frame it was opened at.
    expect(placedFrame(screen.getByText(DocsCopy.allFiles)).top).toBe(before - 180 - 10);
  });
});

// The list may lay a row (or the search bar) out again later than the window change and any next frame. The open menu
// must follow that actual layout, reported by the row's or the button's own layout callback, not a guessed frame. The
// wait below lets every frame-based retry run before the late layout arrives.
const laterThanAnyFrame = () =>
  act(() => {
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 50);
    return promise;
  });
const laidOut = (element: TestInstance, width: number, height: number) =>
  act(async () => {
    fireEvent(element, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height } } });
  });

test('an open file menu follows its row when the list lays the row out after the window change', async () => {
  await openBrowser('project-anchor-file-late');
  await longPress('README.md');
  await withWindow(852, 393, async () => {
    await laterThanAnyFrame();
    mockRowFrame = { x: 0, y: 200, width: 852, height: 44 };
    await laidOut(screen.getByLabelText('README.md'), 852, 44);
    const lifted = screen.getByLabelText(DocsCopy.openFile('README.md'));
    expect(StyleSheet.flatten(lifted.props.style)).toEqual(
      expect.objectContaining({ left: 8, top: 200, width: 852 - 16, height: 44 }),
    );
    expect(menuLabels()).toEqual([DocsCopy.open, DocsCopy.copyFullPath, DocsCopy.share]);
  });
});

test('an open folder menu follows its row when the list lays the row out after the window change', async () => {
  await openBrowser('project-anchor-folder-late');
  await longPress('src');
  await withWindow(852, 393, async () => {
    await laterThanAnyFrame();
    mockRowFrame = { x: 0, y: 160, width: 852, height: 44 };
    const row = screen
      .getAllByLabelText('src')
      .find(
        (element) =>
          (StyleSheet.flatten(element.props.style) as { position?: string } | undefined)?.position !== 'absolute',
      );
    await laidOut(row!, 852, 44);
    const lifted = screen
      .getAllByLabelText('src')
      .map((element) => StyleSheet.flatten(element.props.style) as Record<string, unknown> | undefined)
      .filter((style) => style?.position === 'absolute');
    expect(lifted).toEqual([expect.objectContaining({ left: 8, top: 160, width: 852 - 16, height: 44 })]);
    expect(menuLabels()).toEqual([DocsCopy.copyFullPath]);
  });
});

test('the open type filter menu follows its button when it is laid out after the window change', async () => {
  await openBrowser('project-anchor-filter-late');
  await act(async () => {
    fireEvent.press(screen.getByLabelText(DocsCopy.filterByType));
  });
  const before = placedFrame(screen.getByText(DocsCopy.allFiles)).top as number;
  await withWindow(852, 393, async () => {
    await laterThanAnyFrame();
    mockRowFrame = { x: 12, y: 120, width: 34, height: 34 };
    await laidOut(screen.getByLabelText(DocsCopy.filterByType), 34, 34);
    expect(placedFrame(screen.getByText(DocsCopy.allFiles)).top).toBe(before - 180 - 10);
  });
});
