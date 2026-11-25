/**
 * GitHub repository picker pieces for Add Project's Repository step: the
 * list/sign-in state hook, the owner group header, the one-line repository row,
 * and the notice shown above the list (loading, sign in, CLI missing, failed).
 *
 * The list shows straight away from the last answer kept in memory, then asks
 * gxserver with `refresh: false` (its memory cache) and, when that answer came
 * from a cache, again with `refresh: true`. A computer that does not answer
 * `listRepositories` gets nothing new: the screen stays a plain text field.
 */

import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { LockGlyph } from '../components/onboarding/SetupIcons';
import { GitForkGlyph } from '../components/sessions/icons';
import { AddProjectCopy } from '../copy';
import type { MachineConnectionTarget } from '../machines/credentials';
import { GhostexRadii, GhostexStrokeWidth } from '../theme/palette';
import { useAppearance, type Appearance } from '../theme/useAppearance';
import {
  githubSignIn,
  listGithubRepositories,
  type AddProjectListedRepository,
  type AddProjectRepositoryList,
} from './client';
import { ErrorBanner, InlineActionButton, MutedText, PendingRow } from './primitives';
import {
  cachedRepositoryList,
  formatSincePush,
  rememberRepositoryList,
  repositoryFullName,
  type RepositoryGroup,
} from './repositoryList';

const MONOSPACE = Platform.select({ ios: 'Menlo', default: 'monospace' });
const SIGN_IN_POLL_MS = 2000;
/** GitHub's device codes expire after 15 minutes. */
const SIGN_IN_GIVE_UP_MS = 15 * 60 * 1000;
const GITHUB_DEVICE_URL = 'https://github.com/login/device';
/** A list that answers this fast never flashes a loading row. */
const LOADING_ROW_DELAY_MS = 300;

export type RepositoryListView =
  | { kind: 'hidden' }
  | { kind: 'loading' }
  | { kind: 'answer'; answer: AddProjectRepositoryList; refreshing: boolean };

export type GithubSignInView =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'waiting'; code: string | null; url: string }
  | { kind: 'failed'; message: string };

export type GithubRepositoryList = {
  view: RepositoryListView;
  signIn: GithubSignInView;
  retry: () => void;
  startSignIn: () => void;
};

