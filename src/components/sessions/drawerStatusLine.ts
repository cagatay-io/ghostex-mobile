/**
 * The one-line status under the Sessions machine tabs. Kept apart from drawerModel.ts so the rule
 * loads in a plain `bun test` (that file pulls in React Native through the machine store).
 */

import { StateCardCopy } from '../../copy';
import type { MachineInventory } from '../../inventory/store';
import type { MachineNotice } from './machineNotice';

/**
 * Status line per sessions-drawer.md §5 for the selected machine.
 *
 * CDXC:RemoteMachines 2026-10-28 DECISION:
 * User: "we shouldn't show connecting twice like we do here on the phone please". While the machine
 * notice floats over the list (the connecting pill, a failure card or its pill), it already says
 * what the machine is doing, so the line under the tabs stays empty instead of repeating it; the
 * desktop sidebar has no such line at all. The line keeps what no other part of the screen says:
 * a refresh in progress, "Connected to <name>", and the no-machines hint.
 */
export function drawerStatusLine(
  /** `machineDisplayLabel` of the selected machine; null when there are no machines. */
  label: string | null,
  inventory: MachineInventory | undefined,
  notice: MachineNotice | null = null,
): string {
  if (label === null) return StateCardCopy.noMachines.status;
  if (notice !== null) return '';
  if (inventory === undefined || (!inventory.hasLoaded && inventory.summary === null)) {
    return StateCardCopy.connecting.status(label);
  }
  if (inventory.refreshing && inventory.summary !== null) {
    return StateCardCopy.connecting.refreshingStatus(label);
  }
  if (inventory.lastError !== null) {
    return StateCardCopy.failure.refreshFailedStatus(inventory.lastError);
  }
  if (inventory.summary !== null) {
    if (inventory.summary.sessions.length === 0 && inventory.summary.projects.length > 0) {
      return StateCardCopy.success.emptyProjectsStatus;
    }
    return StateCardCopy.success.status(label);
  }
  return StateCardCopy.initialStatus;
}
