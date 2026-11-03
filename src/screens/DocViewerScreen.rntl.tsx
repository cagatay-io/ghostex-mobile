/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. The Docs viewer's header when the project file browser opened a Markdown file: as the
 * the design's rendered preview draws it, Copy Full Path, Add to
 * Session Context (only in a preview opened from an agent session), Share and Reload; Add to Session Context puts the
 * host's text into that session's input and names the session. Stand-ins: the page builder (the page never finishes
 * loading here, the header does not wait for it), gxserver's `runProjectDocsAction`, the session inputs, the machines
 * store, the share sheet and the native chrome.
 */

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import type { RpcAnswer } from '../chat/rust/transport';
import VerticalBarArea from '../components/common/verticalBar/VerticalBarArea';
import { DocsCopy } from '../copy';
import type { ContextSession, SessionInputs } from '../files/sessionContext';
import { shareProjectFile } from '../files/share';
import { appShareSheet } from '../files/shareSheet';
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
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true, useRoute: () => ({ key: 'doc' }) }));
jest.mock('react-native-webview', () => ({ WebView: () => null }));
jest.mock('../docs/page', () => ({
  buildDocPage: () => Promise.withResolvers().promise,
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

const mockSent: Record<string, unknown>[] = [];
const mockRpc = (_method: string, params: Record<string, unknown>) => {
  mockSent.push(params);
  return Promise.resolve({ result: { contextPrompt: '\nFile context: docs/plan.md\n' }, error: null });
};
jest.mock('../files/machine', () => ({
  currentMachine: (id: string) => ({ id }),
  useProjectDocsRpc: () => mockRpc,
}));
jest.mock('../files/shareSheet', () => ({
  canShareFiles: true,
  appShareSheet: { keepCopy: () => Promise.reject(new Error('unused')), open: () => Promise.resolve() },
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
const FROM_FILES: Props['route']['params'] = {
  machineId: 'machine-1',
  path: '/Users/me/ghostex-mobile/docs/plan.md',
  projectId: 'project-1',
  entryPath: 'docs/plan.md',
};

/** The viewer with the header it sets drawn above it, as the stack navigator draws `headerRight`. */
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
      <DocViewerScreen navigation={navigation} route={{ key: 'doc', name: 'DocViewer', params }} />
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
});

test('one share at a time: while another screen shares, the preview header Share is dimmed and starts nothing', async () => {
  // Another Files screen's share, its file still being fetched from the computer.
  const read = Promise.withResolvers<RpcAnswer>();
  const running = shareProjectFile(
    () => read.promise,
    'project-1',
    { name: 'slow.txt', path: 'slow.txt' },
    appShareSheet,
    () => undefined,
  );
  await render(<WithHeader params={FROM_FILES} />);
  const shareButton = () => within(screen.getByTestId('header')).getByLabelText(DocsCopy.shareButton);
  expect(shareButton().props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  await act(async () => {
    fireEvent.press(shareButton());
  });
  expect(screen.queryByText(DocsCopy.shareFetching('plan.md'))).toBeNull();
  await act(async () => {
    read.resolve({ result: null, error: null });
    await running;
  });
  expect(shareButton().props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
});

test('a Markdown preview from an agent session offers Add to Session Context', async () => {
  await render(<WithHeader params={{ ...FROM_FILES, session: SESSION }} />);
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
    expect.objectContaining({ projectId: 'project-1', scope: 'project', path: 'docs/plan.md' }),
  ]);
  expect(mockInserted).toEqual([{ session: 'session-7', text: '\nFile context: docs/plan.md\n' }]);
  expect(await screen.findByText(DocsCopy.contextAdded('Duo layout spike'))).toBeTruthy();
  expect(screen.getByText(DocsCopy.contextNotSent)).toBeTruthy();
});

test('a Markdown preview opened without a session has no Add to Session Context', async () => {
  await render(<WithHeader params={FROM_FILES} />);
  expect(headerLabels()).toEqual([DocsCopy.copyFullPath, DocsCopy.shareButton, DocsCopy.reload]);
});

test('a document opened outside Files (a chat link) keeps its own header, without Share or the action', async () => {
  await render(<WithHeader params={{ machineId: 'machine-1', path: '/Users/me/notes.md' }} />);
  expect(headerLabels()).toEqual([DocsCopy.copyPath, DocsCopy.reload]);
});
