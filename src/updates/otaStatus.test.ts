/// <reference types="node" />
/** Run with `bun test src/updates/otaStatus.test.ts` from apps/mobile/app. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { OtaCopy, otaErrorMessage, otaStatusLine, type OtaState } from './otaStatus';

const idle: OtaState = { ready: null, isChecking: false, isDownloading: false };

describe('otaStatusLine', () => {
  // iOS sends an absent error and absent progress as null (issue #324: "Cannot read property 'message' of null").
  test('idle state with null errors and null progress shows the automatic-updates line', () => {
    assert.deepEqual(otaStatusLine({ ...idle, checkError: null, downloadError: null, downloadProgress: null }), {
      text: OtaCopy.automatic,
      tone: 'muted',
    });
  });

  test('undefined errors show the same line', () => {
    assert.equal(otaStatusLine(idle).text, OtaCopy.automatic);
  });

  test('a plain { message } error object, not an Error, shows its message', () => {
    assert.deepEqual(otaStatusLine({ ...idle, checkError: { message: 'offline' }, downloadError: null }), {
      text: 'The last update check failed: offline',
      tone: 'error',
    });
  });

  test('a download error wins over a check error', () => {
    assert.ok(otaStatusLine({ ...idle, checkError: new Error('a'), downloadError: new Error('b') }).text.includes('b'));
  });

  test('an error without text still shows a line instead of throwing', () => {
    for (const error of [{}, { message: 5 }, '', new Error('')]) {
      assert.deepEqual(otaStatusLine({ ...idle, checkError: error }), {
        text: OtaCopy.error(null),
        tone: 'error',
      });
    }
  });

  test('downloading without progress is indeterminate, with progress shows a percent', () => {
    assert.equal(
      otaStatusLine({ ...idle, isDownloading: true, downloadProgress: null }).text,
      'Downloading an update…',
    );
    assert.equal(otaStatusLine({ ...idle, isDownloading: true }).text, 'Downloading an update…');
    assert.equal(
      otaStatusLine({ ...idle, isDownloading: true, downloadProgress: 0.42 }).text,
      'Downloading an update… 42%',
    );
  });

  test('checking and ready lines', () => {
    assert.equal(otaStatusLine({ ...idle, isChecking: true, checkError: null }).text, OtaCopy.checking);
    assert.deepEqual(otaStatusLine({ ...idle, ready: { version: '10.36.0' } }), {
      text: 'Ghostex 10.36.0 is ready.',
      tone: 'accent',
    });
    assert.equal(otaStatusLine({ ...idle, ready: { version: null } }).text, 'An update is ready.');
  });
});

describe('otaErrorMessage', () => {
  test('reads null, strings, Errors and message objects', () => {
    assert.equal(otaErrorMessage(null), null);
    assert.equal(otaErrorMessage(undefined), null);
    assert.equal(otaErrorMessage('x'), 'x');
    assert.equal(otaErrorMessage(new Error('y')), 'y');
    assert.equal(otaErrorMessage({ message: 'z' }), 'z');
  });
});
