/**
 * Where a chat request to a session on a Cloud Box may go, and the wake a send needs.
 *
 * CDXC:CloudBoxes 2026-11-02 DECISION:
 * User (Q1013): "On sending a message there. Not on opening the session." Every chat call to a
 * paused or stopped box is refused with `cloudBoxAsleep` without any network call (gx-chat-core's
 * `session/cloud_box.rs` then shows the chat as ready with "Stopped · sending wakes it"); only a
 * call that delivers a message resumes the box, through its computer when it answers and through
 * the provider with the phone's cloud kit when it is off (Q1033), then waits until the box is back.
 * SEE-ALSO: apps/desktop/src/app/gx_store/cloud_boxes.rs (`cloud_box_send_target`),
 * packages/gx-chat-core/src/session/cloud_box.rs
 */

import type { ChatRpcError } from '../chat/rust/events';
import { chatMachineLink } from '../chat/rust/machine-link';
import { homeCloudBoxesRpc, waitForBoxAnswer } from './boxLink';
import { cloudBoxEntryOfMachine, findMachineRecord, useCloudBoxesStore } from './store';
import {
  CLOUD_BOX_ASLEEP,
  CLOUD_BOX_UNAVAILABLE,
  isReachable,
  isStarting,
  wakesOnSend,
  type CloudBox,
} from './types';

/** The calls that deliver a message, and so may wake a box (`cloudBoxAsleep`'s SEE-ALSO list). */
export const WAKING_METHODS = new Set([
  'sendSessionChatMessage',
  'queueSessionChatPrompt',
  'sendSessionChatQueuedPrompt',
  'answerSessionChatPrompt',
]);

/** How long a send waits for a woken box to come back (the desktop's `WAKE_WAIT`). */
const WAKE_WAIT_MS = 5 * 60_000;
const WAKE_POLL_MS = 1_500;

function refusal(code: string, message: string, method: string): ChatRpcError {
  return { code, message, endpoint: `/api/${method}` };
}

/** Concurrent sends wake a box once. */
const waking = new Map<string, Promise<ChatRpcError | null>>();

/**
 * Resumes a box by whichever route is open: its computer (`cloudBoxes resume`), else the provider
 * with the phone's cloud kit. Answers the row after the call, or an error message.
 */
type Resumer = (box: CloudBox, homeMachineId: string) => Promise<CloudBox | string>;
let providerResumer: Resumer | null = null;

/** The computer-off path registers its provider resume here (./phoneStart.ts). */
export function setProviderResumer(resumer: Resumer): void {
  providerResumer = resumer;
}

async function resumeBox(
  box: CloudBox,
  homeMachineId: string,
  source: 'home' | 'provider',
): Promise<CloudBox | string> {
  // A box the phone started itself is not in its computer's registry yet (./actions.ts `onHome`).
  if (source === 'provider' && providerResumer !== null) return providerResumer(box, homeMachineId);
  const answer = await homeCloudBoxesRpc(homeMachineId, 'resume', { boxId: box.boxId });
  if (answer.error === null) {
    const row = (answer.result as { box?: CloudBox } | null)?.box;
    return row ?? { ...box, state: 'creating' };
  }
  if (answer.error.code !== 'unreachable' || providerResumer === null) return answer.error.message;
  return providerResumer(box, homeMachineId);
}

/** Reads one box's row from its computer, when it answers. */
async function readRow(boxId: string, homeMachineId: string): Promise<CloudBox | null> {
  const answer = await homeCloudBoxesRpc(homeMachineId, 'get', { boxId }, 10_000);
  if (answer.error !== null) return null;
  return (answer.result as { box?: CloudBox } | null)?.box ?? null;
}

async function wake(machineId: string, method: string): Promise<ChatRpcError | null> {
  const entry = cloudBoxEntryOfMachine(machineId);
  if (entry === null) return refusal(CLOUD_BOX_UNAVAILABLE, 'This cloud box is no longer listed.', method);
  const { box, homeMachineId } = entry;
  if (wakesOnSend(box.state) || box.state === 'failed') {
    const resumed = await resumeBox(box, homeMachineId, entry.source);
    if (typeof resumed === 'string') {
      return refusal(CLOUD_BOX_UNAVAILABLE, `Could not wake the cloud box: ${resumed}`, method);
    }
    useCloudBoxesStore.getState().putBox(homeMachineId, resumed, entry.source);
  }
  const deadline = Date.now() + WAKE_WAIT_MS;
  while (Date.now() < deadline) {
    const current = cloudBoxEntryOfMachine(machineId);
    if (current === null) return refusal(CLOUD_BOX_UNAVAILABLE, 'This cloud box is no longer listed.', method);
    if (isReachable(current.box.state)) {
      if (!(await waitForBoxAnswer(machineId, deadline))) break;
      const machine = findMachineRecord(machineId);
      if (machine !== null) chatMachineLink(machine).forgetRoute();
      return null;
    }
    if (current.box.state === 'failed') {
      return refusal(CLOUD_BOX_UNAVAILABLE, current.box.stateDetail ?? 'The cloud box failed to start.', method);
    }
    await new Promise((resolve) => setTimeout(resolve, WAKE_POLL_MS));
    // The computer's row moves through creating and booting to running; a phone-started resume
    // updates the store itself.
    const row = current.source === 'home' ? await readRow(current.box.boxId, homeMachineId) : null;
    if (row !== null) useCloudBoxesStore.getState().putBox(homeMachineId, row, 'home');
  }
  return refusal(CLOUD_BOX_UNAVAILABLE, 'The cloud box did not come back in time.', method);
}

/**
 * Whether a chat call on a box machine may go out now: `null` when it may (the box is up, or a
 * send just woke it), else the refusal the chat core reads.
 */
export async function cloudBoxRequestGate(machineId: string, method: string): Promise<ChatRpcError | null> {
  const entry = cloudBoxEntryOfMachine(machineId);
  if (entry === null) return refusal(CLOUD_BOX_UNAVAILABLE, 'This cloud box is no longer listed.', method);
  if (isReachable(entry.box.state)) return null;
  if (!WAKING_METHODS.has(method)) {
    if (wakesOnSend(entry.box.state)) {
      return refusal(CLOUD_BOX_ASLEEP, 'This cloud box is stopped. Sending a message wakes it.', method);
    }
    return refusal(
      CLOUD_BOX_UNAVAILABLE,
      isStarting(entry.box.state) ? 'This cloud box is still starting.' : 'This cloud box is not connected yet.',
      method,
    );
  }
  const boxId = entry.box.boxId;
  let pending = waking.get(boxId);
  if (pending === undefined) {
    pending = wake(machineId, method).finally(() => waking.delete(boxId));
    waking.set(boxId, pending);
  }
  return pending;
}
