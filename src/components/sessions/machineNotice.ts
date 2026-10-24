/**
 * What the Sessions list says over its top while its machine is not connected: the phone's
 * counterpart of gx-core's `machine_notice` (packages/gx-core/src/sidebar_view/machine_connection.rs).
 *
 * CDXC:RemoteMachines 2026-10-25 DECISION:
 * User: the phone matches the desktop ("Yes, match the desktop"): a failure is a card floating
 * over the top of the list with the title, the reason, Reconnect and Remote Settings, and an ×
 * that shrinks it to a one-line pill keeping the red mark and the title; connecting is a one-line
 * "Connecting to <name>…" pill. The rows never move for it. Supersedes the full-width
 * MachineFailedCard and the ConnectionWarning banner. The banner's 2026-09-16 rule stays: the
 * failure stays shown through retries until a refresh succeeds, so a retry after a failure keeps
 * the card (its Reconnect button busy) instead of switching to the connecting pill.
 *
 * SEE-ALSO: src/screens/sessions-screen/MachineNotice.tsx (the drawing),
 * apps/desktop/src/app/native_sidebar/machine_notice.rs (the desktop's).
 */

import { MachineNoticeCopy } from '../../copy';
import type { FailureReasonCode } from '../../inventory/client';
import type { MachineInventory } from '../../inventory/store';
import type { MachineTabConnectionState } from './MachineTabs';

export type MachineNotice =
  | { kind: 'connecting'; title: string }
  | {
      kind: 'failure';
      title: string;
      reason: string;
      /** What a shrink is remembered against: a new kind of failure opens the card again. */
      failureKey: FailureReasonCode;
      retrying: boolean;
    };

/** gx-core's titles for the phone's failure reasons. */
function failureTitle(code: FailureReasonCode): string {
  switch (code) {
    case 'authFailed':
      return MachineNoticeCopy.cannotSignIn;
    case 'ghostexMissing':
      return MachineNoticeCopy.setupNeeded;
    // SSH worked but the computer's Ghostex did not answer yet; the store retries on its own.
    case 'ghostexNotAnswering':
      return MachineNoticeCopy.reconnecting;
    default:
      return MachineNoticeCopy.cannotReach;
  }
}

export function machineNotice(
  machineName: string,
  inventory: MachineInventory | undefined,
  connectionState: MachineTabConnectionState,
): MachineNotice | null {
  if (inventory?.lastError != null) {
    const failureKey = inventory.lastErrorCode ?? 'unknown';
    return {
      kind: 'failure',
      title: failureTitle(failureKey),
      reason: inventory.lastError,
      failureKey,
      retrying: inventory.retrying,
    };
  }
  if (connectionState === 'busy') {
    return { kind: 'connecting', title: MachineNoticeCopy.connecting(machineName) };
  }
  return null;
}
