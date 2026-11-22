/**
 * Whether a computer has its Chat Status Line switched on: the built-in extension on its Settings >
 * Extensions (`chatStatusLineEnabled`, off by default), which its session summary names in
 * `builtInFeatures` (id `chatStatusLine`) only while it is on. The chat host hands the answer to the
 * core as `ChatSettings.statusLine`; off, the core marks the meter `statusLineOff` and the phone
 * draws no line and holds no row for it under the chat box (`composer/StatusLine.tsx`).
 *
 * CDXC:SessionChat 2026-11-22 DECISION:
 * The user said yes to the phone following the desktop's Chat Status Line extension: no line unless
 * that computer has it on. Read from `builtInFeatures`, not `builtInFeaturesOff`, like Beads
 * (`beads/featureSwitch.ts`): a computer whose gxserver predates the extension leaves it out and
 * counts as off, as the desktop and the web build read an absent `chatStatusLineEnabled`.
 * SEE-ALSO: packages/settings-catalog/src/data/official_extensions.rs (`chatStatusLine`),
 * apps/desktop/src/app/gx_chat/boot.rs (`status_line`), server/src/ghostex_cli/sessions/mobile_summary.rs.
 */

import { useInventoryStore } from '../inventory/store';

/** The Chat Status Line's built-in extension id, as the computer lists it. */
export const CHAT_STATUS_LINE_FEATURE = 'chatStatusLine';

/** Whether the Chat Status Line is on for a computer whose session summary is `summary` (none yet: off). */
export function chatStatusLineOnIn(summary: { builtInFeatures?: readonly string[] } | null | undefined): boolean {
  return summary?.builtInFeatures?.includes(CHAT_STATUS_LINE_FEATURE) === true;
}

/** Whether the Chat Status Line is on for computer `machineId`, from the summary the phone holds now. */
export function chatStatusLineOnFor(machineId: string): boolean {
  return chatStatusLineOnIn(useInventoryStore.getState().inventoriesByMachineId[machineId]?.summary);
}

/** Calls `onChange` with the new answer each time computer `machineId`'s switch flips. */
export function subscribeChatStatusLine(machineId: string, onChange: (on: boolean) => void): () => void {
  let on = chatStatusLineOnFor(machineId);
  return useInventoryStore.subscribe((state) => {
    const next = chatStatusLineOnIn(state.inventoriesByMachineId[machineId]?.summary);
    if (next === on) return;
    on = next;
    onChange(next);
  });
}
