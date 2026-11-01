/// <reference types="jest" />
/**
 * Run with `bunx jest src/screens/triage/FoldedTriage.rntl.tsx`. The folded triage on the real Sessions screen under
 * the real `VerticalBarArea`: folded on the iPhone Duo the waiting sessions stand above the full list, the one waiting
 * longest first, and it reads only for the cards it shows (their chats, a short-reply card's screen lines); unfolded
 * and on another iPhone there is no triage and nothing is read. Allow, Deny and an option reach the session's chat
 * core as the chat's own approval and question cards send them: the real `ApprovalCard` and `QuestionCard` are tapped
 * into one fake chat, the triage into a stand-in chat host, and both receive the same action. One decision per card
 * goes out once: after a tap the card's other buttons send nothing while the answer is on its way, and a short reply
 * is sent once and its card leaves. A card's head opens the session exactly as its list row does. Mocked are the
 * boundaries only: the native module, the chat host, the computer's commands, the screen read, storage, haptics, the
 * safe area, navigation focus and the voice button.
 *
 * Every tap is awaited: `fireEvent` of this testing library is asynchronous and wraps its own `act`, and a tap left
 * unawaited overlaps the next `act`, after which React commits nothing more in the file.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Dimensions } from 'react-native';

import type { BarLayout } from '../../../modules/ghostex-native/src/GhostexNative.types';
import type { UserAction } from '../../chat/rust/actions';
import type { ChatDocument } from '../../chat/rust/document';
import { ApprovalCard } from '../../chat/native/cards/ApprovalCard';
import { QuestionCard } from '../../chat/native/cards/QuestionCard';
import { useBarGeometryStore } from '../../components/common/verticalBar/barGeometry';
import VerticalBarArea from '../../components/common/verticalBar/VerticalBarArea';
import { useCollapseStore } from '../../components/sessions/collapseStore';
import { parseMobileSummary } from '../../contract/mobileSummary';
import { useInventoryStore, type MachineInventory } from '../../inventory/store';
import { useMachinesStore, type MachineRecord } from '../../machines/store';
import { useSettingsStore } from '../../settings/store';
import { useTerminalStore } from '../../terminal/sessions';
import SessionsScreen from '../SessionsScreen';

const mockDispatched: { sessionId: string; action: UserAction }[] = [];
const mockDocuments: Record<string, Partial<ChatDocument>> = {};
let mockBarLayout: BarLayout | null = null;
/** The computer's commands; a test may hold one back to keep a short reply on its way. */
const mockRun = jest.fn((_machine: { id: string }, _command: string): Promise<unknown> =>
  Promise.resolve({ ok: true }),
);
/** The sessions whose chat host is held now. */
const mockHeld: string[] = [];
const mockTailRead = jest.fn((_machine: { id: string }, _projectId: string, _sessionId: string) =>
  Promise.resolve({ kind: 'lines', lines: ['✓ Wrote the release notes', 'Commit and tag?'] }),
);

jest.mock('../../chat/rust/host', () => ({
  acquireRustChatHost: (target: { sessionId: string }) => {
    mockHeld.push(target.sessionId);
    return {
      host: {
        getState: () => ({ document: mockDocuments[target.sessionId] ?? null }),
        subscribe: () => () => undefined,
        dispatch: (action: UserAction) => mockDispatched.push({ sessionId: target.sessionId, action }),
      },
      release: () => mockHeld.splice(mockHeld.indexOf(target.sessionId), 1),
    };
  },
}));
jest.mock('../../components/sessions/cli', () => ({
  ...jest.requireActual('../../components/sessions/cli'),
  runGhostexCli: (...args: [{ id: string }, string]) => mockRun(...args),
}));
jest.mock('../wall/tailClient', () => ({
  readSessionTail: (...args: [{ id: string }, string, string]) => mockTailRead(...args),
}));
jest.mock('../../../modules/ghostex-native/src', () => ({
  GhostexNative: new Proxy(
    {
      addListener: () => ({ remove: () => undefined }),
      observeBarLayout: () => Promise.resolve({ id: 1, layout: mockBarLayout }),
      isTailscaleConnected: () => Promise.resolve(true),
    } as Record<string, unknown>,
    { get: (target, key: string) => target[key] ?? (() => Promise.resolve()) },
  ),
  GhostexTerminalView: () => null,
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-haptics', () => ({
  impactAsync: () => Promise.resolve(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: () => Promise.resolve() }));
jest.mock('expo-notifications', () => ({}));
// The screen also holds the Unified list (off here), whose swipe rows need Reanimated's native runtime: a plain row.
jest.mock('../machines-screen/SwipeRevealRow', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, default: View, SWIPE_REVEAL_WIDTH: 176 };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { useSafeAreaInsets: () => ({ top: 80, bottom: 20, left: 0, right: 0 }), SafeAreaView: View };
});
jest.mock('../../voice/VoiceButton', () => ({ VoiceButton: () => null }));
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useIsFocused: () => true,
  useFocusEffect: () => undefined,
}));

