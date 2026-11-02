/// <reference types="node" />
/** Run with `bun test src/chat/rust/wasm-core/pageLoad.test.ts` from apps/mobile/app. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  PAGE_RELOAD_DELAYS_MS,
  PAGE_RETRY_AFTER_GIVE_UP_MS,
  PageRestarts,
  coreUnavailableMessage,
  describeLoadError,
  pageFromUpdate,
  pageUriProblem,
  uriBasename,
} from './pageLoad';

// Issue #393: after the 10.42.1 OTA every iPhone resolved the page to `file:///`.
const IOS_ERROR = {
  code: -1101,
  domain: 'NSURLErrorDomain',
  description: 'The requested URL is a directory.',
  url: 'file:///',
};

describe('pageUriProblem', () => {
  test('an empty URI (expo-asset found no file) is refused before the WebView mounts', () => {
    assert.match(pageUriProblem('') ?? '', /no file for the chat core page/);
  });

  test('a folder, by its trailing slash or by its stat, is refused with the path', () => {
    assert.match(pageUriProblem('file:///') ?? '', /folder \(file:\/\/\/\)/);
    assert.match(pageUriProblem('file:///var/app/.expo-internal/abc.html', 'directory') ?? '', /folder/);
  });

  test('a file is accepted', () => {
    assert.equal(pageUriProblem('file:///var/app/.expo-internal/fa38e57d.html', 'file'), null);
    assert.equal(pageUriProblem('file:///var/app/Ghostex.app/chat-core.html'), null);
  });
});

describe('pageFromUpdate', () => {
  const manifest = {
    assets: [
      { key: 'png1', fileExtension: '.png', contentType: 'image/png' },
      { key: 'page', fileExtension: '.html', contentType: 'text/html' },
    ],
  };

  test('finds the one HTML asset by its own key in the update', () => {
    const local = { page: 'file:///var/app/.expo-internal/page.html', png1: 'file:///x.png' };
    assert.equal(pageFromUpdate(manifest, local), local.page);
  });

  test('gives up on no local file, no HTML asset, two HTML assets or no manifest', () => {
    assert.equal(pageFromUpdate(manifest, { png1: 'file:///x.png' }), null);
    assert.equal(pageFromUpdate({ assets: [manifest.assets[0]] }, { png1: 'x' }), null);
    const two = { assets: [...manifest.assets, { key: 'other', fileExtension: '.html' }] };
    assert.equal(pageFromUpdate(two, { page: 'a', other: 'b' }), null);
    assert.equal(pageFromUpdate({}, { page: 'a' }), null);
    assert.equal(pageFromUpdate(manifest, undefined), null);
  });
});

describe('describeLoadError', () => {
  test("keeps WebKit's code, domain and the file it tried, and says it is a folder", () => {
    assert.equal(
      describeLoadError(IOS_ERROR, 'file:///', 'directory'),
      'The chat core page could not load: error -1101 (NSURLErrorDomain: The requested URL is a directory.) loading file:///, a folder.',
    );
  });

  test('names only the basename of a long path', () => {
    const text = describeLoadError(
      { code: -1100 },
      'file:///var/mobile/Containers/x/.expo-internal/fa38e57d.html',
      'file',
    );
    assert.equal(text, 'The chat core page could not load: error -1100 loading fa38e57d.html, a file.');
    assert.equal(uriBasename('file:///a/b/c.html'), 'c.html');
  });

  test('an empty event still says something', () => {
    assert.equal(
      describeLoadError(undefined, '', null),
      'The chat core page could not load: unknown error loading (no path).',
    );
  });
});

describe('PageRestarts', () => {
  test('reloads after a growing wait, then gives up with the real reason', () => {
    const restarts = new PageRestarts();
    const reason = describeLoadError(IOS_ERROR, 'file:///', 'directory');
    const delays: number[] = [];
    let decision = restarts.onFailure(reason, 0);
    while (decision.kind === 'reload') {
      delays.push(decision.delayMs);
      decision = restarts.onFailure(reason, 0);
    }
    assert.deepEqual(delays, [...PAGE_RELOAD_DELAYS_MS]);
    assert.ok(delays.every((delay, index) => index === 0 || delay > delays[index - 1]));
    assert.match(decision.message, /error -1101/);
    assert.match(decision.message, /failed to start 5 times in a row/);
  });

  // The old loop remounted about 16 times a second forever; the whole budget now spans ~7.5 s,
  // inside the 20 s a chat waits, so the chat shows the reason instead of "did not start in time".
  test('the whole budget fits inside the chat wait', () => {
    const total = PAGE_RELOAD_DELAYS_MS.reduce((sum, delay) => sum + delay, 0);
    assert.ok(total < 20_000);
  });

  test('a page that starts resets the count', () => {
    const restarts = new PageRestarts([100, 200]);
    restarts.onFailure('x', 0);
    restarts.onFailure('x', 0);
    restarts.onReady();
    assert.deepEqual(restarts.onFailure('x', 0), { kind: 'reload', delayMs: 100 });
  });

  test('after giving up, one fresh round only once the cooldown passed', () => {
    const restarts = new PageRestarts([100]);
    restarts.onFailure('x', 0);
    assert.equal(restarts.onFailure('x', 1_000).kind, 'giveUp');
    assert.equal(restarts.retryAfterGiveUp(1_000 + PAGE_RETRY_AFTER_GIVE_UP_MS - 1), false);
    assert.equal(restarts.retryAfterGiveUp(1_000 + PAGE_RETRY_AFTER_GIVE_UP_MS), true);
    assert.equal(restarts.retryAfterGiveUp(1_000 + PAGE_RETRY_AFTER_GIVE_UP_MS), false);
    assert.deepEqual(restarts.onFailure('x', 0), { kind: 'reload', delayMs: 100 });
  });

  test('no give-up yet means no retry', () => {
    assert.equal(new PageRestarts().retryAfterGiveUp(10 * PAGE_RETRY_AFTER_GIVE_UP_MS), false);
  });
});

describe('coreUnavailableMessage', () => {
  test("carries the bridge's reason into the chat", () => {
    assert.equal(
      coreUnavailableMessage('The chat core page resolved to a folder (file:///), not a file.'),
      "The chat engine couldn't start. The chat core page resolved to a folder (file:///), not a file. Close the chat and open it again.",
    );
  });

  test('without a reason it reads as before', () => {
    assert.equal(coreUnavailableMessage(null), "The chat engine couldn't start. Close the chat and open it again.");
    assert.equal(coreUnavailableMessage('  '), "The chat engine couldn't start. Close the chat and open it again.");
  });
});
