/**
 * The usage pane's account identity and filtering. The chat core's `accountUsageColumns` returns
 * every account's columns in input order; this joins those rows before keeping the saved, enabled
 * Claude and Codex accounts. Window labels, percentages and reset times belong to the core.
 * The widget reuses those projected window names with the raw finite percent and absolute reset time.
 */

import { usageColumns, type UsageColumn } from '../chat/native/composer/accountUsage';
import { arr, isTrue, obj, str } from '../chat/native/composer/json';
import { UsageCopy } from '../copy';

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
 * The saved, enabled Claude and Codex accounts of an `agentAccounts` answer, in its order: the panel's own rule for
 * the accounts it offers, saved (`registered`) and not turned off (`userDisabled`).
 */
function savedAccounts(answer: unknown): { row: unknown; provider: UsageProvider; index: number }[] {
  const accounts: { row: unknown; provider: UsageProvider; index: number }[] = [];
  for (const [index, row] of arr(obj(answer)?.accounts).entries()) {
    const provider = PROVIDERS.find((entry) => entry === str(row, 'provider'));
    if (provider === undefined || !isTrue(row, 'registered') || isTrue(row, 'userDisabled')) continue;
    accounts.push({ row, provider, index });
  }
  return accounts;
}

/** Join by input position before filtering: the core includes rows with missing or duplicate account ids. */
export function buildUsageMeters(answer: unknown, columns: unknown): UsageAccount[] {
  const projected = arr(columns);
  return savedAccounts(answer).map(({ row, provider, index }) => {
    const name = str(row, 'name');
    const email = str(row, 'email');
    const meters = usageColumns(obj(projected[index])?.usage);
    return {
      id: str(row, 'id'),
      provider,
      name,
      email: email === name ? '' : email,
      usageError: str(row, 'usageError'),
      meters,
      unavailable: meters.length === 0,
    };
  });
}

/** One usage bar of the Home Screen widget (`widget-snapshot.schema.json`, `usage.bars`). */
export type UsageBar = {
  readonly label: string;
  /** Within 0 to 100, as the pane's bar draws it. */
  readonly usedPercent: number;
  /** ISO time of the window's reset; absent when the computer gives none. */
  readonly resetsAt?: string;
};

/** The widget's limit (schema `maxItems`). */
export const MAX_USAGE_BARS = 6;

/**
 * The Home Screen widget's usage bars: the pane's accounts in the pane's order, one bar per usage window with the
 * pane's window name, the first six. A bar is named by its provider ("Claude 5h"), or by its account where the
 * computer has more than one account of that provider ("Work 5h"). A window without a readable percent gets no bar
 * rather than an empty one; the reset travels as a time, so the widget can count down to it.
 */
export function buildUsageBars(answer: unknown, columns: unknown): UsageBar[] {
  const accounts = savedAccounts(answer);
  const projected = arr(columns);
  const bars: UsageBar[] = [];
  for (const { row, provider, index } of accounts) {
    const shared = accounts.filter((account) => account.provider === provider).length > 1;
    const name = str(row, 'name');
    const owner = shared && name.length > 0 ? name : UsageCopy.provider[provider];
    for (const [windowIndex, window] of arr(obj(row)?.usage).entries()) {
      const used = obj(window)?.usedPercent;
      const label = str(arr(obj(projected[index])?.usage)[windowIndex], 'name');
      if (typeof used !== 'number' || !Number.isFinite(used) || label.length === 0) continue;
      const resetsAt = Date.parse(str(window, 'resetsAt'));
      bars.push({
        label: UsageCopy.widgetBar(owner, label),
        usedPercent: Math.min(100, Math.max(0, used)),
        ...(Number.isNaN(resetsAt) ? {} : { resetsAt: new Date(resetsAt).toISOString() }),
      });
      if (bars.length === MAX_USAGE_BARS) return bars;
    }
  }
  return bars;
}
