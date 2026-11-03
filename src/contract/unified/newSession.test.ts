/// <reference types="node" />
/** Where a new session starts on the phone: the rules `choices.ts`, `saved.ts` and `projectList.ts` port from gx-core. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  defaultMachine,
  moveProjectChoiceMachine,
  unifiedNewSessionTarget,
  widenFilterForNewSession,
  type UnifiedProjectChoice,
} from './choices';
import { projectPickerRows } from './projectList';
import { EMPTY_UNIFIED_SAVED, parseUnifiedSaved, rememberNewSession, serializeUnifiedSaved } from './saved';

const choice = (repoKey: string, machines: [string, boolean][], extra: Partial<UnifiedProjectChoice> = {}): UnifiedProjectChoice => ({
  repoKey,
  label: repoKey,
  machines: machines.map(([machineId, connected]) => ({ machineId, label: machineId, connected, projectId: `${repoKey}@${machineId}` })),
  selected: 0,
  hasSessions: true,
  recent: false,
  ...extra,
});

describe('the machine a project starts on', () => {
  test('the last one used for it, skipping one that is not connected', () => {
    const acme = choice('acme', [['mac', true], ['studio', false], ['pc', true]]);
    assert.equal(defaultMachine(acme, { acme: 'pc' }, 'mac'), 2);
    assert.equal(defaultMachine(acme, { acme: 'studio' }, 'pc'), 2);
    assert.equal(defaultMachine(acme, {}, 'nowhere'), 0);
    assert.equal(defaultMachine(choice('solo', [['studio', false]]), {}, 'mac'), 0);
  });
  test('the chips step over a machine that is not connected', () => {
    const acme = choice('acme', [['mac', true], ['studio', false], ['pc', true]]);
    assert.equal(moveProjectChoiceMachine(acme, true), 2);
    assert.equal(moveProjectChoiceMachine({ ...acme, selected: 2 }, false), 0);
    assert.equal(moveProjectChoiceMachine({ ...acme, selected: 2 }, true), 2);
  });
});

describe('where the pencil aims', () => {
  const choices = [choice('acme', [['mac', true]]), choice('zebra', [['mac', true], ['pc', true]], { selected: 1 })];
  test('the open project wins, worktree and all', () => {
    assert.deepEqual(unifiedNewSessionTarget({ repos: [] }, choices, { repoKey: 'zebra', machineId: 'mac', projectId: 'wt' }), {
      repoKey: 'zebra',
      machineId: 'mac',
      projectId: 'wt',
    });
  });
  test('one filtered project wins unless the open one is in it', () => {
    const open = { repoKey: 'acme', machineId: 'mac', projectId: 'acme@mac' };
    assert.deepEqual(unifiedNewSessionTarget({ repos: ['zebra'] }, choices, open), {
      repoKey: 'zebra',
      machineId: 'pc',
      projectId: 'zebra@pc',
    });
    assert.deepEqual(unifiedNewSessionTarget({ repos: ['acme'] }, choices, open), open);
  });
  test('nothing open: the first project', () => {
    assert.equal(unifiedNewSessionTarget({ repos: [] }, choices, null)?.repoKey, 'acme');
    assert.equal(unifiedNewSessionTarget({ repos: [] }, [], null), null);
  });
});

describe('after a session starts', () => {
  test('the filter gains only the kinds that are picked', () => {
    const widened = widenFilterForNewSession({ repos: ['b'], machines: [], spaces: ['mac|s'], query: 'x' }, 'a', 'pc', 'pc|t');
    assert.deepEqual(widened, { repos: ['a', 'b'], machines: [], spaces: ['mac|s', 'pc|t'], query: 'x' });
  });
  test('its repository tops Recent, five at most, and its machine is remembered', () => {
    let state = EMPTY_UNIFIED_SAVED;
    for (const repo of ['a', 'b', 'c', 'd', 'e', 'f']) state = { ...state, ...rememberNewSession(state, repo, 'mac') };
    state = { ...state, ...rememberNewSession(state, 'c', 'pc') };
    assert.deepEqual(state.recentRepos, ['c', 'f', 'e', 'd', 'b']);
    assert.equal(state.lastMachines.c, 'pc');
    assert.deepEqual(parseUnifiedSaved(serializeUnifiedSaved(state)).recentRepos, state.recentRepos);
  });
});

describe('the project list', () => {
  const choices = [choice('quiet', [['mac', true]], { recent: true, hasSessions: false }), choice('acme', [['mac', true]])];
  test('Recent and All projects headings while nothing is typed', () => {
    assert.deepEqual(
      projectPickerRows(choices, '').map((row) => (row.kind === 'heading' ? row.label : row.choice.repoKey)),
      ['Recent', 'quiet', 'All projects', 'acme'],
    );
  });
  test('no headings while typing, or with nothing recent', () => {
    assert.deepEqual(projectPickerRows(choices, 'acm').map((row) => row.key), ['acme']);
    assert.ok(projectPickerRows([choices[1]!], '').every((row) => row.kind === 'project'));
  });
});
