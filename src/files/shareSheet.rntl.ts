/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. One share at a time, and its copy deleted, across screens: the real Share… flow
 * (`share.ts`), the app's share sheet (`shareSheet.ts`) and the screens' hook (`useShareFile.ts`), with only the app
 * module's share sheet (`GhostexNative.shareFile`, which answers once the sheet is over) and the file system faked at
 * their boundary. The list, the source view and the Docs viewer each run their own hook but hand their files to the
 * same share sheet, so one share at a time holds for the whole app, and every share deletes only its own temporary
 * copy: a sheet never loses the file it was handed to another screen's share.
 */

import { act, renderHook } from '@testing-library/react-native';
import { Share } from 'react-native';

import { DocsCopy } from '../copy';
import { isSharing, shareProjectFile, type ShareOutcome } from './share';
import { appShareSheet } from './shareSheet';
import { useShareFile } from './useShareFile';

// The app module's share sheet: each call shows a sheet that stays until the test closes it.
const mockShareFile = jest.fn<Promise<void>, [string]>();
jest.mock('../../modules/ghostex-native/src', () => ({
  GhostexNative: { shareFile: (fileUri: string) => mockShareFile(fileUri) },
}));

// The app's cache as a set of file addresses; a folder holds every address under it.
const mockFiles = new Set<string>();
const mockFolders = new Set<string>();
jest.mock('expo-file-system', () => {
  const join = (parent: { uri: string } | string, name: string) =>
    `${typeof parent === 'string' ? parent : parent.uri}${name}`;
  return {
    Paths: { cache: 'file:///cache/' },
    Directory: class {
      uri: string;
      constructor(parent: { uri: string } | string, name: string) {
        this.uri = `${join(parent, name)}/`;
      }
      get exists() {
        return mockFolders.has(this.uri);
      }
      create() {
        mockFolders.add(this.uri);
      }
      delete() {
        for (const folder of [...mockFolders]) if (folder.startsWith(this.uri)) mockFolders.delete(folder);
        for (const file of [...mockFiles]) if (file.startsWith(this.uri)) mockFiles.delete(file);
      }
    },
    File: class {
      uri: string;
      constructor(folder: { uri: string }, name: string) {
        this.uri = join(folder, name);
      }
      create() {
        mockFiles.add(this.uri);
      }
      write() {
        return Promise.resolve();
      }
    },
  };
});

/** The share sheets shown so far, in order; `close()` ends one (shared or cancelled settle alike). */
const sheets: { uri: string; close: () => void }[] = [];

/** A host whose reads of each path wait until `answer(path)`. */
function slowHost() {
  const reads = new Map<string, () => void>();
  const sent: string[] = [];
  const rpc = (_method: string, params: Record<string, unknown>) => {
    const path = String(params.path);
    sent.push(path);
    const read = Promise.withResolvers<{ result: unknown; error: null }>();
    reads.set(path, () =>
      read.resolve({ result: { action: 'readResource', dataBase64: 'c3ludGhldGlj' }, error: null }),
    );
    return read.promise;
  };
  return { rpc, sent, answer: (path: string) => reads.get(path)?.() };
}