/** The repository list and GitHub sign-in state for one machine; inert when `enabled` is false. */
export function useGithubRepositoryList(machine: MachineConnectionTarget | null, enabled: boolean): GithubRepositoryList {
  const machineRef = useRef(machine);
  machineRef.current = machine;
  const machineId = machine?.id ?? null;
  const [view, setView] = useState<RepositoryListView>(() => {
    if (!enabled || machineId === null) return { kind: 'hidden' };
    const cached = cachedRepositoryList(machineId);
    return cached === null ? { kind: 'loading' } : { kind: 'answer', answer: cached, refreshing: true };
  });
  const [signIn, setSignIn] = useState<GithubSignInView>({ kind: 'idle' });
  const answerRef = useRef<AddProjectRepositoryList | null>(machineId === null ? null : cachedRepositoryList(machineId));
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  const waitingRef = useRef(false);
  const signInBusyRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollDeadlineRef = useRef(0);

  const show = useCallback((target: MachineConnectionTarget, answer: AddProjectRepositoryList, refreshing: boolean) => {
    answerRef.current = answer;
    rememberRepositoryList(target.id, answer);
    setView({ kind: 'answer', answer, refreshing });
  }, []);

  /** Ask with `refresh: true` and replace the list; a failed or unanswered refresh keeps a good list. */
  const refresh = useCallback(
    async (target: MachineConnectionTarget, run: number): Promise<void> => {
      const fresh = await listGithubRepositories(target, { refresh: true });
      if (!mountedRef.current || run !== generationRef.current) return;
      const previous = answerRef.current;
      if (fresh === null || (fresh.status === 'failed' && previous?.status === 'ready')) {
        setView(previous === null ? { kind: 'hidden' } : { kind: 'answer', answer: previous, refreshing: false });
        return;
      }
      show(target, fresh, false);
    },
    [show],
  );

  const load = useCallback(
    async (mode: 'initial' | 'refresh'): Promise<void> => {
      const target = machineRef.current;
      if (!enabled || target === null) return;
      generationRef.current += 1;
      const run = generationRef.current;
      const previous = answerRef.current;
      if (mode === 'refresh') {
        setView(previous === null ? { kind: 'loading' } : { kind: 'answer', answer: previous, refreshing: true });
        await refresh(target, run);
        return;
      }
      const first = await listGithubRepositories(target, { refresh: false });
      if (!mountedRef.current || run !== generationRef.current) return;
      if (first === null) {
        if (previous !== null) {
          // This computer answered before; a hiccup now keeps the last list and still tries a refresh.
          setView({ kind: 'answer', answer: previous, refreshing: true });
          await refresh(target, run);
          return;
        }
        // Nothing new on screen. An older computer refuses this again at once; a cold list that
        // outlived the cached request's budget still arrives through the longer refresh.
        setView({ kind: 'hidden' });
        await refresh(target, run);
        return;
      }
      const needsRefresh = first.status === 'ready' && first.fromCache;
      show(target, first, needsRefresh);
      if (needsRefresh) await refresh(target, run);
    },
    [enabled, refresh, show],
  );

  useEffect(() => {
    mountedRef.current = true;
    void load('initial');
    return () => {
      mountedRef.current = false;
    };
    // The machine record is looked up per render; its id is the stable key.
  }, [machineId, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopPolling = useCallback(() => {
    waitingRef.current = false;
    if (pollTimerRef.current !== null) clearTimeout(pollTimerRef.current);
    pollTimerRef.current = null;
  }, []);

  const schedulePoll = useCallback(() => {
    pollTimerRef.current = setTimeout(() => {
      pollTimerRef.current = null;
      const target = machineRef.current;
      if (!waitingRef.current || target === null) return;
      void (async () => {
        let state: string | null = null;
        let detail = '';
        try {
          const answer = await githubSignIn(target, 'status');
          state = answer.state;
          detail = answer.detail;
        } catch {
          // A missed poll is retried on the next tick.
          state = null;
        }
        if (!waitingRef.current || !mountedRef.current) return;
        if (state === 'done') {
          stopPolling();
          setSignIn({ kind: 'idle' });
          void load('refresh');
          return;
        }
        if (state === 'failed' || state === 'idle' || Date.now() > pollDeadlineRef.current) {
          stopPolling();
          setSignIn({ kind: 'failed', message: detail.length > 0 ? detail : AddProjectCopy.githubSignInFailed });
          return;
        }
        schedulePoll();
      })();
    }, SIGN_IN_POLL_MS);
  }, [load, stopPolling]);

  const startSignIn = useCallback(() => {
    const target = machineRef.current;
    if (target === null || signInBusyRef.current) return;
    signInBusyRef.current = true;
    stopPolling();
    setSignIn({ kind: 'starting' });
    void (async () => {
      try {
        const answer = await githubSignIn(target, 'start');
        if (!mountedRef.current) {
          if (answer.state === 'waiting') void githubSignIn(target, 'cancel').catch(() => undefined);
          return;
        }
        if (answer.state === 'done') {
          setSignIn({ kind: 'idle' });
          void load('refresh');
          return;
        }
        if (answer.state !== 'waiting') {
          setSignIn({
            kind: 'failed',
            message: answer.detail.length > 0 ? answer.detail : AddProjectCopy.githubSignInFailed,
          });
          return;
        }
        setSignIn({ kind: 'waiting', code: answer.code, url: answer.url.length > 0 ? answer.url : GITHUB_DEVICE_URL });
        waitingRef.current = true;
        pollDeadlineRef.current = Date.now() + SIGN_IN_GIVE_UP_MS;
        schedulePoll();
      } catch (failure) {
        if (!mountedRef.current) return;
        setSignIn({ kind: 'failed', message: failure instanceof Error ? failure.message : String(failure) });
      } finally {
        signInBusyRef.current = false;
      }
    })();
  }, [load, schedulePoll, stopPolling]);

  // Leaving the screen while GitHub waits stops polling and cancels the sign-in on the computer.
  useEffect(
    () => () => {
      if (!waitingRef.current) return;
      stopPolling();
      const target = machineRef.current;
      if (target !== null) void githubSignIn(target, 'cancel').catch(() => undefined);
    },
    [stopPolling],
  );

  const retry = useCallback(() => void load('refresh'), [load]);

  return { view, signIn, retry, startSignIn };
}

function useDelayedFlag(active: boolean, delayMs: number): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);
  return active && shown;
}

