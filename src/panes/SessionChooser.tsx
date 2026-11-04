/**
 * The chooser in a new pane (the panes design's): a Close row at its top (as its close button), then what
 * else the pane can show (the pane types, Files and Git Changes only for a session with a project folder, as the ⋯
 * menu offers them), then a new terminal in the project of the session beside it, the computer's Add Project flow,
 * and the computer's agent sessions to open there (those of the project of the session beside it first, then the
 * rest, each part in the session list's order), each with its agent, project and status in words (a status dot
 * alone would carry it by colour only). The session on screen beside it is not listed, nor, opened over a session
 * pane, that pane's session (it comes back with Close). The list is the computer's session list as the Sessions
 * screen has it; while it is being read, a spinner. The sessions are a virtualised list (`FlatList`, keyed by session
 * id, one memoized row; the list builds the rows' styles once per appearance and hands them to every row), the rows
 * above them its header. The list does not spring back past its ends. Every row is a control: half folded like a book
 * they all keep off the fold.
 * The agents pane (`AgentsPane.tsx`) lists the sessions with the same row.
 */

import { memo, useCallback, useMemo, type ReactNode } from 'react';
import { useAppearance, type Appearance } from '../theme/useAppearance';

import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View, type ListRenderItem } from 'react-native';

import { AGENT_ICONS } from '../assets/agentIcons.generated';
import { PlusGlyph, TerminalGlyph } from '../components/sessions/icons';
import { rowActivityIndicator } from '../components/sessions/sessionStatus';
import { CloseIcon } from '../components/terminal/icons';
import {
  agentIconTint,
  hasQuestion,
  NO_SUMMARY_CAPABILITIES,
  resolveAgentIconId,
  type GhostexSession,
  type GhostexSummaryCapabilities,
} from '../contract/mobileSummary';
import { PanesCopy, SessionCopy } from '../copy';
import { useInventoryStore } from '../inventory/store';
import { GhostexRadii } from '../theme/palette';
import type { PaneBarInset } from './geometry';
import { AVAILABLE_PANE_TYPES } from './paneTypes';
import type { SettablePaneType } from './usePaneHost';

export type SessionChooserProps = {
  machineId: string;
  /** The session already on screen beside the chooser. */
  besideSessionId: string | undefined;
  /** Opened over a session pane: that pane's session (on this computer), not listed either. */
  overSessionId: string | undefined;
  /** The session beside has a project with a folder: Files and Git Changes are offered. */
  projectOffered: boolean;
  /** How far its rows stay off the body's edges to keep off a book fold (`PaneFrame.controlInset`). */
  controlInset: PaneBarInset;
  onPick: (session: GhostexSession) => void;
  onPickType: (type: Exclude<SettablePaneType, 'session'>) => void;
  /** The Close row: as the pane's close button. */
  onClose: () => void;
  /** A new terminal in the project of the session beside the chooser (`beside`), opened in this pane. */
  onNewTerminal: (beside: GhostexSession) => void;
  onAddProject: () => void;
};

/** A session's status as the pane rows say it (`PanesCopy.status`). */
export type PaneSessionStatus = keyof typeof PanesCopy.status;

export function paneSessionStatus(
  session: GhostexSession,
  capabilities: GhostexSummaryCapabilities,
): PaneSessionStatus {
  const activity = rowActivityIndicator(session);
  if (activity === 'approval') return 'approval';
  if (hasQuestion(session.pendingQuestionCount, capabilities.awaitingAnswer && session.awaitingAnswer)) return 'question';
  switch (activity) {
    case 'failed':
      return 'failed';
    case 'working':
      return 'working';
    case 'attention':
      return 'done';
    case 'backgroundWork':
      return 'backgroundWork';
    default:
      return 'idle';
  }
}

/**
 * One of the computer's sessions: its agent icon, its title, and its agent, project (`withProject`) and status. A press
 * hands its session to `onPick`, so a list passes one callback and one styles object (`usePaneRowStyles`) to every row
 * and a row is drawn again only when its own session changes.
 */