beforeEach(() => {
  mockFiles.clear();
  mockFolders.clear();
  sheets.length = 0;
  mockShareFile.mockReset();
  mockShareFile.mockImplementation((fileUri) => {
    const closed = Promise.withResolvers<void>();
    sheets.push({ uri: fileUri, close: () => closed.resolve() });
    return closed.promise;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('a share started on another screen while the first file is fetched leaves the first copy alone', async () => {
  const host = slowHost();
  // The list starts a share; while its file is fetched, the file view starts another; then both reads come back.
  const first = shareProjectFile(
    host.rpc,
    'project',
    { path: 'one.txt', name: 'one.txt' },
    appShareSheet,
    () => undefined,
  );
  const second = shareProjectFile(
    host.rpc,
    'project',
    { path: 'two.txt', name: 'two.txt' },
    appShareSheet,
    () => undefined,
  );
  await act(async () => host.answer('one.txt'));
  await act(async () => host.answer('two.txt'));
  const firstCopy = sheets[0]!.uri;
  const firstStillThere = mockFiles.has(firstCopy);
  const sheetsShown = sheets.length;
  const sent = [...host.sent];
  // Settle whatever is still open before judging, so a failure leaves no flow behind.
  await act(async () => {
    for (const sheet of sheets) sheet.close();
  });
  const outcomes = await Promise.all([first, second]);
  // The sheet that is open keeps the file it was handed.
  expect(firstStillThere).toBe(true);
  // One share at a time for the whole app: the second asked the computer for nothing and opened no sheet.
  expect(sent).toEqual(['one.txt']);
  expect(sheetsShown).toBe(1);
  expect(outcomes).toEqual<ShareOutcome[]>([{ shared: true }, { shared: false, busy: true }]);
  expect(mockFiles.size).toBe(0);
});

test('each share deletes only its own copy, the next one starts afresh', async () => {
  const host = slowHost();
  const first = shareProjectFile(
    host.rpc,
    'project',
    { path: 'a/report.pdf', name: 'report.pdf' },
    appShareSheet,
    () => undefined,
  );
  await act(async () => host.answer('a/report.pdf'));
  await act(async () => sheets[0]!.close());
  await first;
  expect(mockFiles.size).toBe(0);
  // The same name again: its own copy, present while its sheet is open, gone after.
  const again = shareProjectFile(
    host.rpc,
    'project',
    { path: 'b/report.pdf', name: 'report.pdf' },
    appShareSheet,
    () => undefined,
  );
  await act(async () => host.answer('b/report.pdf'));
  expect(mockFiles.has(sheets[1]!.uri)).toBe(true);
  await act(async () => sheets[1]!.close());
  await again;
  expect(mockFiles.size).toBe(0);
});

test('a copy an earlier run left behind (the app closed with its sheet open) goes at the next share', async () => {
  mockFolders.add('file:///cache/files-share/');
  mockFolders.add('file:///cache/files-share/left-behind/');
  mockFiles.add('file:///cache/files-share/left-behind/old.txt');
  const host = slowHost();
  const done = shareProjectFile(
    host.rpc,
    'project',
    { path: 'new.txt', name: 'new.txt' },
    appShareSheet,
    () => undefined,
  );
  await act(async () => host.answer('new.txt'));
  expect([...mockFiles]).toEqual([sheets[0]!.uri]);
  await act(async () => sheets[0]!.close());
  await done;
  expect(mockFiles.size).toBe(0);
});

test('while one screen shares, every other screen shows Share… as busy and starts nothing', async () => {
  const host = slowHost();
  const notices = { show: jest.fn(), clear: jest.fn() };
  const list = await renderHook(() => useShareFile(host.rpc, 'project', notices));
  const preview = await renderHook(() => useShareFile(host.rpc, 'project', notices));
  await act(async () => list.result.current.share({ path: 'one.txt', name: 'one.txt', size: 9 }));
  expect(preview.result.current.sharing).toBe(true);
  await act(async () => preview.result.current.share({ path: 'two.txt', name: 'two.txt', size: 9 }));
  // The second screen's tap neither fetched its file nor showed a progress notice.
  expect(host.sent).toEqual(['one.txt']);
  expect(notices.show).toHaveBeenCalledTimes(1);
  await act(async () => host.answer('one.txt'));
  await act(async () => sheets[0]!.close());
  expect(list.result.current.sharing).toBe(false);
  expect(preview.result.current.sharing).toBe(false);
});

test('the copy and the one-share lock last exactly as long as the module reports the sheet open', async () => {
  // React Native's `Share` ignores the completion of an activity the person cancelled (RCTActionSheetManager.mm
  // 0.88:288-295) and could leave both for good; the app's sheet goes through its own module instead.
  const reactNativeShare = jest.spyOn(Share, 'share');
  const host = slowHost();
  const first = shareProjectFile(
    host.rpc,
    'project',
    { path: 'one.txt', name: 'one.txt' },
    appShareSheet,
    () => undefined,
  );
  await act(async () => host.answer('one.txt'));
  // The sheet is open (an activity picked and cancelled inside it changes nothing): its copy stays, Share… is busy.
  expect(mockShareFile.mock.calls).toEqual([[sheets[0]!.uri]]);
  expect(mockFiles.has(sheets[0]!.uri)).toBe(true);
  expect(isSharing(appShareSheet)).toBe(true);
  // The module reports the sheet over: the copy goes and the lock is released at once.
  await act(async () => sheets[0]!.close());
  expect(await first).toEqual<ShareOutcome>({ shared: true });
  expect(mockFiles.size).toBe(0);
  expect(isSharing(appShareSheet)).toBe(false);
  // Share… works again afterwards.
  const next = shareProjectFile(
    host.rpc,
    'project',
    { path: 'two.txt', name: 'two.txt' },
    appShareSheet,
    () => undefined,
  );
  await act(async () => host.answer('two.txt'));
  expect(host.sent).toEqual(['one.txt', 'two.txt']);
  await act(async () => sheets[1]!.close());
  expect(await next).toEqual<ShareOutcome>({ shared: true });
  expect(mockFiles.size).toBe(0);
  expect(reactNativeShare).not.toHaveBeenCalled();
});

/** A rejection as the module's `shareFile` sends it: an error carrying the contract code. */
function nativeFailure(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

test.each([
  ['E_SHARE_INTERRUPTED', 'The share sheet ended before it finished', DocsCopy.shareSheetInterrupted],
  ['E_SHARE_FAILED', 'Mail: SMTP 554 relay refused (synthetic)', DocsCopy.shareActivityFailed],
  ['E_SHARE_UNAVAILABLE', 'The share sheet could not be shown', DocsCopy.shareSheetUnavailable],
  ['ERR_UNEXPECTED', 'synthetic unexpected failure', DocsCopy.shareSheetInterrupted],
])(
  'a sheet that ends with %s releases the lock, deletes the copy and names the category',
  async (code, nativeMessage, shown) => {
    const host = slowHost();
    const notices = { show: jest.fn(), clear: jest.fn() };
    const closed = Promise.withResolvers<void>();
    let sharedUri = '';
    mockShareFile.mockImplementationOnce((fileUri) => {
      sharedUri = fileUri;
      return closed.promise;
    });
    const list = await renderHook(() => useShareFile(host.rpc, 'project', notices));
    await act(async () => list.result.current.share({ path: 'one.txt', name: 'one.txt', size: 9 }));
    await act(async () => host.answer('one.txt'));
    // The sheet is open: its copy is there and Share… is busy everywhere.
    expect(mockFiles.has(sharedUri)).toBe(true);
    expect(list.result.current.sharing).toBe(true);
    // The module ends the share with an error (the presenter went away, a reload, a failed activity, no sheet).
    await act(async () => closed.reject(nativeFailure(code, nativeMessage)));
    expect(mockFiles.size).toBe(0);
    expect(isSharing(appShareSheet)).toBe(false);
    expect(list.result.current.sharing).toBe(false);
    // The notice names what happened by category, never the native message.
    expect(notices.show).toHaveBeenLastCalledWith(shown, true, DocsCopy.shareFailed('one.txt'), false);
    expect(JSON.stringify(notices.show.mock.calls)).not.toContain(nativeMessage);
    // Share… works again afterwards.
    await act(async () => list.result.current.share({ path: 'two.txt', name: 'two.txt', size: 9 }));
    await act(async () => host.answer('two.txt'));
    expect(host.sent).toEqual(['one.txt', 'two.txt']);
    await act(async () => sheets[0]!.close());
    expect(list.result.current.sharing).toBe(false);
    expect(mockFiles.size).toBe(0);
  },
);
