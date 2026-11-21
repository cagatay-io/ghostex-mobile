/**
 * The usage pane's account identity and filtering. The chat core's `accountUsageColumns` returns
 * every account's columns in input order; this joins those rows before keeping the saved, enabled
 * Claude, Codex, and usage-only accounts (Gemini, Cursor, Copilot, etc. from gxserver's
 * `usageAccounts`). Window labels, percentages and reset times for Claude and Codex belong to the
 * core; usage-only accounts reuse desktop's concise window labels (`5h`, `7d`, `Mo`, `Claude/GPT 5h`,
 * `Claude/GPT 7d`, etc.) and clean fallback countdowns.
 * The widget reuses those projected window names with the raw finite percent and absolute reset time.
 */

import { usageColumns, type UsageColumn } from '../chat/native/composer/accountUsage';
import { arr, isTrue, num, obj, str } from '../chat/native/composer/json';
import { agentIconTint, resolveAgentIconId, type AgentIconId } from '../contract/mobileSummary';
import { UsageCopy } from '../copy';

/** The managed providers in `accounts` (Claude Swap, Codex Swap, CLIProxyAPI hubs). */
const MANAGED_PROVIDERS = ['claude', 'codex'] as const;
/** Known usage-only providers in `usageAccounts` (`server/src/accounts/usage_only/`). */
const KNOWN_USAGE_ONLY_PROVIDERS = ['gemini', 'cursor', 'copilot'] as const;
export type UsageProvider =
  | (typeof MANAGED_PROVIDERS)[number]
  | (typeof KNOWN_USAGE_ONLY_PROVIDERS)[number]
  | (string & {});

/** One labelled value under a usage-only account's meters (e.g. "Plan spend", "$4.20 of $20.00"). */
export type UsageDetail = {
  readonly label: string;
  readonly value: string;
};

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
  /** The CLIProxyAPI hub the account is on (its name), or empty for a Claude Swap or Codex Swap account. */
  readonly hub: string;
  /**
   * The computer reads this login as needing a sign-in (`isSignedOut`): its icon wears an amber corner dot,
   * as the computer's sidebar meters do (CDXC:AgentProviders 2026-11-21, apps/desktop/src/app/titlebar/account_usage.rs).
   */
  readonly signedOut: boolean;
  /**
   * Signed out, and the user said the account isn't used on this computer ("Don't use on <computer>", gxserver's
   * `signInIgnored`, kept on the computer): no amber, a "Not used on <computer> · Undo" line instead.
   */
  readonly signInIgnored: boolean;
  /**
   * The limit resets the computer reads for this login (`resetCredits`), or null when it reports none (no reset
   * program for the plan, or not read yet).
   *
   * CDXC:AgentProviders 2026-11-21 DECISION: User: "please add to sessions in ghostex the ability to see the resets for
   * my claude accounts". The phone's usage pane and Accounts screen name how many are left under the meters.
   */
  readonly resets: number | null;
  /** True for usage-only accounts from `usageAccounts` (Gemini, Cursor, Copilot, etc.). */
  readonly usageOnly: boolean;
  /** gxserver's status (`ready`, `loading`, `loginRequired`, `unavailable`, `disabled`, ...). */
  readonly status: string;
  /** Plan name reported for a usage-only account (e.g. "Google AI Ultra", "Pro"), or empty. */
  readonly plan: string;
  /** Labelled details under a usage-only account's meters (Cursor Auto/API/spend, Copilot pools). */
  readonly details: readonly UsageDetail[];
};

const LIGHT_MONOCHROME_ICONS = new Set<AgentIconId>([
  'amp-cli',
  'codex',
  'copilot',
  'cursor-cli',
  'freebuff',
  'grok-build',
  'terminal',
  'zcode',
]);

/** Maps an account provider (`claude`, `codex`, `gemini`, `cursor`, `copilot`, ...) to its agent icon id. */
export function usageProviderIconId(provider: string): AgentIconId {
  return resolveAgentIconId(provider);
}

/** Brand tint for dark mode; uses foreground ink in light mode for white/monochrome provider glyphs. */
export function usageProviderIconColor(iconId: AgentIconId, light: boolean, foreground: string): string {
  return light && LIGHT_MONOCHROME_ICONS.has(iconId) ? foreground : agentIconTint(iconId);
}

