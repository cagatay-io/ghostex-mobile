/**
 * The second slot right after Panes: the computer's agent sessions to open there, each with its agent, project and
 * status in words (a status dot alone would carry it by colour only). The session on screen beside it is not listed.
 * The list is the computer's session list as the Sessions screen has it; while it is being read, a spinner.
 */

import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AGENT_ICONS } from '../assets/agentIcons.generated';
import { hasPendingQuestion, rowActivityIndicator } from '../components/sessions/sessionStatus';
import { agentIconTint, resolveAgentIconId, type GhostexSession } from '../contract/mobileSummary';
import { PanesCopy, SessionCopy } from '../copy';
import { useInventoryStore } from '../inventory/store';
import { GhostexPalette } from '../theme/palette';

export type SessionChooserProps = {
  machineId: string;
  /** The session already on screen beside the chooser. */
  besideSessionId: string | undefined;
  onPick: (session: GhostexSession) => void;
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

export default function SessionChooser({ machineId, besideSessionId, onPick }: SessionChooserProps) {
  const summary = useInventoryStore((state) => state.inventoriesByMachineId[machineId]?.summary ?? null);
  if (summary === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" color={GhostexPalette.MUTED} accessibilityLabel={PanesCopy.chooserLoading} />
      </View>
    );
  }
  const sessions = summary.sessions.filter((session) => session.sessionId !== besideSessionId);
  return (
    <ScrollView style={styles.list} contentContainerStyle={styles.content}>
      <Text style={styles.lead} accessibilityRole="header">
        {PanesCopy.chooserLead}
      </Text>
      {sessions.length === 0 ? <Text style={styles.empty}>{PanesCopy.chooserEmpty}</Text> : null}
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
