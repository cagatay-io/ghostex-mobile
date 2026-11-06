/**
 * An open project's rows split the way the desktop draws its fold (session_group_tree.rs `project_tree`): first the
 * project's own rows, then each session group's header with the rows of that group that follow it. The Sessions
 * list (`DrawerBlockView`) draws it as rows, the session wall as tiles, and the wall reads its thumbnails for the
 * same sessions (`screens/wall/previews.ts`). Free of React Native, so it loads in a plain `bun test`.
 */

import type { DrawerItem, GroupHeaderItem } from '../../contract/grouping';

export type ProjectFoldGroup = { header: GroupHeaderItem; rows: DrawerItem[] };

export type ProjectFoldSections = { own: DrawerItem[]; groups: ProjectFoldGroup[] };

/** A row belongs to the group right above it when it is a row of that group; any other row is the project's own. */
export function projectFoldSections(children: readonly DrawerItem[]): ProjectFoldSections {
  const own: DrawerItem[] = [];
  const groups: ProjectFoldGroup[] = [];
  for (const child of children) {
    if (child.type === 'GROUP_HEADER') {
      groups.push({ header: child, rows: [] });
      continue;
    }
    const group = groups[groups.length - 1];
    const inGroup =
      (child.type === 'SESSION' || child.type === 'COORDINATOR_OLDER') &&
      child.inSessionGroup === true &&
      group !== undefined &&
      child.groupId === group.header.groupId;
    if (inGroup) group.rows.push(child);
    else own.push(child);
  }
  return { own, groups };
}