/** What the list says above its rows: loading, updating, sign in, CLI missing, or a quiet failure. */
export function RepositoryListNotice({
  list,
  machineLabel,
  noMatches,
}: {
  list: GithubRepositoryList;
  machineLabel: string;
  noMatches: boolean;
}): ReactElement | null {
  const { view } = list;
  const showLoading = useDelayedFlag(view.kind === 'loading', LOADING_ROW_DELAY_MS);
  if (view.kind === 'hidden') return null;
  if (view.kind === 'loading') return showLoading ? <PendingRow label={AddProjectCopy.repositoryListLoading} /> : null;
  const { answer } = view;
  // A sign-in card or failure line being re-checked reads as loading, so it cannot be pressed twice.
  if (view.refreshing && answer.status !== 'ready') return <PendingRow label={AddProjectCopy.repositoryListLoading} />;
  switch (answer.status) {
    case 'signedOut':
      return <GithubSignInCard list={list} machineLabel={machineLabel} />;
    case 'missing':
      return <MutedText>{AddProjectCopy.githubCliMissing(machineLabel)}</MutedText>;
    case 'failed':
      return (
        <View style={noticeStyles.failedRow}>
          <View style={noticeStyles.failedText}>
            <MutedText>{answer.detail.length > 0 ? answer.detail : AddProjectCopy.repositoryListFailed}</MutedText>
          </View>
          <InlineActionButton
            testID="add-project-repository-list-retry"
            label={AddProjectCopy.repositoryListRetry}
            onPress={list.retry}
          />
        </View>
      );
    case 'ready':
      if (view.refreshing) return <PendingRow label={AddProjectCopy.repositoryListUpdating} />;
      return noMatches ? <MutedText>{AddProjectCopy.repositoryListNoMatches}</MutedText> : null;
  }
}

const noticeStyles = StyleSheet.create({
  failedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  failedText: {
    flex: 1,
  },
});

function GithubSignInCard({ list, machineLabel }: { list: GithubRepositoryList; machineLabel: string }): ReactElement {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  const { signIn } = list;
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <View style={styles.card} testID="add-project-github-sign-in">
      <Text style={styles.cardTitle}>{AddProjectCopy.githubSignInTitle(machineLabel)}</Text>
      {signIn.kind === 'idle' || signIn.kind === 'starting' ? (
        <View style={styles.cardActions}>
          <InlineActionButton
            primary
            testID="add-project-github-sign-in-start"
            label={AddProjectCopy.githubSignInButton}
            loading={signIn.kind === 'starting'}
            onPress={list.startSignIn}
          />
        </View>
      ) : null}
      {signIn.kind === 'waiting' ? (
        <>
          {signIn.code === null ? null : (
            <>
              <Text style={styles.codeHint}>{AddProjectCopy.githubSignInCodeHint}</Text>
              <Text selectable style={styles.code} testID="add-project-github-sign-in-code">
                {signIn.code}
              </Text>
            </>
          )}
          <View style={styles.cardActions}>
            {signIn.code === null ? null : (
              <InlineActionButton
                testID="add-project-github-sign-in-copy"
                label={copied ? AddProjectCopy.githubSignInCopiedButton : AddProjectCopy.githubSignInCopyButton}
                onPress={() => {
                  const code = signIn.code;
                  if (code === null) return;
                  void Clipboard.setStringAsync(code).then(() => setCopied(true));
                }}
              />
            )}
            <InlineActionButton
              primary
              testID="add-project-github-sign-in-open"
              label={AddProjectCopy.githubSignInOpenButton}
              onPress={() => void Linking.openURL(signIn.url).catch(() => undefined)}
            />
          </View>
          <PendingRow label={AddProjectCopy.githubSignInWaiting} />
        </>
      ) : null}
      {signIn.kind === 'failed' ? (
        <>
          <ErrorBanner message={signIn.message} />
          <View style={styles.cardActions}>
            <InlineActionButton
              primary
              testID="add-project-github-sign-in-retry"
              label={AddProjectCopy.githubSignInTryAgain}
              onPress={list.startSignIn}
            />
          </View>
        </>
      ) : null}
    </View>
  );
}

