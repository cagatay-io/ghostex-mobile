/// <reference types="node" />
/**
 * Run with `bun test src/files/share.test.ts`.
 *
 * Sharing a file: the real Share… flow (`share.ts`) and the real row menu (`rowMenu.ts`) with a
 * stand-in for `runProjectDocsAction` that captures what is sent and a stand-in share sheet that keeps each share's
 * temporary copy in memory, so what is left on the phone after the sheet closes is observed, not assumed. The app's
 * own sheet and file system across screens: `shareSheet.rntl.ts`.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { RpcAnswer } from '../chat/rust/transport';
import { DocsCopy } from '../copy';
import type { DocsRpc } from './request';
import { rowMenuActions } from './rowMenu';
import { isSharing, shareProjectFile, type ShareSheet } from './share';

/** Bytes that are not text (a PNG header and every byte value), as a picture or archive would be. */
const BYTES = Uint8Array.from({ length: 1000 }, (_, index) =>
  index < 8 ? [137, 80, 78, 71, 13, 10, 26, 10][index]! : index % 256,
);

function host(answer: RpcAnswer) {
  const sent: Record<string, unknown>[] = [];
  const rpc: DocsRpc = (method, params) => {
    assert.equal(method, 'runProjectDocsAction');
    sent.push(params);
    return Promise.resolve(answer);
  };
  return { rpc, sent };
}

/**
 * A share sheet whose copies live in a map, each share's under its own address that its `drop` alone deletes;
 * `open` stays open until `close()`, and `shown` settles when it opens.
 */
function sheet(options: { fails?: Error } = {}) {
  const copies = new Map<string, number>();
  const kept: { name: string; bytes: number }[] = [];
  const opened: { uri: string; name: string; copiesWhileOpen: number }[] = [];
  const shown = Promise.withResolvers<void>();
  const closed = Promise.withResolvers<void>();
  const fake: ShareSheet = {
    keepCopy(name, base64) {
      const bytes = Buffer.from(base64, 'base64').length;
      kept.push({ name, bytes });
      const uri = `tmp://files-share/${kept.length}/${name}`;
      copies.set(uri, bytes);
      return Promise.resolve({ uri, drop: () => copies.delete(uri) });
    },
    open(uri, name) {
      opened.push({ uri, name, copiesWhileOpen: copies.size });
      shown.resolve();
      return options.fails !== undefined ? Promise.reject(options.fails) : closed.promise;
    },
  };
  return { fake, copies, kept, opened, shown: shown.promise, close: () => closed.resolve() };
}

const PICTURE = { path: 'assets/logo.png', name: 'logo.png' };

