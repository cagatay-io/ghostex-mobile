/**
 * How the phone reaches a box's gxserver: the handshake and the forward the chat link
 * (`chat/rust/machine-link.ts`) runs for a `cloudbox:` machine instead of `ghostex server endpoint`
 * and an SSH port forward.
 *
 * CDXC:CloudBoxes 2026-11-02 WHY:
 * A box has no SSH the phone can sign in to: its gxserver answers on loopback only and tailcat
 * (Easy Connect's WireGuard relay sidecar) serves that port to the user's paired devices (Q1021
 * "private only"). So the phone asks the box's home computer for `connectInfo` and opens the native
 * tailcat forward pairing already uses (`startTailcatForward`), with no native change. A `local`
 * development box publishes its port on the computer's loopback instead (`direct`), which the phone
 * reaches through the SSH forward it holds to that computer. The token is kept in the secure store,
 * so a box the phone knew stays reachable while its computer is off.
 * SEE-ALSO: apps/desktop/src/app/gx_store/cloud_boxes.rs (`cloud_box_local_port`),
 * server/src/cloud_boxes/lifecycle.rs (`connect_info`)
 */

import { GhostexNative } from '../../modules/ghostex-native/src';
import { useMachinesStore } from '../machines/store';
import { ensureConnected } from '../remote/connection';
import { chatMachineLink } from '../chat/rust/machine-link';
import type { RpcAnswer } from '../chat/rust/transport';
import {
  cloudBoxEntryOfMachine,
  homeMachineOf,
  saveConnectInfo,
  storedConnectInfo,
  forgetConnectInfo,
} from './store';
import { boxIdOfMachine, isReachable, type CloudBoxConnectInfo } from './types';

const HOME_RPC_TIMEOUT_MS = 20_000;
const LOOPBACK = '127.0.0.1';

/** One `/api/cloudBoxes` call on a box's home computer, answered in the chat transport's terms. */
export async function homeCloudBoxesRpc(
  homeMachineId: string,
  action: string,
  params: Record<string, unknown> = {},
  timeoutMs = HOME_RPC_TIMEOUT_MS,
): Promise<RpcAnswer> {
  const home = useMachinesStore.getState().machines.find((machine) => machine.id === homeMachineId);
  if (home === undefined) {
    return { error: { code: 'unreachable', message: 'The computer this box belongs to is not saved here.', endpoint: '/api/cloudBoxes' } };
  }
  const link = chatMachineLink(home);
  // `rpc` sends only over a settled route; the first call runs the handshake.
  await link.route();
  return link.rpc('cloudBoxes', { action, ...params }, timeoutMs);
}

/** The gxserver endpoint of a box: what the chat link keeps once its handshake settled. */
export type BoxEndpoint = { info: CloudBoxConnectInfo; homeMachineId: string };

/**
 * The handshake for a box machine: its connect info when the box is up, else `null` (asleep,
 * starting, gone), with no network call for a box that is not up (Q1013: nothing wakes it on open).
 */
export async function boxHandshake(machineId: string): Promise<BoxEndpoint | null> {
  const entry = cloudBoxEntryOfMachine(machineId);
  if (entry === null || !isReachable(entry.box.state)) return null;
  const boxId = entry.box.boxId;
  const answer = await homeCloudBoxesRpc(entry.homeMachineId, 'connectInfo', { boxId });
  if (answer.error === null) {
    const info = answer.result as CloudBoxConnectInfo;
    if (typeof info?.gxserverToken === 'string' && info.gxserverToken.length > 0) {
      await saveConnectInfo({ ...info, boxId });
      return { info: { ...info, boxId }, homeMachineId: entry.homeMachineId };
    }
  }
  // The computer is off or does not answer: the info the phone last learned (or started the box with).
  const stored = await storedConnectInfo(boxId);
  return stored === null ? null : { info: stored, homeMachineId: entry.homeMachineId };
}

/** The port a `direct` box answers on, from its base URL (`http://127.0.0.1:<port>`). */
function directPort(info: CloudBoxConnectInfo): number | null {
  const match = /:(\d+)\/?$/u.exec(info.baseUrl ?? '');
  const port = match === null ? NaN : Number(match[1]);
  return Number.isInteger(port) && port > 0 && port < 65_536 ? port : null;
}

/** The phone-side loopback port of a box's gxserver; opens the forward when needed. */
export async function boxForward(machineId: string, endpoint: BoxEndpoint): Promise<number> {
  const { info } = endpoint;
  if (info.transport === 'tailcat') {
    if (info.tailcatAddress === undefined || info.tailcatAddress.length === 0) {
      throw new Error('The box has no Easy Connect address yet.');
    }
    const { localPort } = await GhostexNative.startTailcatForward(machineId, info.tailcatAddress, info.gxserverPort);
    return localPort;
  }
  if (info.transport === 'direct') {
    const port = directPort(info);
    const boxId = boxIdOfMachine(machineId) ?? '';
    const home = homeMachineOf(boxId);
    if (port === null || home === null) throw new Error('This box is reached through its computer, which is not saved here.');
    await ensureConnected(home);
    const { localPort } = await GhostexNative.startPortForward(home.id, port, LOOPBACK);
    return localPort;
  }
  throw new Error(`Unknown box transport ${info.transport}.`);
}

/** Closes a box's forward so the next handshake opens a fresh one. */
export async function closeBoxForward(machineId: string, endpoint: BoxEndpoint | null): Promise<void> {
  if (endpoint === null || endpoint.info.transport === 'tailcat') {
    await GhostexNative.stopTailcatForward(machineId).catch(() => undefined);
    return;
  }
  const port = directPort(endpoint.info);
  const home = homeMachineOf(boxIdOfMachine(machineId) ?? '');
  if (port !== null && home !== null) await GhostexNative.stopPortForward(home.id, port).catch(() => undefined);
}

/** A box that is gone: its forward and stored token go too. */
export async function forgetBoxLink(machineId: string): Promise<void> {
  await GhostexNative.stopTailcatForward(machineId).catch(() => undefined);
  const boxId = boxIdOfMachine(machineId);
  if (boxId !== null) await forgetConnectInfo(boxId);
}

const HEALTH_TIMEOUT_MS = 5_000;

/**
 * Waits until a woken box's gxserver answers `GET /api/health` through a fresh forward, so the
 * send that woke it does not go out on a connection the box's restart left dangling.
 *
 * CDXC:CloudBoxes 2026-11-02 WHY: boot restarts the box's tailcat (identity and allow-list), and a
 * request sent the moment the box reports running could hang on the old tunnel until the send's
 * own 16-minute timeout (proved in the W6 harness: the first send after a wake waited 5 minutes).
 * A short health probe over a new forward settles it in seconds.
 */
export async function waitForBoxAnswer(machineId: string, deadlineMs: number): Promise<boolean> {
  while (Date.now() < deadlineMs) {
    const endpoint = await boxHandshake(machineId).catch(() => null);
    if (endpoint !== null) {
      await closeBoxForward(machineId, endpoint);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
      try {
        const localPort = await boxForward(machineId, endpoint);
        const response = await fetch(`http://127.0.0.1:${localPort}/api/health`, { signal: controller.signal });
        await response.text();
        if (response.ok) return true;
      } catch {
        // Not answering yet; asked again below.
      } finally {
        clearTimeout(timer);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  return false;
}
