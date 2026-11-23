/**
 * The workspace tile that leads the Space tabs, the phone's twin of the desktop's first tile of the
 * Spaces row (apps/desktop/src/app/native_sidebar/workspace_tile.rs): the shown workspace's plain
 * icon in the Spaces row's icon size and tone. A tap switches to the other workspace
 * (`workspaceSwitchTarget`) and a long press, the phone's right click, opens the workspace menu
 * (`workspaceMenuItems`), which lists the computer's workspaces with their coloured badges and the
 * shown one checked. It is drawn only while the computer has more than one workspace.
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
 * with the workspace's icon (its own set, `WORKSPACE_ICONS`), and the menu's rows carry the
 * coloured disc (`WorkspaceBadge`). This supersedes the "• Work ⌄" name after the header's title
 * of the same day (Q4254 A), whose tap only opened the menu.
 *
 * CDXC:Workspaces 2026-11-24 DECISION:
 * User: draw the Spaces-row workspace toggle as a plain glyph (no coloured circle or card fill
 * behind it) matching the neighbouring Space tiles' size, tone, hairline border and pressed chrome.
 * The workspace menu rows keep `WorkspaceBadge`.
 */

import { Pressable, StyleSheet, View } from 'react-native';

import { WORKSPACE_ICONS } from '../../assets/tablerIcons.generated';
import type { GhostexWorkspace, GhostexWorkspaces } from '../../contract/mobileSummary';
import { GhostexStrokeWidth } from '../../theme/palette';
import { orderedWorkspaces } from '../../workspaces/workspaceFilter';
import type { ContextMenuItem } from './ContextMenu';
import { inkStyleSheets, useSidebarInk } from './rows';

/** The tile's width: matches a Space tile's minimum width (`SPACE_TILE_MIN_WIDTH`). */
export const WORKSPACE_TILE_WIDTH = 40;
/** Matches `SPACE_ICON_SIZE` in SpaceTabs.tsx. */
const TILE_ICON_SIZE = 20;

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
  const Icon = WORKSPACE_ICONS[workspace.icon] ?? WORKSPACE_ICONS.user;
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
      <Icon size={TILE_ICON_SIZE} color={ink.muted} />
    </Pressable>
  );
}

/** A workspace's mark for menu rows: its icon in white on a filled disc of its colour, `size` across. */
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

/** Matches SpaceTabs.tsx's unselected tile hairline and pressed wash. */
const tileStyles = inkStyleSheets((ink) =>
  StyleSheet.create({
    tile: {
      width: WORKSPACE_TILE_WIDTH,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
      borderWidth: GhostexStrokeWidth,
      borderColor: ink.light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
    },
    pressed: {
      backgroundColor: ink.light ? 'rgba(38,38,38,0.08)' : 'rgba(200,205,213,0.08)',
    },
  }),
);