/** Display label for any account provider (`Claude`, `Codex`, `Gemini`, `Cursor`, `Copilot`, ...). */
export function usageProviderLabel(provider: string): string {
  const key = provider.trim().toLowerCase();
  const known = UsageCopy.provider[key as keyof typeof UsageCopy.provider];
  if (known !== undefined) return known;
  if (key.length === 0) return 'Account';
  return key
    .split(/[-_\s]+/)
    .filter((word) => word.length > 0)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

/** gxserver's `resetCredits`: a count, or null when the account reports none. */
export function resetCount(row: unknown): number | null {
  const value = obj(row)?.resetCredits;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

/** Extra labelled values under a usage-only account's bars (`details`). */
export function usageDetails(row: unknown): UsageDetail[] {
  const details: UsageDetail[] = [];
  for (const entry of arr(obj(row)?.details)) {
    const label = str(entry, 'label').trim();
    const value = str(entry, 'value').trim();
    if (label.length > 0 && value.length > 0) details.push({ label, value });
  }
  return details;
}

/**
 * Desktop's concise window label (`settings_modal/tabs/accounts/data.rs` `UsageWindow::short_label`):
 * `5h`, `7d`, `Mo`, `Claude/GPT 5h`, `Claude/GPT 7d`, or `<n>h` / `<n>d` from `limitWindowSeconds`,
 * falling back to the computer's own `label` when no fixed duration applies.
 */
export function usageOnlyWindowLabel(window: unknown): string {
  const model = str(window, 'model').trim();
  if (model.toLowerCase() === 'fable') return 'Fable';
  const seconds = num(window, 'limitWindowSeconds');
  const id = str(window, 'id');
  let duration: string | null = null;
  if (seconds !== null && seconds > 0) {
    if (seconds === 604_800) {
      duration = '7d';
    } else if (seconds % 86_400 === 0) {
      duration = `${seconds / 86_400}d`;
    } else if (seconds % 3_600 === 0) {
      duration = `${seconds / 3_600}h`;
    } else {
      duration = `${Math.max(1, Math.floor(seconds / 60))}m`;
    }
  } else if (id === 'fiveHour') {
    duration = '5h';
  } else if (id === 'sevenDay') {
    duration = '7d';
  }
  if (duration !== null) {
    return model.length > 0 ? `${model} ${duration}` : duration;
  }
  const label = str(window, 'label').trim();
  if (label.length > 0) return label;
  if (model.length > 0) return model;
  return id === 'month' ? 'Mo' : '';
}

/** Matches gx-chat-core's `format_reset_countdown` when projecting usage-only columns without the core. */
function formatResetCountdown(resetsAt: string, nowMs: number): string {
  if (resetsAt.length === 0) return '';
  const at = Date.parse(resetsAt);
  if (Number.isNaN(at)) return '';
  const remaining = at - nowMs;
  if (remaining <= 0) return 'due';
  const totalMinutes = Math.floor(remaining / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/**
 * Normalizes a usage-only account's columns: uses the core's projected countdown and percentage where
 * available, applies desktop's concise labels (so `Claude/GPT 7d` keeps `7d` beside `Claude/GPT 5h`),
 * handles 0% and 100% cleanly, and drops malformed windows without a finite percent or label.
 */
function buildUsageOnlyColumns(row: unknown, projected: unknown, nowMs: number): UsageColumn[] {
  const coreColumns = usageColumns(projected);
  const rawWindows = arr(obj(row)?.usage);
  const columns: UsageColumn[] = [];
  for (const [windowIndex, rawWindow] of rawWindows.entries()) {
    const used = obj(rawWindow)?.usedPercent;
    if (typeof used !== 'number' || !Number.isFinite(used)) continue;
    const clamped = Math.min(100, Math.max(0, used));
    const core = coreColumns[windowIndex];
    const name = usageOnlyWindowLabel(rawWindow) || (core !== undefined && core.name !== 'undefined' ? core.name : '');
    if (name.length === 0) continue;
    const value =
      core !== undefined && core.value.length > 0 && !core.value.includes('NaN')
        ? core.value
        : `${Math.round(clamped)}%`;
    const resetIn = core !== undefined ? core.resetIn : formatResetCountdown(str(rawWindow, 'resetsAt'), nowMs);
    columns.push({ name, value, percent: clamped, resetIn });
  }
  return columns;
}

/**
 * The answer with each CLIProxyAPI hub account (`cliproxyHubs[].accounts`, sent only while that extension is on and
 * the computer has the hub's management key) appended to `accounts` as a saved account, so the core projects its
 * meters like any other. A hub account whose login is also a saved Claude Swap or Codex Swap account here is left out:
 * the Swap one already shows it, as the computer's sidebar does (apps/desktop/src/app/titlebar/account_usage.rs
 * `distinct_accounts`); an unsaved or turned-off Swap login doesn't count. Hub accounts the hub turned off are left
 * out too.
 *
 * SEE-ALSO: server/src/accounts/hub/mod.rs (`rows`), server/src/accounts/hub/sidebar.rs.
 */
export function withHubAccounts(answer: unknown): unknown {
  const root = obj(answer);
  const hubs = arr(root?.cliproxyHubs);
  if (root === null || root === undefined || hubs.length === 0) return answer;
  const accounts = arr(root.accounts);
  // Only a Swap login saved here, not turned off and signed in stands in for its hub twin, matched by provider, email and,
  // when both name one, Codex workspace (gxserver's `swapLogins`; older computers: the saved accounts themselves).
  const saved = Array.isArray(root.swapLogins)
    ? arr(root.swapLogins)
    : accounts.filter(
        (row) => isTrue(row, 'registered') && !isTrue(row, 'userDisabled') && str(row, 'status') === 'ready',
      );
  const swapLogin = (provider: string, email: string, workspace: string) =>
    email.length > 0 &&
    saved.some((row) => {
      const theirs = str(row, 'workspace');
      return (
        str(row, 'provider') === provider &&
        str(row, 'email').toLowerCase() === email.toLowerCase() &&
        (theirs.length === 0 || workspace.length === 0 || theirs === workspace)
      );
    });
  const added: unknown[] = [];
  for (const hub of hubs) {
    for (const row of arr(obj(hub)?.accounts)) {
      const provider = str(row, 'provider');
      const name = str(row, 'name');
      const email = name.includes('@') ? name : '';
      if (!MANAGED_PROVIDERS.some((entry) => entry === provider) || str(row, 'status') === 'disabled') continue;
      // Hidden from the computer's sidebar meters (its Show usage in the sidebar): not listed here either.
      if (obj(row)?.showInSidebar === false) continue;
      if (swapLogin(provider, email, str(row, 'workspace'))) continue;
      // The hub's reason for an account it can't use, when there is no usage error to show.
      const reason = str(row, 'usageError') || (str(row, 'status') === 'error' ? str(row, 'statusMessage') : '');
      added.push({
        id: str(row, 'id'),
        provider,
        name,
        email: '',
        registered: true,
        status: 'ready',
        usage: arr(obj(row)?.usage),
        usageError: reason,
        hubLabel: str(hub, 'label'),
      });
    }
  }
  return added.length === 0 ? answer : { ...root, accounts: [...accounts, ...added] };
}

/**
 * The answer with each usage-only account (`usageAccounts`, e.g. Gemini, Cursor, Copilot from
 * `server/src/accounts/usage_only/`) appended to `accounts` so the chat core projects its windows
 * alongside Claude and Codex. Older computers that omit `usageAccounts` pass through untouched.
 */
export function withUsageAccounts(answer: unknown): unknown {
  const root = obj(answer);
  const usageRows = arr(root?.usageAccounts);
  if (root === null || usageRows.length === 0) return answer;
  const accounts = arr(root.accounts);
  const seen = new Set(accounts.map((row) => str(row, 'id')).filter((id) => id.length > 0));
  const added: unknown[] = [];
  for (const raw of usageRows) {
    const record = obj(raw);
    if (record === null) continue;
    const provider = str(record, 'provider').trim().toLowerCase();
    if (provider.length === 0) continue;
    const id = str(record, 'id').trim();
    if (id.length > 0 && seen.has(id)) continue;
    if (id.length > 0) seen.add(id);
    // Keep only windows with a finite numeric percent so the core never formats "NaN%".
    const usage = arr(record.usage).filter((window) => {
      const used = obj(window)?.usedPercent;
      return typeof used === 'number' && Number.isFinite(used);
    });
    added.push({
      ...record,
      id: id.length > 0 ? id : `${provider}-${added.length}`,
      provider,
      usageOnly: true,
      registered: record.registered !== false,
      usage,
    });
  }
  return added.length === 0 ? answer : { ...root, accounts: [...accounts, ...added] };
}

/**
 * The saved, enabled accounts of an `agentAccounts` answer, in its order: Claude and Codex from `accounts`
 * plus any usage-only accounts appended from `usageAccounts`, saved (`registered`) and not turned off (`userDisabled`).
 */
function savedAccounts(
  answer: unknown,
): { row: unknown; provider: UsageProvider; usageOnly: boolean; index: number }[] {
  const accounts: { row: unknown; provider: UsageProvider; usageOnly: boolean; index: number }[] = [];
  for (const [index, row] of arr(obj(answer)?.accounts).entries()) {
    const provider = str(row, 'provider').trim().toLowerCase();
    const usageOnly = isTrue(row, 'usageOnly');
    const supported = usageOnly ? provider.length > 0 : MANAGED_PROVIDERS.some((entry) => entry === provider);
    if (!supported || !isTrue(row, 'registered') || isTrue(row, 'userDisabled')) continue;
    accounts.push({ row, provider, usageOnly, index });
  }
  return accounts;
}

/**
 * Whether the computer reads this login as signed out: `loginRequired` (a dead saved login, or a session reported
 * "Login expired"), `identityChanged`, or `unavailable` for an account synced from another computer that was never
 * signed in on this one (`syncedFrom`). A plain `unavailable` (the saved login missing for another reason) is not.
 */
export function isSignedOut(row: unknown): boolean {
  return needsSignIn(row) && !isTrue(row, 'signInIgnored');
}

/** `isSignedOut` before the user's "Don't use on <computer>" (`signInIgnored`). */
function needsSignIn(row: unknown): boolean {
  const status = str(row, 'status');
  if (status === 'loginRequired' || status === 'identityChanged') return true;
  return status === 'unavailable' && str(row, 'syncedFrom').length > 0;
}

/** Needs a sign-in the user said it won't get on this computer (`signInIgnored`). */
export function isSignInIgnored(row: unknown): boolean {
  return needsSignIn(row) && isTrue(row, 'signInIgnored');
}

/** Join by input position before filtering: the core includes rows with missing or duplicate account ids. */
export function buildUsageMeters(answer: unknown, columns: unknown, nowMs: number = Date.now()): UsageAccount[] {
  const projected = arr(columns);
  return savedAccounts(answer).map(({ row, provider, usageOnly, index }) => {
    const name = str(row, 'name') || (usageOnly ? usageProviderLabel(provider) : '');
    const email = str(row, 'email');
    const meters = usageOnly
      ? buildUsageOnlyColumns(row, obj(projected[index])?.usage, nowMs)
      : usageColumns(obj(projected[index])?.usage);
    return {
      id: str(row, 'id'),
      provider,
      name,
      email: email === name ? '' : email,
      usageError: str(row, 'usageError'),
      meters,
      unavailable: meters.length === 0,
      hub: str(row, 'hubLabel'),
      signedOut: isSignedOut(row),
      signInIgnored: usageOnly ? false : isSignInIgnored(row),
      resets: usageOnly ? null : resetCount(row),
      usageOnly,
      status: str(row, 'status'),
      plan: usageOnly ? str(row, 'plan').trim() : '',
      details: usageOnly ? usageDetails(row) : [],
    };
  });
}

/** One usage bar of the Home Screen widget (the snapshot's `usage.bars`). */
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
 * pane's window name, the first six. A bar is named by its provider ("Claude 5h", "Gemini 5h"), or by its account
 * where the computer has more than one account of that provider ("Work 5h"). A window without a readable percent
 * gets no bar rather than an empty one; the reset travels as a time, so the widget can count down to it.
 */
export function buildUsageBars(answer: unknown, columns: unknown): UsageBar[] {
  const accounts = savedAccounts(answer);
  const projected = arr(columns);
  const bars: UsageBar[] = [];
  for (const { row, provider, usageOnly, index } of accounts) {
    const shared = accounts.filter((account) => account.provider === provider).length > 1;
    const name = str(row, 'name');
    const owner = shared && name.length > 0 ? name : usageProviderLabel(provider);
    for (const [windowIndex, window] of arr(obj(row)?.usage).entries()) {
      const used = obj(window)?.usedPercent;
      const label = usageOnly
        ? usageOnlyWindowLabel(window)
        : str(arr(obj(projected[index])?.usage)[windowIndex], 'name');
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
