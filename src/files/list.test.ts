/// <reference types="node" />
/**
 * Run with `bun test src/files/list.test.ts`.
 *
 * REQ-FILES-001 (browse the project folder tree one level at a time), REQ-FILES-007 (hidden files behind a
 * switch): the real listing request with a stand-in for `runProjectDocsAction`, and the real list filter over a
 * fixture listing that holds `.env` (gxserver's `file_entry` rows, server/src/project_docs/project_scope.rs).
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { RpcAnswer } from '../chat/rust/transport';
import { DocsCopy } from '../copy';
import type { DocsEntry } from '../docs/entries';
import { isHiddenPath, listProjectFolder, treeRows, type FolderState, type TreeRow } from './list';
import type { DocsRpc } from './request';

function entry(
  path: string,
  kind: 'file' | 'directory',
  size: number | null = kind === 'file' ? 120 : null,
): DocsEntry {
  const name = path.slice(path.lastIndexOf('/') + 1);
  return {
    path,
    name,
    kind,
    depth: path.split('/').length - 1,
    modifiedAt: '2026-10-29T10:00:00Z',
    size,
    displayPath: path,
  };
}

/** The project's top level as gxserver lists it: folders first, then names; `.git` and `node_modules` skipped there. */
const ROOT: DocsEntry[] = [
  entry('.claude', 'directory'),
  entry('docs', 'directory'),
  entry('src', 'directory'),
  entry('.env', 'file'),
  entry('.gitignore', 'file'),
  entry('package.json', 'file'),
  entry('README.md', 'file'),
];
const SRC: DocsEntry[] = [
  entry('src/files', 'directory'),
  entry('src/.cache-note', 'file'),
  entry('src/copy.ts', 'file'),
];
const CLAUDE: DocsEntry[] = [entry('.claude/settings.json', 'file')];

function loaded(listings: Record<string, DocsEntry[]>): Map<string, FolderState> {
  return new Map(Object.entries(listings).map(([path, entries]) => [path, { entries, loading: false, error: null }]));
}

function names(rows: readonly TreeRow[]): string[] {
  return rows.map((row) => `${'  '.repeat(row.depth)}${row.kind === 'file' ? row.file.name : `${row.folder.name}/`}`);
}

/** A stand-in for `sessionChatRpc(machine, 'runProjectDocsAction', …)` that records what was sent. */
function recordingRpc(answer: RpcAnswer): { rpc: DocsRpc; sent: Record<string, unknown>[] } {
  const sent: Record<string, unknown>[] = [];
  const rpc: DocsRpc = (method, params) => {
    assert.equal(method, 'runProjectDocsAction');
    sent.push(params);
    return Promise.resolve(answer);
  };
  return { rpc, sent };
}

describe('REQ-FILES-001: the project folder tree, one level at a time', () => {
  test('REQ-FILES-001 AC1: opening the browser asks for the project top level with scope "project" and action "list"', async () => {
    const { rpc, sent } = recordingRpc({
      result: { action: 'list', progressive: true, entries: ROOT, revision: 'r1' },
      error: null,
    });
    const listing = await listProjectFolder(rpc, 'project-1', '', { revision: null, force: false });
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.scope, 'project');
    assert.equal(sent[0]?.action, 'list');
    assert.equal(sent[0]?.path, '');
    assert.equal(sent[0]?.projectId, 'project-1');
    assert.deepEqual(
      listing?.entries.map((row) => row.name),
      ROOT.map((row) => row.name),
    );
    assert.equal(listing?.revision, 'r1');
  });

  test('REQ-FILES-001 AC2: a tapped folder is listed by its own path; an unchanged folder sends nothing back', async () => {
    const { rpc, sent } = recordingRpc({
      result: { action: 'list', progressive: true, unchanged: true, revision: 'r2' },
      error: null,
    });
    assert.equal(await listProjectFolder(rpc, 'project-1', 'src', { revision: 'r2', force: true }), null);
    assert.equal(sent[0]?.path, 'src');
    assert.equal(sent[0]?.revision, 'r2');
    assert.equal(sent[0]?.force, true);
  });

  test('REQ-FILES-001: gxserver refusing the listing reaches the browser as its message', async () => {
    const { rpc } = recordingRpc({ result: { error: 'The active project root is unavailable.' }, error: null });
    await assert.rejects(listProjectFolder(rpc, 'project-1', '', { revision: null, force: false }), {
      message: 'The active project root is unavailable.',
    });
  });

  test('REQ-FILES-001: a Ghostex without the whole-project listing (its Docs list comes back) asks for an update', async () => {
    const { rpc } = recordingRpc({ result: { action: 'list', rootName: 'docs', entries: ROOT }, error: null });
    await assert.rejects(listProjectFolder(rpc, 'project-1', '', { revision: null, force: false }), {
      message: DocsCopy.oldCli,
    });
  });

  test('REQ-FILES-001 AC2: an open folder shows its children one level deeper, a closed one does not', () => {
    const folders = loaded({ '': ROOT, src: SRC });
    assert.deepEqual(names(treeRows(folders, new Set(['src']), true)), [
      '.claude/',
      'docs/',
      'src/',
      '  files/',
      '  .cache-note',
      '  copy.ts',
      '.env',
      '.gitignore',
      'package.json',
      'README.md',
    ]);
  });

  test('REQ-FILES-001 AC3: closing the folder row goes back to the parent level', () => {
    const folders = loaded({ '': ROOT, src: SRC });
    assert.deepEqual(names(treeRows(folders, new Set(), true)), names(treeRows(loaded({ '': ROOT }), new Set(), true)));
  });

  test('REQ-FILES-001 AC2: a folder opened before its listing arrived shows as loading, with no children yet', () => {
    const folders = loaded({ '': ROOT });
    folders.set('docs', { entries: null, loading: true, error: null });
    const docs = treeRows(folders, new Set(['docs']), false).find(
      (row) => row.kind === 'folder' && row.folder.name === 'docs',
    );
    assert.equal(docs?.kind === 'folder' && docs.loading && docs.expanded, true);
  });
});

describe('REQ-FILES-007: hidden files behind a switch', () => {
  test('REQ-FILES-007 AC1: with the switch off, .env is not listed (nor any other hidden file or folder)', () => {
    const rows = names(treeRows(loaded({ '': ROOT, src: SRC, '.claude': CLAUDE }), new Set(['src', '.claude']), false));
    assert.ok(!rows.includes('.env'));
    assert.deepEqual(rows, ['docs/', 'src/', '  files/', '  copy.ts', 'package.json', 'README.md']);
  });

  test('REQ-FILES-007 AC2: with the switch on, .env is listed', () => {
    const rows = names(treeRows(loaded({ '': ROOT, '.claude': CLAUDE }), new Set(['.claude']), true));
    assert.ok(rows.includes('.env'));
    assert.ok(rows.includes('  settings.json'));
  });

  test('REQ-FILES-007: a path inside a hidden folder counts as hidden; the mounted Docs directory by its name does not', () => {
    assert.equal(isHiddenPath('.claude/settings.json'), true);
    assert.equal(isHiddenPath('src/.cache-note'), true);
    assert.equal(isHiddenPath('Notes/today.md'), false);
  });
});
