/**
 * The chooser in a new pane (the approved panes mockup's): first what else the pane can show, the Web Preview, the
 * project's Files and its Git Changes (the two only for a session with a project folder, as the ⋯ menu offers them),
 * then the computer's agent sessions to open there, each with its agent, project and status in words (a status dot
 * alone would carry it by colour only). The session on screen beside it is not listed. The list is the computer's
 * session list as the Sessions screen has it; while it is being read, a spinner. Every row is a control: half folded
 * like a book they all keep off the fold.
 */

import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AGENT_ICONS } from '../assets/agentIcons.generated';
import { hasPendingQuestion, rowActivityIndicator } from '../components/sessions/sessionStatus';
import { agentIconTint, resolveAgentIconId, type GhostexSession } from '../contract/mobileSummary';
import { PanesCopy, SessionCopy } from '../copy';
import { useInventoryStore } from '../inventory/store';
import { GhostexPalette, GhostexRadii } from '../theme/palette';
import type { PaneBarInset } from './geometry';
import { AVAILABLE_PANE_TYPES } from './paneTypes';
import type { SettablePaneType } from './usePaneHost';

export type SessionChooserProps = {
  machineId: string;
  /** The session already on screen beside the chooser. */
  besideSessionId: string | undefined;
  /** The session beside has a project with a folder: Files and Git Changes are offered. */
  projectOffered: boolean;
  /** How far its rows stay off the body's edges to keep off a book fold (`PaneFrame.controlInset`). */
  controlInset: PaneBarInset;
  onPick: (session: GhostexSession) => void;
  onPickType: (type: Exclude<SettablePaneType, 'session'>) => void;
};

function statusWord(session: GhostexSession): string {
  if (hasPendingQuestion(session)) return PanesCopy.status.question;
  switch (rowActivityIndicator(session)) {
    case 'approval':
      return PanesCopy.status.approval;
    case 'failed':
      return PanesCopy.status.failed;
    case 'working':
      return PanesCopy.status.working;
    case 'attention':
      return PanesCopy.status.done;
    case 'backgroundWork':
      return PanesCopy.status.backgroundWork;
    default:
      return PanesCopy.status.idle;
  }
}

export default function SessionChooser({
  machineId,
  besideSessionId,
  projectOffered,
  controlInset,
  onPick,
  onPickType,
}: SessionChooserProps) {
  const summary = useInventoryStore((state) => state.inventoriesByMachineId[machineId]?.summary ?? null);
  const sessions = summary?.sessions.filter((session) => session.sessionId !== besideSessionId) ?? [];
  const types = AVAILABLE_PANE_TYPES.filter(
    (definition): definition is typeof definition & { type: Exclude<SettablePaneType, 'session'> } =>
      definition.type !== 'session' && (projectOffered || !definition.needsProject),
  );
  return (
    <ScrollView
      style={styles.list}
      contentContainerStyle={[
        styles.content,
        {
          paddingLeft: styles.content.padding + controlInset.left,
          paddingRight: styles.content.padding + controlInset.right,
        },
      ]}
    >
      <Text style={styles.lead} accessibilityRole="header">
        {PanesCopy.chooserTypesLead}
      </Text>
      {types.map((definition) => (
        <Pressable
          key={definition.type}
          accessibilityRole="button"
          accessibilityLabel={`${definition.label}, ${definition.description}`}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => onPickType(definition.type)}
        >
          <View style={styles.typeIcon}>{definition.icon(20, GhostexPalette.ACCENT)}</View>
          <View style={styles.text}>
            <Text style={styles.title} numberOfLines={1}>
              {definition.label}
            </Text>
            <Text style={styles.detail} numberOfLines={1}>
              {definition.description}
            </Text>
          </View>
        </Pressable>
      ))}
      <Text style={[styles.lead, styles.leadAfter]} accessibilityRole="header">
        {PanesCopy.chooserLead}
      </Text>
      {summary === null ? (
        <View style={styles.pending}>
          <ActivityIndicator size="small" color={GhostexPalette.MUTED} accessibilityLabel={PanesCopy.chooserLoading} />
        </View>
      ) : null}
      {summary !== null && sessions.length === 0 ? <Text style={styles.empty}>{PanesCopy.chooserEmpty}</Text> : null}
      {sessions.map((session) => {
        const iconId = resolveAgentIconId(session.agentIcon, session.agentName);
        const Icon = AGENT_ICONS[iconId] ?? AGENT_ICONS.terminal;
        const title = session.displayTitle.length > 0 ? session.displayTitle : SessionCopy.fallbackTitle;
        const detail = [session.agentName.length > 0 ? session.agentName : session.agent, session.projectName]
          .filter((part) => part.length > 0)
          .concat(statusWord(session))
          .join(' · ');
        return (
          <Pressable
            key={session.sessionId}
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
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pending: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  list: {
    flex: 1,
    backgroundColor: GhostexPalette.BACKGROUND,
  },
  content: {
    padding: 12,
    gap: 8,
  },
  lead: {
    color: GhostexPalette.MUTED,
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  leadAfter: {
    paddingTop: 12,
  },
  empty: {
    color: GhostexPalette.MUTED,
    fontSize: 15,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: GhostexPalette.CARD,
  },
  rowPressed: {
    backgroundColor: GhostexPalette.CARD_ACTIVE,
  },
  typeIcon: {
    width: 36,
    height: 36,
    borderRadius: GhostexRadii.card,
    backgroundColor: GhostexPalette.NEUTRAL_FILL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: GhostexPalette.FOREGROUND,
    fontSize: 15,
    fontWeight: '500',
  },
  detail: {
    color: GhostexPalette.MUTED,
    fontSize: 13,
    marginTop: 2,
  },
});
