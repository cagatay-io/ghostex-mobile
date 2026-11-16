/**
 * A Tailscale computer is not dialled while Tailscale is off on this phone: the phone says so on the computer and
 * dials once Tailscale is on again or the network changes.
 *
 * CDXC:RemoteMachines 2026-11-16 WHY: issues #631 and #632 (an Android phone, a whole afternoon): with the
 * Tailscale VPN off, a Tailscale-only computer was dialled again and again, each dial ran out after 8 s, the
 * reconnect ladder and the dial back-off (30 s, 60 s, 120 s) kept it going, and the phone only ever said the computer
 * "did not answer". A 100.x address goes nowhere without the VPN, so a dial can't work; the phone knows Tailscale is
 * off (`isTailscaleConnected`), and says that instead. Plain SSH computers (a home-network address) are dialled as
 * before; a computer that also has Easy Connect still dials Easy Connect (remote/connection.ts `connectEitherRoute`).
 * SEE-ALSO: src/app/autoReconnect.ts (waits for Tailscale instead of the ladder), src/inventory/client.ts (the
 * computer's line), src/machines/store.ts (`isTailscaleSshMachine`, the address decides).
 */

import { logAppEvent } from '../app/appLog';
import { FailureCopy } from '../copy';
import type { MachineConnectionTarget } from '../machines/credentials';
import { lastKnownTailscaleOnPhone, tailscaleOnPhone, useMachineRoutes } from '../machines/easyConnectRoute';
import { isTailscaleSshMachine } from '../machines/store';

/** The code of the refusal: no native connect uses it. */
export const TAILSCALE_OFF_CODE = 'E_TAILSCALE_OFF';

type Target = Pick<MachineConnectionTarget, 'id' | 'host' | 'transport' | 'tailscaleSsh'>;

/** Computers not dialled because Tailscale was off at their last attempt. */
const waiting = new Set<string>();

/** Whether `machine` is reached over Tailscale (its saved address or Tailscale SSH), not Easy Connect. */
export function reachedOverTailscale(machine: Target): boolean {
  return machine.transport !== 'tailcat' && machine.transport !== 'demo' && isTailscaleSshMachine(machine);
}

/** The refusal `ensureConnected` throws in place of a dial. */
export function tailscaleOffError(): Error & { code: string } {
  const error = new Error(FailureCopy.tailscaleOff) as Error & { code: string };
  error.code = TAILSCALE_OFF_CODE;
  return error;
}

export function isTailscaleOffError(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === TAILSCALE_OFF_CODE;
}

/**
 * Whether a dial to `machine` over Tailscale would go nowhere: it is a Tailscale computer and this phone says
 * Tailscale is off. Unknown (an app build that can't tell) dials as before. Logs the first refusal of each wait.
 */
export async function tailscaleOffFor(machine: Target): Promise<boolean> {
  if (!reachedOverTailscale(machine)) return false;
  if ((await tailscaleOnPhone()) !== false) {
    waiting.delete(machine.id);
    return false;
  }
  if (!waiting.has(machine.id)) {
    waiting.add(machine.id);
    logAppEvent(`Connection: ${machine.id} not dialled: Tailscale is off on this phone`);
  }
  return true;
}

/** Throws the refusal when `tailscaleOffFor(machine)`. */
export async function refuseWhileTailscaleOff(machine: Target): Promise<void> {
  if (await tailscaleOffFor(machine)) throw tailscaleOffError();
}

export function machinesWaitingForTailscale(): string[] {
  return [...waiting];
}

export function stopWaitingForTailscale(machineId: string): void {
  waiting.delete(machineId);
}

/**
 * "; Tailscale off on this phone" for a failure line of a computer on its Tailscale route while the phone's last
 * look found Tailscale off, else nothing: the line then explains itself.
 */
export function tailscaleOffNote(machine: Target | undefined): string {
  if (machine === undefined || !reachedOverTailscale(machine)) return '';
  if (useMachineRoutes.getState().active[machine.id] === 'easyConnect') return '';
  return lastKnownTailscaleOnPhone() === false ? '; Tailscale off on this phone' : '';
}
