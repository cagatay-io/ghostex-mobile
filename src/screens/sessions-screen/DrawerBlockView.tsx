/**
 * One block of the Sessions list (drawerModel.ts `DrawerBlock`): a project with its rows and
 * session groups, a project group with its projects, or a lone row. Laid out as the desktop
 * sidebar lays them out (apps/desktop/src/app/native_sidebar/render.rs, rows.rs, collections.rs,
 * session_group_tree.rs), at DRAWER_SCALE with 44pt touch rows, per the approved design
 * docs/2026-10-21/phone-sessions-screen/sessions-like-sidebar.html.
 *
 * Pure rendering: every action goes back to SessionsScreen through `DrawerBlockActions`, which
 * also keeps this file renderable in the web harness the screenshots come from.
 */

import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';

import StateCard from '../../components/common/StateCard';
import type { MenuAnchor } from '../../components/sessions/ContextMenu';
import type { DrawerBlock, ProjectCardBlock } from '../../components/sessions/drawerModel';
import {
  CollectionHeaderRow,
  collectionHeaderTint,
  ds,
  GroupHeaderRow,
  HEADER_CHEVRON_INSET,
  ProjectEmptyRow,
  ProjectHeaderRow,
  projectRailColor,
  SessionKindLabelRow,
  SessionListToggleRow,
  TOUCH_ROW_HEIGHT,
} from '../../components/sessions/rows';
import SessionRow from '../../components/sessions/SessionRow';
import type { WorkChipActions } from '../../components/sessions/WorkChips';
import { sessionLinksDisplay } from '../../chat/native/sessionLinks';
import type {
  CollectionHeaderItem,
  DrawerItem,
  GroupHeaderItem,
  ProjectHeaderItem,
  SessionItem,
  SessionKindLabelItem,
  StateCardItem,
} from '../../contract/grouping';
import type { GhostexAgentLauncher, GhostexMobileSummary } from '../../contract/mobileSummary';
import { colorWithOpacity, SidebarPalette } from '../../theme/palette';
import type { SidebarAppearance } from '../../theme/sidebarAppearance';

export type DrawerBlockActions = {
  toggleProject: (machineId: string, header: ProjectHeaderItem) => void;
  toggleCollection: (machineId: string, header: CollectionHeaderItem) => void;
  toggleGroup: (machineId: string, item: GroupHeaderItem) => void;
  toggleSessionKind: (machineId: string, item: SessionKindLabelItem) => void;
  toggleCoordinator: (machineId: string, item: SessionItem) => void;
  toggleCoordinatorOlder: (machineId: string, coordinatorKey: string) => void;
  openSession: (machineId: string, item: SessionItem) => void;
  sessionMenu: (machineId: string, item: SessionItem, anchor: MenuAnchor) => void;
  projectMenu: (machineId: string, header: ProjectHeaderItem) => void;
  collectionMenu: (machineId: string, header: CollectionHeaderItem) => void;
  groupMenu: (machineId: string, item: GroupHeaderItem) => void;
  /** Only the Parked heading has a menu. */
  parkedMenu: (machineId: string, item: SessionKindLabelItem) => void;
  launchPrimary: (machineId: string, header: ProjectHeaderItem, agent: GhostexAgentLauncher) => void;
  createProjectTerminal: (machineId: string, header: ProjectHeaderItem) => void;
  createGroupTerminal: (machineId: string, item: GroupHeaderItem) => void;
  agentMenu: (machineId: string, header: ProjectHeaderItem) => void;
  stateCard: (machineId: string, item: StateCardItem) => void;
  workChipActions: (machineId: string, item: SessionItem) => WorkChipActions | undefined;
};

