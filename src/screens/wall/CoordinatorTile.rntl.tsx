/// <reference types="jest" />
/**
 * A tile shows what its list row shows, also for a coordinator whose threads are folded: its row carries the dots of
 * the threads the fold hides (`RowNesting.foldedStatus`), so a thread waiting for approval is the red dot on the
 * coordinator's row and, as tiles, on the coordinator's tile. The block comes from the real summary parser and
 * grouping and is drawn by the real `DrawerBlockView`, once as rows and once as tiles; the expectation is the list
 * row's own dot.
 */

import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { TestInstance } from 'test-renderer';

import { blocksFromItems } from '../../components/sessions/drawerModel';
import { coordinatorRowKey } from '../../contract/coordinatorTree';
import { buildDrawerItems, type SessionItem } from '../../contract/grouping';
import { parseMobileSummary } from '../../contract/mobileSummary';
import { SidebarPalette } from '../../theme/palette';
import { resolveSidebarAppearance } from '../../theme/sidebarAppearance';
import DrawerBlockView from '../sessions-screen/DrawerBlockView';
import { wallTargets } from './previews';

jest.mock('../../../modules/ghostex-native/src', () => ({
  GhostexNative: new Proxy({}, { get: () => () => Promise.resolve() }),
  GhostexTerminalView: () => null,
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-haptics', () => ({ impactAsync: () => Promise.resolve(), ImpactFeedbackStyle: { Light: 'light' } }));

const summary = parseMobileSummary(
  JSON.stringify({
    ok: true,
    projects: [{ projectId: 'p1', name: 'Project', path: '/work/project' }],
    sessions: [
      {
        sessionId: 'lead',
        projectId: 'p1',
        title: 'Lead',
        provider: 'zmx',
        status: 'running',
        isLive: true,
        coordinatorRole: 'coordinator',
        activity: 'idle',
        agentIcon: 'claude',
        agentName: 'Claude',
      },
      {
        sessionId: 'thread',
        projectId: 'p1',
        title: 'Thread',
        provider: 'zmx',
        status: 'running',
        isLive: true,
        coordinatorProjectId: 'p1',
        coordinatorSessionId: 'lead',
        coordinatorThreadState: 'waiting',
        activity: 'attention',
        awaitingApproval: true,
        agentIcon: 'claude',
        agentName: 'Claude',
      },
    ],
  }),
)!;
const lead = summary.sessions.find((session) => session.sessionId === 'lead')!;
const items = buildDrawerItems({
  machineId: 'm1',
  summary,
  expandedProjectKeys: new Set(['id:p1']),
  expandedCollectionIds: new Set(),
  expandedGroupKeys: new Set(),
  collapsedSessionKindKeys: new Set(),
  collapsedCoordinatorKeys: new Set([coordinatorRowKey(lead)]),
});
const block = blocksFromItems('m1', items).find((candidate) => candidate.kind === 'project')!;
const leadItem = items.find((item) => item.type === 'SESSION' && item.session.sessionId === 'lead') as SessionItem;
const appearance = resolveSidebarAppearance('#808080', 90);
const actions = new Proxy({}, { get: () => () => undefined });
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
  actions: actions as never,
};

function approvalDots(node: TestInstance): TestInstance[] {
  return node.queryAll(
    (candidate) => StyleSheet.flatten(candidate.props.style)?.backgroundColor === SidebarPalette.ROW_APPROVAL,
  );
}

test("a folded coordinator's tile shows the approval its row shows for a hidden thread", async () => {
  // The fold hides the thread (no row, no tile) and hands its approval to the coordinator's row.
  expect(leadItem.nesting?.foldedStatus?.approval).toBe(true);
  expect(items.some((item) => item.type === 'SESSION' && item.session.sessionId === 'thread')).toBe(false);
  expect(wallTargets([block]).map((target) => target.sessionId)).toEqual(['lead']);

  await render(<DrawerBlockView {...props} />);
  let row: TestInstance = screen.getByText('Lead');
  while (row.parent !== null && row.props.accessibilityRole !== 'button') row = row.parent;
  expect(approvalDots(row)).toHaveLength(1);

  await screen.rerender(<DrawerBlockView {...props} tileColumns={2} />);
  const tile = screen.getByRole('button', { name: 'Lead, Waiting for approval' });
  expect(approvalDots(tile)).toHaveLength(1);
  expect(screen.getByText('Waiting for approval')).toBeTruthy();
});
