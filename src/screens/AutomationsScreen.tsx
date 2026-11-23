/**
 * Automations screen (GitHub #708): view, pause/resume, and run each connected computer's
 * scheduled automations, plus Runs and Triage like the desktop Automate view.
 *
 * Every read and write is addressed directly to the computer that owns the project (local,
 * Tailscale, Easy Connect, Direct, or Cloud Box), never falling back to another computer.
 */

import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sessionDeepLink } from '../app/deepLinkHandler';
import { openDeepLink } from '../app/deepLinks';
import {
  AutomationAgentGlyph,
  AutomationDetailsBottomSheet,
  statusColorFor,
  type DetailSheetTarget,
} from '../automations/AutomationSheets';
import {
  AutomationsClientError,
  archiveAutomationRun,
  markAutomationRunRead,
  readAllAutomationStates,
  readProjectAutomationState,
  runAutomationNow,
  setAutomationEnabled,
  type AutomationProjectRef,
} from '../automations/client';
import {
  EMPTY_AUTOMATION_STATE,
  automationProjectId,
  describeSchedule,
  formatNextRun,
  formatRelativeOrDate,
  latestRunForAutomation,
  replaceProjectSlice,
  runStatusLabel,
  runStatusTone,
  runSummary,
  triageRuns,
  unreadCountForAutomation,
  visibleRuns,
  type AutomationDefinition,
  type AutomationRun,
  type AutomationState,
  type AutomationTab,
  type AutomationsScope,
} from '../automations/model';
import { Glyph } from '../chat/native/transcript/icons';
import ActionSheet from '../components/common/ActionSheet';
import SegmentedStrip, { type SegmentedStripItem } from '../components/common/SegmentedStrip';
import { useScrollToBarEdges } from '../components/common/verticalBar/VerticalBarArea';
import { ChevronDownGlyph, RefreshGlyph } from '../components/sessions/icons';
import { gbotProjectIds, isHiddenProject } from '../contract/gbotsFilter';
import { AutomationsCopy } from '../copy';
import { useInventoryStore } from '../inventory/store';
import {
  enabledMachines,
  isMachineEnabled,
  machineDisplayLabel,
  selectedMachine,
  useMachinesStore,
} from '../machines/store';
import type { RootStackParamList } from '../navigation/types';
import { GhostexRadii, GhostexStrokeWidth, colorWithOpacity } from '../theme/palette';
import { type Appearance } from '../theme/useAppearance';
import { useAppearanceHeader } from './settings/useAppearanceHeader';
import { machineTargetFor } from './terminal-screen/session-lookups';

type Props = NativeStackScreenProps<RootStackParamList, 'Automations'>;

const AUTO_REFRESH_MS = 30_000;
const CLOCK_TICK_MS = 30_000;

type LoadPhase =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'unreachable'; readonly message: string }
  | { readonly kind: 'failed'; readonly message: string };

function initialMachineId(paramMachineId: string | undefined): string {
  const store = useMachinesStore.getState();
  const enabled = enabledMachines(store);
  if (paramMachineId !== undefined && enabled.some((machine) => machine.id === paramMachineId)) {
    return paramMachineId;
  }
  const active = selectedMachine(store);
  if (active !== null && isMachineEnabled(active)) return active.id;
  return enabled[0]?.id ?? '';
}

function initialScope(params: RootStackParamList['Automations']): AutomationsScope {
  const projectId = params?.projectId?.trim() ?? '';
  if (projectId.length > 0) {
    return {
      kind: 'project',
      projectId,
      projectName: params?.projectName?.trim() || projectId,
      projectPath: params?.projectPath?.trim() ?? '',
    };
  }
  return { kind: 'all' };
}

