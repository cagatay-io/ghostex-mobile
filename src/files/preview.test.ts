/// <reference types="node" />
/**
 * Run with `bun test src/files/preview.test.ts`.
 *
 * REQ-FILES-002 (Markdown rendered, other text as source, up to the host preview limit of 2 MB) and REQ-FILES-006
 * (images, binary files and files over 2 MB show name and size only): how the browser opens a file, and the size
 * it shows.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { DocsCopy } from '../copy';
import { filePreview, formatFileSize, isTextFile, PREVIEW_MAX_BYTES, statProjectFile } from './preview';
import type { DocsRpc } from './request';

/** Bytes as the SSH read answers them, base64. */
const base64 = (bytes: readonly number[]) => Buffer.from(bytes).toString('base64');
const utf8 = (text: string) => Buffer.from(text, 'utf8').toString('base64');

describe('REQ-FILES-002: text up to 2 MB is shown', () => {
  test('REQ-FILES-002 AC1: a Markdown file opens rendered (the Docs viewer)', () => {
    assert.deepEqual(filePreview('README.md', 6_071), { kind: 'document' });
    assert.deepEqual(filePreview('notes.markdown', null), { kind: 'document' });
  });

  test('REQ-FILES-002 AC2: a .ts file opens as source', () => {
    assert.deepEqual(filePreview('TerminalKeyBar.tsx', 21_279), { kind: 'source' });
    assert.deepEqual(filePreview('copy.ts', PREVIEW_MAX_BYTES), { kind: 'source' });
  });

  test('REQ-FILES-002: a file of a kind the phone does not know is read and shown as source when it is text', () => {
    assert.deepEqual(filePreview('Podfile.lock', 900), { kind: 'source' });
    assert.deepEqual(filePreview('CODEOWNERS', 64), { kind: 'source' });
    assert.equal(isTextFile(utf8('export const a = 1;\n')), true);
  });
});

describe('REQ-FILES-006: images, binary and large files show name and size', () => {
  test('REQ-FILES-006 AC1/AC2: an image shows only its name and size', () => {
    assert.deepEqual(filePreview('icon.png', 339_015), { kind: 'info', reason: 'image' });
    assert.deepEqual(filePreview('photo.HEIC', 2_000), { kind: 'info', reason: 'image' });
  });

  test('REQ-FILES-006 AC3/AC4: a binary file shows only its name and size, known ones without being read', () => {
    assert.deepEqual(filePreview('JetBrainsMonoNerdFont-Regular.ttf', 1_200_000), { kind: 'info', reason: 'binary' });
    assert.deepEqual(filePreview('demo.mp4', 1_000), { kind: 'info', reason: 'binary' });
    // Anything else is read first and shown only when it is text, as gxserver's preview decides: no NUL byte ...
    assert.equal(isTextFile(base64([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00])), false);
  });

  test('REQ-FILES-006 AC3/AC4/AC7: bytes that are not UTF-8 are not text, though they hold no NUL byte', () => {
    // ... and valid UTF-8, checked on the bytes: the decoder would turn each of these into U+FFFD "text".
    for (const bytes of [
      [0xff, 0xfe], // no UTF-8 lead byte
      [0x61, 0x80], // a continuation byte alone
      [0xc0, 0x80], // an overlong NUL
      [0xe0, 0x80, 0x80], // an overlong three-byte form
      [0xed, 0xa0, 0x80], // a UTF-16 surrogate
      [0xf4, 0x90, 0x80, 0x80], // past U+10FFFF
      [0x61, 0xe2, 0x82], // cut off at the end
    ]) {
      assert.equal(isTextFile(base64(bytes)), false, bytes.map((byte) => byte.toString(16)).join(' '));
    }
  });

  test('REQ-FILES-002 AC2: any valid UTF-8 is text, a replacement character written in it too', () => {
    for (const text of ['', 'plain', 'ä € 𝄞', '\uFEFFwith a byte-order mark', 'a literal \uFFFD in it', '\u007F']) {
      assert.equal(isTextFile(utf8(text)), true, JSON.stringify(text));
    }
  });

  test('REQ-FILES-006 AC5/AC6: a 3 MB text file shows only its name and size', () => {
    assert.deepEqual(filePreview('server.log', 3_000_000), { kind: 'info', reason: 'large' });
    assert.deepEqual(filePreview('huge.md', PREVIEW_MAX_BYTES + 1), { kind: 'info', reason: 'large' });
    assert.equal(formatFileSize(3_000_000), '3.0 MB');
  });

  test('REQ-FILES-006 AC2/AC4/AC6: sizes read in the units of the 2 MB limit', () => {
    assert.equal(formatFileSize(512), '512 B');
    assert.equal(formatFileSize(339_015), '339 KB');
    assert.equal(formatFileSize(999_600), '1.0 MB');
    assert.equal(formatFileSize(2_285_836), '2.3 MB');
  });
});

