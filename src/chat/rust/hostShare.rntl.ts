/// <reference types="jest" />
/**
 * Run with `bun run test:jest src/chat/rust/hostShare.rntl.ts`. One chat core per chat, shared by every screen that
 * holds it (`acquireRustChatHost`): a screen that releases it and takes it again in the same effects pass (the terminal
 * screen's chat moving into one of the iPhone Duo's panes and back, `src/panes/`) keeps the running core; a release
 * nobody follows disposes it. The core's start and dispose are observed, not run (no computer is reached).
 */

import { acquireRustChatHost, RustChatHost } from './host';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../../../modules/ghostex-native/src', () => ({
  GhostexNative: { addListener: () => ({ remove: () => undefined }) },
}));

const TARGET = {
  machine: { id: 'm1', host: 'mac.local', username: 'me', port: 22 },
  projectId: 'p1',
  sessionId: 's1',
};

let start: jest.SpyInstance;
let dispose: jest.SpyInstance;

beforeEach(() => {
  start = jest.spyOn(RustChatHost.prototype, 'start').mockImplementation(() => undefined);
  dispose = jest.spyOn(RustChatHost.prototype, 'dispose').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function afterMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

test('released and taken again in one pass: the same core runs on, never disposed or started again', async () => {
  const first = acquireRustChatHost(TARGET);
  first.release();
  const second = acquireRustChatHost(TARGET);
  await afterMicrotasks();
  expect(second.host).toBe(first.host);
  expect(start).toHaveBeenCalledTimes(1);
  expect(dispose).not.toHaveBeenCalled();
  second.release();
  await afterMicrotasks();
  expect(dispose).toHaveBeenCalledTimes(1);
});

test('the last release nobody follows disposes the core; the next screen starts a new one', async () => {
  const held = acquireRustChatHost(TARGET);
  held.release();
  await afterMicrotasks();
  expect(dispose).toHaveBeenCalledTimes(1);
  const next = acquireRustChatHost(TARGET);
  expect(next.host).not.toBe(held.host);
  expect(start).toHaveBeenCalledTimes(2);
  next.release();
  await afterMicrotasks();
});