const MACHINE: MachineRecord = {
  id: 'm1',
  name: 'Studio Mac',
  host: 'mac.local',
  username: 'me',
  port: 22,
  savePassword: false,
  lastConnectedAt: null,
};
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

function wireSession(sessionId: string, title: string, overrides: object = {}) {
  return {
    sessionId,
    projectId: 'p1',
    title,
    agentIcon: 'claude',
    agentName: 'Claude',
    status: 'running',
    activity: 'working',
    isLive: true,
    provider: 'zmx',
    ...overrides,
  };
}

const card = { questionIndex: 0, drafts: [], answering: false, busy: false, loading: false, visible: true };
const APPROVAL: Partial<ChatDocument> = {
  prompt: { kind: 'approval', tool: 'Bash', summary: 'bun test src/components/terminal' },
  questionCard: {
    ...card,
    controls: { hasAnswer: false, disabled: false, label: '' },
    approvalTitle: 'Claude Code wants to run a command',
    approvalDetail: 'Bash · in ~/Projects/ghostex-mobile',
  },
};
const QUESTION: Partial<ChatDocument> = {
  prompt: {
    kind: 'question',
    questions: [
      {
        header: 'Key repeat',
        question: 'How fast should a held arrow key repeat?',
        options: [{ label: 'Every 50 ms' }, { label: 'Every 80 ms' }, { label: 'Follow the iOS key repeat' }],
      },
    ],
  },
  questionCard: { ...card, controls: { hasAnswer: false, disabled: true, label: 'Submit' } },
};

/** Two sessions wait (one for approval, one with a question), one finished turn waits, four others work or idle. */
function summary() {
  return parseMobileSummary(
    JSON.stringify({
      ok: true,
      capabilities: { awaitingAnswer: true },
      projects: [{ projectId: 'p1', name: 'ghostex-mobile', path: '/work/ghostex-mobile' }],
      sessions: [
        wireSession('a', 'Alpha'),
        wireSession('b', 'Beta', {
          activity: 'attention',
          awaitingApproval: true,
          attention: { enteredAt: minutesAgo(6), kind: 'needsInput' },
        }),
        wireSession('c', 'Gamma', { activity: 'idle' }),
        wireSession('d', 'Delta', {
          activity: 'attention',
          awaitingAnswer: true,
          attention: { enteredAt: minutesAgo(3), kind: 'needsInput' },
        }),
        wireSession('e', 'Epsilon'),
        wireSession('f', 'Zeta', { activity: 'attention', attention: { enteredAt: minutesAgo(1), kind: 'finished' } }),
        wireSession('g', 'Eta', { activity: 'idle' }),
      ],
    }),
  )!;
}

const navigation = { navigate: jest.fn(), setOptions: () => undefined };
const initialSettings = useSettingsStore.getState().settings;

/** The window and the header region the system reports: folded (band, no fold), unfolded (fold), another iPhone. */
const FOLDED: BarLayout = {
  windowWidth: 466,
  windowHeight: 678,
  safeTop: 80,
  safeLeft: 0,
  safeRight: 0,
  marginTop: 88,
  topBar: { x: 0, y: 26, width: 466, height: 44 },
};
const UNFOLDED: BarLayout = {
  ...FOLDED,
  windowWidth: 669,
  windowHeight: 951,
  divisions: [{ x: 0, y: 455.5, width: 669, height: 40, active: false }],
};
const OTHER_IPHONE: BarLayout = {
  ...FOLDED,
  windowWidth: 402,
  windowHeight: 874,
  safeTop: 62,
  topBar: { x: 0, y: 62, width: 402, height: 44 },
};

async function settle(): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(50);
  });
}

/** The screen, and beside it (`card`) a chat card for comparison: the screen's controls come first in the tree. */
async function renderScreen(layout: BarLayout, card?: ReactElement): Promise<void> {
  mockBarLayout = layout;
  const window = { width: layout.windowWidth!, height: layout.windowHeight!, scale: 3, fontScale: 1 };
  await act(() => {
    Dimensions.set({ window, screen: window });
  });
  await render(
    <>
      <VerticalBarArea>
        <SessionsScreen navigation={navigation as never} route={{ key: 'sessions', name: 'Sessions' } as never} />
      </VerticalBarArea>
      {card}
    </>,
  );
  await settle();
}

