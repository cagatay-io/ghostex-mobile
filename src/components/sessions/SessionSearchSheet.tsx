/**
 * Session search: the phone's counterpart of the desktop's Sessions search
 * (Quick Access, Sessions tab). A panel over the Sessions list with an
 * autofocused field and the matching sessions of every visible computer, open
 * and closed, newest first under day headings; each row shows the session's
 * tag or agent glyph, its title, its project, how long ago it was used (or
 * closed), and a dot: lit while awake, dim while asleep, a ring when closed.
 * Tapping an open row (or the keyboard's search key, which opens the first
 * row, as Enter does on the desktop) opens it the way tapping it in the list
 * does; tapping a closed row brings it back on its computer first. The
 * matching rules live in src/sessions/sessionSearch.ts. Half folded like a laptop
 * the panel stays in the upper half, off the fold: above the keyboard's cover
 * while it is up (`KeyboardAvoidingContainer`), and above the fold with the
 * keyboard dismissed, so it does not jump between the halves.
 */

import { useMemo, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAppearance, type Appearance } from '../../theme/useAppearance';

import {
  ActivityIndicator,
  Modal,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputInstance,
  type TextStyle,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AGENT_ICONS } from '../../assets/agentIcons.generated';
import { agentIconTint, resolveAgentArtId, visibleSessions, type GhostexSession } from '../../contract/mobileSummary';
import { resolveSessionTag } from '../../contract/sessionTags';
import { SessionSearchCopy } from '../../copy';
import { useInventoryStore } from '../../inventory/store';
import { machineDisplayLabel, type MachineRecord } from '../../machines/store';
import { searchClosedSessions } from '../../sessions/closedSessions';
import {
  searchSessions,
  sessionSearchRelativeTime,
  type ChatMatch,
  type ClosedSession,
  type SessionSearchRow,
  type SessionSearchSource,
} from '../../sessions/sessionSearch';
import { GhostexStrokeWidth, SetupPalette } from '../../theme/palette';
import { useKeyboardTop } from '../common/keyboard/keyboardFrame';
import KeyboardAvoidingContainer from '../common/keyboard/KeyboardAvoidingContainer';
import { useVerticalBarSpace } from '../common/verticalBar/VerticalBarArea';
import { FOLD_CLEARANCE } from '../common/verticalBar/layout';
import { useLaptopFold } from '../common/verticalBar/laptopFold';
import { ChevronLeftGlyph, SearchGlyph, XGlyph } from './icons';

export type ProjectHistoryScope = {
  machineId: string;
  projectId: string;
  title: string;
};

export type SessionSearchSheetProps = {
  visible: boolean;
  /** The computers the Sessions list shows (hidden ones are never searched). */
  machines: readonly MachineRecord[];
  /** When set, lists only this project's closed sessions (e.g. Main Hub's History). */
  projectHistory?: ProjectHistoryScope | null;
  onOpen: (machine: MachineRecord, session: GhostexSession) => void;
  /** Bring a closed session back and open it; rejects with the message to show when it cannot. */
  onRestore: (machine: MachineRecord, session: ClosedSession) => Promise<void>;
  onClose: () => void;
};

/** Desktop Quick Access dark palette (apps/desktop/src/app/window/quick_access/palette.rs). */
const ROW_SELECTED = 'rgba(255,255,255,0.075)';
const GLYPH_TILE = 'rgba(255,255,255,0.07)';
const STATUS_DOT = 'rgba(255,255,255,0.20)';
const STATUS_DOT_OPEN = '#FFFFFF';
/** The fill behind the search words, the desktop Quick Access's (`search_hit`). */
const SEARCH_HIT = 'rgba(255,255,255,0.13)';

/** `text` with the search words (`ranges`) in `hitStyle`: the hit fill, semibold, the title colour. */
function Highlighted({
  text,
  ranges,
  hitStyle,
}: {
  text: string;
  ranges: readonly [number, number][];
  hitStyle: StyleProp<TextStyle>;
}) {
  if (ranges.length === 0) return <>{text}</>;
  const parts: ReactNode[] = [];
  let at = 0;
  ranges.forEach(([start, end], index) => {
    if (start < at || end > text.length) return;
    if (start > at) parts.push(text.slice(at, start));
    parts.push(
      <Text key={index} style={hitStyle}>
        {text.slice(start, end)}
      </Text>,
    );
    at = end;
  });
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}
/** Each keystroke would be an SSH round trip per computer; wait for a pause in typing. */
const CLOSED_QUERY_DEBOUNCE_MS = 300;

