/// <reference types="node" />
/** Run with `bun test src/contract/groupingLayout.test.ts` from apps/mobile/app. The desktop rules are named on each test. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { buildDrawerItems, type DrawerBuildInput, type DrawerItem } from './grouping';
import { parseMobileSummary } from './mobileSummary';

function summary(sessions: object[], extra: object = {}) {
  const parsed = parseMobileSummary(
    JSON.stringify({
      ok: true,
      projects: [
        { projectId: 'P1', name: 'Ghostex', path: '/repo/ghostex' },
        { projectId: 'P2', name: 'Empty', path: '/repo/empty' },
      ],
      sessions,
      ...extra,
    }),
  );
  assert.ok(parsed !== null);
  return parsed;
}

function session(sessionId: string, overrides: object = {}) {
  return {
    sessionId,
    projectId: 'P1',
    title: sessionId,
    status: 'idle',
    activity: 'idle',
    isLive: true,
    provider: 'zmx',
    lastInteractionAt: '2026-10-27T10:00:00.000Z',
    createdAt: '2026-10-20T10:00:00.000Z',
    ...overrides,
  };
}

function build(input: Partial<DrawerBuildInput> & Pick<DrawerBuildInput, 'summary'>): DrawerItem[] {
  return buildDrawerItems({
    machineId: 'm1',
    nowMs: Date.parse('2026-10-27T12:00:00.000Z'),
    expandedProjectKeys: new Set(['id:P1', 'id:P2']),
    expandedCollectionIds: new Set(),
    expandedGroupKeys: new Set(),
    collapsedSessionKindKeys: new Set(),
    ...input,
  });
}

const labels = (items: DrawerItem[]) =>
  items.flatMap((item) => (item.type === 'SESSION_KIND_LABEL' ? [item.section] : []));
const sessionIds = (items: DrawerItem[]) =>
  items.flatMap((item) => (item.type === 'SESSION' ? [item.session.sessionId] : []));

describe('section headings (desktop native_sidebar/rows.rs hide_lone_sessions_heading)', () => {
  test('a project with only ordinary sessions shows no Sessions heading', () => {
    const items = build({ summary: summary([session('a'), session('b')]) });
    assert.deepEqual(labels(items), []);
    assert.deepEqual(sessionIds(items), ['a', 'b']);
  });

  test('a stored collapse of the hidden heading cannot hide its rows', () => {
    const items = build({
      summary: summary([session('a')]),
      collapsedSessionKindKeys: new Set(['id:P1|sessions']),
    });
    assert.deepEqual(sessionIds(items), ['a']);
  });

  test('a pinned row brings back both PINNED and SESSIONS', () => {
    const items = build({ summary: summary([session('a', { isPinned: true }), session('b')]) });
    assert.deepEqual(labels(items), ['pinned', 'sessions']);
  });
});

describe('an open project with no sessions (desktop rows.rs "New Session")', () => {
  test('shows the New Session row', () => {
    const items = build({ summary: summary([session('a')]) });
    const empty = items.find((item) => item.type === 'PROJECT_EMPTY');
    assert.ok(empty !== undefined && empty.type === 'PROJECT_EMPTY');
    assert.equal(empty.projectKey, 'id:P2');
    assert.equal(empty.text, 'New Session');
  });
});

describe('collapsed headers holding the open session (desktop project_header.rs collapsed_active)', () => {
  test('a collapsed project carries the highlight; an open one does not', () => {
    const data = summary([session('a')]);
    const header = (items: DrawerItem[]) =>
      items.find((item) => item.type === 'PROJECT_HEADER' && item.projectId === 'P1');
    const collapsed = header(build({ summary: data, activeSessionId: 'a', expandedProjectKeys: new Set() }));
    assert.equal(collapsed?.type === 'PROJECT_HEADER' && collapsed.containsActive, true);
    const open = header(build({ summary: data, activeSessionId: 'a' }));
    assert.equal(open?.type === 'PROJECT_HEADER' && open.containsActive, false);
    const other = header(build({ summary: data, activeSessionId: 'zzz', expandedProjectKeys: new Set() }));
    assert.equal(other?.type === 'PROJECT_HEADER' && other.containsActive, false);
  });

  test('a collapsed project group carries it too', () => {
    const data = summary([session('a')], {
      sidebarProjectCollections: {
        collections: { c1: { collectionId: 'c1', title: 'Apps', color: '#7da4f8', projectIds: ['P1'] } },
        order: ['c1'],
      },
    });
    const items = build({ summary: data, activeSessionId: 'a' });
    const collection = items.find((item) => item.type === 'COLLECTION_HEADER');
    assert.ok(collection !== undefined && collection.type === 'COLLECTION_HEADER');
    assert.equal(collection.collapsed, true);
    assert.equal(collection.containsActive, true);
  });

  test('a collapsed session group carries it', () => {
    const data = summary([session('a'), session('b')], {
      workspaceGroups: {
        projectOrder: ['P1', 'P2'],
        projects: { P1: { groups: [{ groupId: 'g1', title: 'Launch week', sessionIds: ['b'] }] } },
      },
    });
    const items = build({ summary: data, activeSessionId: 'b' });
    const group = items.find((item) => item.type === 'GROUP_HEADER');
    assert.ok(group !== undefined && group.type === 'GROUP_HEADER');
    assert.equal(group.containsActive, true);
    assert.deepEqual(sessionIds(items), ['a']);
  });
});
