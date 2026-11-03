/**
 * The usage pane's account identity and filtering. The chat core's `accountUsageColumns` returns
 * every account's columns in input order; this joins those rows before keeping the saved, enabled
 * Claude and Codex accounts. Window labels, percentages and reset times belong to the core.
 */

import { usageColumns, type UsageColumn } from '../chat/native/composer/accountUsage';
import { arr, isTrue, obj, str } from '../chat/native/composer/json';

/** The providers whose usage the app knows: Claude and Codex for now (OMP is a later host extension). */
const PROVIDERS = ['claude', 'codex'] as const;
export type UsageProvider = (typeof PROVIDERS)[number];

/** One account of the computer with its usage. */
export type UsageAccount = {
  readonly id: string;
  readonly provider: UsageProvider;
  readonly name: string;
  /** Shown beside the name, as the Accounts panel does; empty when absent or the same as the name. */
  readonly email: string;
  /** What the computer says about reading this account's usage; empty when nothing. */
  readonly usageError: string;
  /** One per usage window, in the answer's order. */
  readonly meters: readonly UsageColumn[];
  /** The login reports no usage window: the pane says "Usage is unavailable for this login." instead of bars. */
  readonly unavailable: boolean;
};

/**
 * Keeps the pane's account list and identity over the core's columns. Join by input position, not
 * id: the core includes every row, even accounts with missing or duplicate ids.
 */
export function buildUsageMeters(answer: unknown, columns: unknown): UsageAccount[] {
  const accounts: UsageAccount[] = [];
  const projected = arr(columns);
  for (const [index, row] of arr(obj(answer)?.accounts).entries()) {
    const provider = PROVIDERS.find((entry) => entry === str(row, 'provider'));
    if (provider === undefined || !isTrue(row, 'registered') || isTrue(row, 'userDisabled')) continue;
    const name = str(row, 'name');
    const email = str(row, 'email');
    const meters = usageColumns(obj(projected[index])?.usage);
    accounts.push({
      id: str(row, 'id'),
      provider,
      name,
      email: email === name ? '' : email,
      usageError: str(row, 'usageError'),
      meters,
      unavailable: meters.length === 0,
    });
  }
  return accounts;
}