export default function SessionSearchSheet({
  visible,
  machines,
  projectHistory = null,
  onOpen,
  onRestore,
  onClose,
}: SessionSearchSheetProps) {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  const insets = useSafeAreaInsets();
  const bar = useVerticalBarSpace();
  const inputRef = useRef<TextInputInstance | null>(null);
  const [query, setQuery] = useState('');
  const inventoriesByMachineId = useInventoryStore((state) => state.inventoriesByMachineId);
  // The navigation bar's inset is under the keyboard while it is open; the panel ends 8 pt above it. Half folded like
  // a laptop with the keyboard dismissed, it ends `FOLD_CLEARANCE` above the fold, where the keyboard's cover (from
  // the fold's top) leaves it while the keyboard is up.
  const keyboardUp = useKeyboardTop() !== null;
  const fold = useLaptopFold();
  const { height: windowHeight } = useWindowDimensions();
  const panelBottom = keyboardUp ? 8 : fold !== null ? windowHeight - fold.top + FOLD_CLEARANCE : insets.bottom + 8;
  const [closedByMachine, setClosedByMachine] = useState<Record<string, ClosedSession[]>>({});
  const [chatMatchesByMachine, setChatMatchesByMachine] = useState<Record<string, ChatMatch[]>>({});
  const [closedLoading, setClosedLoading] = useState(false);
  const [closedFailures, setClosedFailures] = useState<string[]>([]);
  const [restoringKey, setRestoringKey] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const closedGeneration = useRef(0);
  const historyMachineId = projectHistory?.machineId ?? null;
  const historyProjectId = projectHistory?.projectId ?? null;

  // The computers that answered the inventory: only those can be reached for closed sessions too.
  const reporting = useMemo(
    () =>
      visible
        ? machines.filter(
            (machine) =>
              inventoriesByMachineId[machine.id]?.summary != null &&
              (historyMachineId === null || machine.id === historyMachineId),
          )
        : [],
    [visible, machines, inventoriesByMachineId, historyMachineId],
  );
  const reportingIds = reporting.map((machine) => machine.id).join('\n');

  useEffect(() => {
    if (!visible) {
      closedGeneration.current += 1;
      setClosedByMachine({});
      setChatMatchesByMachine({});
      setClosedFailures([]);
      setClosedLoading(false);
      return undefined;
    }
    const generation = ++closedGeneration.current;
    setClosedLoading(true);
    const timer = setTimeout(() => {
      const nowMs = Date.now();
      void Promise.all(
        reporting.map(async (machine) => {
          try {
            return {
              machine,
              found: await searchClosedSessions(machine, query, nowMs, historyProjectId ?? undefined),
            };
          } catch {
            return { machine, found: null };
          }
        }),
      ).then((answers) => {
        if (generation !== closedGeneration.current) return;
        const next: Record<string, ClosedSession[]> = {};
        const chats: Record<string, ChatMatch[]> = {};
        const failures: string[] = [];
        for (const { machine, found } of answers) {
          if (found === null) {
            failures.push(machineDisplayLabel(machine));
          } else {
            next[machine.id] = found.sessions;
            chats[machine.id] = found.chatMatches;
          }
        }
        setClosedByMachine(next);
        setChatMatchesByMachine(chats);
        setClosedFailures(failures);
        setClosedLoading(false);
      });
    }, CLOSED_QUERY_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // `reporting` changes on every inventory poll; refetch only when the computers, scope or query change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, query, reportingIds, historyProjectId]);

  const sources = useMemo((): SessionSearchSource[] => {
    // The phone lists one computer at a time, so a result names its computer once there are several.
    const nameMachines = reporting.length > 1;
    return reporting.flatMap((machine) => {
      const summary = inventoriesByMachineId[machine.id]?.summary;
      if (summary == null) return [];
      return [
        {
          machineId: machine.id,
          machineLabel: nameMachines ? machineDisplayLabel(machine) : '',
          customSessionTags: summary.customSessionTags,
          open: visibleSessions(summary.sessions).map((session) => ({
            session,
            projectLabel: session.projectName.trim(),
          })),
          closed: closedByMachine[machine.id] ?? [],
          chatMatches: chatMatchesByMachine[machine.id] ?? [],
        },
      ];
    });
  }, [reporting, inventoriesByMachineId, closedByMachine, chatMatchesByMachine]);

  const nowMs = Date.now();
  const groups = useMemo(
    () =>
      searchSessions(
        sources,
        query,
        Date.now(),
        historyProjectId !== null ? { closedOnly: true, projectId: historyProjectId } : undefined,
      ),
    [sources, query, historyProjectId],
  );
  const sections = useMemo(() => groups.map((group) => ({ title: group.heading, data: group.rows })), [groups]);
  const firstKey = groups[0]?.rows[0]?.key;

  const close = (): void => {
    if (restoringKey !== null) return;
    setQuery('');
    setRestoreError(null);
    onClose();
  };

  const open = (row: SessionSearchRow): void => {
    if (restoringKey !== null) return;
    const machine = machines.find((entry) => entry.id === row.machineId);
    if (machine === undefined) return;
    if (row.kind === 'open') {
      setQuery('');
      setRestoreError(null);
      onOpen(machine, row.session);
      return;
    }
    if (!row.closed.isRestorable) {
      setRestoreError(
        row.closed.restoreUnavailableReason.length > 0
          ? row.closed.restoreUnavailableReason
          : SessionSearchCopy.notRestorable,
      );
      return;
    }
    setRestoreError(null);
    setRestoringKey(row.key);
    void onRestore(machine, row.closed).then(
      () => {
        setRestoringKey(null);
        setQuery('');
      },
      (error: unknown) => {
        setRestoringKey(null);
        setRestoreError(SessionSearchCopy.restoreFailed(error instanceof Error ? error.message : String(error)));
      },
    );
  };

  const renderRow = ({ item }: { item: SessionSearchRow }) => {
    const tag = resolveSessionTag(item, item.customSessionTags);
    const iconId = resolveAgentArtId(item.agentIcon, item.agentName);
    const AgentIcon = AGENT_ICONS[iconId] ?? AGENT_ICONS.terminal;
    // quick_access/sessions.rs `session_icon`: the tag, then the agent's colored logo, then the terminal glyph in a tile.
    const glyph =
      tag !== undefined ? (
        <View style={styles.glyphTile}>
          <tag.Icon size={14} color={tag.color} strokeWidth={1.9} />
        </View>
      ) : iconId === 'terminal' || iconId === 'browser' ? (
        <View style={styles.glyphTile}>
          <AgentIcon size={14} color={appearance.foreground} />
        </View>
      ) : (
        <View style={styles.glyphImage}>
          <AgentIcon size={18} color={agentIconTint(iconId)} />
        </View>
      );
    const time = sessionSearchRelativeTime(item.timestamp, nowMs);
    const closed = item.kind === 'closed';
    const restoring = restoringKey === item.key;
    const chat = item.chatLine;
    const label = [
      item.title,
      item.projectLabel,
      closed ? SessionSearchCopy.closedLabel : '',
      chat === null ? '' : `${chat.who}: ${chat.text}`,
    ]
      .filter((part) => part.length > 0)
      .join(', ');
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ busy: restoring, disabled: closed && !item.closed.isRestorable }}
        style={({ pressed }) => [
          styles.row,
          pressed || restoring || (restoringKey === null && item.key === firstKey) ? styles.rowSelected : null,
          closed && !item.closed.isRestorable ? styles.rowUnavailable : null,
        ]}
        onPress={() => open(item)}
      >
        {glyph}
        <View style={styles.rowBody}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle} numberOfLines={1} ellipsizeMode="tail">
              <Highlighted text={item.title} ranges={item.titleHighlights} hitStyle={styles.hit} />
            </Text>
            {item.projectLabel.length > 0 ? (
              <Text style={styles.rowProject} numberOfLines={1} ellipsizeMode="tail">
                {item.projectLabel}
              </Text>
            ) : null}
          </View>
          {chat !== null ? (
            // CDXC:Sessions 2026-11-27: the words a chat matched by, under its title, as the desktop draws them.
            <Text style={styles.rowChat} numberOfLines={1} ellipsizeMode="tail">
              <Text style={styles.rowChatWho}>{`${chat.who}: `}</Text>
              <Highlighted text={chat.text} ranges={chat.highlights} hitStyle={styles.hit} />
            </Text>
          ) : null}
        </View>
        {restoring ? (
          <>
            <Text style={styles.rowTime}>{SessionSearchCopy.restoring}</Text>
            <ActivityIndicator size="small" color={appearance.muted} />
          </>
        ) : (
          <>
            {time.length > 0 ? <Text style={styles.rowTime}>{time}</Text> : null}
            <View
              style={
                item.kind === 'closed'
                  ? [styles.statusDot, styles.statusDotClosed]
                  : [styles.statusDot, {
                      // A released Native chat's dot reads open (CDXC:SessionSleep 2026-11-27 in components/sessions/SessionRow.tsx).
                      backgroundColor:
                        item.session.isSleeping && item.session.nonCliMode !== true ? STATUS_DOT : STATUS_DOT_OPEN,
                    }]
              }
            />
          </>
        )}
      </Pressable>
    );
  };

  const footer =
    closedLoading || closedFailures.length > 0 ? (
      <Text style={styles.footer}>
        {closedLoading
          ? SessionSearchCopy.loadingClosed
          : SessionSearchCopy.closedUnavailable(closedFailures.join(', '))}
      </Text>
    ) : undefined;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={close}
      onShow={() => {
        if (projectHistory === null) inputRef.current?.focus();
      }}
    >
      <KeyboardAvoidingContainer style={[styles.fill, { paddingTop: insets.top + 8, paddingBottom: panelBottom }]}>
        <Pressable
          style={styles.backdrop}
          accessibilityRole="button"
          accessibilityLabel={SessionSearchCopy.close}
          onPress={close}
        />
        <View style={[styles.panel, bar.margin]}>
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={SessionSearchCopy.close}
              hitSlop={8}
              style={styles.headerButton}
              onPress={close}
            >
              <ChevronLeftGlyph size={22} color={appearance.foreground} />
            </Pressable>
            <View style={styles.field}>
              <SearchGlyph size={16} color={appearance.muted} />
              <TextInput
                keyboardAppearance={appearance.light ? 'light' : 'dark'}
                ref={inputRef}
                autoFocus={projectHistory === null}
                value={query}
                onChangeText={(next) => {
                  setQuery(next);
                  setRestoreError(null);
                }}
                editable={restoringKey === null}
                placeholder={
                  projectHistory !== null
                    ? `Search ${projectHistory.title} history...`
                    : SessionSearchCopy.placeholder
                }
                placeholderTextColor={appearance.muted}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                returnKeyType="search"
                submitBehavior="blurAndSubmit"
                onSubmitEditing={() => {
                  const first = groups[0]?.rows[0];
                  if (first !== undefined) open(first);
                }}
              />
              {query.length > 0 && restoringKey === null ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={SessionSearchCopy.clear}
                  hitSlop={8}
                  onPress={() => {
                    setQuery('');
                    inputRef.current?.focus();
                  }}
                >
                  <XGlyph size={16} color={appearance.muted} />
                </Pressable>
              ) : null}
            </View>
          </View>
          {restoreError !== null ? (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {restoreError}
            </Text>
          ) : null}
          <SectionList
            sections={sections}
            keyExtractor={(row) => row.key}
            renderItem={renderRow}
            renderSectionHeader={({ section }) =>
              // A search is one list with no heading (sessionSearch.ts `searchSessions`).
              section.title.length === 0 ? null : (
                <Text style={styles.sectionHeading} numberOfLines={1}>
                  {section.title}
                </Text>
              )
            }
            stickySectionHeadersEnabled={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            style={styles.list}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              closedLoading ? undefined : (
                <Text style={styles.empty}>
                  {query.trim().length > 0
                    ? SessionSearchCopy.noMatches
                    : projectHistory !== null
                      ? `No closed sessions in ${projectHistory.title} yet.`
                      : SessionSearchCopy.noSessions}
                </Text>
              )
            }
            ListFooterComponent={footer}
          />
        </View>
      </KeyboardAvoidingContainer>
    </Modal>
  );
}

