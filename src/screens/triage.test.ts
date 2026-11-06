/**
 * Run with `bun test src/screens/triage.test.ts`. The folded triage on the iPhone Duo's outer display: which sessions
 * wait for the user and in which order, what each entry offers (Allow and Deny, a question's options, "Open Question",
 * short replies), and what a tap sends.
 *
 * The expectations come from the chat's own cards, never from the triage module: Allow and Deny
 * are the actions `ApprovalCard` dispatches into the session's chat core, an option is the action `QuestionCard`'s
 * option row dispatches (both written out here as the cards wrote them before the triage shared them); the chat core
 * builds the `answerSessionChatPrompt` request from that action, so the same action gives the same request. The core
 * itself runs only as WebAssembly in the app's hidden WebView, so the measured carrier is the action handed to the
 * session's chat core, not the network bytes; `src/screens/triage/FoldedTriage.rntl.tsx` taps the real cards and the
 * real triage into one fake chat host. A short reply goes out as the chat's send in Chat View and as the computer's
 * `send-message` (typed and submitted in the session's terminal) in Terminal View; the fake send adapter logs the
 * commands.
 */

import { describe, expect, test } from 'bun:test';

import type { Json } from '../chat/rust/document';
import { approvalAnswer, questionOptionAnswer } from '../chat/native/cards/answers';
import { obj } from '../chat/native/cards/json';
import { parseMobileSummary, type GhostexMobileSummary, type GhostexSession } from '../contract/mobileSummary';
import { EMPTY_UNIFIED_FILTER, type UnifiedFilter } from '../contract/unified/build';
import { unifiedListOf, unifiedSettingsOf } from '../contract/unified/fromSummary';
import { sendShortReply } from './triage/actions';
import { foldedOuterDisplay, triageEntry, triageSessions, unifiedTriageWaits, waitsForUser } from './triage/model';
import type { TriageDocument } from './triage/model';

/** A fixed instant the waits are measured back from. */
const NOW = 1_800_000_000_000;
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

function summary(sessions: object[], capabilities: object = { awaitingAnswer: true }): GhostexMobileSummary {
  const parsed = parseMobileSummary(
    JSON.stringify({
      ok: true,
      capabilities,
      projects: [{ projectId: 'p1', name: 'ghostex-mobile', path: '/work/ghostex-mobile' }],
      sessions: sessions.map((overrides) => ({
        projectId: 'p1',
        agentIcon: 'claude',
        agentName: 'Claude',
        status: 'running',
        activity: 'idle',
        isLive: true,
        provider: 'zmx',
        ...overrides,
      })),
    }),
  );
  if (parsed === null) throw new Error('The fixture is not a session list.');
  return parsed;
}

function one(overrides: object, capabilities?: object): { session: GhostexSession; summary: GhostexMobileSummary } {
  const parsed = summary([{ sessionId: 's', title: 'Session', ...overrides }], capabilities);
  return { session: parsed.sessions[0]!, summary: parsed };
}

const OPTIONS = [{ label: 'Every 50 ms' }, { label: 'Every 80 ms' }, { label: 'Follow the iOS key repeat' }];

function questionDocument(
  question: Record<string, Json>,
  extraQuestions: Record<string, Json>[] = [],
): TriageDocument {
  return {
    terminalNotice: null,
    noticeVisible: false,
    prompt: {
      kind: 'question',
      questions: [
        { header: 'Key repeat', question: 'How fast should a held arrow key repeat?', ...question },
        ...extraQuestions,
      ],
    },
    questionCard: {
      visible: true,
      questionIndex: 0,
      controls: { hasAnswer: false, disabled: true, label: 'Submit' },
      drafts: [],
      answering: false,
      busy: false,
      loading: false,
    },
  };
}

function approvalDocument(): TriageDocument {
  return {
    terminalNotice: null,
    noticeVisible: false,
    prompt: { kind: 'approval', tool: 'Bash', summary: 'bun test src/components/terminal' },
    questionCard: {
      visible: true,
      questionIndex: 0,
      controls: { hasAnswer: false, disabled: false, label: '' },
      drafts: [],
      answering: false,
      busy: false,
      loading: false,
      approvalTitle: 'Claude Code wants to run a command',
      approvalDetail: 'Bash · in ~/Projects/ghostex-mobile',
    },
  };
}