beforeEach(async () => {
  jest.useFakeTimers();
  mockDispatched.length = 0;
  mockRun.mockClear();
  mockHeld.length = 0;
  mockTailRead.mockClear();
  mockRun.mockImplementation(() => Promise.resolve({ ok: true }));
  await AsyncStorage.clear();
  for (const key of Object.keys(mockDocuments)) delete mockDocuments[key];
  mockDocuments.b = APPROVAL;
  mockDocuments.d = QUESTION;
  navigation.navigate.mockClear();
  useSettingsStore.setState({ hydrated: true, settings: { ...initialSettings } });
  useMachinesStore.setState({ machines: [MACHINE], selectedMachineId: 'm1' });
  const parsed = summary();
  useInventoryStore.setState({
    inventoriesByMachineId: {
      m1: {
        summary: parsed,
        serverSummary: parsed,
        lastError: null,
        lastErrorCode: null,
        hasLoaded: true,
        refreshing: false,
        retrying: false,
        fingerprint: null,
        loadedAt: 0,
      } as MachineInventory,
    },
  });
  useCollapseStore.setState({ expandedProjectsByMachine: { m1: ['id:p1'] } });
  useTerminalStore.setState({ tabs: [], selectedSessionKey: null, sessionViewModeBySessionKey: {} });
  useBarGeometryStore.setState({ hydrated: false, keyboardHeights: {}, layouts: {} });
  await useBarGeometryStore.getState().hydrate();
});

afterEach(() => {
  jest.useRealTimers();
});

const heads = () => screen.queryAllByLabelText(/^Open .*, waiting/).map((head) => head.props.accessibilityLabel);
/** The short replies that went to the computer (its other commands, such as acknowledging, are left out). */
const replySends = () =>
  mockRun.mock.calls
    .map(([, command]) => command)
    .filter((command) => /^ghostex send-(session-chat-)?message /.test(command));

describe('folded: waiting sessions above the full list', () => {
  test('the three waiting sessions come first, the one waiting longest on top; the full list stays below', async () => {
    await renderScreen(FOLDED);
    expect(screen.getByText('Waiting for you · 3')).toBeTruthy();
    expect(heads()).toEqual(['Open Beta, waiting 6m', 'Open Delta, waiting 3m', 'Open Zeta, waiting 1m']);
    // Every session still has its list row; the waiting ones show twice.
    for (const title of ['Alpha', 'Gamma', 'Epsilon', 'Eta']) expect(screen.getAllByText(title)).toHaveLength(1);
    for (const title of ['Beta', 'Delta', 'Zeta']) expect(screen.getAllByText(title)).toHaveLength(2);
    // Approval, question and short replies.
    expect(screen.getByLabelText('Allow')).toBeTruthy();
    expect(screen.getByLabelText('Every 80 ms')).toBeTruthy();
    expect(screen.getByLabelText('continue')).toBeTruthy();
    expect(screen.getByLabelText('yes')).toBeTruthy();
    // Reads only for the cards shown: the chats of the approval and the question, the screen of the short-reply card.
    expect([...mockHeld].sort()).toEqual(['b', 'd']);
    expect(mockTailRead.mock.calls.map(([, , sessionId]) => sessionId)).toEqual(['f']);
    expect(screen.getByLabelText('Last output: ✓ Wrote the release notes\nCommit and tag?')).toBeTruthy();
  });

  test('nothing waiting: one quiet row', async () => {
    const quiet = parseMobileSummary(JSON.stringify({ ok: true, sessions: [wireSession('a', 'Alpha')] }))!;
    useInventoryStore.setState({
      inventoriesByMachineId: {
        m1: { ...useInventoryStore.getState().inventoriesByMachineId.m1!, summary: quiet, serverSummary: quiet },
      },
    });
    await renderScreen(FOLDED);
    expect(screen.getByText('Nothing is waiting for you')).toBeTruthy();
  });
});