export type DrawerBlockViewProps = {
  block: DrawerBlock;
  /** The open session's attachSessionKey (`<machineId>:<sessionId>`). */
  selectedSessionKey: string | null;
  appearance: SidebarAppearance;
  /** The neutral surface behind rows, which a status dot's ring is drawn in. */
  rowSurface: string;
  groupsOpacityPercent: number;
  /** The block's computer's latest summary (tags, links setting, Dim sleeping sessions). */
  summary: GhostexMobileSummary | null;
  /** The session a voice call on the phone is about right now, if any. */
  voiceCallSessionKey: string | null;
  primaryAgent: (header: ProjectHeaderItem) => GhostexAgentLauncher | null;
  /** A failure or connecting card the machine notice already says is drawn as nothing. */
  hideStateCard: (item: StateCardItem) => boolean;
  actions: DrawerBlockActions;
};

const sessionKey = (machineId: string, sessionId: string): string => `${machineId}:${sessionId}`;

/** The tree line's x inside a project's fold: under the project header's chevron (session_group_tree.rs `LINE_X`). */
const FOLD_REACH = ds(12);
const TREE_LINE_X = FOLD_REACH - ds(7.5);
/** session_group_tree.rs: each session group sits 14px right of its project and 2px below what is above it. */
const GROUP_INDENT = ds(14);
const GROUP_GAP = ds(2);

