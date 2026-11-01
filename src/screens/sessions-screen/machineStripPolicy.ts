/**
 * CDXC:Sidebar 2026-11-02 DECISION:
 * User: "We shouldn't keep the machines list, since we are already showing all of the projects from all of the machines." Unified hides the computer tabs; Project keeps them. This supersedes the 2026-11-01 choice to keep tabs in Unified for their connect controls, now reached through the Computers menu and floating MachineNotice.
 */
export function machineTabsVisible(unified: boolean, machineCount: number): boolean {
  return !unified && machineCount > 0;
}

type NoticeEntry = { machineId: string; kind: 'failure' | 'connecting' };

/** Choose one floating notice while keeping every computer available through the Computers menu. */
export function noticeMachineId(
  unified: boolean,
  selectedMachineId: string | null,
  notices: readonly NoticeEntry[],
): string | null {
  if (!unified) return notices.find((notice) => notice.machineId === selectedMachineId)?.machineId ?? null;
  return (
    notices.find((notice) => notice.machineId === selectedMachineId && notice.kind === 'failure') ??
    notices.find((notice) => notice.kind === 'failure') ??
    notices.find((notice) => notice.machineId === selectedMachineId) ??
    notices[0]
  )?.machineId ?? null;
}
