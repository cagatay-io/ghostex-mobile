/// <reference types="node" />
/**
 * Run with `bun test src/usage`. The pane's identity and filtering over `accountUsageColumns`
 * rows. The core tests window projection; the screen test supplies a fake page answer through
 * the bridge and checks the values the pane actually draws with the shared usage row.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { buildUsageMeters } from './usageMeters';

function account(id: string | null, provider: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    provider,
    name: `${provider} ${id}`,
    email: `${id}@example.com`,
    registered: true,
    userDisabled: false,
    // Deliberately unlike the page's answer: no projection may be rebuilt from this window.
    usage: [{ id: 'fiveHour', usedPercent: 99, limitWindowSeconds: 18_000 }],
    ...extra,
  };
}

function projected(id: string | null, name: string) {
  return {
    id,
    usage: [{ label: `${name}: 23%`, name, value: '23%', percent: 22.5, reset: 'Resets due', resetIn: 'due' }],
  };
}

describe('the pane keeps identity and filtering over the core’s rows', () => {
  test('saved, enabled Claude and Codex accounts only, joined before filtering in input order', () => {
    const answer = {
      accounts: [
        account('found', 'claude', { registered: false }),
        account('off', 'codex', { userDisabled: true }),
        account('other', 'omp'),
        account('second', 'codex'),
        account('first', 'claude'),
      ],
    };
    const columns = answer.accounts.map((row) => projected(row.id, `Core ${row.id}`));
    assert.deepEqual(buildUsageMeters(answer, columns), [
      {
        id: 'second', provider: 'codex', name: 'codex second', email: 'second@example.com', usageError: '',
        meters: [{ name: 'Core second', value: '23%', percent: 22.5, resetIn: 'due' }], unavailable: false,
      },
      {
        id: 'first', provider: 'claude', name: 'claude first', email: 'first@example.com', usageError: '',
        meters: [{ name: 'Core first', value: '23%', percent: 22.5, resetIn: 'due' }], unavailable: false,
      },
    ]);
  });

  test('duplicate and missing ids do not attach another account’s columns', () => {
    const answer = { accounts: [account('same', 'claude'), account('same', 'codex'), account(null, 'claude')] };
    const columns = [projected('same', 'First'), projected('same', 'Second'), projected(null, 'Third')];
    assert.deepEqual(buildUsageMeters(answer, columns).map((row) => row.meters[0]?.name), ['First', 'Second', 'Third']);
  });

  test('an email equal to the name is not repeated; a missing name reads empty', () => {
    const answer = {
      accounts: [
        account('a', 'claude', { name: 'a@example.com', email: 'a@example.com' }),
        account('b', 'codex', { name: undefined, email: '' }),
      ],
    };
    const [same, nameless] = buildUsageMeters(answer, [{ id: 'a', usage: [] }, { id: 'b', usage: [] }]);
    assert.equal(same?.email, '');
    assert.equal(nameless?.name, '');
    assert.equal(nameless?.email, '');
  });

  test('anything that is not an accounts answer has no accounts', () => {
    for (const answer of [null, undefined, 'accounts', 3, [], {}, { accounts: 'none' }, { accounts: [null, 7] }]) {
      assert.deepEqual(buildUsageMeters(answer, []), []);
    }
  });
});

describe('the pane receives the core’s usage without recalculating it', () => {
  test('the panel’s reader keeps the returned labels, values and reset text, including null bar fields', () => {
    const answer = { accounts: [account('work', 'claude')] };
    const columns = [{ id: 'work', usage: [
      { name: 'Core label', value: '113%', percent: 100, resetIn: '59m' },
      { name: 'Core model', value: 'NaN%', percent: null, resetIn: null },
    ] }];
    assert.deepEqual(buildUsageMeters(answer, columns)[0]?.meters, [
      { name: 'Core label', value: '113%', percent: 100, resetIn: '59m' },
      { name: 'Core model', value: 'NaN%', percent: 0, resetIn: '' },
    ]);
  });

  test('no columns means unavailable, not a zero bar; the computer’s error is preserved', () => {
    const answer = { accounts: [account('spare', 'codex', { usageError: 'The helper could not read it.' })] };
    const [spare] = buildUsageMeters(answer, [{ id: 'spare', usage: [] }]);
    assert.equal(spare?.unavailable, true);
    assert.equal(spare?.usageError, 'The helper could not read it.');
    assert.deepEqual(spare?.meters, []);
  });
});
