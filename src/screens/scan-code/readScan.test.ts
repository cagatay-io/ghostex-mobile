/// <reference types="node" />
/** Run with `bun test src/screens/scan-code/readScan.test.ts` from apps/mobile/app. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { readScan } from './readScan';

/** The QR a computer shows from 2026-11-02: the compact code in its ghostex.dev link. */
const COMPACT_LINK =
  'https://ghostex.dev/pair#GHOSTEX-EC2:AAUAAAICAMCAKBQHBAEQUCYMBUHA6EARCIJRIFIWC4MBSGQ3DQOR4HZAEERCGJBFEYTQAEDEMVTGO2DJNJVWY3LON5YHC4TT4V4AAFQAAVWWCZDEMEAA4U3UOVSGS37CQCMXGICNMFRQ';
/** The QR before it: the `ghostex-ec1:` link (10.33 to 10.43). */
const JSON_LINK =
  'https://ghostex.dev/pair#ghostex-ec1:eyJ2IjoxLCJhZGRyZXNzIjoidGNBQUVDIiwibmFtZSI6Ik1hYyIsInVzZXIiOiJtYWRkYSIsInBvcnQiOjU4NzQ0LCJzc2hQb3J0IjoyMiwic2VjcmV0IjoiYWJjIn0';

describe('readScan', () => {
  test('reads the compact link from the raw text, the display text, or either case', () => {
    for (const payloads of [
      [COMPACT_LINK, COMPACT_LINK],
      [undefined, COMPACT_LINK],
      ['', COMPACT_LINK],
      [COMPACT_LINK.toLowerCase()],
    ]) {
      const read = readScan(payloads);
      assert.equal(read.kind, 'code', String(payloads));
      if (read.kind === 'code' && read.parsed.kind === 'easyConnect') {
        assert.equal(read.parsed.code.name, 'Studio’s Mac');
        assert.equal(read.parsed.code.secret, 'ZGVmZ2hpamtsbW5vcHFycw');
      } else {
        assert.fail('expected an Easy Connect code');
      }
    }
  });

  test('still reads the link older computers show', () => {
    assert.equal(readScan([JSON_LINK]).kind, 'code');
  });

  test('a display text that differs from the raw text does not hide a readable raw text', () => {
    assert.equal(readScan([COMPACT_LINK, 'ghostex.dev/pair']).kind, 'code');
  });

  test('a newer computer’s code asks for an update, any other QR is foreign', () => {
    assert.deepEqual(readScan(['https://ghostex.dev/pair#GHOSTEX-EC9:AAAA']), {
      kind: 'rejected',
      payload: 'https://ghostex.dev/pair#GHOSTEX-EC9:AAAA',
      outdated: true,
    });
    assert.deepEqual(readScan(['WIFI:S:home;;', undefined]), { kind: 'rejected', payload: 'WIFI:S:home;;', outdated: false });
    assert.deepEqual(readScan([undefined, '']), { kind: 'rejected', payload: '', outdated: false });
  });
});
