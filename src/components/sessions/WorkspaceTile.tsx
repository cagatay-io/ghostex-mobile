/**
 * The workspace tile that leads the Space tabs, the phone's twin of the desktop's first tile of the
 * Spaces row (apps/desktop/src/app/native_sidebar/workspace_tile.rs): the shown workspace's icon
 * in white on a disc of its colour (`WorkspaceBadge`). A tap switches to the other workspace
 * (`workspaceSwitchTarget`) and a long press, the phone's right click, opens the workspace menu
 * (`workspaceMenuItems`), which lists the computer's workspaces with the shown one checked. It is
 * drawn only while the computer has more than one workspace.
 *
 * CDXC:Workspaces 2026-10-09 WHY:
 * The phone's menu keeps only the workspace rows of the desktop's (gx-core
 * sidebar_menu/workspace.rs): opening a workspace in a new window, workspace settings and creating
 * a workspace are desktop windows and settings pages the phone does not have.
 *
 * CDXC:Workspaces 2026-11-20 DECISION:
 * User picked "F. The first tile of the Spaces row" (Q4296): "single click switches workspace;
 * right click shows the workspace menu; each workspace gets its own ICON (not just a colour dot),
 * and those icons must look different from the Spaces icons". The tile is the Space tiles' height
 * on the selected tile's fill without their hairline, with the workspace's icon (its own set,
 * `WORKSPACE_ICONS`) on a disc of its colour, where a Space is an outline glyph on a hairline tile;
 * the menu's rows carry the same disc. This supersedes the "• Work ⌄" name after the header's title
 * of the same day (Q4254 A), whose tap only opened the menu.
 */

import { Pressable, StyleSheet, View } from 'react-native';

import { WORKSPACE_ICONS } from '../../assets/tablerIcons.generated';
import type { GhostexWorkspace, GhostexWorkspaces } from '../../contract/mobileSummary';
import { orderedWorkspaces } from '../../workspaces/workspaceFilter';
import type { ContextMenuItem } from './ContextMenu';
import { inkStyleSheets, useSidebarInk } from './rows';

/** The tile's width: a little wider than a Space tile's minimum, so it keeps its size. */
export const WORKSPACE_TILE_WIDTH = 46;
const TILE_BADGE_SIZE = 22;

export default function WorkspaceTile({
  workspace,
  height,
  onSwitch,
  onOpenMenu,
}: {
  workspace: GhostexWorkspace;
  /** The Space tiles' height, so the row stays one tile tall. */
  height: number;
  /** Switches to the other workspace; null with nowhere to go, when a tap opens the menu. */
  onSwitch: (() => void) | null;
  onOpenMenu: () => void;
}) {
  const ink = useSidebarInk();
  const styles = tileStyles(ink);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Workspace ${workspace.name}`}
      accessibilityHint={
        onSwitch === null ? 'Opens the workspace menu' : 'Switches workspace; long press for the workspace menu'
      }
      onPress={onSwitch ?? onOpenMenu}
      onLongPress={onOpenMenu}
      style={({ pressed }) => [styles.tile, { height }, pressed ? styles.pressed : null]}
    >
      <WorkspaceBadge workspace={workspace} size={TILE_BADGE_SIZE} />
    </Pressable>
  );
}

/** A workspace's mark: its icon in white on a filled disc of its colour, `size` across. */
export function WorkspaceBadge({ workspace, size }: { workspace: GhostexWorkspace; size: number }) {
  const Icon = WORKSPACE_ICONS[workspace.icon] ?? WORKSPACE_ICONS.user;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: workspace.color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon size={Math.round(size * 0.62)} color="#FFFFFF" strokeWidth={2.2} />
    </View>
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
      icon: <WorkspaceBadge workspace={workspace} size={18} />,
      selected: workspace.workspaceId === currentWorkspaceId,
      onPress: () => onSelect(workspace.workspaceId),
    })),
  ];
}

/** The account tiles' fill (the desktop's `usage_card_fills`), a step up while pressed. */
const tileStyles = inkStyleSheets((ink) =>
  StyleSheet.create({
    tile: {
      width: WORKSPACE_TILE_WIDTH,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
      backgroundColor: ink.light ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)',
    },
    pressed: {
      backgroundColor: ink.light ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.11)',
    },
  }),
);
