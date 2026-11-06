/// <reference types="node" />
/**
 * Run with `bun test src/files/search.test.ts`.
 *
 * Searching files in the project: the real search action with a stand-in for `runProjectDocsAction` that captures
 * what is sent. Hidden files behind a switch for the results, and the desktop's type filter (its types, their
 * extensions, its tree of the folders that hold the files of those types,
 * apps/desktop/src/app/native_docs/type_filter.rs).
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { DocsEntry } from '../docs/entries';
import type { TreeRow } from './list';
import type { DocsRpc } from './request';
import { filteredTreeRows, searchedFiles, searchProjectFiles, TYPE_FILTERS } from './search';

function found(path: string, kind: 'file' | 'directory' = 'file'): DocsEntry {
  // gxserver's search rows carry no size or time (server/src/project_docs/project_scope.rs `search_project`).
  return {
    path,
    name: path.slice(path.lastIndexOf('/') + 1),
    kind,
    depth: 0,
    modifiedAt: null,
    size: null,
    displayPath: path,
  };
}

function capture(entries: DocsEntry[], flags: { truncated?: boolean; incomplete?: boolean } = {}) {
  const sent: Record<string, unknown>[] = [];
  const rpc: DocsRpc = (method, params) => {
    assert.equal(method, 'runProjectDocsAction');
    sent.push(params);
    return Promise.resolve({ result: { action: 'search', entries, ...flags }, error: null });
  };
  return { rpc, sent };
}

function names(rows: readonly TreeRow[]): string[] {
  return rows.map((row) => `${'  '.repeat(row.depth)}${row.kind === 'file' ? row.file.name : `${row.folder.name}/`}`);
}

describe('search files in the project', () => {
  test('a submitted term is sent as a project-scope search with that term', async () => {
    const { rpc, sent } = capture([found('src/components/terminal/TerminalKeyBar.tsx')]);
    const answer = await searchProjectFiles(rpc, 'project-1', '  keybar ', []);
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.projectId, 'project-1');
    assert.equal(sent[0]?.scope, 'project');
    assert.equal(sent[0]?.action, 'search');
    assert.equal(sent[0]?.query, 'keybar');
    assert.deepEqual(sent[0]?.extensions, []);
    assert.deepEqual(
      answer.entries.map((entry) => entry.path),
      ['src/components/terminal/TerminalKeyBar.tsx'],
    );
  });

  test('the results list the files found, not the folders gxserver also matches', () => {
    const rows = searchedFiles([found('src/keys', 'directory'), found('src/keys/keyBarPages.ts')], false);
    assert.deepEqual(
      rows.map((entry) => entry.path),
      ['src/keys/keyBarPages.ts'],
    );
  });

  test('gxserver saying it sent only the best matches, or searched part of a large project, is kept', async () => {
    const { rpc } = capture([], { truncated: true, incomplete: true });
    const answer = await searchProjectFiles(rpc, 'project-1', 'a', []);
    assert.equal(answer.truncated, true);
    assert.equal(answer.incomplete, true);
  });

  test('hidden results only with the switch on', () => {
    const results = [found('.env'), found('.claude/settings.json'), found('src/env.ts')];
    assert.deepEqual(
      searchedFiles(results, false).map((entry) => entry.path),
      ['src/env.ts'],
    );
    assert.deepEqual(
      searchedFiles(results, true).map((entry) => entry.path),
      ['.env', '.claude/settings.json', 'src/env.ts'],
    );
  });
});

describe('the desktop type filter', () => {
  test('the types and their extensions are the desktop filter’s', async () => {
    assert.deepEqual(
      TYPE_FILTERS.map((filter) => filter.id),
      ['markdown', 'html', 'excalidraw', 'image', 'video'],
    );
    const { rpc, sent } = capture([]);
    await searchProjectFiles(rpc, 'project-1', '', ['markdown', 'html']);
    assert.equal(sent[0]?.query, '');
    assert.deepEqual(sent[0]?.extensions, ['md', 'mdx', 'markdown', 'html', 'htm']);
  });

  test('with nothing typed the matching files stand in the folders that hold them, all open', () => {
    const files = [
      found('docs/specs/onboarding.md'),
      found('README.md'),
      found('docs/ARCHITECTURE.md'),
      found('docs/specs/a.md'),
    ];
    assert.deepEqual(names(filteredTreeRows(files, new Set())), [
      'README.md',
      'docs/',
      '  ARCHITECTURE.md',
      '  specs/',
      '    a.md',
      '    onboarding.md',
    ]);
  });

  test('a folder closed in the filtered tree hides what is under it', () => {
    const files = [found('docs/specs/onboarding.md'), found('docs/ARCHITECTURE.md'), found('src/x.md')];
    assert.deepEqual(names(filteredTreeRows(files, new Set(['docs']))), ['docs/', 'src/', '  x.md']);
    const docs = filteredTreeRows(files, new Set(['docs']))[0];
    assert.equal(docs?.kind === 'folder' && docs.expanded, false);
  });
});