describe('share a file', () => {
  test('the host is asked once to read the file, and the sheet gets one file of that name and length', async () => {
    const { rpc, sent } = host({
      result: { action: 'readResource', dataBase64: Buffer.from(BYTES).toString('base64') },
      error: null,
    });
    const share = sheet();
    let fetched = 0;
    const done = shareProjectFile(rpc, 'project-1', PICTURE, share.fake, () => (fetched += 1));
    await share.shown;
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.projectId, 'project-1');
    assert.equal(sent[0]?.scope, 'project');
    assert.equal(sent[0]?.action, 'readResource');
    assert.equal(sent[0]?.path, 'assets/logo.png');
    assert.deepEqual(share.kept, [{ name: 'logo.png', bytes: BYTES.length }]);
    assert.deepEqual(
      share.opened.map(({ uri, name }) => ({ uri, name })),
      [{ uri: 'tmp://files-share/1/logo.png', name: 'logo.png' }],
    );
    assert.equal(fetched, 1, 'the progress notice ends once the file is fetched');
    share.close();
    assert.deepEqual(await done, { shared: true });
  });

  test('a file the host refuses reaches no share sheet, and the host message is answered', async () => {
    // gxserver refuses a file over its 12 MiB read limit or one it cannot read with this message (actions.rs).
    const { rpc } = host({ error: { code: 'actionFailed', message: 'Resource is unavailable.' } });
    const share = sheet();
    let fetched = 0;
    const outcome = await shareProjectFile(rpc, 'project-1', PICTURE, share.fake, () => (fetched += 1));
    assert.deepEqual(outcome, { shared: false, message: 'Resource is unavailable.' });
    assert.deepEqual(share.kept, []);
    assert.deepEqual(share.opened, []);
    assert.equal(fetched, 1, 'the progress notice ends when the host refuses too');
  });

  test('a refusal inside the result is the host message too', async () => {
    const { rpc } = host({ result: { action: 'readResource', error: 'Select a resource to read.' }, error: null });
    const share = sheet();
    const outcome = await shareProjectFile(rpc, 'project-1', PICTURE, share.fake, () => undefined);
    assert.deepEqual(outcome, { shared: false, message: 'Select a resource to read.' });
    assert.deepEqual(share.opened, []);
  });

  test('a folder row offers no Share…, a file row does', () => {
    assert.deepEqual(rowMenuActions('folder', { sessionContext: true, share: true }), ['copyPath']);
    assert.equal(rowMenuActions('file', { sessionContext: false, share: true }).includes('share'), true);
    assert.equal(rowMenuActions('file', { sessionContext: false, share: false }).includes('share'), false);
  });

  test('the temporary copy exists while the sheet is open and is gone once it closes', async () => {
    const { rpc } = host({ result: { dataBase64: Buffer.from(BYTES).toString('base64') }, error: null });
    const share = sheet();
    const done = shareProjectFile(rpc, 'project-1', PICTURE, share.fake, () => undefined);
    await share.shown;
    assert.equal(share.opened[0]?.copiesWhileOpen, 1);
    assert.equal(share.copies.size, 1, 'still there while the sheet is open');
    // Shared or cancelled, the sheet closing is what settles `open` (React Native's Share).
    share.close();
    await done;
    assert.equal(share.copies.size, 0);
  });

  test('a sheet that fails still leaves no copy, and its message is answered', async () => {
    const { rpc } = host({ result: { dataBase64: Buffer.from(BYTES).toString('base64') }, error: null });
    const share = sheet({ fails: new Error('Share sheet unavailable') });
    const outcome = await shareProjectFile(rpc, 'project-1', PICTURE, share.fake, () => undefined);
    assert.deepEqual(outcome, { shared: false, message: 'Share sheet unavailable' });
    assert.equal(share.copies.size, 0);
  });

  test('a name from the computer that would leave the copy folder is not used as a file name', async () => {
    const { rpc } = host({ result: { dataBase64: '' }, error: null });
    const share = sheet({ fails: new Error('closed') });
    await shareProjectFile(rpc, 'project-1', { path: 'x/..', name: '..' }, share.fake, () => undefined);
    assert.deepEqual(share.kept, [{ name: DocsCopy.shareFallbackName, bytes: 0 }]);
  });

  test('an answer without the file (an older Ghostex) says so instead of sharing nothing', async () => {
    const { rpc } = host({ result: { action: 'readResource' }, error: null });
    const share = sheet();
    const outcome = await shareProjectFile(rpc, 'project-1', PICTURE, share.fake, () => undefined);
    assert.deepEqual(outcome, { shared: false, message: DocsCopy.shareNoData });
    assert.deepEqual(share.kept, []);
  });

  test('one share at a time on a sheet; another started meanwhile reads nothing and keeps no copy', async () => {
    const { rpc, sent } = host({ result: { dataBase64: Buffer.from(BYTES).toString('base64') }, error: null });
    const share = sheet();
    const first = shareProjectFile(rpc, 'project-1', PICTURE, share.fake, () => undefined);
    assert.equal(isSharing(share.fake), true);
    const second = shareProjectFile(rpc, 'project-1', { path: 'b.png', name: 'b.png' }, share.fake, () => undefined);
    // The second asked the computer for nothing.
    assert.deepEqual(
      sent.map((params) => params.path),
      ['assets/logo.png'],
    );
    await share.shown;
    assert.equal(share.copies.size, 1, 'only the open sheet holds a copy');
    share.close();
    assert.deepEqual(await Promise.all([first, second]), [{ shared: true }, { shared: false, busy: true }]);
    assert.equal(isSharing(share.fake), false);
    assert.equal(share.copies.size, 0);
  });
});
