/// <reference types="jest" />
/**
 * An announced open question card and a counted question draw the same row dots.
 * The parsed summary and real grouping feed the real list renderer and Sleep Below menu.
 * An older computer's unannounced field leaves the finished-turn status unchanged.
 */

import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { TestInstance } from 'test-renderer';

import { blocksFromItems } from '../../components/sessions/drawerModel';
import { buildDrawerItems, type SessionItem } from '../../contract/grouping';
import { parseMobileSummary, type GhostexMobileSummary } from '../../contract/mobileSummary';
import { SidebarPalette } from '../../theme/palette';
import { resolveSidebarAppearance } from '../../theme/sidebarAppearance';
import DrawerBlockView from './DrawerBlockView';
import { buildSessionMenu } from './sidebar-menus';

jest.mock('../../../modules/ghostex-native/src', () => ({
  GhostexNative: new Proxy({}, { get: () => () => Promise.resolve() }),
  GhostexTerminalView: () => null,
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-haptics', () => ({ impactAsync: () => Promise.resolve(), ImpactFeedbackStyle: { Light: 'light' } }));

const ANNOUNCED = { awaitingAnswer: true };

/** One project: OMP waiting on its question card, and an idle session below it that Sleep Below may sleep. */
function summaryFrom(capabilities: object | undefined): GhostexMobileSummary {
  const base = {
    projectId: 'p1',
    projectName: 'Project',
    provider: 'zmx',
    status: 'running',
    isLive: true,
    agent: 'omp',
    agentName: 'OMP',
  };
  const summary = parseMobileSummary(
    JSON.stringify({
      ok: true,
      projects: [{ projectId: 'p1', name: 'Project', path: '/work/project' }],
      sessions: [
        { ...base, sessionId: 'lead', title: 'Lead', activity: 'idle' },
        { ...base, sessionId: 'omp', title: 'Omp', activity: 'attention', awaitingAnswer: true },
        // A counted question (a Codex question or a question form): what the row has always drawn for a question.
        { ...base, sessionId: 'asked', title: 'Asked', activity: 'attention', pendingQuestionCount: 1 },
        { ...base, sessionId: 'rest', title: 'Rest', activity: 'idle' },
      ],
      ...(capabilities === undefined ? {} : { capabilities }),
    }),
  );
  if (summary === null) throw new Error('the fixture is not a mobile summary');
  return summary;
}

function drawn(summary: GhostexMobileSummary) {
  const items = buildDrawerItems({
    machineId: 'm1',
    summary,
    expandedProjectKeys: new Set(['id:p1']),
    expandedCollectionIds: new Set(),
    expandedGroupKeys: new Set(),
    collapsedSessionKindKeys: new Set(),
  });
  const block = blocksFromItems('m1', items).find((candidate) => candidate.kind === 'project');
  if (block === undefined) throw new Error('the fixture has no project block');
  const appearance = resolveSidebarAppearance('#808080', 90);
  const props = {
    block,
    selectedSessionKey: null,
    appearance,
    rowSurface: appearance.card,
    groupsOpacityPercent: 18,
    summary,
    voiceCallSessionKey: null,
    primaryAgent: () => null,
    hideStateCard: () => false,
    // Every action is an inert callback; the real renderer only calls these props in response to a gesture.
    actions: new Proxy({}, { get: () => () => undefined }) as never,
  };
  const item = (sessionId: string): SessionItem => {
    const found = items.find((entry): entry is SessionItem => entry.type === 'SESSION' && entry.session.sessionId === sessionId);
    if (found === undefined) throw new Error(`the fixture has no session ${sessionId}`);
    return found;
  };
  return { block, props, item };
}

function dotsOf(node: TestInstance, color: string): TestInstance[] {
  return node.queryAll((candidate) => StyleSheet.flatten(candidate.props.style)?.backgroundColor === color);
}

function rowOf(title: string): TestInstance {
  let row: TestInstance = screen.getByText(title);
  while (row.parent !== null && row.props.accessibilityRole !== 'button') row = row.parent;
  return row;
}

function sleepBelowOf(summary: GhostexMobileSummary): unknown {
  const { item } = drawn(summary);
  const lead = item('lead');
  const menu = buildSessionMenu({
    session: lead.session,
    capabilities: lead.capabilities,
    customTags: summary.customSessionTags,
    below: [item('omp').session, item('rest').session],
    threads: [],
    project: null,
  });
  const advanced = menu.flatMap((entry) => [entry, ...(entry.children ?? [])]);
  return advanced.find((entry) => entry.label === 'Sleep Below')?.command;
}

describe('from a computer that announces the field', () => {
  const summary = summaryFrom(ANNOUNCED);

  test('the list row draws what it draws for a counted question: the pink dot, no time', async () => {
    await render(<DrawerBlockView {...drawn(summary).props} />);
    for (const color of [SidebarPalette.ROW_QUESTION, SidebarPalette.ROW_ATTENTION]) {
      expect(dotsOf(rowOf('Omp'), color)).toHaveLength(dotsOf(rowOf('Asked'), color).length);
    }
    expect(dotsOf(rowOf('Omp'), SidebarPalette.ROW_QUESTION)).toHaveLength(1);
  });

  test('Sleep Below leaves it awake', () => {
    expect(sleepBelowOf(summary)).toEqual({
      type: 'command',
      message: { type: 'setSessionsSleeping', sessionIds: ['rest'], sleeping: true, source: 'sleepBelow' },
    });
  });
});

describe('from a computer that does not announce it, a finished turn as before', () => {
  const summary = summaryFrom(undefined);

  test('the row keeps its blue dot and Sleep Below reads it as done', async () => {
    await render(<DrawerBlockView {...drawn(summary).props} />);
    expect(dotsOf(rowOf('Omp'), SidebarPalette.ROW_QUESTION)).toHaveLength(0);
    expect(dotsOf(rowOf('Omp'), SidebarPalette.ROW_ATTENTION)).toHaveLength(1);
    // The counted question stays a question.
    expect(dotsOf(rowOf('Asked'), SidebarPalette.ROW_QUESTION)).toHaveLength(1);
    expect(sleepBelowOf(summary)).toEqual({
      type: 'command',
      message: { type: 'setSessionsSleeping', sessionIds: ['omp', 'rest'], sleeping: true, source: 'sleepBelow' },
    });
  });
});