export default function DrawerBlockView(props: DrawerBlockViewProps): ReactElement | null {
  const { block, actions, summary, selectedSessionKey } = props;
  const machineId = block.machineId;
  const linksDisplay = sessionLinksDisplay(summary?.sidebarSessionLinks);
  const dimSleeping = summary?.dimSleepingSessions === true;

  const sessionRow = (item: SessionItem): ReactElement => {
    const key = sessionKey(machineId, item.session.sessionId);
    return (
      <SessionRow
        key={item.key}
        session={item.session}
        active={selectedSessionKey === key || item.nesting?.containsActive === true}
        expandedGroupSurface={props.rowSurface}
        sidebarBackground={props.appearance.background}
        sidebarForeground={props.appearance.foreground}
        inCard
        customSessionTags={summary?.customSessionTags}
        nesting={item.nesting}
        coordinatorBadge={item.coordinatorBadge}
        onToggleThreads={() => actions.toggleCoordinator(machineId, item)}
        workActions={actions.workChipActions(machineId, item)}
        sessionLinksDisplay={linksDisplay}
        dimSleeping={dimSleeping}
        voiceCall={props.voiceCallSessionKey === key}
        onPress={() => actions.openSession(machineId, item)}
        onMenu={(anchor) => actions.sessionMenu(machineId, item, anchor)}
      />
    );
  };

  const childRow = (child: DrawerItem, header: ProjectHeaderItem): ReactElement | null => {
    switch (child.type) {
      case 'PROJECT_EMPTY':
        return (
          <ProjectEmptyRow
            key={child.key}
            text={child.text}
            onPress={() => actions.createProjectTerminal(machineId, header)}
          />
        );
      case 'SESSION':
        return sessionRow(child);
      case 'SESSION_KIND_LABEL':
        return (
          <SessionKindLabelRow
            key={child.key}
            label={child.label}
            collapsed={child.collapsed}
            status={child.status}
            active={child.status.sessionIds.some((id) => sessionKey(machineId, id) === selectedSessionKey)}
            onPress={() => actions.toggleSessionKind(machineId, child)}
            onMenu={child.section === 'parked' ? () => actions.parkedMenu(machineId, child) : undefined}
          />
        );
      case 'COORDINATOR_OLDER':
        return (
          <SessionListToggleRow
            key={child.key}
            label={child.label}
            threadDepth={child.depth + 1}
            passingLines={child.passingLines}
            onPress={() => actions.toggleCoordinatorOlder(machineId, child.coordinatorKey)}
          />
        );
      default:
        return null;
    }
  };

  /**
   * A project's open rows, then its session groups indented under it with a tree line from under
   * the project's chevron to each group's header (desktop session_group_tree.rs `project_tree`).
   * A group's rows are the GROUP_HEADER's following rows of the same group.
   */
  const projectFold = (card: ProjectCardBlock): ReactElement => {
    const own: ReactElement[] = [];
    const groups: { header: GroupHeaderItem; rows: ReactElement[] }[] = [];
    for (const child of card.children) {
      if (child.type === 'GROUP_HEADER') {
        groups.push({ header: child, rows: [] });
        continue;
      }
      const element = childRow(child, card.header);
      if (element === null) continue;
      const group = groups[groups.length - 1];
      const inGroup =
        (child.type === 'SESSION' || child.type === 'COORDINATOR_OLDER') &&
        child.inSessionGroup === true &&
        group !== undefined &&
        child.groupId === group.header.groupId;
      if (inGroup) group.rows.push(element);
      else own.push(element);
    }
    if (groups.length === 0) return <View style={styles.rows}>{own}</View>;
    return (
      <View style={styles.fold}>
        <View style={styles.foldPart}>
          <View style={styles.rows}>{own}</View>
          <View pointerEvents="none" style={[styles.treeLine, { top: 0, bottom: 0 }]} />
        </View>
        {groups.map(({ header, rows }, index) => {
          const last = index === groups.length - 1;
          return (
            <View key={header.key} style={[styles.foldPart, styles.groupPart]}>
              <GroupHeaderRow
                title={header.title}
                collapsed={header.collapsed}
                containsActive={header.containsActive}
                status={header.status}
                onPress={() => actions.toggleGroup(machineId, header)}
                onMenu={() => actions.groupMenu(machineId, header)}
                onCreateTerminal={() => actions.createGroupTerminal(machineId, header)}
              />
              {!header.collapsed && rows.length > 0 ? <View style={styles.rows}>{rows}</View> : null}
              <View
                pointerEvents="none"
                style={[
                  styles.treeLine,
                  last ? { top: 0, height: GROUP_GAP + TOUCH_ROW_HEIGHT / 2 } : { top: 0, bottom: 0 },
                ]}
              />
              <View pointerEvents="none" style={styles.treeBranch} />
            </View>
          );
        })}
      </View>
    );
  };

  /** A project block: the header, then (open) its fold. `inCollection` drops the 18px block indent (collections.rs). */
  const projectCard = (card: ProjectCardBlock, inCollection: boolean): ReactElement => {
    const header = card.header;
    const primaryAgent = props.primaryAgent(header);
    return (
      <View
        key={`card:${header.key}`}
        style={[
          inCollection ? styles.projectInCollection : styles.projectTopLevel,
          inCollection && !header.collapsed ? styles.projectInCollectionOpen : null,
        ]}
      >
        <ProjectHeaderRow
          title={header.title}
          icon={header.icon}
          collapsed={header.collapsed}
          containsActive={header.containsActive}
          workingCount={header.workingCount}
          attentionCount={header.attentionCount}
          questionCount={header.questionCount}
          approvalCount={header.approvalCount}
          backgroundWorkCount={header.backgroundWorkCount}
          awakeCount={header.awakeCount}
          primaryAgent={primaryAgent}
          onToggle={() => actions.toggleProject(machineId, header)}
          onMenu={() => actions.projectMenu(machineId, header)}
          onLaunchPrimary={() => {
            if (primaryAgent !== null) actions.launchPrimary(machineId, header, primaryAgent);
          }}
          onCreateTerminal={() => actions.createProjectTerminal(machineId, header)}
          onOpenAgentMenu={() => actions.agentMenu(machineId, header)}
        />
        {!header.collapsed && card.children.length > 0 ? projectFold(card) : null}
      </View>
    );
  };

  if (block.kind === 'project') return projectCard(block.card, false);
  if (block.kind === 'collection') {
    const header = block.header;
    // collections.rs: the rail and the header band are the project group's color at 18%.
    const tint = colorWithOpacity(
      collectionHeaderTint(header.color, props.appearance.background),
      props.groupsOpacityPercent,
    );
    const rail = colorWithOpacity(
      projectRailColor(header.color, props.appearance.background),
      props.groupsOpacityPercent,
    );
    return (
      <View style={[styles.collection, header.collapsed ? styles.collectionClosed : null]}>
        <View
          pointerEvents="none"
          style={[
            styles.collectionRail,
            header.collapsed ? styles.collectionRailClosed : null,
            { backgroundColor: rail },
          ]}
        />
        <View style={[styles.collectionBand, { backgroundColor: tint }]}>
          <CollectionHeaderRow
            title={header.title}
            collapsed={header.collapsed}
            containsActive={header.containsActive}
            workingCount={header.workingCount}
            attentionCount={header.attentionCount}
            questionCount={header.questionCount}
            approvalCount={header.approvalCount}
            backgroundWorkCount={header.backgroundWorkCount}
            awakeCount={header.awakeCount}
            onPress={() => actions.toggleCollection(machineId, header)}
            onMenu={() => actions.collectionMenu(machineId, header)}
          />
        </View>
        {!header.collapsed && block.projects.length > 0 ? (
          <View style={styles.collectionBody}>{block.projects.map((card) => projectCard(card, true))}</View>
        ) : null}
      </View>
    );
  }
  const { item } = block;
  if (item.type === 'STATE_CARD') {
    if (props.hideStateCard(item)) return null;
    return (
      <StateCard
        title={item.title}
        body={item.body}
        actionHint={item.actionHint}
        onPress={() => actions.stateCard(machineId, item)}
      />
    );
  }
  if (item.type === 'PROJECT_EMPTY') return <ProjectEmptyRow text={item.text} />;
  if (item.type === 'SESSION') return sessionRow(item);
  return null;
}

