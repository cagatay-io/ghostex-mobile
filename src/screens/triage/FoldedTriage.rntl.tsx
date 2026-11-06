/// <reference types="jest" />
/**
 * Run with `bunx jest src/screens/triage/FoldedTriage.rntl.tsx`. The folded triage on the real Sessions screen under
 * the real `VerticalBarArea`: folded on the iPhone Duo the waiting sessions stand above the full list, the one waiting
 * longest first, and it reads only for the cards it shows (their chats, a short-reply card's screen lines), a session
 * whose project changes trading the old project's chat for the new one's; unfolded and on another iPhone there is no
 * triage and nothing is read. Allow, Deny and an option reach the session's chat core as the chat's own approval and
 * question cards send them: the real `ApprovalCard` and `QuestionCard` are tapped into one fake chat, the triage into
 * a stand-in chat host, and both receive the same action. One decision per card goes out once: after a tap the card's
 * other buttons send nothing while the answer is on its way, and a short reply is sent once and its card leaves. A
 * card's head opens the session exactly as its list row does. With the computer's Sidebar set to Unified the same
 * holds above upstream's Unified list, whose scope is every computer it shows as its filter leaves them: the waits
 * ordered across computers, each card answering on its own. Mocked are the
 * boundaries only: the native module, the chat host, the computer's commands, the screen read, storage, haptics, the
 * safe area, navigation focus and the voice button.
 *
 * Every tap is awaited: `fireEvent` of this testing library is asynchronous and wraps its own `act`, and a tap left
 * unawaited overlaps the next `act`, after which React commits nothing more in the file.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import type { TestInstance } from 'test-renderer';

import type { BarLayout } from '../../../modules/ghostex-native/src/GhostexNative.types';
import type { UserAction } from '../../chat/rust/actions';
import type { ChatDocument } from '../../chat/rust/document';
import { askColor } from '../../chat/native/cards/askCard';
import { ApprovalCard } from '../../chat/native/cards/ApprovalCard';
import { QuestionCard } from '../../chat/native/cards/QuestionCard';
import { NoticeCard } from '../../chat/native/cards/NoticeCard';
import { useBarGeometryStore } from '../../components/common/verticalBar/barGeometry';
import VerticalBarArea from '../../components/common/verticalBar/VerticalBarArea';
import { useCollapseStore } from '../../components/sessions/collapseStore';
import { parseMobileSummary, type GhostexMobileSummary } from '../../contract/mobileSummary';
import { EMPTY_UNIFIED_FILTER } from '../../contract/unified/build';
import * as inventoryClient from '../../inventory/client';
import { useInventoryStore, type MachineInventory } from '../../inventory/store';
import { useMachinesStore, type MachineRecord } from '../../machines/store';
import { useSettingsStore } from '../../settings/store';
import { useTerminalStore } from '../../terminal/sessions';
import { useUnifiedListStore } from '../sessions-screen/unified-list-store';
import { THEME_PRESETS, themePresetPatch } from '../../theme/presets';
import { GhostexPalette, neutralButtonFills, SidebarPalette } from '../../theme/palette';
import { resolveAppearance } from '../../theme/useAppearance';
import SessionsScreen from '../SessionsScreen';

const mockDispatched: { sessionId: string; action: UserAction }[] = [];
const mockDocuments: Record<string, Partial<ChatDocument>> = {};
const mockChatListeners = new Map<string, () => void>();
let mockBarLayout: BarLayout | null = null;
/** The computer's commands; a test may hold one back to keep a short reply on its way. */
const mockRun = jest.fn((_machine: { id: string }, _command: string): Promise<unknown> =>
  Promise.resolve({ ok: true }),
);
/** The sessions whose chat host is held now. */
const mockHeld: string[] = [];
/** The chat hosts let go, by the host's identity without the computer: `projectId/sessionId`. */
const mockReleased: string[] = [];
const mockTailRead = jest.fn((_machine: { id: string }, _projectId: string, _sessionId: string) =>
  Promise.resolve({ kind: 'lines', lines: ['✓ Wrote the release notes', 'Commit and tag?'] }),
);