describe('which sessions wait for the user', () => {
  test('waiting: the blue attention dot, the red approval dot, a pending question; working or idle: not', () => {
    expect(
      waitsForUser(one({ activity: 'attention' }).session, { awaitingAnswer: true, attentionNotificationId: false }),
    ).toBe(true);
    expect(
      waitsForUser(one({ awaitingApproval: true }).session, { awaitingAnswer: true, attentionNotificationId: false }),
    ).toBe(true);
    expect(
      waitsForUser(one({ pendingQuestionCount: 1 }).session, { awaitingAnswer: false, attentionNotificationId: false }),
    ).toBe(true);
    expect(
      waitsForUser(one({ activity: 'working' }).session, { awaitingAnswer: true, attentionNotificationId: false }),
    ).toBe(false);
    expect(
      waitsForUser(one({ activity: 'idle' }).session, { awaitingAnswer: true, attentionNotificationId: false }),
    ).toBe(false);
  });

  test('an open question card counts, also while the agent works, but only from a computer that announces the field', () => {
    const working = one({ activity: 'working', awaitingAnswer: true });
    expect(waitsForUser(working.session, working.summary.capabilities)).toBe(true);
    const unannounced = one({ activity: 'working', awaitingAnswer: true }, {});
    expect(waitsForUser(unannounced.session, unannounced.summary.capabilities)).toBe(false);
  });

  test('a finished turn does not wait; one still holding an approval or a question does', () => {
    const capabilities = { awaitingAnswer: true, attentionNotificationId: false };
    const finished = { activity: 'attention', attention: { enteredAt: minutesAgo(1), kind: 'finished' } };
    expect(waitsForUser(one(finished).session, capabilities)).toBe(false);
    expect(waitsForUser(one({ ...finished, awaitingApproval: true }).session, capabilities)).toBe(true);
    expect(waitsForUser(one({ ...finished, awaitingAnswer: true }).session, capabilities)).toBe(true);
    expect(waitsForUser(one({ ...finished, pendingQuestionCount: 1 }).session, capabilities)).toBe(true);
  });

  test('a wait for input without a question waits; an attention without a kind (an older computer) still counts', () => {
    const capabilities = { awaitingAnswer: true, attentionNotificationId: false };
    const needsInput = { activity: 'attention', attention: { enteredAt: minutesAgo(1), kind: 'needsInput' } };
    expect(waitsForUser(one(needsInput).session, capabilities)).toBe(true);
    const noKind = one({ activity: 'attention', attention: { enteredAt: minutesAgo(1) } });
    expect(waitsForUser(noKind.session, capabilities)).toBe(true);
  });

  test('a finished turn stays out of the triage and keeps its place in the normal list', () => {
    const parsed = summary([
      {
        sessionId: 'w',
        title: 'W',
        activity: 'attention',
        attention: { enteredAt: minutesAgo(5), kind: 'needsInput' },
      },
      { sessionId: 'd', title: 'D', activity: 'attention', attention: { enteredAt: minutesAgo(8), kind: 'finished' } },
    ]);
    expect(triageSessions(parsed).map((session) => session.sessionId)).toEqual(['w']);
    expect(parsed.sessions.map((session) => session.sessionId)).toEqual(['w', 'd']);
  });

  test('two waiting sessions among five others are the triage, the one waiting longest first', () => {
    const parsed = summary([
      { sessionId: 'a', title: 'A', activity: 'working' },
      { sessionId: 'b', title: 'B', activity: 'attention', attention: { enteredAt: minutesAgo(1) } },
      { sessionId: 'c', title: 'C', activity: 'idle' },
      { sessionId: 'd', title: 'D', activity: 'working' },
      { sessionId: 'e', title: 'E', activity: 'attention', attention: { enteredAt: minutesAgo(6) } },
      { sessionId: 'f', title: 'F', activity: 'idle' },
      { sessionId: 'g', title: 'G', activity: 'working' },
    ]);
    expect(triageSessions(parsed).map((session) => session.sessionId)).toEqual(['e', 'b']);
  });

  test('a wait without a known start (an approval outside attention) follows the ones with one', () => {
    const parsed = summary([
      { sessionId: 'x', title: 'X', awaitingApproval: true },
      { sessionId: 'y', title: 'Y', activity: 'attention', attention: { enteredAt: minutesAgo(2) } },
    ]);
    expect(triageSessions(parsed).map((session) => session.sessionId)).toEqual(['y', 'x']);
  });
});

