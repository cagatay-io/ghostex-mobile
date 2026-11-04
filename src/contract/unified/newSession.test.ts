/// <reference types="node" />
/** Where a new session starts on the phone: the rules `choices.ts`, `saved.ts` and `projectList.ts` port from gx-core. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  defaultMachine,
  filterProjectChoices,
  moveProjectChoiceMachine,
  unifiedNewSessionTarget,
  unifiedProjectChoices,
  widenFilterForNewSession,
  type UnifiedProjectChoice,
} from './choices';
import { projectPickerRows } from './projectList';
import { mergeRepoIdentities, originKeysOf, repoIdentity, resolveRepoIdentity } from './repo';
import { EMPTY_UNIFIED_SAVED, parseUnifiedSaved, rememberNewSession, serializeUnifiedSaved } from './saved';

const choice = (repoKey: string, machines: [string, boolean][], extra: Partial<UnifiedProjectChoice> = {}): UnifiedProjectChoice => ({
  repoKey,
  label: repoKey,
  machines: machines.map(([machineId, connected]) => ({ machineId, label: machineId, connected, projectId: `${repoKey}@${machineId}` })),
  selected: 0,
  hasSessions: true,
  recent: false,
  detail: null,
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

describe('Recent', () => {
  test('holds the newest active projects up to its cap (gx-core recent_holds_the_newest_active_projects_up_to_its_cap)', () => {
    const project = (id: string, at: number | null) => ({
      projectId: id,
      title: id,
      path: `/${id}`,
      gitRemoteOriginUrl: `https://github.com/o/${id}`,
      worktreeParentPath: null,
      hasSessions: at !== null,
      lastActivityMs: at,
    });
    const choices = unifiedProjectChoices(
      [
        {
          machine: 'local',
          label: 'Local',
          connected: true,
          projects: [
            project('a', 1),
            project('b', 7),
            project('c', 3),
            project('d', 9),
            project('e', 5),
            project('f', 2),
            project('g', null),
          ],
        },
      ],
      {},
      [],
      'local',
    );
    assert.deepEqual(choices.map((choice) => [choice.label, choice.recent]), [
      ['d', true],
      ['b', true],
      ['e', true],
      ['c', true],
      ['f', true],
      ['a', false],
      ['g', false],
    ]);
  });
});

describe('one project is one row (Q1224)', () => {
  const id = (origin: string | null, path: string) => repoIdentity(origin, path, null, '');
  test('however its origin is spelled or known', () => {
    const https = id('https://github.com/Owner/Ghostex.git', '/a/Ghostex');
    const alias = id('git@github-work:owner/ghostex.git', '/b/Ghostex');
    const none = id(null, '/c/Ghostex');
    const fork = id('git@github.com:fork/ghostex.git', '/d/ghostex');
    const other = id(null, '/e/notes');
    let merged = mergeRepoIdentities([https, alias, none, fork, other]);
    assert.equal(merged.get(alias.key)!.key, https.key);
    // A fork is a different repository, so a folder named like both stays on its own.
    assert.equal(merged.get(none.key)!.key, none.key);
    assert.equal(merged.get(fork.key)!.key, fork.key);
    assert.equal(merged.get(other.key)!.key, other.key);
    merged = mergeRepoIdentities([https, alias, none]);
    assert.equal(merged.get(none.key)!.key, https.key);
    assert.equal(merged.get(none.key)!.label, 'Ghostex');
    // Another computer's folder joins the row; one beside the repository is another checkout.
    assert.equal(resolveRepoIdentity(none, merged, originKeysOf([none], merged)).key, https.key);
    assert.equal(resolveRepoIdentity(none, merged, originKeysOf([https, none], merged)).key, none.key);
  });

  test("a computer's name in the search picks it on the row", () => {
    const ghostex = choice('ghostex', [['MacBook', true], ['Studio', false], ['Windows', true]], { label: 'Ghostex' });
    const notes = choice('notes', [['MacBook', true]], { label: 'notes' });
    const found = filterProjectChoices([ghostex, notes], 'ghostex win');
    assert.deepEqual(found.map((row) => [row.label, row.selected]), [['Ghostex', 2]]);
    // A connected computer wins over one that is not.
    const both = choice('ghostex', [['Studio A', false], ['Studio B', true]], { label: 'Ghostex' });
    assert.equal(filterProjectChoices([both], 'studio')[0]!.selected, 1);
    // A word nothing holds hides the row.
    assert.deepEqual(filterProjectChoices([ghostex], 'ghostex linux'), []);
  });
});
