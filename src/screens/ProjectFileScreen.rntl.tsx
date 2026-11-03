/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. The project file browser's file view (`ProjectFileScreen`) wiring: a file over 2 MB
 * shows its name and size, no content is read, and Copy Full Path puts its full path on the clipboard; bytes that are
 * not UTF-8 text show name and size, not decoded source; its Share… fetches the file by its path in the project
 * under a progress notice and hands it to the share sheet, as the design's info view does; and the source
 * view's header offers Add to Session Context only in a preview opened from an agent session. Stand-ins: gxserver's `runProjectDocsAction`, the SSH file read (its base64 decoded by the real
 * decoder), the share sheet, the session inputs, the clipboard, the native chrome.
 */

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import VerticalBarArea from '../components/common/verticalBar/VerticalBarArea';
import { DocsCopy } from '../copy';
import type { ContextSession, SessionInputs } from '../files/sessionContext';
import type { ShareSheet } from '../files/share';
import type { RootStackParamList } from '../navigation/types';
import ProjectFileScreen from './ProjectFileScreen';

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
// The source view's WebView, drawn as a plain view that carries its label.
jest.mock('react-native-webview', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return {
    WebView: (props: { accessibilityLabel?: string }) => <MockView accessibilityLabel={props.accessibilityLabel} />,
  };
});
const mockSent: Record<string, unknown>[] = [];
const mockRpc = (_method: string, params: Record<string, unknown>) => {
  mockSent.push(params);
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
const mockRead = jest.fn<Promise<unknown[]>, []>(() => Promise.resolve([]));
jest.mock('../docs/remoteFiles', () => ({
  ...jest.requireActual('../docs/remoteFiles'),
  readRemoteFiles: () => mockRead(),
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

type Props = NativeStackScreenProps<RootStackParamList, 'ProjectFile'>;
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
      <ProjectFileScreen navigation={navigation} route={{ key: 'file', name: 'ProjectFile', params }} />
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
  mockRead.mockClear();
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