export default function AutomationsScreen({ navigation, route }: Props) {
  const appearance = useAppearanceHeader();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  const insets = useSafeAreaInsets();
  const listEdges = useScrollToBarEdges();

  const allMachines = useMachinesStore((state) => state.machines);
  const machines = useMemo(() => allMachines.filter(isMachineEnabled), [allMachines]);
  const [machineId, setMachineId] = useState<string>(() => initialMachineId(route.params?.machineId));
  const [scope, setScope] = useState<AutomationsScope>(() => initialScope(route.params));
  const [tab, setTab] = useState<AutomationTab>('automations');
  const [runFilter, setRunFilter] = useState<{ readonly automationId: string; readonly unreadOnly: boolean } | null>(
    null,
  );

  const [state, setState] = useState<AutomationState | null>(null);
  const [phase, setPhase] = useState<LoadPhase>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detailSheet, setDetailSheet] = useState<
    | { readonly kind: 'automation'; readonly id: string }
    | { readonly kind: 'run'; readonly id: string; readonly fromAutomationId?: string }
    | null
  >(null);
  const [picking, setPicking] = useState<'machine' | 'project' | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const ticketRef = useRef(0);
  const stateRef = useRef<AutomationState | null>(null);
  stateRef.current = state;

  const machineRecord = machines.find((entry) => entry.id === machineId) ?? null;
  const computerName = machineRecord === null ? AutomationsCopy.noComputer : machineDisplayLabel(machineRecord);

  const inventorySummary = useInventoryStore((store) =>
    machineId.length > 0 ? store.inventoriesByMachineId[machineId]?.summary ?? null : null,
  );

  const hiddenProjectIds = useMemo(
    () => (inventorySummary !== null ? gbotProjectIds(inventorySummary) : new Set<string>()),
    [inventorySummary],
  );

  /** Non-GBot, non-hidden projects from the selected computer's inventory summary. */
  const inventoryProjects = useMemo<AutomationProjectRef[]>(() => {
    const summary = inventorySummary;
    if (summary === null) return [];
    return summary.projects
      .filter(
        (project) =>
          project.projectId.length > 0 &&
          project.projectId !== 'quick-automations' &&
          (project.path ?? '').length > 0 &&
          !isHiddenProject(project),
      )
      .map((project) => ({
        projectId: project.projectId,
        projectPath: project.path ?? '',
        name: project.name,
      }));
  }, [inventorySummary]);

  const inventoryProjectsRef = useRef(inventoryProjects);
  inventoryProjectsRef.current = inventoryProjects;

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const load = useCallback(
    async (options: { pull?: boolean; silent?: boolean } = {}) => {
      const target = machineId.length > 0 ? machineTargetFor(machineId) : null;
      ticketRef.current += 1;
      const mine = ticketRef.current;

      if (target === null) {
        setState(null);
        setPhase({ kind: 'unreachable', message: AutomationsCopy.noComputerBody });
        setRefreshing(false);
        return;
      }

      if (options.pull) setRefreshing(true);
      else if (!options.silent && stateRef.current === null) setPhase({ kind: 'loading' });

      try {
        const loaded =
          scope.kind === 'project'
            ? await readProjectAutomationState(target, {
                projectId: scope.projectId,
                projectPath: scope.projectPath,
              })
            : await readAllAutomationStates(target, inventoryProjectsRef.current);

        if (mine !== ticketRef.current) return;
        setState(loaded);
        setPhase({ kind: 'ready' });
        setNotice(null);
      } catch (error) {
        if (mine !== ticketRef.current) return;
        const message = error instanceof Error ? error.message : String(error);
        const unreachable = error instanceof AutomationsClientError && error.unreachable;
        if (stateRef.current !== null) {
          setNotice(message);
          setPhase({ kind: 'ready' });
        } else {
          setPhase(unreachable ? { kind: 'unreachable', message } : { kind: 'failed', message });
        }
      } finally {
        if (mine === ticketRef.current) setRefreshing(false);
      }
    },
    [machineId, scope],
  );

  // Reload whenever computer or project scope changes.
  useEffect(() => {
    setState(null);
    setNotice(null);
    setDetailSheet(null);
    setRunFilter(null);
    setPhase({ kind: 'loading' });
    void load();
  }, [load]);

  // Refresh on focus and every 30s while the screen stays open.
  useFocusEffect(
    useCallback(() => {
      if (stateRef.current !== null) void load({ silent: true });
      const timer = setInterval(() => {
        void load({ silent: true });
      }, AUTO_REFRESH_MS);
      return () => clearInterval(timer);
    }, [load]),
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      title: AutomationsCopy.title,
      headerRight: () => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={AutomationsCopy.refresh}
          hitSlop={10}
          onPress={() => void load({ pull: true })}
          style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
        >
          <RefreshGlyph size={18} color={appearance.foreground} />
        </Pressable>
      ),
    });
  }, [appearance.foreground, load, navigation, styles.headerButton, styles.pressed]);

  /** Resolves the project reference on the selected computer for a mutation. */
  const projectRefFor = useCallback(
    (projectId: string): AutomationProjectRef => {
      const fromState = stateRef.current?.projects.find((entry) => entry.projectId === projectId);
      if (fromState !== undefined) {
        return { projectId: fromState.projectId, projectPath: fromState.path, name: fromState.label };
      }
      if (scope.kind === 'project' && (projectId.length === 0 || scope.projectId === projectId)) {
        return { projectId: scope.projectId, projectPath: scope.projectPath, name: scope.projectName };
      }
      const fromInventory = inventoryProjectsRef.current.find((entry) => entry.projectId === projectId);
      if (fromInventory !== undefined) return fromInventory;
      return { projectId };
    },
    [scope],
  );

  const applyMutationResult = useCallback(
    (nextProjectState: AutomationState) => {
      setState((current) => {
        if (scope.kind === 'all' && current !== null) {
          return replaceProjectSlice(current, nextProjectState);
        }
        return nextProjectState;
      });
      setNotice(null);
    },
    [scope.kind],
  );

  const handleToggleEnabled = useCallback(
    async (automation: AutomationDefinition, enabled: boolean) => {
      const target = machineTargetFor(machineId);
      if (target === null) return;
      setBusyId(automation.id);
      setNotice(null);
      try {
        const next = await setAutomationEnabled(
          target,
          projectRefFor(automationProjectId(automation)),
          automation.id,
          enabled,
        );
        applyMutationResult(next);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : AutomationsCopy.updateFailed);
      } finally {
        setBusyId((current) => (current === automation.id ? null : current));
      }
    },
    [applyMutationResult, machineId, projectRefFor],
  );

  const handleRunNow = useCallback(
    async (automation: AutomationDefinition) => {
      const target = machineTargetFor(machineId);
      if (target === null) return;
      setBusyId(automation.id);
      setNotice(null);
      try {
        const next = await runAutomationNow(target, projectRefFor(automationProjectId(automation)), automation.id);
        applyMutationResult(next);
        setDetailSheet(null);
        setTab('runs');
      } catch (error) {
        setNotice(error instanceof Error ? error.message : AutomationsCopy.runNowFailed);
      } finally {
        setBusyId((current) => (current === automation.id ? null : current));
      }
    },
    [applyMutationResult, machineId, projectRefFor],
  );

  const handleMarkRead = useCallback(
    async (run: AutomationRun) => {
      const target = machineTargetFor(machineId);
      if (target === null) return;
      setBusyId(run.id);
      setNotice(null);
      try {
        const next = await markAutomationRunRead(target, projectRefFor(run.projectId), run.id);
        applyMutationResult(next);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : AutomationsCopy.markReadFailed);
      } finally {
        setBusyId((current) => (current === run.id ? null : current));
      }
    },
    [applyMutationResult, machineId, projectRefFor],
  );

  const handleMarkAllRead = useCallback(
    async (automationId: string) => {
      const target = machineTargetFor(machineId);
      const current = stateRef.current;
      if (target === null || current === null) return;
      const unreadRuns = visibleRuns(current).filter(
        (run) => run.automationId === automationId && run.isUnread,
      );
      if (unreadRuns.length === 0) return;
      setBusyId(automationId);
      setNotice(null);
      try {
        for (const run of unreadRuns) {
          const next = await markAutomationRunRead(target, projectRefFor(run.projectId), run.id);
          applyMutationResult(next);
        }
      } catch (error) {
        setNotice(error instanceof Error ? error.message : AutomationsCopy.markReadFailed);
      } finally {
        setBusyId((currentBusy) => (currentBusy === automationId ? null : currentBusy));
      }
    },
    [applyMutationResult, machineId, projectRefFor],
  );

  const handleOpenUnreadForAutomation = useCallback((automationId: string) => {
    setRunFilter({ automationId, unreadOnly: true });
    setTab('runs');
  }, []);

  const handleSelectTab = useCallback((nextTab: AutomationTab) => {
    setRunFilter(null);
    setTab(nextTab);
  }, []);

  const handleArchiveRun = useCallback(
    async (run: AutomationRun) => {
      const target = machineTargetFor(machineId);
      if (target === null) return;
      setBusyId(run.id);
      setNotice(null);
      try {
        const next = await archiveAutomationRun(target, projectRefFor(run.projectId), run.id);
        applyMutationResult(next);
        setDetailSheet((current) => (current?.kind === 'run' && current.id === run.id ? null : current));
      } catch (error) {
        setNotice(error instanceof Error ? error.message : AutomationsCopy.archiveFailed);
      } finally {
        setBusyId((current) => (current === run.id ? null : current));
      }
    },
    [applyMutationResult, machineId, projectRefFor],
  );

  const handleOpenRunSession = useCallback(
    (run: AutomationRun, automationName: string) => {
      if (run.sessionId === null || machineId.length === 0) return;
      setDetailSheet(null);
      if (run.isUnread) {
        void handleMarkRead(run);
      }
      openDeepLink(
        sessionDeepLink({
          machineId,
          sessionId: run.sessionId,
          title: automationName,
        }),
      );
    },
    [handleMarkRead, machineId],
  );

  const currentState = state ?? EMPTY_AUTOMATION_STATE;
  const allVisibleRuns = useMemo(() => visibleRuns(currentState), [currentState]);
  const triageList = useMemo(() => triageRuns(currentState), [currentState]);

  const automationNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const automation of currentState.automations) map.set(automation.id, automation.name);
    return map;
  }, [currentState.automations]);

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const project of currentState.projects) map.set(project.projectId, project.label);
    for (const project of inventoryProjects) {
      if (project.projectId !== undefined && !map.has(project.projectId)) {
        map.set(project.projectId, project.name ?? project.projectId);
      }
    }
    return map;
  }, [currentState.projects, inventoryProjects]);

  /** Projects available in the project picker for the selected computer. */
  const projectChoices = useMemo(() => {
    const map = new Map<string, { projectId: string; label: string; path: string }>();
    for (const project of inventoryProjects) {
      if (project.projectId !== undefined && project.projectId.length > 0) {
        map.set(project.projectId, {
          projectId: project.projectId,
          label: project.name?.trim() || project.projectId,
          path: project.projectPath ?? '',
        });
      }
    }
    for (const project of currentState.projects) {
      if (
        project.projectId.length > 0 &&
        project.projectId !== 'quick-automations' &&
        !hiddenProjectIds.has(project.projectId)
      ) {
        map.set(project.projectId, {
          projectId: project.projectId,
          label: project.label,
          path: project.path,
        });
      }
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [currentState.projects, hiddenProjectIds, inventoryProjects]);

  const automationCountByProject = useMemo(() => {
    const counts = new Map<string, number>();
    if (scope.kind !== 'all') return counts;
    for (const automation of currentState.automations) {
      const pid = automationProjectId(automation);
      counts.set(pid, (counts.get(pid) ?? 0) + 1);
    }
    return counts;
  }, [currentState.automations, scope.kind]);

  const tabs = useMemo<SegmentedStripItem<AutomationTab>[]>(
    () => [
      { key: 'automations', label: AutomationsCopy.tabAutomations, count: currentState.automations.length },
      { key: 'runs', label: AutomationsCopy.tabRuns, count: allVisibleRuns.length },
      { key: 'triage', label: AutomationsCopy.tabTriage, count: triageList.length },
    ],
    [allVisibleRuns.length, currentState.automations.length, triageList.length],
  );

  const detailSheetTarget = useMemo<DetailSheetTarget | null>(() => {
    if (detailSheet === null) return null;
    if (detailSheet.kind === 'automation') {
      const automation = currentState.automations.find((entry) => entry.id === detailSheet.id);
      return automation === undefined ? null : { kind: 'automation', automation };
    }
    const run = currentState.runs.find((entry) => entry.id === detailSheet.id);
    return run === undefined ? null : { kind: 'run', run, fromAutomationId: detailSheet.fromAutomationId };
  }, [currentState.automations, currentState.runs, detailSheet]);

  const scopeLabel =
    scope.kind === 'all'
      ? AutomationsCopy.allProjects
      : (projectNameById.get(scope.projectId) ?? scope.projectName);

  const renderAutomationRow = useCallback(
    ({ item }: { item: AutomationDefinition }) => {
      const busy = busyId === item.id;
      const unread = unreadCountForAutomation(currentState.runs, item.id);
      const lastRun = latestRunForAutomation(currentState.runs, item.id);
      const agent = currentState.agents.find((entry) => entry.agentId === item.agentId);
      const projectLabel = scope.kind === 'all' ? projectNameById.get(automationProjectId(item)) : undefined;
      const scheduleParts = [projectLabel, describeSchedule(item.schedule)].filter(
        (part): part is string => part !== undefined && part.length > 0,
      );
      const nextText = item.enabled ? formatNextRun(item.nextRunAt, nowMs) : AutomationsCopy.paused;
      const lastRunColor =
        lastRun !== null ? statusColorFor(runStatusTone(lastRun.status), appearance) : appearance.muted;
      const lastRunWhen =
        lastRun !== null ? formatRelativeOrDate(lastRun.completedAt ?? lastRun.createdAt, nowMs) : '';

      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={item.name}
          onPress={() => setDetailSheet({ kind: 'automation', id: item.id })}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        >
          <View style={styles.rowTop}>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: item.enabled
                    ? statusColorFor('success', appearance)
                    : colorWithOpacity(appearance.foreground, 22),
                },
              ]}
            />
            <AutomationAgentGlyph agent={agent} fallbackId={item.agentId} size={14} />
            <Text style={[styles.rowTitle, !item.enabled && styles.rowTitlePaused]} numberOfLines={1}>
              {item.name}
            </Text>
            {!item.enabled ? <Text style={styles.pausedBadge}>{AutomationsCopy.paused}</Text> : null}
            {unread > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={AutomationsCopy.viewUnreadFor(unread, item.name)}
                hitSlop={8}
                onPress={(event) => {
                  event.stopPropagation();
                  handleOpenUnreadForAutomation(item.id);
                }}
                style={({ pressed }) => [
                  styles.unreadBadgeButton,
                  { backgroundColor: colorWithOpacity(appearance.accent, 15) },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.unreadBadge, { color: appearance.accent }]}>
                  {AutomationsCopy.unreadCount(unread)}
                </Text>
              </Pressable>
            ) : null}
            <View style={styles.switchWrap}>
              {busy ? (
                <ActivityIndicator size="small" color={appearance.muted} />
              ) : (
                <Switch
                  value={item.enabled}
                  disabled={busy}
                  accessibilityLabel={
                    item.enabled ? AutomationsCopy.pauseLabel(item.name) : AutomationsCopy.resumeLabel(item.name)
                  }
                  onValueChange={(nextEnabled) => void handleToggleEnabled(item, nextEnabled)}
                />
              )}
            </View>
          </View>

          <Text style={styles.scheduleLine} numberOfLines={2}>
            {scheduleParts.join(' · ')}
          </Text>

          <View style={styles.metaRow}>
            <Text style={styles.metaText} numberOfLines={1}>
              {AutomationsCopy.nextLabel(nextText)}
            </Text>
            <Text style={styles.metaDot}>·</Text>
            {lastRun !== null ? (
              <Text style={styles.metaText} numberOfLines={1}>
                <Text style={{ color: lastRunColor, fontWeight: '600' }}>{runStatusLabel(lastRun.status)}</Text>
                {lastRunWhen.length > 0 ? ` · ${lastRunWhen}` : ''}
              </Text>
            ) : (
              <Text style={styles.metaText}>{AutomationsCopy.noRunsYetShort}</Text>
            )}
          </View>
        </Pressable>
      );
    },
    [
      appearance,
      busyId,
      currentState.agents,
      currentState.runs,
      handleOpenUnreadForAutomation,
      handleToggleEnabled,
      nowMs,
      projectNameById,
      scope.kind,
      styles,
    ],
  );

  const renderRunRow = useCallback(
    ({ item }: { item: AutomationRun }) => {
      const name = automationNameById.get(item.automationId) ?? item.automationId;
      const projectLabel = scope.kind === 'all' ? projectNameById.get(item.projectId) : undefined;
      const statusColor = statusColorFor(runStatusTone(item.status), appearance);
      const when = formatRelativeOrDate(item.completedAt ?? item.createdAt, nowMs);

      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${name}, ${runStatusLabel(item.status)}`}
          onPress={() => setDetailSheet({ kind: 'run', id: item.id })}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        >
          <View style={styles.runTop}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: item.isUnread ? appearance.accent : 'transparent' },
              ]}
            />
            <Text style={styles.rowTitle} numberOfLines={1}>
              {name}
            </Text>
            <View style={[styles.runBadge, { backgroundColor: colorWithOpacity(statusColor, 15) }]}>
              <Text style={[styles.runBadgeText, { color: statusColor }]}>{runStatusLabel(item.status)}</Text>
            </View>
          </View>

          <Text style={styles.runSummaryText} numberOfLines={2}>
            {runSummary(item)}
          </Text>

          <View style={styles.runFooter}>
            <Text style={styles.metaText} numberOfLines={1}>
              {[projectLabel, when].filter((part): part is string => Boolean(part && part.length > 0)).join(' · ')}
            </Text>
            {item.sessionId !== null ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={AutomationsCopy.openSessionFor(name)}
                hitSlop={8}
                onPress={(event) => {
                  event.stopPropagation();
                  handleOpenRunSession(item, name);
                }}
                style={({ pressed }) => [styles.sessionChip, pressed && styles.pressed]}
              >
                <Glyph name="external-link" size={12} color={appearance.foreground} />
                <Text style={styles.sessionChipText}>{AutomationsCopy.openSessionShort}</Text>
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      );
    },
    [appearance, automationNameById, handleOpenRunSession, nowMs, projectNameById, scope.kind, styles],
  );

  const controlsHeader = (
    <View style={styles.controls}>
      <View style={styles.pickers}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={AutomationsCopy.pickComputer}
          disabled={machines.length <= 1}
          onPress={() => setPicking('machine')}
          style={({ pressed }) => [
            styles.pickerChip,
            pressed && styles.pickerPressed,
            machines.length <= 1 && styles.pickerStatic,
          ]}
        >
          <Glyph name="device-desktop" size={14} color={appearance.muted} />
          <Text style={styles.pickerText} numberOfLines={1}>
            {computerName}
          </Text>
          {machines.length > 1 ? <ChevronDownGlyph size={14} color={appearance.mutedGlyph} /> : null}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={AutomationsCopy.pickProject}
          disabled={projectChoices.length === 0}
          onPress={() => setPicking('project')}
          style={({ pressed }) => [
            styles.pickerChip,
            pressed && styles.pickerPressed,
            projectChoices.length === 0 && styles.pickerStatic,
          ]}
        >
          <Glyph name="folder" size={14} color={appearance.muted} />
          <Text style={styles.pickerText} numberOfLines={1}>
            {scopeLabel}
          </Text>
          {projectChoices.length > 0 ? <ChevronDownGlyph size={14} color={appearance.mutedGlyph} /> : null}
        </Pressable>
      </View>

      <SegmentedStrip
        accessibilityLabel={AutomationsCopy.tabsLabel}
        items={tabs}
        selected={tab}
        onSelect={handleSelectTab}
      />

      {notice !== null ? (
        <View style={styles.noticeCard} accessibilityRole="alert">
          <Text style={styles.noticeText} numberOfLines={3}>
            {notice}
          </Text>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setNotice(null)}>
            <Glyph name="x" size={15} color={appearance.danger} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  const renderBody = () => {
    if (phase.kind === 'loading' && state === null) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={appearance.muted} />
          <Text style={styles.mutedCenter}>{AutomationsCopy.loading(computerName)}</Text>
        </View>
      );
    }
    if ((phase.kind === 'unreachable' || phase.kind === 'failed') && state === null) {
      return (
        <View style={styles.centered} accessibilityRole="alert">
          <Text style={styles.emptyTitle}>
            {phase.kind === 'unreachable' ? AutomationsCopy.unreachableTitle(computerName) : AutomationsCopy.loadFailedTitle}
          </Text>
          <Text style={styles.mutedCenter}>{phase.message}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void load()}
            style={({ pressed }) => [styles.retryButton, pressed && styles.pickerPressed]}
          >
            <Text style={styles.retryLabel}>{AutomationsCopy.tryAgain}</Text>
          </Pressable>
        </View>
      );
    }

    const refreshControl = (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={() => void load({ pull: true })}
        tintColor={appearance.mutedGlyph}
        colors={[appearance.foreground]}
        progressBackgroundColor={appearance.card}
      />
    );

    if (tab === 'automations') {
      return (
        <FlatList
          data={currentState.automations}
          keyExtractor={(item) => item.id}
          renderItem={renderAutomationRow}
          refreshControl={refreshControl}
          style={listEdges.scroll}
          contentContainerStyle={[styles.listContent, listEdges.content, { paddingBottom: insets.bottom + 24 }]}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Glyph name="clock" size={28} color={appearance.muted} />
              <Text style={styles.emptyTitle}>{AutomationsCopy.emptyAutomationsTitle}</Text>
              <Text style={styles.mutedCenter}>{AutomationsCopy.emptyAutomationsBody(scopeLabel)}</Text>
            </View>
          }
        />
      );
    }

    const activeFilter = tab === 'runs' ? runFilter : null;
    const filteredRuns =
      activeFilter !== null
        ? allVisibleRuns.filter(
            (run) =>
              run.automationId === activeFilter.automationId &&
              (!activeFilter.unreadOnly || run.isUnread),
          )
        : allVisibleRuns;
    const runs = tab === 'triage' ? triageList : filteredRuns;
    const filteredName =
      activeFilter !== null
        ? (automationNameById.get(activeFilter.automationId) ?? activeFilter.automationId)
        : '';
    const filterBusy = activeFilter !== null && busyId === activeFilter.automationId;
    const filterHasUnread = activeFilter !== null && runs.some((run) => run.isUnread);
    return (
      <FlatList
        data={runs}
        keyExtractor={(item) => item.id}
        renderItem={renderRunRow}
        refreshControl={refreshControl}
        style={listEdges.scroll}
        contentContainerStyle={[styles.listContent, listEdges.content, { paddingBottom: insets.bottom + 24 }]}
        ListHeaderComponent={
          activeFilter !== null ? (
            <View style={styles.filterBanner}>
              <Text style={styles.filterBannerLabel} numberOfLines={1}>
                {AutomationsCopy.unreadRunsFilter(filteredName)}
              </Text>
              <View style={styles.filterBannerActions}>
                {filterHasUnread ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={AutomationsCopy.markAllRead}
                    disabled={filterBusy}
                    hitSlop={8}
                    onPress={() => void handleMarkAllRead(activeFilter.automationId)}
                    style={({ pressed }) => [pressed && styles.pressed, filterBusy && styles.disabled]}
                  >
                    <Text style={[styles.filterActionText, { color: appearance.accent }]}>
                      {AutomationsCopy.markAllRead}
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={AutomationsCopy.showAllRuns}
                  hitSlop={8}
                  onPress={() => setRunFilter(null)}
                  style={({ pressed }) => [pressed && styles.pressed]}
                >
                  <Text style={styles.filterClearText}>{AutomationsCopy.showAllRuns}</Text>
                </Pressable>
              </View>
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          <View style={styles.centered}>
            <Glyph name="clock" size={28} color={appearance.muted} />
            <Text style={styles.emptyTitle}>
              {activeFilter !== null
                ? AutomationsCopy.emptyFilteredUnreadTitle
                : tab === 'triage'
                  ? AutomationsCopy.emptyTriageTitle
                  : AutomationsCopy.emptyRunsTitle}
            </Text>
            <Text style={styles.mutedCenter}>
              {activeFilter !== null
                ? AutomationsCopy.emptyFilteredUnreadBody(filteredName)
                : tab === 'triage'
                  ? AutomationsCopy.emptyTriageBody
                  : AutomationsCopy.emptyRunsBody}
            </Text>
            {activeFilter !== null ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setRunFilter(null)}
                style={({ pressed }) => [styles.retryButton, pressed && styles.pickerPressed]}
              >
                <Text style={styles.retryLabel}>{AutomationsCopy.showAllRuns}</Text>
              </Pressable>
            ) : null}
          </View>
        }
      />
    );
  };

  return (
    <View style={styles.screen}>
      {controlsHeader}
      <View style={styles.body}>{renderBody()}</View>

      <AutomationDetailsBottomSheet
        target={detailSheetTarget}
        state={currentState}
        nowMs={nowMs}
        busyId={busyId}
        onToggleEnabled={(automation, enabled) => void handleToggleEnabled(automation, enabled)}
        onRunNow={(automation) => void handleRunNow(automation)}
        onSelectRun={(run, fromAutomationId) => setDetailSheet({ kind: 'run', id: run.id, fromAutomationId })}
        onBackToAutomation={(automationId) => setDetailSheet({ kind: 'automation', id: automationId })}
        onOpenSession={handleOpenRunSession}
        onMarkRead={(run) => void handleMarkRead(run)}
        onMarkAllRead={(automationId) => void handleMarkAllRead(automationId)}
        onArchive={(run) => void handleArchiveRun(run)}
        onClose={() => setDetailSheet(null)}
      />

      <ActionSheet
        visible={picking === 'machine'}
        title={AutomationsCopy.pickComputer}
        subtitle={AutomationsCopy.pickComputerSubtitle}
        items={machines.map((machine) => ({
          key: machine.id,
          label: `${machine.id === machineId ? '✓ ' : ''}${machineDisplayLabel(machine)}`,
          onPress: () => {
            setPicking(null);
            if (machine.id !== machineId) {
              setMachineId(machine.id);
              setScope({ kind: 'all' });
            }
          },
        }))}
        onClose={() => setPicking(null)}
      />

      <ActionSheet
        visible={picking === 'project'}
        title={AutomationsCopy.pickProject}
        subtitle={computerName}
        items={[
          {
            key: '__all__',
            label: `${scope.kind === 'all' ? '✓ ' : ''}${AutomationsCopy.allProjects}`,
            detail:
              scope.kind === 'all'
                ? AutomationsCopy.automationCount(currentState.automations.length)
                : undefined,
            onPress: () => {
              setPicking(null);
              setScope({ kind: 'all' });
            },
          },
          ...projectChoices.map((project) => {
            const selected = scope.kind === 'project' && scope.projectId === project.projectId;
            const count = automationCountByProject.get(project.projectId);
            return {
              key: project.projectId,
              label: `${selected ? '✓ ' : ''}${project.label}`,
              detail: count !== undefined ? AutomationsCopy.automationCount(count) : project.path || undefined,
              onPress: () => {
                setPicking(null);
                setScope({
                  kind: 'project',
                  projectId: project.projectId,
                  projectName: project.label,
                  projectPath: project.path,
                });
              },
            };
          }),
        ]}
        onClose={() => setPicking(null)}
      />
    </View>
  );
}

const createStyles = (appearance: Appearance) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: appearance.background,
    },
    headerButton: {
      padding: 6,
      borderRadius: GhostexRadii.control,
    },
    controls: {
      paddingTop: 10,
      paddingBottom: 10,
      gap: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: appearance.border,
    },
    pickers: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 12,
    },
    pickerChip: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      height: 36,
      paddingHorizontal: 10,
      borderRadius: GhostexRadii.control,
      backgroundColor: appearance.card,
      borderWidth: GhostexStrokeWidth,
      borderColor: appearance.border,
    },
    pickerPressed: {
      backgroundColor: appearance.cardActive,
    },
    pickerStatic: {
      opacity: 0.9,
    },
    pickerText: {
      flex: 1,
      minWidth: 0,
      color: appearance.foreground,
      fontSize: 13.5,
      fontWeight: '600',
    },
    noticeCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 12,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: GhostexRadii.control,
      backgroundColor: colorWithOpacity(appearance.danger, 12),
      borderWidth: GhostexStrokeWidth,
      borderColor: colorWithOpacity(appearance.danger, 35),
    },
    noticeText: {
      flex: 1,
      color: appearance.danger,
      fontSize: 12.5,
      lineHeight: 17,
    },
    body: {
      flex: 1,
      minHeight: 0,
    },
    listContent: {
      padding: 12,
      gap: 10,
    },
    card: {
      paddingHorizontal: 12,
      paddingVertical: 11,
      borderRadius: GhostexRadii.section,
      backgroundColor: appearance.card,
      borderWidth: GhostexStrokeWidth,
      borderColor: appearance.border,
      gap: 5,
    },
    cardPressed: {
      backgroundColor: appearance.cardActive,
    },
    rowTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: 28,
    },
    runTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: 22,
    },
    statusDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      flexShrink: 0,
    },
    rowTitle: {
      flex: 1,
      minWidth: 0,
      color: appearance.foreground,
      fontSize: 14.5,
      fontWeight: '600',
    },
    rowTitlePaused: {
      color: appearance.muted,
    },
    pausedBadge: {
      color: appearance.muted,
      fontSize: 11.5,
      fontWeight: '500',
    },
    unreadBadgeButton: {
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 6,
      flexShrink: 0,
    },
    unreadBadge: {
      fontSize: 11.5,
      fontWeight: '600',
    },
    filterBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: GhostexRadii.control,
      backgroundColor: appearance.card,
      borderWidth: GhostexStrokeWidth,
      borderColor: appearance.border,
    },
    filterBannerLabel: {
      flex: 1,
      minWidth: 0,
      color: appearance.muted,
      fontSize: 12.5,
      fontWeight: '600',
    },
    filterBannerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flexShrink: 0,
    },
    filterActionText: {
      fontSize: 12.5,
      fontWeight: '600',
    },
    filterClearText: {
      color: appearance.muted,
      fontSize: 12.5,
      fontWeight: '600',
    },
    disabled: {
      opacity: 0.45,
    },
    switchWrap: {
      minWidth: 48,
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
    scheduleLine: {
      color: appearance.muted,
      fontSize: 13,
      lineHeight: 18,
      paddingLeft: 15,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingLeft: 15,
      flexWrap: 'wrap',
    },
    metaText: {
      color: appearance.muted,
      fontSize: 12,
      flexShrink: 1,
    },
    metaDot: {
      color: appearance.muted,
      fontSize: 12,
    },
    runBadge: {
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 5,
      flexShrink: 0,
    },
    runBadgeText: {
      fontSize: 11.5,
      fontWeight: '600',
    },
    runSummaryText: {
      color: appearance.muted,
      fontSize: 13,
      lineHeight: 18,
      paddingLeft: 15,
    },
    runFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      paddingLeft: 15,
      marginTop: 2,
    },
    sessionChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 6,
      backgroundColor: appearance.neutralFill,
    },
    sessionChipText: {
      color: appearance.foreground,
      fontSize: 12,
      fontWeight: '600',
    },
    pressed: {
      opacity: 0.65,
    },
    centered: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 28,
      paddingTop: 56,
      gap: 10,
    },
    emptyTitle: {
      color: appearance.foreground,
      fontSize: 15.5,
      fontWeight: '600',
      textAlign: 'center',
    },
    mutedCenter: {
      color: appearance.muted,
      fontSize: 13,
      lineHeight: 19,
      textAlign: 'center',
    },
    retryButton: {
      marginTop: 4,
      paddingHorizontal: 14,
      height: 36,
      borderRadius: GhostexRadii.control,
      backgroundColor: appearance.neutralFill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    retryLabel: {
      color: appearance.foreground,
      fontSize: 13.5,
      fontWeight: '600',
    },
  });
