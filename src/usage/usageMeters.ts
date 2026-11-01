/**
 * The usage meters of a computer's Claude and Codex accounts, from gxserver's `agentAccounts` answer,
 * the data the chat's Accounts panel is drawn from. The chat core projects each usage window into the panel's
 * compact column (`panel_usage_bars` in `packages/gx-chat-core/src/menus/native_accounts.rs`, labels and countdown in
 * `accounts_data.rs`); this is that projection in TypeScript, the JavaScript semantics the core reproduces
 * (`Math.round`, `String(number)`, `Date.parse`), so the pane shows the panel's numbers outside a chat session. The
 * columns are the panel's own type (`UsageColumn`), drawn the same way (`usageLines`).
 *
 * The answer is gxserver's and read leniently (`json.ts`): a missing or mistyped field reads as empty, never throws.
 * A login without usage gets no meters and says so (`unavailable`), never a bar at 0 %.
 * Free of React Native, so it loads in a plain `bun test`.
 */

import type { UsageColumn } from '../chat/native/composer/accountUsage';
import { arr, isTrue, num, obj, optStr, str } from '../chat/native/composer/json';

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

const DAY_SECONDS = 86_400;
const HOUR_SECONDS = 3_600;

/** `window.model` as a truthy value: an empty model is no model (`UsageWindow::scoped_model`). */
function scopedModel(window: unknown): string | null {
  const model = optStr(window, 'model');
  return model !== null && model.length > 0 ? model : null;
}

/** `accountUsageLabel`: `7d`, `5h`, `Fable`, `<model> 7d`, or the window's own label. */
function accountUsageLabel(window: unknown): string {
  if (str(window, 'model').toLowerCase() === 'fable') return 'Fable';
  const model = scopedModel(window);
  const seconds = num(window, 'limitWindowSeconds');
  const id = optStr(window, 'id');
  let duration: string | null = null;
  if (seconds !== null && seconds > 0) {
    if (seconds % DAY_SECONDS === 0) duration = `${String(seconds / DAY_SECONDS)}d`;
    else if (seconds % HOUR_SECONDS === 0) duration = `${String(seconds / HOUR_SECONDS)}h`;
    else duration = `${String(Math.floor(seconds / 60))}m`;
  } else if (id === 'fiveHour') duration = '5h';
  else if (id === 'sevenDay' || model !== null) duration = '7d';
  if (duration === null) return optStr(window, 'label') ?? 'undefined';
  return model === null ? duration : `${model} ${duration}`;
}

/** The compact column's name: a model's weekly window is the model alone (`compact_usage_label`). */
function compactUsageLabel(window: unknown): string {
  const label = accountUsageLabel(window);
  const model = scopedModel(window);
  return model !== null && label === `${model} 7d` ? model : label;
}

/** `formatResetCountdown`: days and hours from 24 hours on, else hours and minutes, else minutes. */
function formatResetCountdown(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function usageMeter(window: unknown, nowMs: number): UsageColumn {
  // `usedPercent` as the core reads it: a number, else NaN (written "NaN%", drawn as an empty bar).
  const used = obj(window)?.usedPercent;
  const percent = typeof used === 'number' ? used : Number.NaN;
  const resetsAt = Date.parse(str(window, 'resetsAt'));
  const remaining = resetsAt - nowMs;
  return {
    name: compactUsageLabel(window),
    value: `${String(Math.round(percent))}%`,
    percent: Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0,
    resetIn: Number.isNaN(resetsAt) ? '' : remaining > 0 ? formatResetCountdown(remaining) : 'due',
  };
}

/**
 * The saved, enabled Claude and Codex accounts of an `agentAccounts` answer, in its order, each with one meter per
 * usage window as the Accounts panel draws them at `nowMs`. The panel's own rule for the accounts it offers: saved
 * (`registered`) and not turned off (`userDisabled`).
 */
export function buildUsageMeters(answer: unknown, nowMs: number): UsageAccount[] {
  const accounts: UsageAccount[] = [];
  for (const row of arr(obj(answer)?.accounts)) {
    const provider = PROVIDERS.find((entry) => entry === str(row, 'provider'));
    if (provider === undefined || !isTrue(row, 'registered') || isTrue(row, 'userDisabled')) continue;
    const name = str(row, 'name');
    const email = str(row, 'email');
    const meters = arr(obj(row)?.usage).map((window) => usageMeter(window, nowMs));
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