describe('the outer display of the folded iPhone Duo', () => {
  test('folded: the header in the status band (or a side bar) and no fold divisions', () => {
    expect(foldedOuterDisplay('band', [])).toBe(true);
    expect(foldedOuterDisplay('band', undefined)).toBe(true);
    expect(foldedOuterDisplay('rail', [])).toBe(true);
  });

  test('not folded: the inner display (it reports the fold), every other iPhone and Android (header on top)', () => {
    expect(foldedOuterDisplay('band', [{ x: 0, y: 455.5, width: 669, height: 40, active: false }])).toBe(false);
    expect(foldedOuterDisplay('rail', [{ x: 455.5, y: 0, width: 40, height: 669, active: false }])).toBe(false);
    expect(foldedOuterDisplay('top', [])).toBe(false);
    expect(foldedOuterDisplay('top', undefined)).toBe(false);
  });
});

describe('the Unified list: its waiting sessions, every computer it shows', () => {
  const studio = { id: 'm1', name: 'Studio Mac' };
  const mini = { id: 'm2', name: 'Mini' };
  const studioSummary = summary([
    { sessionId: 'a', title: 'A', activity: 'working' },
    { sessionId: 'b', title: 'B', activity: 'attention', attention: { enteredAt: minutesAgo(6) } },
    { sessionId: 'c', title: 'C', activity: 'idle', isParked: true },
    { sessionId: 'd', title: 'Deploy notes', awaitingAnswer: true, attention: { enteredAt: minutesAgo(3) } },
    // A finished turn: in the Unified list, not in the triage.
    { sessionId: 'p', title: 'P', activity: 'attention', attention: { enteredAt: minutesAgo(8), kind: 'finished' } },
  ]);
  const miniSummary = summary(
    [
      { sessionId: 'm', title: 'M', awaitingApproval: true, attention: { enteredAt: minutesAgo(9) } },
      { sessionId: 'n', title: 'N', activity: 'attention', isPinned: true, attention: { enteredAt: minutesAgo(1) } },
      { sessionId: 'o', title: 'O', pendingQuestionCount: 1 },
    ],
    {},
  );
  const summaries: Record<string, GhostexMobileSummary> = { m1: studioSummary, m2: miniSummary };
  /** The waiting sessions over the list as upstream's Unified list builds it for these two computers and `filter`. */
  const waits = (filter: UnifiedFilter) =>
    unifiedTriageWaits(
      unifiedListOf(
        [
          { machineId: 'm1', label: 'Studio Mac', summary: studioSummary, workspaceId: null },
          { machineId: 'm2', label: 'Mini', summary: miniSummary, workspaceId: null },
        ],
        unifiedSettingsOf(studioSummary),
        filter,
        NOW,
      ),
      [studio, mini],
      (machineId) => summaries[machineId] ?? null,
    ).map(({ machine, session }) => `${machine.id}:${session.sessionId}`);

  test("both computers' waiting sessions, the one waiting longest first; working and idle ones, wherever they sit, not", () => {
    expect(waits(EMPTY_UNIFIED_FILTER)).toEqual(['m2:m', 'm1:b', 'm1:d', 'm2:n', 'm2:o']);
  });

  test("each session counts by its own computer's rules: an open question card only from one that announces it", () => {
    const unannounced = {
      ...miniSummary,
      sessions: [{ ...miniSummary.sessions[0]!, awaitingApproval: false, awaitingAnswer: true }],
    };
    const list = unifiedListOf(
      [{ machineId: 'm2', label: 'Mini', summary: unannounced, workspaceId: null }],
      unifiedSettingsOf(unannounced),
      EMPTY_UNIFIED_FILTER,
      NOW,
    );
    expect(unifiedTriageWaits(list, [mini], () => unannounced)).toEqual([]);
  });

  test("the Unified filter's scope is the triage's: one computer picked, only its waiting sessions", () => {
    expect(waits({ ...EMPTY_UNIFIED_FILTER, machines: ['m2'] })).toEqual(['m2:m', 'm2:n', 'm2:o']);
    expect(waits({ ...EMPTY_UNIFIED_FILTER, query: 'deploy' })).toEqual(['m1:d']);
  });
});

