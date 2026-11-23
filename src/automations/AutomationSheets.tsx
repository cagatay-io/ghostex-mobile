/**
 * Detail bottom sheet for the Automations screen (single BottomSheet hosting either an automation's
 * detail or a run's detail, avoiding overlapping native Modals and nested ScrollViews):
 * - Automation detail: schedule, prompt, details, Pause/Resume, Run now, and recent runs.
 * - Run detail: status, summary/error, details, Open session, Mark read, Archive, plus Back when
 *   opened from an automation's Recent runs list.
 */

import * as Clipboard from 'expo-clipboard';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AGENT_ICONS } from '../assets/agentIcons.generated';
import { Glyph } from '../chat/native/transcript/icons';
import BottomSheet from '../components/common/BottomSheet';
import { ChevronLeftGlyph } from '../components/sessions/icons';
import { agentIconTint, resolveAgentIconId } from '../contract/mobileSummary';
import { AutomationsCopy } from '../copy';
import { GhostexRadii, GhostexStrokeWidth, colorWithOpacity } from '../theme/palette';
import { useAppearance, type Appearance } from '../theme/useAppearance';
import {
  automationProjectId,
  describeMode,
  describeSchedule,
  formatFullTimestamp,
  formatNextRun,
  formatRelativeOrDate,
  isRunActive,
  runStatusLabel,
  runStatusTone,
  runSummary,
  type AutomationAgentOption,
  type AutomationDefinition,
  type AutomationRun,
  type AutomationState,
  type RunStatusTone,
} from './model';

export function statusColorFor(tone: RunStatusTone, appearance: Appearance): string {
  switch (tone) {
    case 'danger':
      return appearance.danger;
    case 'warning':
      return appearance.light ? '#b45309' : '#f59e0b';
    case 'accent':
      return appearance.accent;
    case 'success':
      return appearance.light ? '#15803d' : '#4ade80';
    case 'muted':
      return appearance.muted;
  }
}

export function AutomationAgentGlyph({
  agent,
  fallbackId,
  size = 14,
}: {
  agent?: AutomationAgentOption;
  fallbackId: string;
  size?: number;
}) {
  const iconId = resolveAgentIconId(agent?.icon, agent?.label ?? fallbackId);
  const Icon = AGENT_ICONS[iconId];
  if (Icon === undefined) return null;
  return <Icon size={size} color={agentIconTint(iconId)} />;
}

