/// <reference types="node" />
/** Run with `bun test src/machines/pairingCodes.test.ts` from apps/mobile/app. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  encodeEasyConnectCode,
  encodeTailscaleCode,
  isGhostexPairingPayload,
  pairingLink,
  readPairingCode,
  type EasyConnectCode,
  type TailscaleCode,
} from './pairingCodes';

/** A code shaped like a real one: a 172-byte `tc` address and a computer name with a curly apostrophe. */
const address =
  'tcpGFwWCCl0EhM9pa-3vTQ0YmelxgiQeYI-eSO6MvYAm2RD0NcLGFrWCBYhxYTk8m_rBmNJSttcKfMlKHG29WBtwqTaARTKLQ1R2FxWCAP8Tihnn7V1PfiCEOOCKZ77Ns7oCyLIpQucs_qUOAaVmFygaFhToGjYWhudGMzMDNhLmlwbi5kZXZhNG8xODUuMTc4LjIwMi4xOTdhNnEyYTAwOmRkODA6MjA6OjIwNw';
const before: EasyConnectCode = {
  v: 1,
  address,
  name: 'Studio’s MacBook Pro',
  user: 'madda',
  port: 58744,
  sshPort: 22,
  secret: 'Iujwpx9qYo-HS_aPhRb64lJqjy08AbWo0_Z6yRCcBOc',
  expiresAt: '2026-10-26T04:20:38.191Z',
};
const today: EasyConnectCode = { ...before, secret: 'Iujwpx9qYo-HS_aPhRb64l' };
delete today.expiresAt;

const tailscale: TailscaleCode = { v: 1, name: 'Studio', host: 'studio.tail1234.ts.net', port: 22, user: 'madda' };

/** gxserver's `COMPACT_VECTOR` (server/src/remote_access/pairing_code.rs). */
const COMPACT_VECTOR =
  'GHOSTEX-EC2:AAUAAAICAMCAKBQHBAEQUCYMBUHA6EARCIJRIFIWC4MBSGQ3DQOR4HZAEERCGJBFEYTQAEDEMVTGO2DJNJVWY3LON5YHC4TT4V4AAFQAAVWWCZDEMEAA4U3UOVSGS37CQCMXGICNMFRQ';

describe('readPairingCode reads every code a computer since 10.30.0 has shown', () => {
  test('10.30.0 to 10.32.0: the bare code with its expiry', () => {
    assert.deepEqual(readPairingCode(encodeEasyConnectCode(before)), { kind: 'easyConnect', code: before });
    assert.deepEqual(readPairingCode(encodeTailscaleCode(tailscale)), { kind: 'tailscale', code: tailscale });
  });

  test('10.33.0 on: the code inside a ghostex.dev link', () => {
    assert.deepEqual(readPairingCode(pairingLink(encodeEasyConnectCode(before))), {
      kind: 'easyConnect',
      code: before,
    });
    assert.deepEqual(readPairingCode(pairingLink(encodeTailscaleCode(tailscale))), {
      kind: 'tailscale',
      code: tailscale,
    });
  });

  test('2026-10-27 on: a shorter secret, no expiry, and Copy as text gives the bare code', () => {
    assert.deepEqual(readPairingCode(pairingLink(encodeEasyConnectCode(today))), { kind: 'easyConnect', code: today });
    assert.deepEqual(readPairingCode(encodeEasyConnectCode(today)), { kind: 'easyConnect', code: today });
  });

  test('the compact code, bare, linked and in lower case', () => {
    const expected: EasyConnectCode = {
      v: 1,
      address: 'tcAAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJw',
      name: 'Studio’s Mac',
      user: 'madda',
      port: 58744,
      sshPort: 22,
      secret: 'ZGVmZ2hpamtsbW5vcHFycw',
    };
    for (const payload of [COMPACT_VECTOR, pairingLink(COMPACT_VECTOR), COMPACT_VECTOR.toLowerCase()]) {
      assert.deepEqual(readPairingCode(payload), { kind: 'easyConnect', code: expected }, payload);
    }
  });

  test('a pasted code keeps working with the spaces a chat app adds around it', () => {
    assert.equal(readPairingCode(`  ${encodeEasyConnectCode(today)}\n`)?.kind, 'easyConnect');
  });

  test('refuses broken and foreign codes', () => {
    for (const payload of [
      'GHOSTEX-EC2:',
      'GHOSTEX-EC2:AAUAAAICAMCA',
      'ghostex-ec1:not-base64!',
      'https://example.com/pair#ghostex-ec1:AAAA',
      'WIFI:S:home;;',
    ]) {
      assert.equal(readPairingCode(payload), null, payload);
    }
  });
});

describe('isGhostexPairingPayload', () => {
  test('tells a Ghostex code this build cannot read from a foreign QR', () => {
    assert.equal(isGhostexPairingPayload('ghostex-ec9:AAAA'), true);
    assert.equal(isGhostexPairingPayload('https://ghostex.dev/pair#ghostex-ec9:AAAA'), true);
    assert.equal(isGhostexPairingPayload('https://example.com/'), false);
    assert.equal(isGhostexPairingPayload('WIFI:S:home;;'), false);
  });
});
