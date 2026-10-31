/// <reference types="node" />
/**
 * Run with `bun test src/contract/mobileSummary.test.ts`. The Actions part of the mobile summary as the computer's
 * `ghostex sessions --json --mobile-summary` sends it: `quickActionsByProject`, `globalQuickActions` and
 * `capabilities.globalQuickActions`. A missing key means an empty list; Global Actions count only while the
 * capability is `true`.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { parseMobileSummary, withoutGlobalQuickActions, type GhostexMobileSummary } from './mobileSummary';

function parse(extra: object): GhostexMobileSummary {
  const parsed = parseMobileSummary(JSON.stringify({ sessions: [], ...extra }));
  assert.ok(parsed !== null);
  return parsed;
}

const projectActions = {
  P1: [
    { actionType: 'terminal', commandId: 'c1', name: 'Tests', icon: 'flask' },
    { actionType: 'browser', commandId: 'c3', name: 'Docs', url: 'http://localhost:3000/docs' },
    { actionType: 'shell', commandId: 'x', name: 'Unknown type' },
  ],
};

const globalActions = [
  { actionType: 'terminal', commandId: 'g1', name: 'Git Status' },
  { actionType: 'browser', commandId: 'g2', name: 'Status Page', url: 'https://example.com/', icon: 'world' },
  { actionType: 'other', commandId: 'g9', name: 'Unknown type' },
];

describe('global actions in the mobile summary', () => {
  test('an older computer without the field parses, with no global actions', () => {
    const summary = parse({ quickActionsByProject: projectActions });
    assert.deepEqual(summary.globalQuickActions, []);
    assert.equal(summary.globalQuickActionsSupported, false);
    assert.equal(summary.quickActionsByProject.P1.length, 2);
  });

  test('lists the global actions in the computer order, with the fields a project action has', () => {
    const summary = parse({ globalQuickActions: globalActions, capabilities: { globalQuickActions: true } });
    assert.equal(summary.globalQuickActionsSupported, true);
    assert.deepEqual(summary.globalQuickActions, [
      { actionType: 'terminal', commandId: 'g1', url: '', icon: '', name: 'Git Status' },
      { actionType: 'browser', commandId: 'g2', url: 'https://example.com/', icon: 'world', name: 'Status Page' },
    ]);
  });

  test('without the capability, or with any value but true, no global action is listed', () => {
    for (const capabilities of [undefined, {}, { globalQuickActions: false }, { globalQuickActions: 'true' }, 1]) {
      const summary = parse({ globalQuickActions: globalActions, capabilities });
      assert.deepEqual(summary.globalQuickActions, [], JSON.stringify(capabilities));
      assert.equal(summary.globalQuickActionsSupported, false, JSON.stringify(capabilities));
    }
  });

  test('a summary whose action read failed has the capability but neither list: both are empty', () => {
    const summary = parse({ capabilities: { globalQuickActions: true } });
    assert.equal(summary.globalQuickActionsSupported, true);
    assert.deepEqual(summary.globalQuickActions, []);
    assert.deepEqual(summary.quickActionsByProject, {});
  });

  test('a global list that is not an array counts as empty', () => {
    const summary = parse({ globalQuickActions: { g1: {} }, capabilities: { globalQuickActions: true } });
    assert.deepEqual(summary.globalQuickActions, []);
  });

  test('the other capabilities the computer sends do not change the actions', () => {
    const summary = parse({
      quickActionsByProject: projectActions,
      globalQuickActions: globalActions,
      capabilities: { globalQuickActions: true, somethingElse: true },
    });
    assert.equal(summary.globalQuickActions.length, 2);
    assert.equal(summary.quickActionsByProject.P1.length, 2);
  });
});

describe('project actions parse as before', () => {
  test('same entries, same fields, unknown types dropped, with or without global actions', () => {
    const expected = {
      P1: [
        { actionType: 'terminal', commandId: 'c1', url: '', icon: 'flask', name: 'Tests' },
        { actionType: 'browser', commandId: 'c3', url: 'http://localhost:3000/docs', icon: '', name: 'Docs' },
      ],
    };
    assert.deepEqual(parse({ quickActionsByProject: projectActions }).quickActionsByProject, expected);
    assert.deepEqual(
      parse({
        quickActionsByProject: projectActions,
        globalQuickActions: globalActions,
        capabilities: { globalQuickActions: true },
      }).quickActionsByProject,
      expected,
    );
  });
});

describe('dropping cached global actions', () => {
  test('removes the global actions and the capability, and keeps everything else', () => {
    const summary = parse({
      quickActionsByProject: projectActions,
      globalQuickActions: globalActions,
      capabilities: { globalQuickActions: true },
    });
    const dropped = withoutGlobalQuickActions(summary);
    assert.deepEqual(dropped.globalQuickActions, []);
    assert.equal(dropped.globalQuickActionsSupported, false);
    assert.deepEqual(dropped, { ...summary, globalQuickActions: [], globalQuickActionsSupported: false });
    // The cached summary itself is not changed.
    assert.equal(summary.globalQuickActions.length, 2);
  });
});
