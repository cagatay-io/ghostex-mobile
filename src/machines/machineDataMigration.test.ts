/// <reference types="node" />
/** Run with `bun test src/machines/machineDataMigration.test.ts` from apps/mobile/app. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { migrateMachineData, migrateStoredValue, planStorageMigration } from './machineDataMigration';

const STALE = '0b1c2d3e-aaaa-4bbb-8ccc-111111111111';
const KEPT = '9f8e7d6c-dddd-4eee-8fff-222222222222';
const OTHER = '55555555-6666-4777-8888-999999999999';
const renames = new Map([[STALE, KEPT]]);

describe('migrateStoredValue', () => {
  test('moves per-machine map entries to the kept id', () => {
    const raw = JSON.stringify({ [STALE]: 'workspace-1', [OTHER]: 'workspace-9' });
    assert.deepEqual(JSON.parse(migrateStoredValue(raw, renames)), { [KEPT]: 'workspace-1', [OTHER]: 'workspace-9' });
  });

  test("keeps the kept machine's own entry over the dropped one's", () => {
    const raw = JSON.stringify({ [STALE]: 3000, [KEPT]: 5173 });
    assert.deepEqual(JSON.parse(migrateStoredValue(raw, renames)), { [KEPT]: 5173 });
  });

  test('rewrites session keys and nested JSON text', () => {
    const raw = JSON.stringify({
      [`${STALE}:sess-1`]: 'chat',
      [`${KEPT}:sess-2`]: 'terminal',
      wrapped: { w: 1, v: JSON.stringify({ target: `remote-${STALE}:proj:sess` }) },
      list: [STALE, OTHER],
    });
    assert.deepEqual(JSON.parse(migrateStoredValue(raw, renames)), {
      [`${KEPT}:sess-2`]: 'terminal',
      [`${KEPT}:sess-1`]: 'chat',
      wrapped: { w: 1, v: JSON.stringify({ target: `remote-${KEPT}:proj:sess` }) },
      list: [KEPT, OTHER],
    });
  });

  test('rewrites a plain-text value such as the selected machine id', () => {
    assert.equal(migrateStoredValue(STALE, renames), KEPT);
    assert.equal(migrateStoredValue(OTHER, renames), OTHER);
  });

  test('returns the value untouched, byte for byte, when no dropped id appears', () => {
    const raw = '{ "spaced":  true }';
    assert.equal(migrateStoredValue(raw, renames), raw);
  });
});

describe('planStorageMigration', () => {
  test('renames keys, rewrites values, and keeps the kept machine’s own keys', () => {
    const rows: [string, string | null][] = [
      ['machines.v1', JSON.stringify([{ id: STALE }])],
      ['machines.selectedId', STALE],
      ['workspaces.selectedIdByMachine', JSON.stringify({ [STALE]: 'w1' })],
      [`chat.draft.remote-${STALE}:p:s`, 'hello'],
      [`chat.draft.remote-${STALE}:p:t`, 'stale copy'],
      [`chat.draft.remote-${KEPT}:p:t`, 'kept copy'],
      ['settings.v1', JSON.stringify({ fontSize: 14 })],
      ['empty', null],
    ];
    const plan = planStorageMigration(rows, renames, new Set(['machines.v1']));
    assert.deepEqual(plan.set, [
      ['machines.selectedId', KEPT],
      ['workspaces.selectedIdByMachine', JSON.stringify({ [KEPT]: 'w1' })],
      [`chat.draft.remote-${KEPT}:p:s`, 'hello'],
    ]);
    assert.deepEqual(plan.remove, [`chat.draft.remote-${STALE}:p:s`, `chat.draft.remote-${STALE}:p:t`]);
  });

  test('does nothing without renames', () => {
    assert.deepEqual(planStorageMigration([['k', STALE]], new Map()), { set: [], remove: [] });
  });
});

describe('migrateMachineData', () => {
  test('applies the plan to storage', async () => {
    const store = new Map<string, string>([
      ['machines.v1', JSON.stringify([{ id: STALE }])],
      ['machines.selectedId', STALE],
      [`terminal.fontSizes.v1`, JSON.stringify({ [`${STALE}:s1`]: 15 })],
      [`chat.draft.remote-${STALE}:p:s`, 'hello'],
    ]);
    await migrateMachineData(
      {
        getAllKeys: async () => [...store.keys()],
        multiGet: async (keys) => keys.map((key) => [key, store.get(key) ?? null] as const),
        multiSet: async (pairs) => {
          for (const [key, value] of pairs) store.set(key, value);
        },
        multiRemove: async (keys) => {
          for (const key of keys) store.delete(key);
        },
      },
      renames,
      new Set(['machines.v1']),
    );
    assert.deepEqual(Object.fromEntries(store), {
      'machines.v1': JSON.stringify([{ id: STALE }]),
      'machines.selectedId': KEPT,
      'terminal.fontSizes.v1': JSON.stringify({ [`${KEPT}:s1`]: 15 }),
      [`chat.draft.remote-${KEPT}:p:s`]: 'hello',
    });
  });
});
