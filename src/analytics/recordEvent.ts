/**
 * Fire-and-forget delivery of fixed-vocabulary analytics pings to a computer's gxserver.
 *
 * The phone never talks to an analytics service directly. Every ping goes to the computer's own
 * `POST /api/recordClientEvent` endpoint (which enforces the user's analytics opt-out, the closed
 * taxonomy in `server/src/telemetry/taxonomy.rs`, and hourly deduplication).
 *
 * Delivery prefers the warm HTTP forward (`chatMachineLink(machine).gxserverLink()`, authenticated
 * with the main or paired-device bearer token): it consumes zero SSH exec command slots and reaches
 * every gxserver since 2026-10-27 directly, including builds whose `ghostex client-view` CLI subcommand
 * was omitted from `is_known_command`. Computers without port forwarding (`legacy`) fall back to the
 * matching `ghostex` CLI verb over SSH.
 */

import { chatMachineLink } from '../chat/rust/machine-link';
import { isCloudBoxMachineId } from '../cloudBoxes/types';
import { isDemoMachine } from '../demo/identity';
import { isOutdatedMachineFailure } from '../inventory/client';
import type { MachineConnectionTarget } from '../machines/credentials';
import { useMachinesStore } from '../machines/store';
import { execRemoteCommand } from '../remote/commands';

export type ClientEventBody = {
  readonly event: string;
  readonly properties: Readonly<Record<string, string>>;
};

export type ClientEventDelivery = 'sent' | 'unsupported' | 'failed';

const DEFAULT_TIMEOUT_MS = 10_000;

/** Look up a saved machine's SSH/Easy Connect connection target by id, or null for unknown/demo/box ids. */
export function lookupMachineTarget(machineId: string | null | undefined): MachineConnectionTarget | null {
  if (machineId == null || machineId.length === 0 || isCloudBoxMachineId(machineId)) return null;
  const record = useMachinesStore.getState().machines.find((machine) => machine.id === machineId);
  if (record === undefined || isDemoMachine(record)) return null;
  return {
    id: record.id,
    host: record.host,
    username: record.username,
    port: record.port,
    transport: record.transport,
    tailscaleSsh: record.tailscaleSsh,
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

async function postOverWarmLink(
  machine: MachineConnectionTarget,
  body: ClientEventBody,
  timeoutMs: number,
): Promise<ClientEventDelivery | 'fallback'> {
  const link = chatMachineLink(machine);
  const current = link.current();
  if (current === 'legacy') return 'fallback';
  if (current === 'unavailable') return 'failed';
  const startedAt = Date.now();
  let gxserver: Awaited<ReturnType<typeof link.gxserverLink>>;
  try {
    gxserver = await withTimeout(link.gxserverLink(), timeoutMs);
  } catch {
    return link.current() === 'legacy' ? 'fallback' : 'failed';
  }
  if (gxserver === null) {
    return link.current() === 'legacy' ? 'fallback' : 'failed';
  }
  const remainingMs = Math.max(1_000, timeoutMs - (Date.now() - startedAt));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), remainingMs);
  try {
    const response = await fetch(`http://127.0.0.1:${gxserver.localPort}/api/recordClientEvent`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${gxserver.authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (response.ok) return 'sent';
    if (response.status === 404) return 'unsupported';
    if (response.status === 401) link.forgetEndpoint();
    return 'fallback';
  } catch {
    return 'fallback';
  } finally {
    clearTimeout(timer);
  }
}

async function sendViaCli(machineId: string, command: string, timeoutMs: number): Promise<ClientEventDelivery> {
  try {
    const result = await execRemoteCommand(machineId, command, timeoutMs);
    const combined = `${result.stdout}\n${result.stderr}`;
    if (isOutdatedMachineFailure(combined)) return 'unsupported';
    if (result.exitCode !== 0) return 'failed';
    if (/"ok"\s*:\s*false/u.test(result.stdout)) return 'failed';
    return 'sent';
  } catch {
    return 'failed';
  }
}

/**
 * Deliver one analytics ping to `machine`. Never throws.
 * - `'sent'`: gxserver accepted the event (HTTP 2xx or CLI exit 0).
 * - `'unsupported'`: this machine's Ghostex predates the endpoint or CLI verb; caller should back off.
 * - `'failed'`: offline, busy, or transient transport error; caller may retry after a short cooldown.
 */
export async function sendMobileClientEvent(
  machine: MachineConnectionTarget,
  body: ClientEventBody,
  fallbackCliCommand: string | null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ClientEventDelivery> {
  if (isDemoMachine(machine) || isCloudBoxMachineId(machine.id)) return 'sent';
  try {
    const httpOutcome = await postOverWarmLink(machine, body, timeoutMs);
    if (httpOutcome !== 'fallback') return httpOutcome;
    if (fallbackCliCommand === null) return 'failed';
    return await sendViaCli(machine.id, fallbackCliCommand, timeoutMs);
  } catch {
    return 'failed';
  }
}