function DetailRow({
  label,
  value,
  leading,
  copyValue,
  last = false,
  styles,
  appearance,
}: {
  label: string;
  value: string;
  leading?: React.ReactNode;
  copyValue?: string;
  last?: boolean;
  styles: ReturnType<typeof createStyles>;
  appearance: Appearance;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <View style={[styles.detailRow, last && styles.detailRowLast]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <View style={styles.detailValueWrap}>
        {leading}
        <Text style={styles.detailValue} numberOfLines={2} selectable>
          {value}
        </Text>
        {copyValue !== undefined ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={AutomationsCopy.copyValue(label)}
            hitSlop={8}
            onPress={() => {
              void Clipboard.setStringAsync(copyValue).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
            style={styles.copyButton}
          >
            <Glyph name={copied ? 'check' : 'copy'} size={14} color={copied ? appearance.accent : appearance.muted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export type DetailSheetTarget =
  | { readonly kind: 'automation'; readonly automation: AutomationDefinition }
  | { readonly kind: 'run'; readonly run: AutomationRun; readonly fromAutomationId?: string };

export function AutomationDetailsBottomSheet({
  target,
  state,
  nowMs,
  busyId,
  onToggleEnabled,
  onRunNow,
  onSelectRun,
  onBackToAutomation,
  onOpenSession,
  onMarkRead,
  onMarkAllRead,
  onArchive,
  onClose,
}: {
  target: DetailSheetTarget | null;
  state: AutomationState;
  nowMs: number;
  busyId: string | null;
  onToggleEnabled: (automation: AutomationDefinition, enabled: boolean) => void;
  onRunNow: (automation: AutomationDefinition) => void;
  onSelectRun: (run: AutomationRun, fromAutomationId: string) => void;
  onBackToAutomation: (automationId: string) => void;
  onOpenSession: (run: AutomationRun, automationName: string) => void;
  onMarkRead: (run: AutomationRun) => void;
  onMarkAllRead: (automationId: string) => void;
  onArchive: (run: AutomationRun) => void;
  onClose: () => void;
}) {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);

  let content: React.ReactNode = null;
  if (target?.kind === 'automation') {
    const { automation } = target;
    const busy = busyId === automation.id;
    const agent = state.agents.find((entry) => entry.agentId === automation.agentId);
    const projectId = automationProjectId(automation);
    const projectName =
      state.projects.find((project) => project.projectId === projectId)?.label ??
      (state.projectId === projectId ? state.projectName : projectId);
    const visibleAutomationRuns = state.runs.filter(
      (run) => !run.isArchived && run.automationId === automation.id,
    );
    const unreadAutomationCount = visibleAutomationRuns.filter((run) => run.isUnread).length;
    const recentRuns = visibleAutomationRuns.slice(0, 10);
    const modelLine = [automation.model, automation.effort]
      .filter((v): v is string => Boolean(v && v.trim()))
      .join(' · ');

    const detailRows: Array<{ label: string; value: string; leading?: React.ReactNode }> = [
      { label: AutomationsCopy.scheduleLabel, value: describeSchedule(automation.schedule) },
      {
        label: AutomationsCopy.nextRunLabel,
        value: automation.enabled ? formatNextRun(automation.nextRunAt, nowMs) : AutomationsCopy.paused,
      },
      {
        label: AutomationsCopy.agentLabel,
        value: agent?.label ?? automation.agentId,
        leading: <AutomationAgentGlyph agent={agent} fallbackId={automation.agentId} size={14} />,
      },
      ...(modelLine.length > 0 ? [{ label: AutomationsCopy.modelLabel, value: modelLine }] : []),
      { label: AutomationsCopy.modeLabel, value: describeMode(automation.executionMode) },
      ...(automation.executionMode.kind === 'worktree' &&
      automation.executionMode.setupCommand !== undefined &&
      automation.executionMode.setupCommand.length > 0
        ? [{ label: AutomationsCopy.setupLabel, value: automation.executionMode.setupCommand }]
        : []),
      ...(automation.executionMode.kind === 'thread' &&
      (automation.executionMode.agentSessionId ?? automation.executionMode.sessionId) !== undefined
        ? [
            {
              label: AutomationsCopy.threadLabel,
              value: automation.executionMode.agentSessionId ?? automation.executionMode.sessionId ?? '',
            },
          ]
        : []),
    ];

    content = (
      <View style={styles.sheetContent}>
        <View style={styles.headerBlock}>
          <View style={styles.badgeRow}>
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor: colorWithOpacity(
                    automation.enabled ? statusColorFor('success', appearance) : appearance.muted,
                    16,
                  ),
                },
              ]}
            >
              <Text
                style={[
                  styles.statusPillText,
                  { color: automation.enabled ? statusColorFor('success', appearance) : appearance.muted },
                ]}
              >
                {automation.enabled ? AutomationsCopy.active : AutomationsCopy.paused}
              </Text>
            </View>
            {projectName.length > 0 ? (
              <Text style={styles.projectTag} numberOfLines={1}>
                {projectName}
              </Text>
            ) : null}
          </View>
          <Text style={styles.title}>{automation.name}</Text>
        </View>

        <View style={styles.actionRow}>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => onRunNow(automation)}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed, busy && styles.disabled]}
          >
            {busy ? (
              <ActivityIndicator size="small" color={appearance.accentForeground} />
            ) : (
              <Glyph name="player-play" size={14} color={appearance.accentForeground} />
            )}
            <Text style={styles.primaryLabel}>{AutomationsCopy.runNow}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => onToggleEnabled(automation, !automation.enabled)}
            style={({ pressed }) => [styles.neutralButton, pressed && styles.neutralPressed, busy && styles.disabled]}
          >
            <Text style={styles.neutralLabel}>
              {automation.enabled ? AutomationsCopy.pause : AutomationsCopy.resume}
            </Text>
          </Pressable>
        </View>

        {automation.prompt.trim().length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{AutomationsCopy.promptLabel}</Text>
            <View style={styles.card}>
              <Text style={styles.promptBody} selectable>
                {automation.prompt}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{AutomationsCopy.detailsLabel}</Text>
          <View style={styles.groupCard}>
            {detailRows.map((row, index) => (
              <DetailRow
                key={row.label}
                label={row.label}
                value={row.value}
                leading={row.leading}
                last={index === detailRows.length - 1}
                styles={styles}
                appearance={appearance}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>{AutomationsCopy.recentRunsLabel}</Text>
            {unreadAutomationCount > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={AutomationsCopy.markAllRead}
                disabled={busy}
                hitSlop={8}
                onPress={() => onMarkAllRead(automation.id)}
                style={({ pressed }) => [pressed && styles.pressed, busy && styles.disabled]}
              >
                <Text style={[styles.sectionActionText, { color: appearance.accent }]}>
                  {AutomationsCopy.markAllRead}
                </Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.groupCard}>
            {recentRuns.length === 0 ? (
              <View style={styles.emptyRunRow}>
                <Text style={styles.mutedText}>{AutomationsCopy.noRunsForAutomation}</Text>
              </View>
            ) : (
              recentRuns.map((run, index) => {
                const color = statusColorFor(runStatusTone(run.status), appearance);
                const when = formatRelativeOrDate(run.completedAt ?? run.createdAt, nowMs);
                return (
                  <Pressable
                    key={run.id}
                    accessibilityRole="button"
                    onPress={() => onSelectRun(run, automation.id)}
                    style={({ pressed }) => [
                      styles.recentRunRow,
                      index > 0 && styles.rowBorder,
                      pressed && styles.rowPressed,
                    ]}
                  >
                    <View style={styles.recentRunMain}>
                      <View style={styles.recentRunTop}>
                        {run.isUnread ? <View style={[styles.unreadDot, { backgroundColor: appearance.accent }]} /> : null}
                        <Text style={[styles.recentRunStatus, { color }]}>{runStatusLabel(run.status)}</Text>
                        <View style={styles.spacer} />
                        <Text style={styles.recentRunTime}>{when}</Text>
                      </View>
                      <Text style={styles.recentRunSummary} numberOfLines={2}>
                        {runSummary(run)}
                      </Text>
                    </View>
                    <Glyph name="chevron-right" size={15} color={appearance.muted} />
                  </Pressable>
                );
              })
            )}
          </View>
        </View>
      </View>
    );
  } else if (target?.kind === 'run') {
    const { run, fromAutomationId } = target;
    const busy = busyId === run.id;
    const automation = state.automations.find((entry) => entry.id === run.automationId);
    const automationName = automation?.name ?? run.automationId;
    const agent = automation !== undefined ? state.agents.find((entry) => entry.agentId === automation.agentId) : undefined;
    const projectName =
      state.projects.find((project) => project.projectId === run.projectId)?.label ??
      (state.projectId === run.projectId ? state.projectName : run.projectId);
    const statusColor = statusColorFor(runStatusTone(run.status), appearance);
    const active = isRunActive(run);

    const detailRows: Array<{ label: string; value: string; leading?: React.ReactNode; copyValue?: string }> = [
      ...(projectName.length > 0 ? [{ label: AutomationsCopy.projectLabel, value: projectName }] : []),
      ...(automation !== undefined
        ? [
            {
              label: AutomationsCopy.agentLabel,
              value: agent?.label ?? automation.agentId,
              leading: <AutomationAgentGlyph agent={agent} fallbackId={automation.agentId} size={14} />,
            },
          ]
        : []),
      ...(run.createdAt.length > 0
        ? [{ label: AutomationsCopy.startedLabel, value: formatFullTimestamp(run.createdAt) }]
        : []),
      {
        label: AutomationsCopy.completedLabel,
        value: run.completedAt !== null ? formatFullTimestamp(run.completedAt) : AutomationsCopy.stillRunning,
      },
      ...(run.sessionId !== null
        ? [{ label: AutomationsCopy.sessionLabel, value: run.sessionId, copyValue: run.sessionId }]
        : []),
      ...(run.worktree !== null && run.worktree.branch.length > 0
        ? [{ label: AutomationsCopy.branchLabel, value: run.worktree.branch, copyValue: run.worktree.branch }]
        : []),
      ...(run.worktree !== null && run.worktree.path.length > 0
        ? [{ label: AutomationsCopy.worktreeLabel, value: run.worktree.path, copyValue: run.worktree.path }]
        : []),
    ];

    content = (
      <View style={styles.sheetContent}>
        {fromAutomationId !== undefined ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => onBackToAutomation(fromAutomationId)}
            style={({ pressed }) => [styles.backRow, pressed && styles.pressed]}
          >
            <ChevronLeftGlyph size={14} color={appearance.accent} />
            <Text style={[styles.backText, { color: appearance.accent }]}>{automationName}</Text>
          </Pressable>
        ) : null}

        <View style={styles.headerBlock}>
          <View style={styles.badgeRow}>
            <View style={[styles.statusPill, { backgroundColor: colorWithOpacity(statusColor, 16) }]}>
              <Text style={[styles.statusPillText, { color: statusColor }]}>{runStatusLabel(run.status)}</Text>
            </View>
            {run.isUnread ? (
              <Text style={[styles.unreadTag, { color: appearance.accent }]}>{AutomationsCopy.unread}</Text>
            ) : null}
          </View>
          <Text style={styles.title}>{automationName}</Text>
        </View>

        <View style={styles.actionRow}>
          {run.sessionId !== null ? (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => onOpenSession(run, automationName)}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed, busy && styles.disabled]}
            >
              <Glyph name="external-link" size={14} color={appearance.accentForeground} />
              <Text style={styles.primaryLabel}>{AutomationsCopy.openSession}</Text>
            </Pressable>
          ) : null}
          {run.isUnread ? (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => onMarkRead(run)}
              style={({ pressed }) => [styles.neutralButton, pressed && styles.neutralPressed, busy && styles.disabled]}
            >
              <Text style={styles.neutralLabel}>{AutomationsCopy.markRead}</Text>
            </Pressable>
          ) : null}
          {!run.isArchived ? (
            <Pressable
              accessibilityRole="button"
              disabled={busy || active}
              onPress={() => onArchive(run)}
              style={({ pressed }) => [
                styles.neutralButton,
                pressed && styles.neutralPressed,
                (busy || active) && styles.disabled,
              ]}
            >
              <Text style={styles.neutralLabel}>{AutomationsCopy.archive}</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{AutomationsCopy.resultLabel}</Text>
          <View style={styles.card}>
            <Text style={styles.promptBody} selectable>
              {runSummary(run)}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{AutomationsCopy.detailsLabel}</Text>
          <View style={styles.groupCard}>
            {detailRows.map((row, index) => (
              <DetailRow
                key={row.label}
                label={row.label}
                value={row.value}
                leading={row.leading}
                copyValue={row.copyValue}
                last={index === detailRows.length - 1}
                styles={styles}
                appearance={appearance}
              />
            ))}
          </View>
        </View>
      </View>
    );
  }

  return (
    <BottomSheet visible={target !== null} onClose={onClose}>
      {content}
    </BottomSheet>
  );
}

