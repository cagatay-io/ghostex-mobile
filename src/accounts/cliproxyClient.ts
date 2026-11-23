/**
 * CLIProxyAPI hub status for the phone's CLIProxyAPI status screen: reads `agentAccounts` (`operation: 'list'`)
 * on a connected computer, projects usage meters for each hub's Claude and Codex accounts (never Antigravity),
 * and supports clearing an account's cooldown when the hub has a management key.
 *
 * Compatible with older computers: computers without `cliproxyHubs` report `enabled: false`, and older hubs
 * without `sessionAffinity`, `routingStrategy`, or `canManage` fall back cleanly.
 */

import { sessionChatRpc } from '../chat/rust/transport';
import { wasmCoreBridge } from '../chat/rust/wasm-core/bridge';
import { arr, isTrue, obj, str } from '../chat/native/composer/json';
import type { UsageColumn } from '../chat/native/composer/accountUsage';
import type { MachineConnectionTarget } from '../machines/credentials';
import { buildUsageMeters } from '../usage/usageMeters';

import type { AccountsAnswer } from './client';

const LIST_TIMEOUT_MS = 60_000;
const ACTION_TIMEOUT_MS = 30_000;

export type CliProxyHubAccount = {
  readonly id: string;
  readonly provider: 'claude' | 'codex';
  readonly name: string;
  readonly plan: string;
  /** `ready`, `coolingDown`, `disabled`, or `error`. */
  readonly status: string;
  readonly statusMessage: string;
  readonly requiresSignIn: boolean;
  readonly nextRetryAfter: string;
  readonly usageError: string;
  readonly meters: readonly UsageColumn[];
  readonly showInSidebar: boolean;
  readonly canManage: boolean;
};

export type CliProxyHub = {
  readonly id: string;
  readonly label: string;
  readonly url: string;
  readonly host: string;
  readonly hasManagementKey: boolean;
  /** `ready`, `loading`, `unavailable`, or `noManagementKey`. */
  readonly status: string;
  readonly error: string;
  readonly updatedAt: string;
  readonly sessionAffinity: boolean | null;
  readonly routingStrategy: string;
  readonly accounts: readonly CliProxyHubAccount[];
};

export type CliProxyStatusData = {
  /** False when the CLIProxyAPI built-in extension is off on the computer (or an older gxserver). */
  readonly enabled: boolean;
  readonly hubs: readonly CliProxyHub[];
};

async function call(machine: MachineConnectionTarget, params: Record<string, unknown>, timeoutMs: number) {
  const answer = await sessionChatRpc(machine, 'agentAccounts', params, timeoutMs);
  if (answer.error !== null) {
    const code = answer.error.code;
    return {
      ok: false as const,
      unreachable: code === 'unreachable' || code === 'cloudBoxUnavailable' || code === 'cloudBoxAsleep',
      message: answer.error.message,
    };
  }
  return { ok: true as const, value: answer.result };
}