describe("the chat's own answers", () => {
  test("Allow sends what the chat's approval card's Allow sends", async () => {
    const fromCard: UserAction[] = [];
    const chat = { dispatch: (action: UserAction) => fromCard.push(action) };
    await renderScreen(FOLDED, <ApprovalCard chat={chat as never} document={APPROVAL as ChatDocument} />);
    const [triageAllow, cardAllow] = screen.getAllByLabelText('Allow');
    await fireEvent.press(cardAllow!);
    await fireEvent.press(triageAllow!);
    expect(fromCard).toHaveLength(1);
    expect(mockDispatched).toEqual([{ sessionId: 'b', action: fromCard[0] }]);
  });

  test("Deny sends what the chat's approval card's Deny sends", async () => {
    const fromCard: UserAction[] = [];
    const chat = { dispatch: (action: UserAction) => fromCard.push(action) };
    await renderScreen(FOLDED, <ApprovalCard chat={chat as never} document={APPROVAL as ChatDocument} />);
    const [triageDeny, cardDeny] = screen.getAllByLabelText('Deny');
    await fireEvent.press(cardDeny!);
    await fireEvent.press(triageDeny!);
    expect(fromCard).toHaveLength(1);
    expect(mockDispatched).toEqual([{ sessionId: 'b', action: fromCard[0] }]);
  });

  test("the second option sends what the chat's question card's second option sends", async () => {
    const fromCard: UserAction[] = [];
    const chat = { dispatch: (action: UserAction) => fromCard.push(action) };
    await renderScreen(FOLDED, <QuestionCard chat={chat as never} document={QUESTION as ChatDocument} />);
    const [triageOption, cardOption] = screen.getAllByLabelText('Every 80 ms');
    await fireEvent.press(cardOption!);
    await fireEvent.press(triageOption!);
    expect(fromCard).toHaveLength(1);
    expect(mockDispatched).toEqual([{ sessionId: 'd', action: fromCard[0] }]);
  });
});

describe('one decision per card goes out once', () => {
  test('after Allow, neither Allow nor Deny sends again while the answer is on its way', async () => {
    await renderScreen(FOLDED);
    await fireEvent.press(screen.getByLabelText('Allow'));
    expect(screen.getByText('Sending…')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Deny'));
    await fireEvent.press(screen.getByLabelText('Allow'));
    await settle();
    expect(mockDispatched.map(({ sessionId }) => sessionId)).toEqual(['b']);
  });

  test('after an option, no option sends again while the answer is on its way', async () => {
    await renderScreen(FOLDED);
    await fireEvent.press(screen.getByLabelText('Every 80 ms'));
    await fireEvent.press(screen.getByLabelText('Every 50 ms'));
    await fireEvent.press(screen.getByLabelText('Every 80 ms'));
    await settle();
    expect(mockDispatched.map(({ sessionId }) => sessionId)).toEqual(['d']);
  });

  test('a short reply is sent once: no second reply while it is on its way, and its card leaves once it is out', async () => {
    const delivery = Promise.withResolvers<unknown>();
    mockRun.mockImplementation((_machine, command) =>
      /^ghostex send-/.test(command) ? delivery.promise : Promise.resolve({ ok: true }),
    );
    await renderScreen(FOLDED);
    await fireEvent.press(screen.getByLabelText('yes'));
    await fireEvent.press(screen.getByLabelText('continue'));
    await fireEvent.press(screen.getByLabelText('yes'));
    await settle();
    expect(replySends()).toHaveLength(1);
    expect(replySends()[0]).toContain("--session-id 'f'");
    await act(async () => delivery.resolve({ ok: true }));
    await settle();
    expect(screen.queryByLabelText('Open Zeta, waiting 1m')).toBeNull();
    expect(screen.queryByLabelText('yes')).toBeNull();
    expect(replySends()).toHaveLength(1);
  });
});

describe('the normal workflow stays', () => {
  test("a card's head opens the session exactly as its list row does", async () => {
    await renderScreen(FOLDED);
    await fireEvent.press(screen.getByLabelText('Open Zeta, waiting 1m'));
    await settle();
    const fromHead = [...navigation.navigate.mock.calls];
    expect(fromHead).toHaveLength(1);
    // Opening acknowledges the waiting turn as the row does, so it leaves the triage; its row stays.
    expect(screen.getAllByText('Zeta')).toHaveLength(1);
    await act(() => {
      useTerminalStore.setState({ tabs: [], selectedSessionKey: null });
    });
    navigation.navigate.mockClear();
    await fireEvent.press(screen.getByText('Zeta'));
    await settle();
    expect(navigation.navigate.mock.calls).toEqual(fromHead);
  });
});

describe('not folded', () => {
  test('unfolded there is no triage', async () => {
    await renderScreen(UNFOLDED);
    expect(screen.queryByLabelText('Waiting for you')).toBeNull();
    expect(screen.getAllByText('Beta')).toHaveLength(1);
    expect(mockHeld).toEqual([]);
    expect(mockTailRead).not.toHaveBeenCalled();
  });

  test('on another iPhone there is no triage', async () => {
    await renderScreen(OTHER_IPHONE);
    expect(screen.queryByLabelText('Waiting for you')).toBeNull();
    expect(screen.getAllByText('Beta')).toHaveLength(1);
    expect(mockHeld).toEqual([]);
    expect(mockTailRead).not.toHaveBeenCalled();
  });
});
