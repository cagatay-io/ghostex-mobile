/// <reference types="node" />
/**
 * Run with `bun test src/contract/grouping.test.ts`. The project header's Actions… entry and its list: the
 * project's own actions first, then the computer's Global Actions, under the desktop settings' section names
 * "Project Actions" and "Global Actions". An action is identified by its list (scope) and its commandId, because a
 * project action and a Global Action can share an id.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  lastRunEntry,
  quickActionEntries,
  quickActionListRows,
  type QuickActionEntry,
  type QuickActionRef,
} from '../actions/quickActions';
import { buildDrawerItems, type ProjectHeaderItem } from './grouping';
import { parseMobileSummary, type GhostexQuickAction } from './mobileSummary';

const TWO_PROJECT_ACTIONS = [
  { actionType: 'terminal', commandId: 'c1', name: 'Tests' },
  { actionType: 'browser', commandId: 'c3', name: 'Docs', url: 'http://localhost:3000/docs' },
];
const GLOBAL_ACTIONS = [
  { actionType: 'terminal', commandId: 'g1', name: 'Git Status' },
  { actionType: 'browser', commandId: 'c1', name: 'Status Page', url: 'https://example.com/' },
];

/** A project header with the Global Actions of the summary it was built from: the two inputs of the Actions… list. */
type MenuSource = { header: ProjectHeaderItem; globals: GhostexQuickAction[] };

function sourceOf(extra: object): MenuSource {
  const summary = parseMobileSummary(
    JSON.stringify({
      projects: [{ projectId: 'P1', name: 'Ghostex', path: '/repo/ghostex' }],
      sessions: [
        {
          sessionId: 's1',
          projectId: 'P1',
          projectName: 'Ghostex',
          projectPath: '/repo/ghostex',
          title: 's1',
          provider: 'zmx',
          isLive: true,
        },
      ],
      ...extra,
    }),
  );
  assert.ok(summary !== null);
  const items = buildDrawerItems({
    machineId: 'm1',
    summary,
    expandedProjectKeys: new Set(),
    expandedCollectionIds: new Set(),
    expandedGroupKeys: new Set(),
    collapsedSessionKindKeys: new Set(),
  });
  const found = items.find(
    (item): item is ProjectHeaderItem => item.type === 'PROJECT_HEADER' && item.projectId === 'P1',
  );
  assert.ok(found !== undefined);
  return { header: found, globals: summary.globalQuickActions };
}

const withGlobals = { globalQuickActions: GLOBAL_ACTIONS, capabilities: { globalQuickActions: true } };

/** The Actions… entries: the header's own actions, then the summary's Global Actions, as the menu passes them. */
function entriesOf(source: MenuSource): QuickActionEntry[] {
  return quickActionEntries(source.header.quickActions, source.globals);
}

/** The list the Actions… entry opens, as headings, separators and `scope:commandId` rows (`*` = last run). */
function listed(source: MenuSource, lastRun?: QuickActionRef): string[] {
  return quickActionListRows(entriesOf(source), lastRun).map((row) => {
    if (row.kind === 'heading') return `# ${row.label}`;
    if (row.kind === 'separator') return '---';
    return `${row.entry.scope}:${row.entry.action.commandId ?? ''}${row.selected ? ' *' : ''}`;
  });
}

describe('Actions… in the project header menu', () => {
  test('two project actions: the entry is there and lists both', () => {
    const source = sourceOf({ quickActionsByProject: { P1: TWO_PROJECT_ACTIONS } });
    assert.ok(lastRunEntry(entriesOf(source), undefined) !== null);
    assert.deepEqual(listed(source), ['# Project Actions', 'project:c1', 'project:c3']);
  });

  test('a global action is listed after the project actions', () => {
    const source = sourceOf({ quickActionsByProject: { P1: TWO_PROJECT_ACTIONS }, ...withGlobals });
    assert.deepEqual(listed(source), [
      '# Project Actions',
      'project:c1',
      'project:c3',
      '---',
      '# Global Actions',
      'global:g1',
      'global:c1',
    ]);
  });

  test('a project without actions of its own gets the entry for the global actions alone', () => {
    const source = sourceOf(withGlobals);
    assert.ok(lastRunEntry(entriesOf(source), undefined) !== null);
    assert.deepEqual(listed(source), ['# Global Actions', 'global:g1', 'global:c1']);
  });

  test('no actions at all: no Actions… entry', () => {
    const source = sourceOf({});
    assert.equal(lastRunEntry(entriesOf(source), undefined), null);
    assert.deepEqual(listed(source), []);
  });

  test('global actions without the capability are not listed', () => {
    const source = sourceOf({ globalQuickActions: GLOBAL_ACTIONS });
    assert.equal(lastRunEntry(entriesOf(source), undefined), null);
  });
});

describe('the last-run mark is keyed by scope and commandId', () => {
  const source = sourceOf({ quickActionsByProject: { P1: TWO_PROJECT_ACTIONS }, ...withGlobals });
  const entries = entriesOf(source);

  test('a global action sharing a project action id marks only the global one', () => {
    const lastRun: QuickActionRef = { scope: 'global', commandId: 'c1' };
    assert.deepEqual(
      listed(source, lastRun).filter((row) => row.endsWith('*')),
      ['global:c1 *'],
    );
    const entry = lastRunEntry(entries, lastRun);
    assert.equal(entry?.scope, 'global');
    // The entry's icon follows the last run: this Global c1 is a browser action, the project's c1 a terminal one.
    assert.equal(entry?.action.actionType, 'browser');
  });

  test('the project action marks only the project one', () => {
    const lastRun: QuickActionRef = { scope: 'project', commandId: 'c1' };
    assert.deepEqual(
      listed(source, lastRun).filter((row) => row.endsWith('*')),
      ['project:c1 *'],
    );
    assert.equal(lastRunEntry(entries, lastRun)?.action.actionType, 'terminal');
  });

  test('without a matching last run the entry shows the first action and nothing is marked', () => {
    const lastRun: QuickActionRef = { scope: 'global', commandId: 'c3' };
    assert.equal(lastRunEntry(entries, lastRun)?.action.commandId, 'c1');
    assert.equal(lastRunEntry(entries, lastRun)?.scope, 'project');
    assert.deepEqual(
      listed(source, lastRun).filter((row) => row.endsWith('*')),
      [],
    );
  });
});