/** Reads CLIProxyAPI hubs and their Claude and Codex accounts from a computer. */
export async function readCliProxyStatus(
  machine: MachineConnectionTarget,
  refresh: boolean,
): Promise<AccountsAnswer<CliProxyStatusData>> {
  const answer = await call(machine, { operation: 'list', ...(refresh ? { refresh: true } : {}) }, LIST_TIMEOUT_MS);
  if (!answer.ok) return answer;

  const root = obj(answer.value);
  if (root === null || !Array.isArray(root.cliproxyHubs)) {
    return { ok: true, value: { enabled: false, hubs: [] } };
  }

  const rawHubs = arr(root.cliproxyHubs);
  const flatAccounts: Record<string, unknown>[] = [];
  for (const rawHub of rawHubs) {
    for (const rawAccount of arr(obj(rawHub)?.accounts)) {
      const provider = str(rawAccount, 'provider').trim().toLowerCase();
      if (provider !== 'claude' && provider !== 'codex') continue;
      flatAccounts.push({
        ...(obj(rawAccount) ?? {}),
        provider,
        registered: true,
        showInTitlebar: true,
      });
    }
  }

  const nowMs = Date.now();
  let columns: unknown = [];
  if (flatAccounts.length > 0) {
    try {
      columns = await wasmCoreBridge.call({
        op: 'accountUsageColumns',
        args: [JSON.stringify({ accounts: flatAccounts }), nowMs],
      });
    } catch {
      // No chat core yet: fall back to status and metadata without meter bars.
    }
  }

  const meterMap = new Map(
    buildUsageMeters({ accounts: flatAccounts }, columns, nowMs).map((account) => [
      `${account.provider}:${account.id}`,
      account.meters,
    ]),
  );

  const hubs: CliProxyHub[] = rawHubs.map((rawHub) => {
    const hubObj = obj(rawHub);
    const sessionAffinity =
      typeof hubObj?.sessionAffinity === 'boolean' ? hubObj.sessionAffinity : null;
    const accounts: CliProxyHubAccount[] = arr(hubObj?.accounts)
      .filter((rawAccount) => {
        const provider = str(rawAccount, 'provider').trim().toLowerCase();
        return provider === 'claude' || provider === 'codex';
      })
      .map((rawAccount) => {
        const id = str(rawAccount, 'id');
        const provider = str(rawAccount, 'provider').trim().toLowerCase() as 'claude' | 'codex';
        const showInSidebar = obj(rawAccount)?.showInSidebar !== false;
        return {
          id,
          provider,
          name: str(rawAccount, 'name') || provider,
          plan: str(rawAccount, 'plan').trim(),
          status: str(rawAccount, 'status') || 'ready',
          statusMessage: str(rawAccount, 'statusMessage').trim(),
          requiresSignIn: isTrue(rawAccount, 'requiresSignIn'),
          nextRetryAfter: str(rawAccount, 'nextRetryAfter').trim(),
          usageError: str(rawAccount, 'usageError').trim(),
          meters: meterMap.get(`${provider}:${id}`) ?? [],
          showInSidebar,
          canManage: isTrue(rawAccount, 'canManage'),
        };
      });

    return {
      id: str(rawHub, 'id'),
      label: str(rawHub, 'label') || str(rawHub, 'host') || str(rawHub, 'url'),
      url: str(rawHub, 'url'),
      host: str(rawHub, 'host'),
      hasManagementKey: isTrue(rawHub, 'hasManagementKey'),
      status: str(rawHub, 'status') || 'ready',
      error: str(rawHub, 'error').trim(),
      updatedAt: str(rawHub, 'updatedAt').trim(),
      sessionAffinity,
      routingStrategy: str(rawHub, 'routingStrategy').trim(),
      accounts,
    };
  });

  return { ok: true, value: { enabled: true, hubs } };
}

/** Clears cooldown state for one hub account on a hub with a management key. */
export async function resetHubAccountCooldown(
  machine: MachineConnectionTarget,
  accountId: string,
): Promise<AccountsAnswer<true>> {
  const answer = await call(
    machine,
    { operation: 'hubAccountResetCooldown', accountId },
    ACTION_TIMEOUT_MS,
  );
  return answer.ok ? { ok: true, value: true } : answer;
}

/** Formats an ISO cooldown reset timestamp relative to `nowMs`. */
export function formatCooldownReset(iso: string, nowMs: number = Date.now()): string | null {
  if (iso.length === 0) return null;
  const targetMs = Date.parse(iso);
  if (!Number.isFinite(targetMs)) return null;
  const seconds = Math.floor((targetMs - nowMs) / 1000);
  if (seconds <= 0) return 'ready soon';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `resets in ${Math.max(1, minutes)}m`;
  if (minutes < 24 * 60) return `resets in ${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  const date = new Date(targetMs);
  return `resets ${date.toLocaleDateString(undefined, { weekday: 'short' })} ${date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}
