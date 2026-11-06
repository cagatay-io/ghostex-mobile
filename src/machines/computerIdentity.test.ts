/// <reference types="node" />
/** Run with `bun test src/machines/computerIdentity.test.ts` from apps/mobile/app. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { dedupeMachineRecords, machineForSameComputer, tailcatServerKey } from './computerIdentity';
import type { MachineRecord } from './store';

/*
Real addresses from tailcat v0.6.0 (`ConnInfo.Addr()`): A1 and A2 are one server key with a different
pre-shared key and relay each (what pairing the same computer twice can give), B1 is another computer.
*/
const SERVER_A = 'nodekey:44dc694592367c1d73874c6e547bf6183e3d7a79666c291535b67989d1ccaf77';
const A1 =
  'tcpGFwWCBE3GlFkjZ8HXOHTG5Ue_YYPj16eWZsKRU1tnmJ0cyvd2FrWCDs6VpYSir_InhWQq3SVJn9pFz2McQU_hbvqrhrKZuLLWFxWCDLu4dL9g6NRRnK6EpBmR4-ZydUhxc-YWOoV2aMfOkfIWFygaFhToGiYWhzZGVycDEudGFpbHNjYWxlLmNvbWFkGQG7';
const A2 =
  'tcpGFwWCBE3GlFkjZ8HXOHTG5Ue_YYPj16eWZsKRU1tnmJ0cyvd2FrWCDs6VpYSir_InhWQq3SVJn9pFz2McQU_hbvqrhrKZuLLWFxWCDvFw8y6nCzr_QuKEcHIER9iplbLz1qBauE8Eb-3H6bwWFygaFhToGiYWhzZGVycDIudGFpbHNjYWxlLmNvbWFkGQG7';
const SERVER_B = 'nodekey:c7c319569ee2ccaa9f35c3796295434c05d7b6732b38963d5fd04e363c185624';
const B1 =
  'tcpGFwWCDHwxlWnuLMqp81w3lilUNMBde2cys4lj1f0E42PBhWJGFrWCDs6VpYSir_InhWQq3SVJn9pFz2McQU_hbvqrhrKZuLLWFxWCCfE2LV2I1XDf6EhaeOt2G8cwjz94J8uCqcDJ-8qsUwuWFygaFhToGiYWhzZGVycDEudGFpbHNjYWxlLmNvbWFkGQG7';
/** The address in pairingCodes.test.ts, shaped like a live computer's. */
const LIVE =
  'tcpGFwWCCl0EhM9pa-3vTQ0YmelxgiQeYI-eSO6MvYAm2RD0NcLGFrWCBYhxYTk8m_rBmNJSttcKfMlKHG29WBtwqTaARTKLQ1R2FxWCAP8Tihnn7V1PfiCEOOCKZ77Ns7oCyLIpQucs_qUOAaVmFygaFhToGjYWhudGMzMDNhLmlwbi5kZXZhNG8xODUuMTc4LjIwMi4xOTdhNnEyYTAwOmRkODA6MjA6OjIwNw';

function machine(id: string, fields: Partial<MachineRecord> = {}): MachineRecord {
  return {
    id,
    name: 'Studio Mac',
    host: `tailcat-${id}`,
    username: 'madda',
    port: 22,
    savePassword: false,
    transport: 'tailcat',
    lastConnectedAt: null,
    computerName: 'Studio Mac',
    ...fields,
  };
}

describe('tailcatServerKey', () => {
  test('reads the server key out of a real address', () => {
    assert.equal(tailcatServerKey(A1), SERVER_A);
    assert.equal(tailcatServerKey(` ${A2}\n`), SERVER_A);
    assert.equal(tailcatServerKey(B1), SERVER_B);
    assert.match(tailcatServerKey(LIVE) ?? '', /^nodekey:[0-9a-f]{64}$/u);
  });

  test('refuses what is not a tailcat address', () => {
    assert.equal(tailcatServerKey(''), null);
    assert.equal(tailcatServerKey('tc'), null);
    assert.equal(tailcatServerKey('tcnot*base64'), null);
    assert.equal(tailcatServerKey('ghostex-ec1:abc'), null);
    // Cut short inside the server key.
    assert.equal(tailcatServerKey(A1.slice(0, 20)), null);
  });
});