export const PaneSessionRow = memo(function PaneSessionRow({
  session,
  capabilities,
  withProject,
  styles,
  onPick,
}: {
  session: GhostexSession;
  capabilities: GhostexSummaryCapabilities;
  withProject: boolean;
  styles: PaneRowStyles;
  onPick: (session: GhostexSession) => void;
}) {
  const iconId = resolveAgentIconId(session.agentIcon, session.agentName);
  const Icon = AGENT_ICONS[iconId] ?? AGENT_ICONS.terminal;
  const title = session.displayTitle.length > 0 ? session.displayTitle : SessionCopy.fallbackTitle;
  const detail = [
    session.agentName.length > 0 ? session.agentName : session.agent,
    withProject ? session.projectName : '',
  ]
    .filter((part) => part.length > 0)
    .concat(PanesCopy.status[paneSessionStatus(session, capabilities)])
    .join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${detail}`}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => onPick(session)}
    >
      <Icon size={20} color={agentIconTint(iconId)} />
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.detail} numberOfLines={1}>
          {detail}
        </Text>
      </View>
    </Pressable>
  );
});

/** A row that acts rather than opens a session: its icon, its label and, where it has one, a line under it. */
function ActionRow({
  label,
  detail,
  icon,
  styles,
  onPress,
}: {
  label: string;
  detail?: string;
  icon: ReactNode;
  styles: PaneRowStyles;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail === undefined ? label : `${label}, ${detail}`}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
    >
      <View style={styles.typeIcon}>{icon}</View>
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {label}
        </Text>
        {detail !== undefined ? (
          <Text style={styles.detail} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function SessionChooser({
  machineId,
  besideSessionId,
  overSessionId,
  projectOffered,
  controlInset,
  onPick,
  onPickType,
  onClose,
  onNewTerminal,
  onAddProject,
}: SessionChooserProps) {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  const rowStyles = usePaneRowStyles();
  const summary = useInventoryStore((state) => state.inventoriesByMachineId[machineId]?.summary ?? null);
  // A new terminal goes into the project of the session beside the chooser, where it has one.
  const beside = summary?.sessions.find((session) => session.sessionId === besideSessionId) ?? null;
  const besideProject = beside !== null && beside.projectId.length > 0 && beside.projectName.length > 0 ? beside : null;
  // The sessions of the project of the session beside the chooser first, then the rest, each part in the summary's
  // order: by the project's id alone, also where the summary names no project (the row above needs the name).
  const besideProjectId = beside !== null && beside.projectId.length > 0 ? beside.projectId : null;
  const sessions = useMemo(() => {
    const listed =
      summary?.sessions.filter(
        (session) => session.sessionId !== besideSessionId && session.sessionId !== overSessionId,
      ) ?? [];
    if (besideProjectId === null) return listed;
    return listed
      .filter((session) => session.projectId === besideProjectId)
      .concat(listed.filter((session) => session.projectId !== besideProjectId));
  }, [summary, besideSessionId, overSessionId, besideProjectId]);
  const capabilities = summary?.capabilities ?? NO_SUMMARY_CAPABILITIES;
  const types = AVAILABLE_PANE_TYPES.filter(
    (definition): definition is typeof definition & { type: Exclude<SettablePaneType, 'session'> } =>
      definition.type !== 'session' && (projectOffered || !definition.needsProject),
  );
  const renderSession = useCallback<ListRenderItem<GhostexSession>>(
    ({ item }) => (
      <PaneSessionRow session={item} capabilities={capabilities} withProject styles={rowStyles} onPick={onPick} />
    ),
    [capabilities, rowStyles, onPick],
  );
  return (
    <FlatList
      style={styles.list}
      bounces={false}
      alwaysBounceVertical={false}
      contentContainerStyle={[
        styles.content,
        {
          paddingLeft: styles.content.padding + controlInset.left,
          paddingRight: styles.content.padding + controlInset.right,
        },
      ]}
      data={sessions}
      keyExtractor={sessionKey}
      renderItem={renderSession}
      ListHeaderComponent={
        <View style={styles.header}>
          <ActionRow
            label={PanesCopy.chooserClose}
            icon={<CloseIcon size={16} color={appearance.accent} />}
            styles={rowStyles}
            onPress={onClose}
          />
          <Text style={[styles.lead, styles.leadAfter]} accessibilityRole="header">
            {PanesCopy.chooserTypesLead}
          </Text>
          {types.map((definition) => (
            <ActionRow
              key={definition.type}
              label={definition.label}
              detail={definition.description}
              icon={definition.icon(20, appearance.accent)}
              styles={rowStyles}
              onPress={() => onPickType(definition.type)}
            />
          ))}
          <Text style={[styles.lead, styles.leadAfter]} accessibilityRole="header">
            {PanesCopy.chooserLead}
          </Text>
          {besideProject !== null ? (
            <ActionRow
              label={PanesCopy.newTerminalIn(besideProject.projectName)}
              icon={<TerminalGlyph size={20} color={appearance.accent} />}
              styles={rowStyles}
              onPress={() => onNewTerminal(besideProject)}
            />
          ) : null}
          <ActionRow
            label={PanesCopy.addProject}
            icon={<PlusGlyph size={20} color={appearance.accent} />}
            styles={rowStyles}
            onPress={onAddProject}
          />
          {summary === null ? (
            <View style={styles.pending}>
              <ActivityIndicator size="small" color={appearance.muted} accessibilityLabel={PanesCopy.chooserLoading} />
            </View>
          ) : null}
          {summary !== null && sessions.length === 0 ? (
            <Text style={styles.empty}>{PanesCopy.chooserEmpty}</Text>
          ) : null}
        </View>
      }
    />
  );
}

function sessionKey(session: GhostexSession): string {
  return session.sessionId;
}

const createStyles = (appearance: Appearance) => StyleSheet.create({
  /** The rows above the sessions, as far apart as the sessions are (`content`'s gap). */
  header: {
    gap: 8,
  },
  pending: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  list: {
    flex: 1,
    backgroundColor: appearance.background,
  },
  content: {
    padding: 12,
    gap: 8,
  },
  lead: {
    color: appearance.muted,
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  leadAfter: {
    paddingTop: 12,
  },
  empty: {
    color: appearance.muted,
    fontSize: 15,
    paddingHorizontal: 4,
  },
});

/** The rows' styles for one appearance (`usePaneRowStyles`), apart from the list's own. */
export type PaneRowStyles = ReturnType<typeof createRowStyles>;

/** The rows' styles for the current appearance: a list builds them once and hands them to each of its rows. */
export function usePaneRowStyles(): PaneRowStyles {
  const appearance = useAppearance();
  return useMemo(() => createRowStyles(appearance), [appearance]);
}

const createRowStyles = (appearance: Appearance) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: appearance.card,
  },
  rowPressed: {
    backgroundColor: appearance.cardActive,
  },
  typeIcon: {
    width: 36,
    height: 36,
    borderRadius: GhostexRadii.card,
    backgroundColor: appearance.neutralFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: appearance.foreground,
    fontSize: 15,
    fontWeight: '500',
  },
  detail: {
    color: appearance.muted,
    fontSize: 13,
    marginTop: 2,
  },
});
