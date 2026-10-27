/// <reference types="node" />
/** Run with `bun test src/screens/scan-code/systemScanner.test.ts` from apps/mobile/app. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { shouldTakeSystemScan } from './systemScanner';

/** The link the user's MacBook (10.38.0) showed, with a stand-in secret. */
const LINK =
  'https://ghostex.dev/pair#ghostex-ec1:eyJ2IjoxLCJhZGRyZXNzIjoidGNBQUVDIiwibmFtZSI6Ik1hYyIsInVzZXIiOiJtYWRkYSIsInBvcnQiOjU4NzQ0LCJzc2hQb3J0IjoyMiwic2VjcmV0IjoiYWJjIn0';

describe('shouldTakeSystemScan', () => {
  test('takes the computer’s link, its bare code and the compact code', () => {
    assert.equal(shouldTakeSystemScan([LINK]), true);
    assert.equal(shouldTakeSystemScan([undefined, LINK.slice('https://ghostex.dev/pair#'.length)]), true);
    assert.equal(
      shouldTakeSystemScan([
        'GHOSTEX-EC2:AAUAAAICAMCAKBQHBAEQUCYMBUHA6EARCIJRIFIWC4MBSGQ3DQOR4HZAEERCGJBFEYTQAEDEMVTGO2DJNJVWY3LON5YHC4TT4V4AAFQAAVWWCZDEMEAA4U3UOVSGS37CQCMXGICNMFRQ',
      ]),
      true,
    );
  });

  test('takes a Ghostex code from a newer computer, so the app can say to update', () => {
    assert.equal(shouldTakeSystemScan(['ghostex-ec9:AAAA']), true);
  });

  test('keeps scanning past any other QR', () => {
    assert.equal(shouldTakeSystemScan(['https://example.com/menu']), false);
    assert.equal(shouldTakeSystemScan(['WIFI:S:home;;', undefined, '']), false);
  });
});
