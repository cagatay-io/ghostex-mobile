/**
 * The agents pane (the panes design's): the computer's agent sessions with their
 * status, from its session list as the Sessions screen and the chooser have it (the app's one summary poll; no read of
 * its own). On top the count of sessions with a question, working, done and failed, each a word beside its status dot;
 * below, the sessions by project, each the chooser's row (agent icon, title, agent and status in words). A tap opens
 * that session in the session pane beside, as a terminal, as a pick in the chooser does. The computer is the selected
 * session's, as for the chooser and the Web Preview. Every row is a control: half folded like a book they keep off
 * the fold (`controlInset`).
 */

import { useMemo } from 'react';
import { useAppearance, type Appearance } from '../theme/useAppearance';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { NO_SUMMARY_CAPABILITIES, type GhostexSession } from '../contract/mobileSummary';
import { PanesCopy } from '../copy';
import { useInventoryStore } from '../inventory/store';
import { SidebarPalette } from '../theme/palette';
import type { PaneBarInset } from './geometry';
import { paneSessionStatus, PaneSessionRow, usePaneRowStyles, type PaneSessionStatus } from './SessionChooser';

/** The summary's counts, in the design's order, each with its status colour (the session list's dots). */
const CHIPS = [
  { status: 'question', color: SidebarPalette.ROW_QUESTION },
  { status: 'working', color: SidebarPalette.ROW_WORKING },
  { status: 'done', color: SidebarPalette.ROW_ATTENTION },
  { status: 'failed', color: SidebarPalette.ROW_FAILED },
] as const satisfies readonly { status: keyof typeof PanesCopy.agentsChip & PaneSessionStatus; color: string }[];

const PADDING = 12;

export type AgentsPaneProps = {
  machineId: string;
  /** How far its rows stay off the body's edges to keep off a book fold (`PaneFrame.controlInset`). */
  controlInset: PaneBarInset;
  onPick: (session: GhostexSession) => void;
};

export default function AgentsPane({ machineId, controlInset, onPick }: AgentsPaneProps) {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  const rowStyles = usePaneRowStyles();
  const summary = useInventoryStore((state) => state.inventoriesByMachineId[machineId]?.summary ?? null);
  const sessions = summary?.sessions ?? [];
  const capabilities = summary?.capabilities ?? NO_SUMMARY_CAPABILITIES;
  const statuses = sessions.map((session) => paneSessionStatus(session, capabilities));
  const projects = new Map<string, GhostexSession[]>();
  for (const session of sessions) {
    const rows = projects.get(session.projectName);
    if (rows === undefined) projects.set(session.projectName, [session]);
    else rows.push(session);
  }
  const chips = CHIPS.map((chip) => ({
    ...chip,
    count: statuses.filter((status) => status === chip.status).length,
  })).filter((chip) => chip.count > 0);

  return (
    <ScrollView
      style={styles.list}
      contentContainerStyle={[
        styles.content,
        { paddingLeft: PADDING + controlInset.left, paddingRight: PADDING + controlInset.right },
      ]}
    >
      {summary === null ? (
        <View style={styles.pending}>
          <ActivityIndicator size="small" color={appearance.muted} accessibilityLabel={PanesCopy.chooserLoading} />
        </View>
      ) : null}
      {summary !== null && sessions.length === 0 ? <Text style={styles.empty}>{PanesCopy.agentsEmpty}</Text> : null}
      {chips.length > 0 ? (
        <View style={styles.summary} accessibilityRole="summary" accessibilityLabel={PanesCopy.agentsSummary}>
          {chips.map((chip) => (
            <View key={chip.status} style={styles.chip}>
              <View style={[styles.dot, { backgroundColor: chip.color }]} />
              <Text style={styles.chipText}>{PanesCopy.agentsChip[chip.status](chip.count)}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {[...projects].map(([project, rows]) => (
        <View key={project} style={styles.group}>
          {project.length > 0 ? (
            <Text style={styles.project} accessibilityRole="header" numberOfLines={1}>
              {project}
            </Text>
          ) : null}
          {rows.map((session) => (
            <PaneSessionRow
              key={session.sessionId}
              session={session}
              capabilities={capabilities}
              withProject={false}
              styles={rowStyles}
              onPick={onPick}
            />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const createStyles = (appearance: Appearance) => StyleSheet.create({
  list: { flex: 1, backgroundColor: appearance.background },
  content: { padding: PADDING, gap: 12 },
  pending: { alignItems: 'center', paddingVertical: 16 },
  empty: { color: appearance.muted, fontSize: 15, paddingHorizontal: 4 },
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: appearance.card,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { color: appearance.foreground, fontSize: 13 },
  group: { gap: 8 },
  project: { color: appearance.muted, fontSize: 13, fontWeight: '600', paddingHorizontal: 4 },
});
