/**
 * The shown workspace after the header's title: a small dot in the workspace's colour, its name
 * and a chevron, the phone's take on the desktop's switcher at the sidebar's bottom left
 * (apps/desktop/src/app/native_sidebar/workspace_tile.rs). A tap opens the workspace menu
 * (`workspaceMenuItems`), which lists the computer's workspaces with the shown one checked. It is
 * drawn only while the computer has more than one workspace.
 *
 * CDXC:Workspaces 2026-10-09 WHY:
 * The phone's menu keeps only the workspace rows of the desktop's (gx-core
 * sidebar_menu/workspace.rs): opening a workspace in a new window, workspace settings and creating
 * a workspace are desktop windows and settings pages the phone does not have.
 *
 * CDXC:Workspaces 2026-11-20 DECISION:
 * User picked "A. The name, quietly" (Q4254) for the desktop and the phone: the letter tile at the
 * left of the Space row goes; the phone shows "• Work ⌄" after the title, a tap opens the menu,
 * and the menu's rows carry the workspace's colour as a dot instead of the person and briefcase
 * glyphs. Supersedes the 2026-10-10 tile that followed the desktop's split button.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { GhostexWorkspace, GhostexWorkspaces } from '../../contract/mobileSummary';
import { orderedWorkspaces } from '../../workspaces/workspaceFilter';
import type { ContextMenuItem } from './ContextMenu';
import { ChevronDownGlyph } from './icons';
import { inkStyleSheets, useSidebarInk } from './rows';

const DOT_SIZE = 8;

export default function WorkspaceName({
  workspace,
  onOpenMenu,
}: {
  workspace: GhostexWorkspace;
  onOpenMenu: () => void;
}) {
  const ink = useSidebarInk();
  const styles = nameStyles(ink);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Workspace ${workspace.name}`}
      accessibilityHint="Opens the workspace menu"
      hitSlop={{ top: 12, bottom: 12, left: 6, right: 8 }}
      onPress={onOpenMenu}
      style={({ pressed }) => [styles.name, pressed ? styles.pressed : null]}
    >
      <WorkspaceDot color={workspace.color} />
      <Text style={styles.label} numberOfLines={1}>
        {workspace.name}
      </Text>
      <ChevronDownGlyph size={12} color={ink.muted} />
    </Pressable>
  );
}

/** The workspace's colour as a small dot: the name's mark and the menu rows' icon. */
function WorkspaceDot({ color }: { color: string }) {
  return (
    <View style={{ width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2, backgroundColor: color }} />
  );
}

/** The workspace menu's rows: a heading, then every workspace, the shown one checked. */
export function workspaceMenuItems(
  workspaces: GhostexWorkspaces,
  currentWorkspaceId: string,
  onSelect: (workspaceId: string) => void,
): ContextMenuItem[] {
  return [
    { kind: 'heading', key: 'heading', label: 'Workspaces' },
    ...orderedWorkspaces(workspaces).map((workspace): ContextMenuItem => ({
      kind: 'item',
      key: workspace.workspaceId,
      label: workspace.name,
      icon: <WorkspaceDot color={workspace.color} />,
      selected: workspace.workspaceId === currentWorkspaceId,
      onPress: () => onSelect(workspace.workspaceId),
    })),
  ];
}

/** Quiet, in the list's muted ink, so the title stays the loudest thing in the row. */
const nameStyles = inkStyleSheets((ink) =>
  StyleSheet.create({
    name: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexShrink: 1,
      minWidth: 0,
      paddingHorizontal: 6,
      paddingVertical: 4,
      borderRadius: 8,
    },
    // The text ink at 8%.
    pressed: {
      backgroundColor: ink.light ? 'rgba(38,38,38,0.08)' : 'rgba(200,205,213,0.08)',
    },
    label: {
      flexShrink: 1,
      color: ink.muted,
      fontSize: 14,
      fontWeight: '500',
    },
  }),
);