/**
 * gxserver's answer to a project-scope `stat`, as it goes over the wire: the file's metadata sits under `file`
 * (`response(Some(project_file_metadata(…)))`, server/src/project_docs/actions.rs:24-40,77-83 at 86b287b1), and a
 * file that is not there answers `{ missing, path }` in the same place (file_ops.rs:99-130).
 */
function statAnswer(file: Record<string, unknown>): DocsRpc {
  return () =>
    Promise.resolve({
      result: { action: 'stat', requestId: 'mobile-files-stat-1', rootName: 'docs', file },
      error: null,
    });
}

function statOf(path: string, size: number): Record<string, unknown> {
  const name = path.slice(path.lastIndexOf('/') + 1);
  return { kind: 'text', modifiedAt: '2026-10-29T08:00:00Z', name, path, size };
}

describe('REQ-FILES-006: a file found by search (listed without its size) is measured before it opens', () => {
  test('REQ-FILES-006 AC5/AC6: the size comes from a project-scope stat, so a 3 MB text file shows name and size', async () => {
    const sent: Record<string, unknown>[] = [];
    const answer = statAnswer(statOf('logs/server.log', 3_000_000));
    const rpc: DocsRpc = (method, params, timeoutMs) => {
      sent.push(params);
      return answer(method, params, timeoutMs);
    };
    const size = await statProjectFile(rpc, 'project-1', 'logs/server.log');
    assert.deepEqual([sent[0]?.scope, sent[0]?.action, sent[0]?.path], ['project', 'stat', 'logs/server.log']);
    assert.equal(size, 3_000_000);
    assert.deepEqual(filePreview('server.log', size), { kind: 'info', reason: 'large' });
  });

  test('REQ-FILES-006 AC5-AC7: a 3 MB Markdown file found by search shows name and size, not the rendered page', async () => {
    const size = await statProjectFile(statAnswer(statOf('docs/huge.md', 3_000_000)), 'project-1', 'docs/huge.md');
    assert.equal(size, 3_000_000);
    assert.deepEqual(filePreview('huge.md', size), { kind: 'info', reason: 'large' });
  });

  test('REQ-FILES-006 AC2/AC4: an image or a binary file found by search keeps its size', async () => {
    assert.equal(
      await statProjectFile(statAnswer(statOf('assets/icon.png', 339_015)), 'project-1', 'icon.png'),
      339_015,
    );
    assert.equal(await statProjectFile(statAnswer(statOf('bin/tool.wasm', 1_200)), 'project-1', 'tool.wasm'), 1_200);
  });

  test('REQ-FILES-006: a file gone since it was listed says so instead of opening', async () => {
    const rpc = statAnswer({ missing: true, path: 'gone.txt' });
    await assert.rejects(statProjectFile(rpc, 'project-1', 'gone.txt'), { message: DocsCopy.fileMissing });
  });

  test('REQ-FILES-006: an answer without the file (an older Ghostex) is not read as a size', async () => {
    const rpc: DocsRpc = () => Promise.resolve({ result: { action: 'stat', size: 3_000_000 }, error: null });
    await assert.rejects(statProjectFile(rpc, 'project-1', 'logs/server.log'), { message: DocsCopy.oldCli });
  });
});