const createStyles = (appearance: Appearance) =>
  StyleSheet.create({
    sheetContent: {
      paddingTop: 4,
      paddingBottom: 16,
      gap: 16,
    },
    backRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      alignSelf: 'flex-start',
      paddingVertical: 2,
    },
    backText: {
      fontSize: 13.5,
      fontWeight: '600',
    },
    pressed: {
      opacity: 0.65,
    },
    headerBlock: {
      gap: 6,
    },
    badgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    statusPill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    statusPillText: {
      fontSize: 12,
      fontWeight: '600',
    },
    projectTag: {
      color: appearance.muted,
      fontSize: 12.5,
      flexShrink: 1,
    },
    unreadTag: {
      fontSize: 12,
      fontWeight: '600',
    },
    title: {
      color: appearance.foreground,
      fontSize: 18,
      fontWeight: '700',
    },
    actionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    primaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      height: 36,
      borderRadius: GhostexRadii.control,
      backgroundColor: appearance.accent,
    },
    primaryPressed: {
      opacity: 0.82,
    },
    primaryLabel: {
      color: appearance.accentForeground,
      fontSize: 13.5,
      fontWeight: '600',
    },
    neutralButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      height: 36,
      borderRadius: GhostexRadii.control,
      backgroundColor: appearance.neutralFill,
    },
    neutralPressed: {
      backgroundColor: appearance.neutralFillPressed,
    },
    neutralLabel: {
      color: appearance.foreground,
      fontSize: 13.5,
      fontWeight: '600',
    },
    disabled: {
      opacity: 0.45,
    },
    section: {
      gap: 8,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    sectionActionText: {
      fontSize: 12.5,
      fontWeight: '600',
    },
    sectionLabel: {
      color: appearance.muted,
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      paddingHorizontal: 2,
    },
    card: {
      padding: 12,
      borderRadius: GhostexRadii.section,
      backgroundColor: appearance.card,
      borderWidth: GhostexStrokeWidth,
      borderColor: appearance.border,
    },
    promptBody: {
      color: appearance.foreground,
      fontSize: 13.5,
      lineHeight: 20,
    },
    groupCard: {
      borderRadius: GhostexRadii.section,
      backgroundColor: appearance.card,
      borderWidth: GhostexStrokeWidth,
      borderColor: appearance.border,
      overflow: 'hidden',
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: appearance.border,
    },
    detailRowLast: {
      borderBottomWidth: 0,
    },
    detailLabel: {
      color: appearance.muted,
      fontSize: 13,
      flexShrink: 0,
    },
    detailValueWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 6,
      minWidth: 0,
    },
    detailValue: {
      color: appearance.foreground,
      fontSize: 13,
      textAlign: 'right',
      flexShrink: 1,
    },
    copyButton: {
      padding: 4,
    },
    emptyRunRow: {
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    mutedText: {
      color: appearance.muted,
      fontSize: 13,
    },
    recentRunRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    rowBorder: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: appearance.border,
    },
    rowPressed: {
      backgroundColor: appearance.cardActive,
    },
    recentRunMain: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    recentRunTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    unreadDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    recentRunStatus: {
      fontSize: 13,
      fontWeight: '600',
    },
    spacer: {
      flex: 1,
    },
    recentRunTime: {
      color: appearance.muted,
      fontSize: 12,
    },
    recentRunSummary: {
      color: appearance.muted,
      fontSize: 12.5,
      lineHeight: 17,
    },
  });