describe('dedupeMachineRecords', () => {
  test('leaves a list with one record per computer alone', () => {
    const machines = [
      machine('a', { transport: 'tailcat' }),
      machine('b'),
      machine('ssh', { transport: 'ssh', host: 'mac.local' }),
    ];
    const tokens: Record<string, string> = { a: A1, b: B1 };
    const result = dedupeMachineRecords(machines, (id) => tokens[id] ?? null);
    assert.deepEqual(result.merges, []);
    assert.deepEqual(result.machines, machines);
  });

  test('keeps the newest pairing in the first slot and drops the others', () => {
    const machines = [
      machine('old', { pairedAt: '2026-10-01T00:00:00Z', lastConnectedAt: '2026-11-05T09:00:00Z' }),
      machine('other'),
      machine('new', { pairedAt: '2026-11-04T00:00:00Z', lastConnectedAt: '2026-11-04T10:00:00Z', deviceId: 'dev2' }),
    ];
    const tokens: Record<string, string> = { old: A1, other: B1, new: A2 };
    const result = dedupeMachineRecords(machines, (id) => tokens[id] ?? null);
    assert.deepEqual(result.merges, [{ survivorId: 'new', staleIds: ['old'] }]);
    assert.deepEqual(
      result.machines.map((entry) => entry.id),
      ['new', 'other'],
    );
    // The kept record is the newest pairing's, with the latest connection of the group.
    assert.equal(result.machines[0]!.deviceId, 'dev2');
    assert.equal(result.machines[0]!.lastConnectedAt, '2026-11-05T09:00:00Z');
  });

  test('prefers a shown record, keeps a typed name, and shows the merged one', () => {
    const machines = [
      machine('typed', { name: 'Work laptop', pairedAt: '2026-10-01T00:00:00Z' }),
      machine('hidden', { pairedAt: '2026-11-04T00:00:00Z', disabled: true }),
      machine('shown', { pairedAt: '2026-10-20T00:00:00Z' }),
    ];
    const result = dedupeMachineRecords(machines, () => A1);
    assert.deepEqual(result.merges, [{ survivorId: 'shown', staleIds: ['typed', 'hidden'] }]);
    assert.equal(result.machines.length, 1);
    assert.equal(result.machines[0]!.id, 'shown');
    assert.equal(result.machines[0]!.name, 'Work laptop');
    assert.equal(result.machines[0]!.disabled, undefined);
  });

  test('stays hidden when every record for the computer was hidden', () => {
    const machines = [machine('a', { disabled: true }), machine('b', { disabled: true })];
    const result = dedupeMachineRecords(machines, () => A1);
    assert.equal(result.machines.length, 1);
    assert.equal(result.machines[0]!.disabled, true);
  });

  test('falls back to the record added last when nothing else tells them apart', () => {
    const result = dedupeMachineRecords([machine('first'), machine('second')], () => A2);
    assert.deepEqual(result.merges, [{ survivorId: 'second', staleIds: ['first'] }]);
  });

  test('never merges records without a readable address or SSH records', () => {
    const machines = [
      machine('noToken'),
      machine('bad'),
      machine('ssh1', { transport: 'ssh', host: 'mac.local' }),
      machine('ssh2', { transport: 'ssh', host: 'mac.local', username: 'other' }),
    ];
    const tokens: Record<string, string> = { bad: 'tcbroken', ssh1: A1, ssh2: A1 };
    const result = dedupeMachineRecords(machines, (id) => tokens[id] ?? null);
    assert.deepEqual(result.merges, []);
    assert.equal(result.machines.length, 4);
  });
});

describe('machineForSameComputer', () => {
  const machines = [machine('a'), machine('b'), machine('ssh', { transport: 'ssh', host: 'mac.local' })];
  const tokens: Record<string, string> = { a: A1, b: B1, ssh: A2 };
  const tokenOf = (id: string): string | null => tokens[id] ?? null;

  test('finds the saved record for the computer behind a new address', () => {
    assert.equal(machineForSameComputer(machines, tokenOf, A2)?.id, 'a');
    assert.equal(machineForSameComputer(machines, tokenOf, B1)?.id, 'b');
  });

  test('ignores the record being edited and unknown computers', () => {
    assert.equal(machineForSameComputer(machines, tokenOf, A2, 'a'), null);
    assert.equal(machineForSameComputer(machines, tokenOf, LIVE), null);
    assert.equal(machineForSameComputer(machines, tokenOf, 'tcbroken'), null);
  });

  test('finds a computer by the second address it gave the phone, which has a server key of its own', () => {
    // Record `b` was paired on B1; the computer later gave it LIVE (its address on our relay) too.
    const addressesOf = (id: string): readonly string[] => (id === 'b' ? [B1, LIVE] : []);
    assert.equal(machineForSameComputer(machines, tokenOf, LIVE, null, addressesOf)?.id, 'b');
    assert.equal(machineForSameComputer(machines, tokenOf, LIVE, 'b', addressesOf), null);
  });
});