describe('approve and deny from the triage', () => {
  test('a session waiting for approval offers the approval with its command', () => {
    const { session, summary: parsed } = one({ activity: 'attention', awaitingApproval: true });
    expect(triageEntry(session, parsed.capabilities, approvalDocument())).toMatchObject({
      kind: 'approval',
      title: 'Claude Code wants to run a command',
      detail: 'Bash · in ~/Projects/ghostex-mobile',
      command: 'bun test src/components/terminal',
    });
  });

  test('the stored approval keeps the chat card labels and answers on the entry', () => {
    const { session, summary: parsed } = one({ awaitingApproval: true });
    expect(triageEntry(session, parsed.capabilities, approvalDocument())).toMatchObject({
      kind: 'approval',
      approve: { label: 'Allow', action: { type: 'answer', answer: { kind: 'approval', approvalSend: '1' } } },
      deny: { label: 'Deny', action: { type: 'answer', answer: { kind: 'approval', approvalSend: '' } } },
    });
  });

  test('permission rows use only the folded positions, labels and answers; question notices stay questions', () => {
    const { session, summary: parsed } = one({ awaitingApproval: true });
    const document: TriageDocument = {
      ...approvalDocument(),
      questionCard: { ...approvalDocument().questionCard, visible: false },
      noticeVisible: true,
      terminalNotice: {
        kind: 'permissionPrompt',
        title: 'Run the checks?',
        collapsedDetail: '$ bun test',
        collapsedChoices: [0, 2],
        choices: [
          { label: 'Proceed once (y)', collapsedLabel: 'Proceed once', answer: { kind: 'terminalChoice', choiceIndex: 4 } },
          { label: 'Always proceed', collapsedLabel: 'Always proceed', answer: { kind: 'terminalChoice', choiceIndex: 7 } },
          { label: 'Decline (n)', collapsedLabel: 'Decline', answer: { kind: 'terminalChoice', choiceIndex: 9 } },
        ],
      },
    };
    expect(triageEntry(session, parsed.capabilities, document)).toMatchObject({
      kind: 'approval',
      title: 'Run the checks?',
      command: '$ bun test',
      approve: { label: 'Proceed once', action: { type: 'answer', answer: { kind: 'terminalChoice', choiceIndex: 4 } } },
      deny: { label: 'Decline', action: { type: 'answer', answer: { kind: 'terminalChoice', choiceIndex: 9 } } },
    });
    expect(triageEntry(session, parsed.capabilities, { ...document, noticeVisible: false })).toEqual({
      kind: 'approvalInSession',
    });
    const question = one({ awaitingAnswer: true });
    expect(
      triageEntry(question.session, question.summary.capabilities, {
        ...document,
        prompt: { kind: 'question' },
        terminalNotice: { ...obj(document.terminalNotice), kind: 'questionPrompt' },
      }),
    ).toEqual({ kind: 'openQuestion', reason: null, header: '', text: '', steps: 1 });
  });

  test("Approve sends the answer the chat's Allow button sends", () => {
    // ApprovalCard's Allow: dispatch({ type: 'answer', answer: { kind: 'approval', approvalSend: '1' } }).
    expect(approvalAnswer(true)).toEqual({ type: 'answer', answer: { kind: 'approval', approvalSend: '1' } });
  });

  test("Deny sends the answer the chat's Deny button sends", () => {
    // ApprovalCard's Deny: dispatch({ type: 'answer', answer: { kind: 'approval', approvalSend: '' } }).
    expect(approvalAnswer(false)).toEqual({ type: 'answer', answer: { kind: 'approval', approvalSend: '' } });
  });

  test('an approval the chat does not show (read from the screen only, or the chat not loaded yet) has no buttons', () => {
    const { session, summary: parsed } = one({ awaitingApproval: true });
    expect(triageEntry(session, parsed.capabilities, null)).toEqual({ kind: 'approvalInSession' });
  });
});