/** Owner group header: the owner and "Personal" or "Organisation", or "Shared with you". */
export function RepositoryGroupHeader({ group }: { group: RepositoryGroup }): ReactElement {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  if (group.kind === 'shared') {
    return (
      <View style={styles.groupHeader}>
        <Text style={styles.groupKind}>{AddProjectCopy.repositoryGroupShared}</Text>
      </View>
    );
  }
  return (
    <View style={styles.groupHeader}>
      <Text numberOfLines={1} style={styles.groupOwner}>
        {group.owner}
      </Text>
      <Text style={styles.groupKind}>
        {group.kind === 'personal' ? AddProjectCopy.repositoryGroupPersonal : AddProjectCopy.repositoryGroupOrganisation}
      </Text>
    </View>
  );
}

/** One line per repository: name, lock when private, fork when a fork, time since last push. */
export function RepositoryRow({
  disabled,
  first,
  last,
  now,
  onPress,
  repository,
  showOwner,
}: {
  disabled: boolean;
  first: boolean;
  last: boolean;
  now: number;
  onPress: (repository: AddProjectListedRepository) => void;
  repository: AddProjectListedRepository;
  showOwner: boolean;
}): ReactElement {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  const fullName = repositoryFullName(repository);
  const age = formatSincePush(repository.pushedAt, now);
  const label = [
    fullName,
    repository.private ? AddProjectCopy.repositoryPrivate : null,
    repository.fork ? AddProjectCopy.repositoryFork : null,
    age.length > 0 ? AddProjectCopy.repositoryPushedAgo(age) : null,
  ]
    .filter((part): part is string => part !== null)
    .join(', ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      testID={`add-project-repository-row-${fullName}`}
      disabled={disabled}
      onPress={() => onPress(repository)}
      style={({ pressed }) => [
        styles.row,
        first && styles.rowFirst,
        last && styles.rowLast,
        disabled && styles.rowDisabled,
        pressed && !disabled && styles.rowPressed,
      ]}
    >
      <Text numberOfLines={1} style={styles.rowName}>
        {showOwner ? fullName : repository.name}
      </Text>
      {repository.private ? <LockGlyph size={13} strokeWidth={2} color={appearance.muted} /> : null}
      {repository.fork ? <GitForkGlyph size={13} color={appearance.muted} /> : null}
      <View style={styles.rowSpacer} />
      {age.length > 0 ? <Text style={styles.rowAge}>{age}</Text> : null}
    </Pressable>
  );
}

const createStyles = (appearance: Appearance) =>
  StyleSheet.create({
    card: {
      borderRadius: GhostexRadii.card,
      borderWidth: GhostexStrokeWidth,
      borderColor: appearance.border,
      backgroundColor: appearance.card,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 10,
    },
    cardTitle: {
      color: appearance.foreground,
      fontSize: 15,
      fontWeight: '600',
    },
    cardActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 8,
    },
    codeHint: {
      color: appearance.muted,
      fontSize: 12,
    },
    code: {
      color: appearance.foreground,
      fontFamily: MONOSPACE,
      fontSize: 28,
      fontWeight: '700',
      letterSpacing: 2,
    },
    groupHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 8,
      marginTop: 16,
      marginBottom: 6,
    },
    groupOwner: {
      color: appearance.foreground,
      fontSize: 13,
      fontWeight: '600',
      flexShrink: 1,
    },
    groupKind: {
      color: appearance.muted,
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 44,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: appearance.card,
      borderColor: appearance.border,
      borderLeftWidth: GhostexStrokeWidth,
      borderRightWidth: GhostexStrokeWidth,
      borderTopWidth: GhostexStrokeWidth,
    },
    rowFirst: {
      borderTopLeftRadius: GhostexRadii.card,
      borderTopRightRadius: GhostexRadii.card,
    },
    rowLast: {
      borderBottomWidth: GhostexStrokeWidth,
      borderBottomLeftRadius: GhostexRadii.card,
      borderBottomRightRadius: GhostexRadii.card,
    },
    rowDisabled: {
      opacity: 0.45,
    },
    rowPressed: {
      backgroundColor: appearance.cardActive,
    },
    rowName: {
      color: appearance.foreground,
      fontSize: 15,
      fontWeight: '600',
      flexShrink: 1,
    },
    rowSpacer: {
      flex: 1,
      minWidth: 8,
    },
    rowAge: {
      color: appearance.muted,
      fontSize: 12,
      fontVariant: ['tabular-nums'],
    },
  });