jest.mock('../../chat/rust/host', () => ({
  acquireRustChatHost: (target: { projectId: string; sessionId: string }) => {
    mockHeld.push(target.sessionId);
    return {
      host: {
        getState: () => ({ document: mockDocuments[target.sessionId] ?? null }),
        subscribe: (listener: () => void) => {
          mockChatListeners.set(target.sessionId, listener);
          return () => mockChatListeners.delete(target.sessionId);
        },
        dispatch: (action: UserAction) => mockDispatched.push({ sessionId: target.sessionId, action }),
      },
      release: () => {
        mockHeld.splice(mockHeld.indexOf(target.sessionId), 1);
        mockReleased.push(`${target.projectId}/${target.sessionId}`);
      },
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
jest.mock('react-native-webview', () => ({ WebView: () => null }));
// NoticeCard's Markdown imports image/animation views; these cases render only its plain folded rows.
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: jest.requireActual('react-native').Animated,
  useReducedMotion: () => false,
}));
// The screen also holds the Unified list (on in the Unified tests at the end), whose swipe rows need Reanimated's
// native runtime: a plain row.
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

const PERMISSION_ROWS: Partial<ChatDocument> = {
  ...APPROVAL,
  questionCard: { ...card, controls: { hasAnswer: false, disabled: false, label: '' }, visible: false },
  noticeVisible: true,
  terminalNotice: {
    kind: 'permissionPrompt',
    title: 'Run the checks?',
    detectedAt: '2026-11-01T12:00:00Z',
    tone: 'approval',
    collapsedDetail: '$ bun test',
    collapsedChoices: [0, 2],
    choices: [
      {
        index: 4,
        label: 'Proceed once (y)',
        collapsedLabel: 'Proceed once',
        answer: { kind: 'terminalChoice', choiceIndex: 4 },
      },
      {
        index: 7,
        label: 'Always proceed',
        collapsedLabel: 'Always proceed',
        answer: { kind: 'terminalChoice', choiceIndex: 7 },
      },
      { index: 9, label: 'Decline (n)', collapsedLabel: 'Decline', answer: { kind: 'terminalChoice', choiceIndex: 9 } },
    ],
  },
};

/**
 * Three sessions wait (one for approval, one with a question, one for input without a question), one turn finished
 * (in the list only), four others work or idle.
 */
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
        wireSession('f', 'Zeta', {
          activity: 'attention',
          attention: { enteredAt: minutesAgo(1), kind: 'needsInput' },
        }),
        wireSession('g', 'Eta', { activity: 'idle' }),
        wireSession('h', 'Lambda', {
          activity: 'attention',
          attention: { enteredAt: minutesAgo(2), kind: 'finished' },
        }),
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
  mockReleased.length = 0;
  mockTailRead.mockClear();
  mockChatListeners.clear();
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

const ZETA_ENTERED = minutesAgo(1);
/**
 * The summary with Zeta in one attention of `kind`: the computer keeps the attention's id when a wait for the user
 * turns into a finished turn (a question answered on the Mac, the turn done), so only the kind says what it shows now.
 */
function zetaIn(kind: 'needsInput' | 'finished', eventId = 'attention-f'): GhostexMobileSummary {
  const base = summary();
  return {
    ...base,
    sessions: base.sessions.map((session) =>
      session.sessionId === 'f'
        ? { ...session, attentionEventId: eventId, attentionEnteredAt: ZETA_ENTERED, attentionKind: kind }
        : session,
    ),
  };
}

async function showSummary(next: GhostexMobileSummary): Promise<void> {
  await act(() => {
    useInventoryStore.setState({
      inventoriesByMachineId: {
        m1: { ...useInventoryStore.getState().inventoriesByMachineId.m1!, summary: next, serverSummary: next },
      },
    });
  });
  await settle();
}

describe('folded: waiting sessions above the full list', () => {
  test('the three waiting sessions come first, the one waiting longest on top; the full list stays below', async () => {
    await renderScreen(FOLDED);
    expect(screen.getByText('Waiting for you · 3')).toBeTruthy();
    expect(heads()).toEqual(['Open Beta, waiting 6m', 'Open Delta, waiting 3m', 'Open Zeta, waiting 1m']);
    // Every session still has its list row; the waiting ones show twice, the finished turn once.
    for (const title of ['Alpha', 'Gamma', 'Epsilon', 'Eta', 'Lambda']) {
      expect(screen.getAllByText(title)).toHaveLength(1);
    }
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

  test("the open question card's session shows the pink question dot on its card and on its list row", async () => {
    await renderScreen(FOLDED);
    const pinkDots = (node: TestInstance) =>
      node.queryAll(
        (candidate) => StyleSheet.flatten(candidate.props.style)?.backgroundColor === SidebarPalette.ROW_QUESTION,
      );
    // Delta's computer announces `awaitingAnswer` and counts no question: its card and its row read the question card.
    const [card, row] = screen.getAllByText('Delta').map((title) => {
      let node = title;
      while (
        node.parent !== null &&
        node.props.accessibilityLabel !== 'Delta' &&
        node.props.accessibilityRole !== 'button'
      )
        node = node.parent;
      return node;
    });
    expect(card).toBeDefined();
    expect(row).toBeDefined();
    if (card === undefined || row === undefined) throw new Error('the question card and list row must both be drawn');
    expect(pinkDots(card)).toHaveLength(1);
    expect(pinkDots(row)).toHaveLength(1);
  });

  test("a waiting session whose project changes lets go of the old project's chat and answers from the new one", async () => {
    await renderScreen(FOLDED);
    expect(screen.getByLabelText('Allow')).toBeTruthy();
    expect(mockReleased).toEqual([]);
    // The same session on the same computer, now under another project, whose chat asks a question.
    const moved = summary();
    const beta = moved.sessions.find((session) => session.sessionId === 'b')!;
    const elsewhere = {
      ...moved,
      projects: [...moved.projects, { ...moved.projects[0]!, projectId: 'p2', name: 'ghostex-server' }],
      sessions: moved.sessions.map((session) => (session === beta ? { ...beta, projectId: 'p2' } : session)),
    };
    mockDocuments.b = QUESTION;
    await act(() => {
      useInventoryStore.setState({
        inventoriesByMachineId: {
          m1: {
            ...useInventoryStore.getState().inventoriesByMachineId.m1!,
            summary: elsewhere,
            serverSummary: elsewhere,
          },
        },
      });
    });
    await settle();
    expect(mockReleased).toEqual(['p1/b']);
    expect([...mockHeld].sort()).toEqual(['b', 'd']);
    expect(screen.queryByLabelText('Allow')).toBeNull();
    expect(screen.getAllByLabelText('Every 80 ms')).toHaveLength(2);
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

  test('a wait whose turn then finishes in the same attention leaves the triage and keeps its list row', async () => {
    mockTailRead.mockImplementation(() =>
      Promise.resolve({ kind: 'lines', lines: ['Which repeat rate?', '› 1. Every 50 ms  2. Every 80 ms'] }),
    );
    await renderScreen(FOLDED);
    await showSummary(zetaIn('needsInput'));
    expect(screen.getByLabelText('Last output: Which repeat rate?\n› 1. Every 50 ms  2. Every 80 ms')).toBeTruthy();
    const reads = mockTailRead.mock.calls.length;

    await showSummary(zetaIn('finished'));
    expect(heads().map((head) => head.replace(/, waiting .*$/, ''))).toEqual(['Open Beta', 'Open Delta']);
    expect(screen.getAllByText('Zeta')).toHaveLength(1);
    expect(screen.queryByLabelText(/^Last output: /)).toBeNull();
    expect(mockTailRead.mock.calls.length).toBe(reads);
  });

  test("the screen read for an earlier wait, answering after the newer wait's, leaves the newer lines", async () => {
    // Two reads of one session overtake each other.
    // A finished turn leaves the triage, so the newer wait is the next wait for input.
    const earlierRead = Promise.withResolvers<{ kind: string; lines: string[] }>();
    mockTailRead.mockImplementation(() => earlierRead.promise);
    await showSummary(zetaIn('needsInput', 'attention-f1'));
    await renderScreen(FOLDED);
    mockTailRead.mockImplementation(() => Promise.resolve({ kind: 'lines', lines: ['Continue?', '(y/n)'] }));
    await showSummary(zetaIn('needsInput', 'attention-f2'));
    expect(screen.getByLabelText('Last output: Continue?\n(y/n)')).toBeTruthy();
    await act(() => earlierRead.resolve({ kind: 'lines', lines: ['Old question', 'old options'] }));
    await settle();
    expect(screen.getByLabelText('Last output: Continue?\n(y/n)')).toBeTruthy();
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

  describe.each(['omp', 'claude', 'copilot', 'grok', 'antigravity', 'cursor', 'empryo'])(
    '%s permission rows',
    (agent) => {
      test.each([
        { label: 'Proceed once', choiceIndex: 4 },
        { label: 'Decline', choiceIndex: 9 },
      ])('$label sends the folded notice row answer once and retires with the notice', async ({ label, choiceIndex }) => {
        mockDocuments.b = PERMISSION_ROWS;
        const parsed = summary();
        await showSummary({
          ...parsed,
          sessions: parsed.sessions.map((session) =>
            session.sessionId === 'b' ? { ...session, agent, agentIcon: agent, agentName: agent } : session,
          ),
        });
        const fromCard: UserAction[] = [];
        const chat = { dispatch: (action: UserAction) => fromCard.push(action) };
        // The fixture contains only the card fields read by these renderers.
        await renderScreen(FOLDED, <NoticeCard chat={chat as never} document={PERMISSION_ROWS as ChatDocument} />);
        const [triageRow, cardRow] = screen.getAllByLabelText(label);
        if (triageRow === undefined || cardRow === undefined) throw new Error('Both surfaces must show the folded row.');
        expect(screen.queryByLabelText('Always proceed')).toBeNull();
        await fireEvent.press(cardRow);
        await fireEvent.press(triageRow);
        expect(fromCard).toEqual([{ type: 'answer', answer: { kind: 'terminalChoice', choiceIndex } }]);
        expect(mockDispatched).toEqual([{ sessionId: 'b', action: fromCard[0] }]);
        await fireEvent.press(triageRow);
        expect(mockDispatched).toHaveLength(1);
        // The stored prompt and questionCard do not change when the visible notice retires.
        mockDocuments.b = { ...PERMISSION_ROWS, noticeVisible: false };
        await act(() => mockChatListeners.get('b')?.());
        await settle();
        expect(screen.queryByLabelText('Open Beta, waiting 6m')).toBeNull();
      });
    },
  );
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

describe("the Unified list (the computer's Sidebar set to Unified)", () => {
  const MINI: MachineRecord = { ...MACHINE, id: 'm2', name: 'Mini', host: 'mini.local' };
  /**
   * The second computer: one approval waiting longer than any on the first, one wait for input, one finished turn
   * (in the list only), one working.
   */
  const miniSummary = () =>
    parseMobileSummary(
      JSON.stringify({
        ok: true,
        capabilities: { awaitingAnswer: true },
        projects: [{ projectId: 'p1', name: 'ghostex-server', path: '/work/ghostex-server' }],
        sessions: [
          wireSession('m', 'Theta', {
            activity: 'attention',
            awaitingApproval: true,
            attention: { enteredAt: minutesAgo(9), kind: 'needsInput' },
          }),
          wireSession('n', 'Iota', {
            activity: 'attention',
            attention: { enteredAt: minutesAgo(2), kind: 'needsInput' },
          }),
          wireSession('o', 'Kappa'),
          wireSession('q', 'Mu', {
            activity: 'attention',
            attention: { enteredAt: minutesAgo(4), kind: 'finished' },
          }),
        ],
      }),
    )!;
  const inventory = (parsed: GhostexMobileSummary): MachineInventory => ({
    ...useInventoryStore.getState().inventoriesByMachineId.m1!,
    summary: parsed,
    serverSummary: parsed,
  });
  const addMini = (): void => {
    useMachinesStore.setState({ machines: [MACHINE, MINI], selectedMachineId: 'm1' });
    useInventoryStore.setState({
      inventoriesByMachineId: { ...useInventoryStore.getState().inventoriesByMachineId, m2: inventory(miniSummary()) },
    });
  };

  beforeEach(() => {
    // The first computer's Sidebar setting decides the list; the fixture is the classic tests' own.
    useInventoryStore.setState({ inventoriesByMachineId: { m1: inventory({ ...summary(), sidebarView: 'unified' }) } });
    useUnifiedListStore.setState({
      hydrated: true,
      filter: EMPTY_UNIFIED_FILTER,
      toggledShelves: [],
      foldedGroups: [],
    });
  });

  test('folded: the three waiting sessions stand above the full Unified list, the one waiting longest on top', async () => {
    await renderScreen(FOLDED);
    expect(screen.getByPlaceholderText('Search sessions')).toBeTruthy();
    expect(screen.getByText('Waiting for you · 3')).toBeTruthy();
    expect(heads()).toEqual(['Open Beta, waiting 6m', 'Open Delta, waiting 3m', 'Open Zeta, waiting 1m']);
    // The Unified list below keeps its cards; the waiting ones show twice, and the section comes first.
    for (const title of ['Gamma', 'Eta', 'Lambda']) expect(screen.getAllByText(title)).toHaveLength(1);
    for (const title of ['Beta', 'Delta', 'Zeta']) expect(screen.getAllByText(title)).toHaveLength(2);
    // Tree order: the section's heading before the list's cards.
    expect(screen.getAllByText(/^(Waiting for you · 3|Gamma)$/).map((text) => text.props.children)).toEqual([
      'Waiting for you · 3',
      'Gamma',
    ]);
    expect(screen.getByLabelText('Allow')).toBeTruthy();
    expect(screen.getByLabelText('Every 80 ms')).toBeTruthy();
    expect(screen.getByLabelText('yes')).toBeTruthy();
    expect([...mockHeld].sort()).toEqual(['b', 'd']);
    expect(mockTailRead.mock.calls.map(([, , sessionId]) => sessionId)).toEqual(['f']);
  });

  test('every computer the list shows: the waits ordered across them, each card answering on its own computer', async () => {
    addMini();
    mockDocuments.m = APPROVAL;
    await renderScreen(FOLDED);
    expect(heads()).toEqual([
      'Open Theta, waiting 9m',
      'Open Beta, waiting 6m',
      'Open Delta, waiting 3m',
      'Open Iota, waiting 2m',
      'Open Zeta, waiting 1m',
    ]);
    expect([...mockHeld].sort()).toEqual(['b', 'd', 'm']);
    const [thetaAllow] = screen.getAllByLabelText('Allow');
    await fireEvent.press(thetaAllow!);
    expect(mockDispatched.map(({ sessionId }) => sessionId)).toEqual(['m']);
    const [iotaReply] = screen.getAllByLabelText('yes');
    await fireEvent.press(iotaReply!);
    await settle();
    expect(
      mockRun.mock.calls
        .filter(([, command]) => /^ghostex send-(session-chat-)?message /.test(command))
        .map(([target, command]) => [target.id, /--session-id '(\w+)'/.exec(command)?.[1]]),
    ).toEqual([['m2', 'n']]);
  });

  test("the Unified filter's scope is the triage's: with one computer picked, only its waiting sessions", async () => {
    addMini();
    useUnifiedListStore.setState({ filter: { ...EMPTY_UNIFIED_FILTER, machines: ['m2'] } });
    await renderScreen(FOLDED);
    expect(heads()).toEqual(['Open Theta, waiting 9m', 'Open Iota, waiting 2m']);
    expect(mockHeld).toEqual(['m']);
  });

  test("a card's head opens the session exactly as its Unified card does", async () => {
    // The computer answers the refresh that opening starts with what it showed, so it stays connected: a computer
    // whose refresh fails gives no cards in the Unified list.
    const read = jest.spyOn(inventoryClient, 'fetchInventory').mockImplementation(async () => ({
      summary: useInventoryStore.getState().inventoriesByMachineId.m1!.serverSummary!,
      fingerprint: 'unchanged',
    }));
    await renderScreen(FOLDED);
    await fireEvent.press(screen.getByLabelText('Open Zeta, waiting 1m'));
    await settle();
    const fromHead = [...navigation.navigate.mock.calls];
    expect(fromHead).toHaveLength(1);
    await act(() => {
      useTerminalStore.setState({ tabs: [], selectedSessionKey: null });
    });
    navigation.navigate.mockClear();
    await fireEvent.press(screen.getAllByLabelText('Zeta').at(-1)!);
    await settle();
    expect(navigation.navigate.mock.calls).toEqual(fromHead);
    read.mockRestore();
  });

  test('unfolded there is no triage above the Unified list, and nothing is read', async () => {
    await renderScreen(UNFOLDED);
    expect(screen.getByPlaceholderText('Search sessions')).toBeTruthy();
    expect(screen.queryByLabelText('Waiting for you')).toBeNull();
    expect(screen.getAllByText('Beta')).toHaveLength(1);
    expect(mockHeld).toEqual([]);
    expect(mockTailRead).not.toHaveBeenCalled();
  });

  test('on another iPhone there is no triage above the Unified list, and nothing is read', async () => {
    await renderScreen(OTHER_IPHONE);
    expect(screen.getByPlaceholderText('Search sessions')).toBeTruthy();
    expect(screen.queryByLabelText('Waiting for you')).toBeNull();
    expect(screen.getAllByText('Beta')).toHaveLength(1);
    expect(mockHeld).toEqual([]);
    expect(mockTailRead).not.toHaveBeenCalled();
  });
});

/** WCAG relative luminance of `#rrggbb`. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((at) => parseInt(hex.slice(at, at + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** `fill` (`#rrggbb` or `rgba(r,g,b,a)`) painted over the opaque `base`. */
function over(fill: string, base: string): string {
  if (fill.startsWith('#')) return fill;
  const [r, g, b, a] = fill.match(/[0-9.]+/g)!.map(Number);
  return `#${[r!, g!, b!]
    .map((channel, at) => Math.round(parseInt(base.slice(1 + 2 * at, 3 + 2 * at), 16) * (1 - a!) + channel * a!))
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}
const flat = (node: { props: { style?: unknown } }) => StyleSheet.flatten(node.props.style as never) ?? {};

describe("the triage in the appearance's colours", () => {
  const MULTI_SELECT: Partial<ChatDocument> = {
    ...QUESTION,
    prompt: {
      kind: 'question',
      questions: [
        { header: 'Pick', question: 'Choose several', multiSelect: true, options: [{ label: 'A' }, { label: 'B' }] },
      ],
    },
  };

  test.each(['latte', 'alucard', 'tn-day'])(
    'light preset %s: Deny, Open Question, the command and the waiting time read on the light cards',
    async (preset) => {
      useSettingsStore.getState().patchSettings(themePresetPatch(preset, false)!);
      mockDocuments.d = MULTI_SELECT;
      const page = resolveAppearance(useSettingsStore.getState().settings, true);
      await renderScreen(FOLDED);
      const light = neutralButtonFills(true).rest;
      for (const label of ['Deny', 'Open Question']) {
        const button = screen.getByLabelText(label);
        const text = screen.getByText(label);
        expect(flat(button).backgroundColor).toBe(light);
        expect(flat(text).color).toBe(page.foreground);
        expect(contrast(flat(text).color as string, over(light, page.card))).toBeGreaterThanOrEqual(4.5);
      }
      const command = screen.getByText(/bun test src\/components\/terminal/);
      const well = command.parent!;
      expect(flat(well).backgroundColor).toBe(page.background);
      expect(contrast(flat(command).color as string, page.background)).toBeGreaterThanOrEqual(4.5);
      const head = screen.getByLabelText('Open Beta, waiting 6m');
      const [waited] = head.queryAll((node) => typeof node.type === 'string' && node.props.children === '6m');
      expect(flat(waited!).color).toBe('#424242');
    },
  );

  test.each(THEME_PRESETS.filter((preset) => preset.mode === 'light').map((preset) => preset.id))(
    "light preset %s: a question's header reads on the light card",
    async (preset) => {
      useSettingsStore.getState().patchSettings(themePresetPatch(preset, false)!);
      const page = resolveAppearance(useSettingsStore.getState().settings, true);
      await renderScreen(FOLDED);
      expect(contrast(flat(screen.getByText('Key repeat')).color as string, page.card)).toBeGreaterThanOrEqual(4.5);
    },
  );

  test('dark: the same parts keep their dark look', async () => {
    // The default appearance follows the system, which is light under Jest; the dark look is asked for.
    useSettingsStore.getState().patchSettings({ sidebarTheme: 'dark-2' });
    mockDocuments.d = MULTI_SELECT;
    await renderScreen(FOLDED);
    for (const label of ['Deny', 'Open Question']) {
      expect(flat(screen.getByLabelText(label)).backgroundColor).toBe(GhostexPalette.NEUTRAL_FILL);
      expect(flat(screen.getByText(label)).color).toBe(resolveAppearance(useSettingsStore.getState().settings, false).foreground);
    }
    const command = screen.getByText(/bun test src\/components\/terminal/);
    const well = command.parent!;
    expect(flat(well).backgroundColor).toBe(resolveAppearance(useSettingsStore.getState().settings, false).background);
    const head = screen.getByLabelText('Open Beta, waiting 6m');
    const [waited] = head.queryAll((node) => typeof node.type === 'string' && node.props.children === '6m');
    expect(flat(waited!).color).toBe(SidebarPalette.ROW_TIME);
    expect(flat(screen.getByText('Pick')).color).toBe(askColor(false));
  });

  test.each(THEME_PRESETS.map((preset) => [preset.id, preset.mode] as const))(
    '%s (%s): "Sending…" on a picked option keeps 4.5:1 on its fill, at rest and pressed',
    async (preset, mode) => {
      useSettingsStore.getState().patchSettings(themePresetPatch(preset, false)!);
      await renderScreen(FOLDED);
      await fireEvent.press(screen.getByLabelText('Every 80 ms'));
      const option = screen.getByLabelText('Every 80 ms');
      let card = option.parent;
      while (card !== null && !String(flat(card).backgroundColor ?? '').startsWith('#')) card = card.parent;
      const cardFill = String(flat(card!).backgroundColor);
      const sending = flat(screen.getByText('Sending…')).color as string;
      for (const fill of [String(flat(option).backgroundColor), neutralButtonFills(mode === 'light').pressed]) {
        expect(contrast(sending, over(fill, cardFill))).toBeGreaterThanOrEqual(4.5);
      }
    },
  );
});