describe('answer a question from the triage', () => {
  test('a single-select question with three options and optional free text has three option buttons', () => {
    const { session, summary: parsed } = one({ activity: 'attention', awaitingAnswer: true });
    const entry = triageEntry(session, parsed.capabilities, questionDocument({ options: OPTIONS }));
    expect(entry).toMatchObject({
      kind: 'question',
      header: 'Key repeat',
      text: 'How fast should a held arrow key repeat?',
      options: ['Every 50 ms', 'Every 80 ms', 'Follow the iOS key repeat'],
    });
  });

  test("tapping the second option sends what QuestionCard's second option sends", () => {
    // QuestionCard's option row: dispatch({ type: 'questionOption', index: optionIndex }).
    expect(questionOptionAnswer(1)).toEqual({ type: 'questionOption', index: 1 });
  });

  test('without free text the options still answer it completely', () => {
    const { session, summary: parsed } = one({ awaitingAnswer: true });
    const entry = triageEntry(session, parsed.capabilities, questionDocument({ options: OPTIONS, allowCustom: false }));
    expect(entry.kind).toBe('question');
  });

  test('questions buttons cannot answer completely offer to open the question', () => {
    const { session, summary: parsed } = one({ activity: 'attention', awaitingAnswer: true });
    expect(
      triageEntry(session, parsed.capabilities, questionDocument({ options: OPTIONS, multiSelect: true })),
    ).toMatchObject({
      kind: 'openQuestion',
      text: 'How fast should a held arrow key repeat?',
      reason: 'multiSelect',
    });
    expect(
      triageEntry(
        session,
        parsed.capabilities,
        questionDocument({ options: OPTIONS }, [{ question: 'Also for Tab?', options: OPTIONS }]),
      ),
    ).toMatchObject({ kind: 'openQuestion', reason: 'steps', steps: 2 });
    expect(triageEntry(session, parsed.capabilities, questionDocument({ options: [] }))).toMatchObject({
      kind: 'openQuestion',
      reason: 'text',
    });
  });

  test('a question the chat has no card for (a form or an async question) only offers to open it', () => {
    const { session, summary: parsed } = one({ activity: 'attention', pendingQuestionCount: 1 });
    expect(triageEntry(session, parsed.capabilities, null)).toEqual({
      kind: 'openQuestion',
      reason: null,
      header: '',
      text: '',
      steps: 1,
    });
  });
});

describe('short replies', () => {
  test('another waiting session gets the short replies; approvals and questions do not', () => {
    const waiting = one({ activity: 'attention' });
    expect(triageEntry(waiting.session, waiting.summary.capabilities, null)).toEqual({ kind: 'reply' });
  });

  const machine = { id: 'm1', name: 'Studio Mac', host: 'mac.local', username: 'me', port: 22 };

  test('Chat View: tapping "ja" sends one chat message "ja" to that session', async () => {
    const sent: string[] = [];
    const acknowledged: string[] = [];
    const { session } = one({ sessionId: 'S', activity: 'attention' });
    await sendShortReply({ machine, session, chatView: true }, 'ja', {
      run: async (_machine, command) => {
        sent.push(command);
      },
      acknowledge: (machineId, sessionId) => acknowledged.push(`${machineId}:${sessionId}`),
    });
    expect(sent).toEqual(["ghostex send-session-chat-message --session-id 'S' --project-id 'p1' --text 'ja' --json"]);
    expect(acknowledged).toEqual(['m1:S']);
  });

  test('Terminal View: tapping "ja" types "ja" into that session\'s terminal and submits it, once', async () => {
    const sent: string[] = [];
    const { session } = one({ sessionId: 'S', activity: 'attention' });
    await sendShortReply({ machine, session, chatView: false }, 'ja', {
      run: async (_machine, command) => {
        sent.push(command);
      },
      acknowledge: () => undefined,
    });
    expect(sent).toEqual(["ghostex send-message --session-id 'S' --project-id 'p1' --text='ja' --json"]);
  });

  test('a failed send is reported and acknowledges nothing', async () => {
    const acknowledged: string[] = [];
    const { session } = one({ sessionId: 'S', activity: 'attention' });
    const sending = sendShortReply({ machine, session, chatView: true }, 'ja', {
      run: () => Promise.reject(new Error('Cannot reach machine')),
      acknowledge: (machineId, sessionId) => acknowledged.push(`${machineId}:${sessionId}`),
    });
    await expect(sending).rejects.toThrow('Cannot reach machine');
    expect(acknowledged).toEqual([]);
  });
});