const styles = StyleSheet.create({
  /*
   * render.rs: a top-level project block is padded 18px on the left (the header box reaches back
   * 15px of it for its chevron), 5px on the right and 10px below.
   */
  projectTopLevel: {
    paddingLeft: ds(18),
    marginRight: ds(5),
    marginBottom: ds(10),
  },
  /*
   * collections.rs: a project inside a project group sits 2px rail + 10px + 8px in, its header box
   * reaching back 15px of that. Here the block is padded 18px from the rail's right edge instead,
   * which lands the header and rows on the same pixels while every box stays inside its parent
   * (Android takes no touch outside a parent's bounds).
   */
  projectInCollection: {
    paddingLeft: HEADER_CHEVRON_INSET + ds(3),
    marginBottom: ds(5),
  },
  projectInCollectionOpen: {
    marginBottom: ds(7),
  },
  /* rows.rs: the open rows, 3px in from each side (session_list.rs SESSION_INSET_X) and 3px below. */
  rows: {
    paddingHorizontal: ds(3),
    paddingBottom: ds(3),
  },
  /* session_group_tree.rs `reach_left`: the fold reaches 12px left so the tree line sits inside it. */
  fold: {
    marginLeft: -FOLD_REACH,
  },
  foldPart: {
    position: 'relative',
    paddingLeft: FOLD_REACH,
  },
  groupPart: {
    paddingTop: GROUP_GAP,
    paddingLeft: FOLD_REACH + GROUP_INDENT,
  },
  treeLine: {
    position: 'absolute',
    left: TREE_LINE_X,
    width: ds(1),
    backgroundColor: SidebarPalette.ROW_THREAD_LINE,
  },
  /* The turn towards a group's header, ending just short of its chevron. */
  treeBranch: {
    position: 'absolute',
    left: TREE_LINE_X,
    top: GROUP_GAP + TOUCH_ROW_HEIGHT / 2 - ds(0.5),
    width: ds(6),
    height: ds(1),
    backgroundColor: SidebarPalette.ROW_THREAD_LINE,
  },
  /* collections.rs: 3px left and 5px right of the list, 10px below, after the 2px rail. */
  collection: {
    marginLeft: ds(3),
    marginRight: ds(5),
    marginBottom: ds(10),
    paddingBottom: ds(5),
    paddingLeft: ds(2),
  },
  collectionClosed: {
    paddingBottom: 0,
  },
  collectionRail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: ds(5),
    width: ds(2),
  },
  collectionRailClosed: {
    bottom: 0,
  },
  /* The header band runs from the rail across the whole block. */
  collectionBand: {},
  collectionBody: {
    paddingTop: ds(5),
  },
});
