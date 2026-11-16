/**
 * Moves a computer that fell back to Easy Connect back to Tailscale as soon as Tailscale reaches it
 * again (CDXC:RemotePairing 2026-11-12 DECISION in src/machines/routeChoice.ts).
 *
 * While the app is in front, every `MOVE_BACK_INTERVAL_MS`, when the network changes and when the
 * app comes back, each computer on Easy Connect is checked: with Tailscale up on the phone, a test
 * connection over Tailscale under its own id (`tailscaleProbeId`), so the live Easy Connect link is
 * untouched while it tries. Only when that test got through is the computer dialled again, Tailscale
 * first; its terminals drop for that moment and reattach (`autoReconnect.ts` on `connected`).
 */

import { AppState, Platform } from 'react-native';

import { GhostexNative } from '../../modules/ghostex-native/src';
import { resolveSshConfig } from '../machines/credentials';
import {
  hasEasyConnectRoute,
  tailscaleOnPhone,
  useMachineRoutes,
  withTailscaleHeadStart,
} from '../machines/easyConnectRoute';
import { MOVE_BACK_INTERVAL_MS, shouldTryMoveBack, tailscaleProbeId } from '../machines/routeChoice';
import { enabledMachines, useMachinesStore, type MachineRecord } from '../machines/store';
import { commandsInFlight } from '../remote/channelBudget';
import { ensureConnected } from '../remote/connection';
import { logAppEvent } from './appLog';
import { networkChangesHeard } from './networkChanges';

let installed = false;
const trying = new Set<string>();
const lastTryAt = new Map<string, number>();

/** Whether a fresh connection over Tailscale gets through to `machine`, without touching its live one. */
async function tailscaleReaches(machine: MachineRecord): Promise<boolean> {
  const probeId = tailscaleProbeId(machine.id);
  try {
    await GhostexNative.connect(probeId, withTailscaleHeadStart(await resolveSshConfig(machine)));
    return true;
  } catch {
    return false;
  } finally {
    await GhostexNative.disconnect(probeId).catch(() => undefined);
  }
}

/** How long a move back waits for the commands running on the Easy Connect connection to finish. */
const COMMANDS_FINISH_WAIT_MS = 10_000;
const COMMANDS_FINISH_STEP_MS = 250;

/**
 * Whether the commands running on `machineId`'s connection finished within `COMMANDS_FINISH_WAIT_MS`.
 *
 * CDXC:RemoteMachines 2026-11-16 WHY: issue #632: moving back to Tailscale replaced the Easy Connect connection
 * while a `ghostex sessions` read ran on it; the read failed ("E_CHANNEL_FAILED: Disconnected") and the phone said
 * "Ghostex on the computer couldn't do that", for a disconnect the phone made itself. The move back is never urgent
 * (Easy Connect works meanwhile), so it waits for what runs, and with commands still running it tries again at the
 * next check (`MOVE_BACK_INTERVAL_MS`). A read cut off anyway is read again quietly (inventory/store.ts).
 */
async function commandsFinished(machineId: string): Promise<boolean> {
  const until = Date.now() + COMMANDS_FINISH_WAIT_MS;
  while (commandsInFlight(machineId) > 0) {
    if (Date.now() >= until) return false;
    await new Promise((resolve) => setTimeout(resolve, COMMANDS_FINISH_STEP_MS));
  }
  return true;
}

async function check(force: boolean): Promise<void> {
  if (AppState.currentState !== 'active') return;
  const active = useMachineRoutes.getState().active;
  const candidates = enabledMachines(useMachinesStore.getState()).filter(
    (machine) => active[machine.id] === 'easyConnect' && hasEasyConnectRoute(machine),
  );
  if (candidates.length === 0) return;
  const tailscaleUp = await tailscaleOnPhone();
  for (const machine of candidates) {
    const now = Date.now();
    const go = shouldTryMoveBack({
      route: useMachineRoutes.getState().active[machine.id],
      tailscaleOnPhone: tailscaleUp,
      trying: trying.has(machine.id),
      lastTryAtMs: lastTryAt.get(machine.id) ?? null,
      nowMs: now,
      force,
    });
    if (!go) continue;
    trying.add(machine.id);
    lastTryAt.set(machine.id, now);
    void (async () => {
      try {
        if (!(await tailscaleReaches(machine))) return;
        // Still on Easy Connect (nothing else moved it meanwhile): dial again, Tailscale first.
        if (useMachineRoutes.getState().active[machine.id] !== 'easyConnect') return;
        if (!(await commandsFinished(machine.id))) {
          logAppEvent(
            `Connection: ${machine.id} stays on Easy Connect for now (${commandsInFlight(machine.id)} commands still running)`,
          );
          return;
        }
        if (useMachineRoutes.getState().active[machine.id] !== 'easyConnect') return;
        logAppEvent(`Connection: ${machine.id} moves back to Tailscale`);
        await ensureConnected(machine, { reset: true, reason: 'moving back to Tailscale' });
      } catch (error) {
        logAppEvent(
          `Connection: ${machine.id} could not move back to Tailscale (${error instanceof Error ? error.message : String(error)})`,
        );
      } finally {
        trying.delete(machine.id);
      }
    })();
  }
}

/** Installs the checks for the app's lifetime. */
export function initRouteMoveBack(): void {
  if (installed) return;
  installed = true;
  setInterval(() => void check(false), MOVE_BACK_INTERVAL_MS);
  AppState.addEventListener('change', (next) => {
    if (next === 'active') void check(true);
  });
  if (networkChangesHeard(Platform.OS, GhostexNative)) {
    GhostexNative.addListener('onNetworkChanged', () => void check(true));
  }
}