const createStyles = (appearance: Appearance) => StyleSheet.create({
  fill: {
    flex: 1,
    paddingHorizontal: 10,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: SetupPalette.BACKDROP,
  },
  panel: {
    flexShrink: 1,
    maxHeight: '100%',
    backgroundColor: appearance.input,
    borderRadius: 12,
    borderWidth: GhostexStrokeWidth,
    borderColor: appearance.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderBottomWidth: GhostexStrokeWidth,
    borderBottomColor: appearance.border,
  },
  headerButton: {
    width: 36,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: {
    flex: 1,
    minWidth: 0,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: appearance.card,
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    color: appearance.foreground,
    fontSize: 15,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingHorizontal: 6,
    paddingBottom: 8,
  },
  sectionHeading: {
    color: appearance.muted,
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: 4,
  },
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowChat: {
    color: appearance.muted,
    fontSize: 12.5,
  },
  rowChatWho: {
    color: appearance.foreground,
    fontWeight: '600',
  },
  hit: {
    color: appearance.foreground,
    backgroundColor: SEARCH_HIT,
    fontWeight: '600',
  },
  rowSelected: {
    backgroundColor: ROW_SELECTED,
  },
  glyphTile: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: GLYPH_TILE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphImage: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 9,
  },
  rowTitle: {
    flexShrink: 1,
    color: appearance.foreground,
    fontSize: 14.5,
  },
  rowProject: {
    flexShrink: 8,
    color: appearance.muted,
    fontSize: 12.5,
  },
  rowTime: {
    minWidth: 28,
    textAlign: 'right',
    color: appearance.muted,
    fontSize: 12.5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  /** A closed session draws only the ring of the dot: nothing is running for it. */
  statusDotClosed: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  rowUnavailable: {
    opacity: 0.45,
  },
  footer: {
    color: appearance.muted,
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 12,
  },
  error: {
    color: appearance.danger,
    fontSize: 13,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  empty: {
    color: appearance.muted,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 24,
  },
});
