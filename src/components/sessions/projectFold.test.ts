/**
 * Run with `bun test src/components/sessions/projectFold.test.ts`. How an open project's rows split into its own rows
 * and its session groups (desktop session_group_tree.rs `project_tree`), the one rule the list and the tiles view
 * both draw: a group's rows are the rows of that group right after its header; any other row is the project's own.
 */

import { describe, expect, test } from 'bun:test';

import type {
  CoordinatorOlderItem,
  DrawerItem,
  GroupHeaderItem,
  SessionItem,
  SessionKindLabelItem,
} from '../../contract/grouping';
import { projectFoldSections } from './projectFold';

const session = (id: string, groupId = '', inSessionGroup = false): SessionItem =>
  ({ type: 'SESSION', key: `session:${id}`, groupId, inSessionGroup }) as SessionItem;
const group = (groupId: string): GroupHeaderItem =>
  ({ type: 'GROUP_HEADER', key: `group:${groupId}`, groupId }) as GroupHeaderItem;
const label: SessionKindLabelItem = { type: 'SESSION_KIND_LABEL', key: 'kind:parked' } as SessionKindLabelItem;
const older = (groupId: string): CoordinatorOlderItem =>
  ({ type: 'COORDINATOR_OLDER', key: `older:${groupId}`, groupId, inSessionGroup: true }) as CoordinatorOlderItem;

describe('project fold sections', () => {
  test('a project without session groups keeps every row as its own', () => {
    const children: DrawerItem[] = [session('a'), label, session('b')];
    expect(projectFoldSections(children)).toEqual({ own: children, groups: [] });
  });

  test("a group's rows follow its header; a row of no group, or of another group, stays the project's", () => {
    const children: DrawerItem[] = [
      session('a'),
      group('g1'),
      session('b', 'g1', true),
      older('g1'),
      session('c', 'g2', true),
      session('d'),
      group('g2'),
      session('e', 'g2', true),
    ];
    expect(projectFoldSections(children)).toEqual({
      own: [session('a'), session('c', 'g2', true), session('d')],
      groups: [
        { header: group('g1'), rows: [session('b', 'g1', true), older('g1')] },
        { header: group('g2'), rows: [session('e', 'g2', true)] },
      ],
    });
  });
});
