/**
 * The Where rows at the top of a project's agent menu (./where.ts): This computer or Cloud Box.
 * Picking one keeps the menu open, so the agent is picked next.
 */

import { useEffect } from 'react';

import type { ContextMenuItem } from '../components/sessions/ContextMenu';
import { CloudGlyph } from '../components/sessions/icons';
import { SidebarPalette } from '../theme/palette';
import { loadCloudWhere, setCloudWhere, useCloudWhereStore } from './where';

/** Reads the project's Where while its agent menu is open, and redraws when it arrives. */
export function useCloudWhere(machineId: string | null, projectId: string | null): void {
  useCloudWhereStore((state) => state.byProject);
  useEffect(() => {
    if (machineId === null || projectId === null || projectId.length === 0) return;
    void loadCloudWhere(machineId, projectId);
  }, [machineId, projectId]);
}

export function cloudWhereItems(
  machineId: string,
  projectId: string,
  report: (message: string) => void,
  startOnPhone: (agent: { agentId: string; name: string }) => void,
): ContextMenuItem[] {
  const where = useCloudWhereStore.getState().byProject[`${machineId}:${projectId}`];
  if (where === undefined || !where.offered) return [];
  if (where.computerOff !== undefined) {
    // CDXC:CloudBoxes 2026-11-02 SEE-ALSO: cloudBoxes/phoneStart.ts (Q1033 D7, the phone starts the box itself).
    const rows: ContextMenuItem[] = where.computerOff.agents.map((agent) => ({
      kind: 'item',
      key: `where.phone.${agent.agentId}`,
      label: `Start ${agent.name} on a Cloud Box…`,
      icon: <CloudGlyph size={14} color={SidebarPalette.MUTED} />,
      info: "Starts a box from the project's Default snapshot with your computer off.",
      onPress: () => startOnPhone(agent),
    }));
    const capReached = where.computerOff.capReached;
    return [
      { kind: 'heading', key: 'where.heading', label: 'Your computer is off' },
      ...(capReached !== null
        ? [{ kind: 'note' as const, key: 'where.capReached', label: capReached }]
        : rows.length > 0
        ? rows
        : [{ kind: 'note' as const, key: 'where.noAgents', label: 'Allow an agent login on cloud boxes on the computer first.' }]),
      { kind: 'separator', key: 'where.separator' },
    ];
  }
  const pick = (cloud: boolean) => () => {
    if (where.cloud === cloud) return;
    void setCloudWhere(machineId, projectId, cloud).then((error) => {
      if (error !== null) report(`Couldn't change where new chats run: ${error}`);
    });
  };
  return [
    { kind: 'heading', key: 'where.heading', label: 'Where' },
    { kind: 'item', key: 'where.local', label: 'This computer', selected: !where.cloud, onPress: pick(false) },
    {
      kind: 'item',
      key: 'where.cloud',
      label: 'Cloud Box',
      icon: <CloudGlyph size={14} color={SidebarPalette.MUTED} />,
      info: 'The new chat starts on a cloud box from the project’s Default snapshot when you send its first message.',
      selected: where.cloud,
      onPress: pick(true),
    },
    { kind: 'separator', key: 'where.separator' },
  ];
}
