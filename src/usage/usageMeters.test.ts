/// <reference types="node" />
/**
 * Run with `bun test src/usage/usageMeters.test.ts`. The real `buildUsageMeters` over the
 * computer's `agentAccounts` answer, the data the chat's Accounts panel (`accountPanel`) is projected from. The
 * expected columns are the chat core's own (`packages/gx-chat-core/src/menus/native_accounts.rs`, its test
 * `usage_bars_are_compact_columns_with_5h_7d_and_the_model_name`): the pane must show what that panel shows.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { buildUsageMeters } from './usageMeters';

/** The chat core test's clock. */
const NOW = 1_800_000_000_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function window(id: string, model: string | null, seconds: number, percent: number, resetMs: number | null) {
  return {
    id,
    label: id,
    usedPercent: percent,
    limitWindowSeconds: seconds,
    ...(resetMs === null ? {} : { resetsAt: new Date(resetMs).toISOString() }),
    ...(model === null ? {} : { model }),
  };
}

function account(id: string, provider: string, usage: unknown[], extra: Record<string, unknown> = {}) {
  return {
    id,
    provider,
    selector: id,
    name: `${provider} ${id}`,
    email: `${id}@example.com`,
    registered: true,
    userDisabled: false,
    status: 'ready',
    usage,
    ...extra,
  };
}

/** `agentAccounts {operation: "list"}`: a Claude account with two windows and a Codex account. */
const accountsAnswer = {
  accounts: [
    account('work', 'claude', [
      window('fiveHour', null, 18_000, 16.4, NOW + (2 * 60 + 36) * MINUTE),
      window('sevenDay', null, 604_800, 40, NOW + (5 * 24 + 4) * HOUR),
    ]),
    account('team', 'codex', [
      window('fiveHour', null, 18_000, 70, NOW + (60 + 5) * MINUTE),
      window('sevenDay', null, 604_800, 35, NOW + (4 * 24 + 2) * HOUR),
    ]),
  ],
  helpers: [],
};

describe('each usage window is one meter, as the Accounts panel draws it', () => {
  test('a Claude account with two windows and a Codex account', () => {
    const accounts = buildUsageMeters(accountsAnswer, NOW);
    assert.deepEqual(
      accounts.map(({ id, provider, name, email, meters, unavailable }) => ({
        id,
        provider,
        name,
        email,
        meters,
        unavailable,
      })),
      [
        {
          id: 'work',
          provider: 'claude',
          name: 'claude work',
          email: 'work@example.com',
          meters: [
            { name: '5h', value: '16%', percent: 16.4, resetIn: '2h 36m' },
            { name: '7d', value: '40%', percent: 40, resetIn: '5d 4h' },
          ],
          unavailable: false,
        },
        {
          id: 'team',
          provider: 'codex',
          name: 'codex team',
          email: 'team@example.com',
          meters: [
            { name: '5h', value: '70%', percent: 70, resetIn: '1h 5m' },
            { name: '7d', value: '35%', percent: 35, resetIn: '4d 2h' },
          ],
          unavailable: false,
        },
      ],
    );
  });

  test('model windows, a reset that is due and one without a reset time: the chat core’s columns', () => {
    const [claude] = buildUsageMeters(
      {
        accounts: [
          account('work', 'claude', [
            window('fiveHour', null, 18_000, 16.4, NOW + (2 * 60 + 36) * MINUTE),
            window('sevenDay', null, 604_800, 40, NOW + (5 * 24 + 4) * HOUR),
            window('sevenDayFable', 'Fable', 604_800, 0, null),
            window('sevenDaySonnet', 'Sonnet', 604_800, 3, NOW - 1),
            window('codexSpark', 'Spark', 18_000, 12, null),
          ]),
        ],
      },
      NOW,
    );
    assert.deepEqual(
      claude?.meters.map(({ name, value, resetIn }) => [name, value, resetIn]),
      [
        ['5h', '16%', '2h 36m'],
        ['7d', '40%', '5d 4h'],
        ['Fable', '0%', ''],
        ['Sonnet', '3%', 'due'],
        ['Spark 5h', '12%', ''],
      ],
    );
  });

  test('a bar keeps within 0 to 100 while the percent reads as reported; minutes and odd windows', () => {
    const [claude] = buildUsageMeters(
      {
        accounts: [
          account('work', 'claude', [
            window('over', null, 3_600, 112.5, NOW + 59 * MINUTE + 59_999),
            window('odd', null, 90, -4, NOW + 3 * MINUTE),
          ]),
        ],
      },
      NOW,
    );
    assert.deepEqual(claude?.meters, [
      { name: '1h', value: '113%', percent: 100, resetIn: '59m' },
      { name: '1m', value: '-4%', percent: 0, resetIn: '3m' },
    ]);
  });
});

describe('a login without usage', () => {
  const withoutUsage = {
    accounts: [account('spare', 'codex', [], { status: 'unavailable', usageError: 'The helper could not read it.' })],
  };

  test('its meters are an empty list', () => {
    assert.deepEqual(buildUsageMeters(withoutUsage, NOW)[0]?.meters, []);
  });

  test('it carries an explicit unavailable state, not zeros', () => {
    const [spare] = buildUsageMeters(withoutUsage, NOW);
    assert.equal(spare?.unavailable, true);
    assert.equal(spare?.usageError, 'The helper could not read it.');
    // Not a meter at 0 %: there is no meter at all, and the state says why.
    assert.deepEqual(spare?.meters, []);
  });
});

describe('the accounts the pane shows', () => {
  test('saved, enabled Claude and Codex accounts only, in the answer’s order', () => {
    const accounts = buildUsageMeters(
      {
        accounts: [
          account('found', 'claude', [], { registered: false }),
          account('off', 'codex', [], { userDisabled: true }),
          account('omp', 'omp', []),
          account('second', 'codex', []),
          account('first', 'claude', []),
        ],
      },
      NOW,
    );
    assert.deepEqual(
      accounts.map((entry) => entry.id),
      ['second', 'first'],
    );
  });

  test('an email equal to the name is not repeated; a missing name reads empty', () => {
    const [same, nameless] = buildUsageMeters(
      {
        accounts: [
          account('a', 'claude', [], { name: 'a@example.com', email: 'a@example.com' }),
          account('b', 'codex', [], { name: undefined, email: '' }),
        ],
      },
      NOW,
    );
    assert.equal(same?.email, '');
    assert.equal(nameless?.name, '');
    assert.equal(nameless?.email, '');
  });

  test('anything that is not an accounts answer has no accounts', () => {
    for (const answer of [null, undefined, 'accounts', 3, [], {}, { accounts: 'none' }, { accounts: [null, 7] }]) {
      assert.deepEqual(buildUsageMeters(answer, NOW), []);
    }
  });
});
