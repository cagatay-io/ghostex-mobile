/**
 * A coordinator's work item cards under its replies (`workCards` in the chat core's document,
 * `packages/gx-chat-core/src/extras/work_cards.rs`, which holds the user's decision): a card per item
 * the turn changed, with its status, where it stands, who has the ball and how long ago, and a card
 * per ask with its answer buttons; an item's earlier cards and settled asks fold to one quiet line.
 * Port of desktop `native_chat/work_cards.rs`.
 *
 * A tap on an answer sends `coordinatorBoardAnswer`, which the core records with gxserver once and
 * then tells the coordinator ("W3 Q2: Now"). Every button is a neutral fill, never the dark primary
 * one: the card sits on the chat's glass (the user's standing rule, no black fills on glass).
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as Clipboard from 'expo-clipboard';
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import type { ChatDocument, WorkingCard as WorkingCardValue } from '../../rust/document';
import type { RustChat } from '../../rust/useRustChat';
import { CountBadge } from '../../../components/common/CountBadge';
import {
  consumePendingAskDetails,
  hasPendingAskDetails,
  subscribeOpenAskDetails,
} from '../../../notifications/pendingAskDetails';
import { attachSessionKey } from '../../../terminal/sessions';
import { useMachinesStore } from '../../../machines/store';
import { SidebarPalette } from '../../../theme/palette';
import { Glyph, type GlyphName } from './icons';
import {
  ASKS_GROUP_NAME,
  ASKS_GROUP_PLURAL,
  ASKS_GROUP_SINGULAR,
  INBOX_NAME,
  asksCountWords,
} from './inboxLabels';
import { arr, isTrue, obj, str, type JsonRecord } from './json';
import { usePageCountRefresh } from './pageCounts';
import { ToneButton } from './ToneCard';
import { askColor, tint } from './askCard';
import { AgentMark } from './agentMark';
import { toneColor } from './CoordinatorBoard';
import { QuestionFlashFrame } from '../transcript/OpenQuestions';
import { CODE_SIZE, MONO_FONT, PROSE_LINE, PROSE_SIZE, themedStyles, useTranscriptTheme } from '../transcript/theme';
import {
  TranscriptEnvProvider,
  TranscriptFlagsProvider,
  transcriptFlags,
  useTranscriptFlags,
  type TranscriptEnv,
} from '../transcript/context';
import { strengthenedText } from '../transcript/textStrength';
import { LinkWords } from '../transcript/LinkWords';
import { Sheet } from '../composer/Sheet';
import {
  OPENED_ROW_GAP,
  STATUS_COLOR,
  TextArea,
  WORK_BUTTON_SLOP,
  WorkAnswerLine,
  WorkDescription,
  WorkMenuButton,
  WorkMenuList,
  rowAsksQuestion,
  rowMarkdown,
  workMenuRows,
} from './workItemParts';
import { STACK_GAP } from './NativeChatCards';
import { loadReplyDrafts, pruneReplyDrafts, registerReplyDraftScope, type ReplyDraftScope } from './replyDrafts';
import { FoldChevron } from '../transcript/foldChevron';
import { animateNextFold } from '../transcript/foldMotion';
import { useTranscriptBottomStore } from '../transcript/bottomStore';
import { WorkingLine } from './WorkingCard';
import { VISUAL as WORKING_VISUAL } from './WorkingStrip';
import {
  SINGLE_LINE_CARD,
  SINGLE_LINE_HEADER_HEIGHT,
  SINGLE_LINE_TITLE,
  SingleLineBadge,
  SingleLinePill,
  SingleLineTileBox,
  TITLE_ROW_GAP,
  singleLinePressed,
  singleLineShell,
  useSingleLineTitleFit,
} from '../transcript/singleLineCard';

type Dispatch = RustChat['dispatch'];

/**
 * A title's colour: the chat's body text at the user's Text strength, as a reply's prose is drawn.
 *
 * CDXC:Coordinators 2026-11-10 DECISION: User, on the opened Moving list: "the font size must match
 * the font size of the chat here please and same text strength should apply". Titles are the chat's
 * body text, second lines, folds and the Moving row's names its muted text at the same size; chips
 * and the status and age labels stay small (desktop `native_chat/work_cards.rs`).
 */
function useBodyColor(): string {
  const P = useTranscriptTheme();
  const { chatTextStrength } = useTranscriptFlags();
  return strengthenedText(P.prose, chatTextStrength, P.light);
}

const CHIP_ICON: Record<string, GlyphName> = {
  thread: 'robot',
  steps: 'checklist',
  item: 'stack',
  question: 'help-circle',
  usageLimit: 'clock',
  link: 'link',
  file: 'note',
  wait: 'clock',
  github: 'brand-github',
};

/** The cards in the document, by the reply each sits under and by summary-mode turn. */
export type WorkCardIndex = {
  byAnchor: { [messageId: string]: JsonRecord[] };
  byTurn: { [turnId: string]: JsonRecord[] };
};

export function workCardIndex(document: ChatDocument | null): WorkCardIndex {
  const index: WorkCardIndex = { byAnchor: {}, byTurn: {} };
  for (const card of arr(document?.workCards)
    .map(obj)
    .filter((card): card is JsonRecord => card !== null && str(card, 'key').length > 0)) {
    const anchor = str(card, 'anchorId');
    const turn = str(card, 'turnId');
    if (anchor.length > 0) (index.byAnchor[anchor] ??= []).push(card);
    if (turn.length > 0) (index.byTurn[turn] ??= []).push(card);
  }
  return index;
}

/** A status's marker: Tabler SVGs matching desktop `status_look` (Q4775-Q4783). */
function StatusMarker({ status, size, dim }: { status: string; size: number; dim?: boolean }) {
  const P = useTranscriptTheme();
  const color = STATUS_COLOR[status] ?? P.cardMuted;
  const opacity = dim === true ? 0.8 : 1;
  const glyph = (() => {
    if (status === 'finished') return <Glyph name="circle-check" size={size} color={color} />;
    if (status === 'approved') return <Glyph name="shield-check" size={size} color={STATUS_COLOR.finished} />;
    if (status === 'denied') return <Glyph name="shield-x" size={size} color={STATUS_COLOR.blocked} />;
    if (status === 'dropped') return <Glyph name="circle-x" size={size} color={P.muted} />;
    if (status === 'blocked') return <Glyph name="circle-minus-filled" size={size} color={color} />;
    if (status === 'moving') return <Glyph name="circle-half" size={size} color={color} />;
    if (status === 'waiting') return <Glyph name="player-pause" size={size} color={color} />;
    if (status === 'needs') return <Glyph name="circle-dot" size={size} color={color} />;
    if (status === 'later') return <Glyph name="calendar-clock" size={size} color={P.muted} />;
    if (status === 'removed') return <Glyph name="circle-off" size={size} color={P.muted} />;
    return <Glyph name="circle-dashed" size={size} color={P.muted} />;
  })();
  return opacity < 1 ? <View style={{ opacity }}>{glyph}</View> : glyph;
}

/** The cards under one reply or summary-mode turn. `gap` spaces the cards when given (an opened Quiet View line's rail, `quietView.tsx`). */
export function WorkCardStack({ cards, dispatch, gap }: { cards: JsonRecord[]; dispatch: Dispatch; gap?: number }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  if (cards.length === 0) return null;
  return (
    <View style={gap === undefined ? styles.stack : [styles.stack, { gap }]}>
      {cards.map((card) => (
        // The ? pill's jump lands on an ask's card and outlines it (`OpenQuestions.tsx`).
        <QuestionFlashFrame key={str(card, 'key')} target={str(card, 'key')} light={P.light}>
          {str(card, 'kind') === 'moving' ? (
            <WorkMovingRow card={card} dispatch={dispatch} />
          ) : typeof card.lead === 'string' ? (
            <WorkTurnCard card={card} dispatch={dispatch} />
          ) : isTrue(card, 'folded') ? (
            <WorkFoldLine card={card} dispatch={dispatch} />
          ) : (
            <WorkCard card={card} dispatch={dispatch} />
          )}
        </QuestionFlashFrame>
      ))}
    </View>
  );
}

/** The dock's rows stop growing here and scroll inside it (desktop `DOCK_MAX_HEIGHT`). */
const DOCK_MAX_HEIGHT = 420;
/** A row's lead (its mark and the gap after it) and the dock's insets, for the answers' room. */
const DOCK_LEAD = 23;
const DOCK_INSETS = 12 * 2 + 4 * 2 + 8 * 2 + 2;

/** The header bar's height with the surface's borders: what the cap leaves the rows is the rest. */
const DOCK_HEAD_HEIGHT = 36 + 3;
/** The least room the rows keep under the bar when the cap is tight: about one closed row. */
const DOCK_MIN_ROWS = 44;

/**
 * The most height the dock may take, from the space between what sits above the transcript and the
 * chat box: 45% of it with the keyboard down, half with it up, and never more than
 * `DOCK_MAX_HEIGHT`; the transcript keeps the rest, at least about a third once the working card
 * is counted. Past the cap the rows scroll inside the dock, as on the desktop. With the keyboard up
 * that is about 100 points on a small phone (360 by 640) and 210 on a large one (411 by 915), so
 * the bar and a row or two show; with it down, about 210 and 330, and a foldable unfolded (673 by
 * 841) gets about 300.
 *
 * CDXC:Coordinators 2026-11-12 DECISION:
 * User, of an opened docked row that filled the screen above the keyboard and pushed the chat box
 * off it: "The composer should always be visible whenever I have my caret focused on it, so I can
 * type on the phone app."
 */
export function dockHeightCap(space: number, keyboardUp: boolean): number {
  return Math.min(DOCK_MAX_HEIGHT, Math.max(0, space) * (keyboardUp ? 0.5 : 0.45));
}

/**
 * The dock's overflow line, by what is hidden: "3 more done", "2 more need you · 1 more done". Never
 * says "need you" of a row that does not (a finished row has `needs` false). Same words as
 * gx-chat-core `work_cards::dock_more_label`.
 */
function dockMoreLabel(hiddenRows: JsonRecord[]): string {
  const needs = hiddenRows.filter((row) => isTrue(row, 'needs')).length;
  const blocked = hiddenRows.filter((row) => !isTrue(row, 'needs') && str(row, 'kind') === 'blocked').length;
  const done = hiddenRows.length - needs - blocked;
  const parts: string[] = [];
  if (needs > 0) parts.push(`${needs} more ${asksCountWords(needs)}`);
  if (blocked > 0) parts.push(`${blocked} more blocked`);
  if (done > 0) parts.push(`${done} more done`);
  return parts.join(' \u00b7 ');
}

/**
 * The dock directly on the chat box (gx-chat-core `work_cards::dock`, which holds the user's
 * decisions; desktop `render_work_dock`): one surface with a header bar, then compact rows, what
 * needs him first, then blocked work and what the newest turn finished. The header counts what
 * needs him, what is blocked and what is in progress, opens the Work sheet, and collapses the dock to
 * itself; a collapsed dock opens by itself when something new needs him (the core's `hidden`). At
 * most `phoneLimit` rows show, then "N more" by what is hidden (`dockMoreLabel`), which opens the rest in place. A tap shows a
 * row's ask in a sheet (`DockRow` with `onClose`). It sits outside the transcript, so it carries the
 * transcript's flags (Text strength) and an env for the description's Markdown.
 *
 * CDXC:Coordinators 2026-11-11 DECISION:
 * User, of the phone's dock: "make how the work items list shows up matches please!!" The phone takes
 * the desktop's header (marks and counts, the Work items button, the chevron) in place of its round
 * x, and the desktop's opened row.
 *
 * The bar also carries the agent's working status at its left, the work summary at its right
 * (desktop `work_dock_header` with `dock_status_card`): while the bar shows, the working card above
 * the chat box does not. With nothing docked the bar still shows while there is something to count
 * or a status to carry, as one line with no chevron (`workDockShown`); with nothing counted and the
 * agent idle it goes, unlike the desktop's "Nothing in progress", since the phone keeps its Work pill.
 *
 * CDXC:Coordinators 2026-11-12 DECISION:
 * User, of the desktop's bar ("✦ Manifesting…" at the left, "◐ 2 in progress" and the Work panel
 * button at the right): make the phone's chat match, one bar above the chat box, opening to the
 * docked rows as before; idle, it shows only the work summary; with no work items it is just the
 * working status. The phone's limits stay (45% of the space, folded while typing).
 */
export function WorkDock({
  document,
  chat: coreChat,
  onHostAction,
  projectId,
  sessionId,
  status = null,
  onOpenWork,
  onAskSettled,
  typing = false,
  errorShown = false,
  maxHeight,
  gapBelow = 6,
}: {
  document: ChatDocument | null;
  chat: RustChat;
  /** The working status the bar carries at its left (`dockStatusCard`), or null for none. */
  status?: WorkingCardValue | null;
  /** Opens the Work sheet, as the Work pill does (the chat screen's pill sheet). */
  onOpenWork?: () => void;
  /** A row's button that opens something of the app's (`{ type: 'hostAction', action }`, gx-chat-core `extras/dock_stack.rs`): Pick model. */
  onHostAction?: (action: string) => void;
  /** Shows the chat's toast for an ask settled elsewhere while its sheet was open: "Answered" or "Withdrawn". */
  onAskSettled?: (title: string) => void;
  projectId?: string;
  sessionId?: string;
  /** The chat box has the caret with the keyboard up: the dock folds to its bar until a tap opens it. */
  typing?: boolean;
  /** An error banner sits above the dock: fold to the header row until the error clears or the user expands it. */
  errorShown?: boolean;
  /** The most height the whole dock may take (`dockHeightCap`); its rows scroll inside past it. */
  maxHeight?: number;
  /** The space under it: the stack's gap to the working card, or its share of the gap to the box. */
  gapBelow?: number;
}) {
  // A row's `hostAction` button opens the app's own sheet instead of going to the chat core.
  const chat = useMemo<RustChat>(
    () => ({
      ...coreChat,
      dispatch: ((action: { type?: unknown; action?: unknown }) => {
        if (action?.type === 'hostAction') {
          if (typeof action.action === 'string') onHostAction?.(action.action);
          return;
        }
        coreChat.dispatch(action as never);
      }) as RustChat['dispatch'],
    }),
    [coreChat, onHostAction],
  );
  const flags = useMemo(() => transcriptFlags(document), [document]);
  // While he types or while an error banner sits above the dock, fold locally (not in the core):
  // when typing ends or the error goes away, the dock returns to its previous state.
  const [peek, setPeek] = useState(false);
  useEffect(() => {
    if (!typing) setPeek(false);
  }, [typing]);
  const [errorPeek, setErrorPeek] = useState(false);
  useEffect(() => {
    if (!errorShown) setErrorPeek(false);
  }, [errorShown]);
  const styles = useStyles();
  const P = useTranscriptTheme();
  const dispatch = chat.dispatch;
  // The row whose ask is shown in its sheet (`DockRow` with `onClose`), by key.
  const [sheetKey, setSheetKey] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [snoozedOpen, setSnoozedOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [swipeSnoozeRow, setSwipeSnoozeRow] = useState<JsonRecord | null>(null);
  const env = useMemo<TranscriptEnv>(
    () => ({
      dispatch,
      theme: P,
      simple: false,
      workOpen: false,
      filePreviews: false,
      mutedThinking: false,
      main: false,
    }),
    [dispatch, P],
  );
  const machine = chat.machine;
  const scope = useMemo<ReplyDraftScope | null>(
    () =>
      machine !== null && (projectId ?? '').length > 0 && (sessionId ?? '').length > 0
        ? { machine, projectId: projectId ?? '', sessionId: sessionId ?? '' }
        : null,
    // The machine object changes identity on every store update; only the chat's identity matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [machine?.id, projectId, sessionId],
  );
  // The chat's Reply drafts: read once, and the Work sheet's Reply finds this chat's scope.
  useEffect(() => {
    if (scope === null) return;
    registerReplyDraftScope(dispatch, scope);
    loadReplyDrafts(scope);
  }, [dispatch, scope]);
  const dockValue = document?.workDock;
  const boardValue = document?.coordinatorBoard;
  useEffect(() => {
    if (scope !== null && (dockValue != null || boardValue != null)) pruneReplyDrafts(scope, dockValue, boardValue);
  }, [scope, dockValue, boardValue]);
  // The dock's own collapse eases as the chat's folds do (`foldMotion.ts`). It can come from the
  // core (`hidden`), the keyboard or a tap, so the change is caught where it is drawn: the render
  // that first draws it configures the layout it commits.
  const shownCollapsed = useRef<boolean | null>(null);
  const dock = obj(dockValue);
  const rows = dockRows(document);
  // Notification tap opens the first open ask's details bottom sheet automatically once its row
  // is loaded (CDXC:Coordinators 2026-11-24, Q3).
  const dockSessionKey =
    machine !== null && (sessionId ?? '').length > 0 ? attachSessionKey(machine.id, sessionId ?? '') : null;
  const [pendingDetailsTick, setPendingDetailsTick] = useState(0);
  useEffect(() => subscribeOpenAskDetails(() => setPendingDetailsTick((n) => n + 1)), []);
  useEffect(() => {
    if (dockSessionKey === null || sheetKey !== null || !hasPendingAskDetails(dockSessionKey)) return;
    const askRow = rows.find((row) => {
      const rowKind = str(row, 'kind');
      return (
        (rowKind === 'ask' || rowKind === 'question') &&
        !isTrue(row, 'settled') &&
        (isTrue(row, 'details') || str(row, 'body').trim().length > 0)
      );
    });
    if (askRow === undefined) return;
    if (consumePendingAskDetails(dockSessionKey)) {
      setSheetKey(str(askRow, 'key'));
    }
  }, [dockSessionKey, sheetKey, rows, pendingDetailsTick]);
  const snoozed = dockSnoozed(document);
  const recent = dockRecent(document);
  const recentArchiveAll = obj(dock?.recentArchiveAll) ?? obj(dock?.doneArchiveAll);
  const recentArchiveAllCmd = obj(recentArchiveAll?.command);
  const undoMarkAllRead = obj(dock?.undoMarkAllRead);
  const board = obj(boardValue);
  // The sheet's row left the dock while it was open: the sheet goes (its key with it, so the same
  // row coming back later does not pop it up again), and an ask the coordinator, the computer or
  // another phone settled says how in a toast (desktop `sync_dock_ask_modal`). The reader's own
  // answer, Reply or menu pick from the sheet closes it first, so it gets none; a snooze from
  // elsewhere leaves the ask open, so it gets none either.
  //
  // CDXC:Coordinators 2026-11-14 DECISION:
  // User: "when question is marked as answered give a toast at least that it has been answered",
  // then yes to the same toast on the phone (Q3109).
  const sheetGone =
    sheetKey !== null &&
    !rows.some((row) => str(row, 'key') === sheetKey) &&
    !snoozed.some((row) => str(row, 'key') === sheetKey) &&
    !recent.some((row) => str(row, 'key') === sheetKey);
  const settledValue = document?.workAsksSettled;
  useEffect(() => {
    if (!sheetGone || sheetKey === null) return;
    const how = str(settledValue, sheetKey);
    setSheetKey(null);
    if (how === 'answered') onAskSettled?.('Answered');
    else if (how === 'withdrawn') onAskSettled?.('Withdrawn');
    // Only the moment the row goes matters, not each new toast callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetGone, sheetKey, settledValue]);
  if (document === null || !workDockShown(document, status)) {
    shownCollapsed.current = null;
    return null;
  }
  // With nothing docked the bar is one line: no chevron, nothing to open.
  const collapsible = rows.length > 0 || snoozed.length > 0 || recent.length > 0 || undoMarkAllRead !== null;
  const hiddenInCore = isTrue(dock, 'hidden');
  // An approval the agent waits on (or one just answered) keeps the dock open while typing: it is
  // drawn nowhere else (gx-chat-core extras/dock_approvals.rs; desktop `render_work_dock`).
  const stays = rows.some((row) => isTrue(row, 'stays'));
  const collapsed = !collapsible || hiddenInCore || (errorShown && !errorPeek) || (typing && !peek && !stays);
  if (shownCollapsed.current !== null && shownCollapsed.current !== collapsed) animateNextFold();
  shownCollapsed.current = collapsed;
  const limit = typeof dock?.phoneLimit === 'number' ? dock.phoneLimit : 3;
  const hidden = Math.max(0, rows.length - limit);
  const shown = all && hidden > 0 ? rows : rows.slice(0, limit);
  const markAllSeen = obj(dock?.markAllSeen);
  const markAllSummary = str(markAllSeen, 'summary');
  const sheetRow =
    sheetKey === null
      ? null
      : ([...rows, ...snoozed, ...recent].find((row) => str(row, 'key') === sheetKey) ?? null);
  const swipeSnoozeChoices = swipeSnoozeRow === null
    ? []
    : arr(swipeSnoozeRow.snooze)
        .map(obj)
        .filter((choice): choice is JsonRecord => choice !== null);
  return (
    <TranscriptFlagsProvider value={flags}>
      <TranscriptEnvProvider value={env}>
        <View style={[styles.dockColumn, { paddingBottom: gapBelow }]}>
          <View style={styles.dockSurface}>
            <DockHeader
              rows={rows}
              board={board}
              status={status}
              collapsible={collapsible}
              open={!collapsed}
              onOpenGroup={(group) => dispatch({ type: 'showCoordinatorBoardGroup', group } as never)}
              onOpenWork={
                onOpenWork ?? (() => dispatch({ type: 'showCoordinatorBoardGroup', group: 'needs' } as never))
              }
              onToggle={() => {
                if (!collapsed) {
                  if (errorShown) setErrorPeek(false);
                  dispatch({ type: 'hideWorkDock' } as never);
                  return;
                }
                // Folded for an error or typing: open it while that lasts; folded by him: open it for good.
                if (errorShown) setErrorPeek(true);
                if (typing) setPeek(true);
                if (hiddenInCore) dispatch({ type: 'showWorkDock' } as never);
              }}
            />
            {collapsed ? null : (
              <ScrollView
                style={{
                  maxHeight:
                    maxHeight === undefined
                      ? DOCK_MAX_HEIGHT
                      : Math.max(DOCK_MIN_ROWS, Math.min(DOCK_MAX_HEIGHT, maxHeight - DOCK_HEAD_HEIGHT)),
                }}
                contentContainerStyle={styles.dockRows}
                nestedScrollEnabled
              >
                {shown.map((row) => {
                  const rowKey = str(row, 'key');
                  const dismissCmd = obj(row.dismiss);
                  const rowSnooze = arr(row.snooze)
                    .map(obj)
                    .filter((choice): choice is JsonRecord => choice !== null);
                  const rowContent =
                    str(row, 'kind') === 'pageBundle' ? (
                      <DockPageBundleRow row={row} chat={chat} />
                    ) : (
                      <DockRow row={row} chat={chat} scope={scope} onShow={() => setSheetKey(rowKey)} />
                    );
                  const rowDismissLabel = str(row, 'dismissLabel');
                  const isArchiveDismiss =
                    rowDismissLabel === 'Archive' ||
                    rowDismissLabel === 'Archive all' ||
                    rowDismissLabel === 'Done' ||
                    rowDismissLabel === 'Mark as read' ||
                    rowDismissLabel === 'Mark all done' ||
                    rowDismissLabel === 'Read all';
                  return (
                    <View key={rowKey}>
                      <QuestionFlashFrame target={rowKey} light={P.light}>
                        <SwipeableInboxRow
                          canDismiss={dismissCmd !== null}
                          dismissLabel={isArchiveDismiss ? 'Archive' : 'Dismiss'}
                          canSnooze={rowSnooze.length > 0}
                          onDismiss={() => {
                            if (dismissCmd !== null) dispatch(dismissCmd as never);
                          }}
                          onSnooze={() => setSwipeSnoozeRow(row)}
                        >
                          {rowContent}
                        </SwipeableInboxRow>
                      </QuestionFlashFrame>
                    </View>
                  );
                })}
                {hidden > 0 || markAllSeen !== null ? (
                  <View style={styles.dockFoot}>
                    {hidden > 0 ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ expanded: all }}
                        hitSlop={8}
                        onPress={() => setAll((was) => !was)}
                      >
                        <Text style={styles.dockMore}>
                          {all ? 'Show fewer' : dockMoreLabel(rows.slice(limit))}
                        </Text>
                      </Pressable>
                    ) : markAllSummary.length > 0 ? (
                      <Text style={styles.dockMarkSummary} numberOfLines={1}>
                        {markAllSummary}
                      </Text>
                    ) : null}
                    {markAllSeen !== null ? (() => {
                      const rawLabel =
                        str(markAllSeen, 'label')
                          .replace(/^Mark all (?:read|done)\b/, 'Archive all')
                          .replace(/\s*\(\d+\)$/, '') || 'Archive all';
                      const count = typeof markAllSeen.count === 'number' && markAllSeen.count > 0 ? markAllSeen.count : null;
                      return (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={count !== null ? `${rawLabel}, ${count}` : rawLabel}
                          hitSlop={8}
                          style={({ pressed }) => [
                            styles.dockMarkSeen,
                            { flexDirection: 'row', alignItems: 'center', gap: 6 },
                            pressed && { backgroundColor: P.ink(0.09) },
                          ]}
                          onPress={() => dispatch(markAllSeen.command as never)}
                        >
                          <Text style={styles.dockMarkSeenText}>{rawLabel}</Text>
                          {count !== null ? <CountBadge count={count} light={P.light} /> : null}
                        </Pressable>
                      );
                    })() : null}
                  </View>
                ) : null}
                {undoMarkAllRead !== null ? (
                  <View style={styles.dockUndoBar}>
                    <Glyph name="archive" size={13} color={P.muted} />
                    <Text style={styles.dockUndoText} numberOfLines={1}>
                      {str(undoMarkAllRead, 'label').replace(/^Marked (\d+) (?:read|done)$/, 'Archived $1') || 'Archived'}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      hitSlop={8}
                      style={({ pressed }) => [
                        styles.dockUndoButton,
                        pressed && { backgroundColor: P.ink(0.12) },
                      ]}
                      onPress={() => dispatch(undoMarkAllRead.command as never)}
                    >
                      <Text style={styles.dockUndoButtonText}>Undo</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Dismiss"
                      hitSlop={8}
                      onPress={() => dispatch(undoMarkAllRead.dismiss as never)}
                      style={styles.dockUndoClose}
                    >
                      <Glyph name="x" size={12} color={P.muted} />
                    </Pressable>
                  </View>
                ) : null}
                {snoozed.length > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Snoozed, ${snoozed.length}`}
                    accessibilityState={{ expanded: snoozedOpen }}
                    style={styles.dockSnoozed}
                    onPress={() => setSnoozedOpen((was) => !was)}
                  >
                    <Glyph name="moon" size={13} color={P.cardMuted} />
                    <View style={styles.dockSnoozedMain}>
                      <Text style={styles.dockSnoozedLabel} numberOfLines={1}>
                        Snoozed
                      </Text>
                      <CountBadge count={snoozed.length} light={P.light} />
                    </View>
                    <View style={snoozedOpen ? styles.dockSnoozedChevronOpen : null}>
                      <Glyph name="chevron-down" size={12} color={P.cardMuted} />
                    </View>
                  </Pressable>
                ) : null}
                {snoozedOpen
                  ? snoozed.map((row) => (
                      <View key={str(row, 'key')} style={styles.dockSnoozedRow}>
                        <DockRow row={row} chat={chat} scope={scope} onShow={() => setSheetKey(str(row, 'key'))} />
                      </View>
                    ))
                  : null}
                {recent.length > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Recent, ${recent.length}`}
                    accessibilityState={{ expanded: recentOpen }}
                    style={styles.dockSnoozed}
                    onPress={() => setRecentOpen((was) => !was)}
                  >
                    <StatusMarker status="finished" size={13} />
                    <View style={styles.dockSnoozedMain}>
                      <Text style={styles.dockSnoozedLabel} numberOfLines={1}>
                        Recent
                      </Text>
                      <CountBadge count={recent.length} light={P.light} />
                    </View>
                    {recentOpen && recentArchiveAllCmd !== null ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Archive all, ${recent.length}`}
                        hitSlop={6}
                        onPress={(event) => {
                          event.stopPropagation();
                          dispatch(recentArchiveAllCmd as never);
                        }}
                        style={({ pressed }) => [styles.bundleButton, pressed && { backgroundColor: P.ink(0.09) }]}
                      >
                        <Text style={styles.bundleButtonText}>Archive all</Text>
                      </Pressable>
                    ) : null}
                    <View style={recentOpen ? styles.dockSnoozedChevronOpen : null}>
                      <Glyph name="chevron-down" size={12} color={P.cardMuted} />
                    </View>
                  </Pressable>
                ) : null}
                {recentOpen
                  ? recent.map((row, idx) => {
                      const rowKey = str(row, 'key');
                      if (str(row, 'kind') === 'finished') {
                        const dismissCmd = obj(row.dismiss);
                        return (
                          <View key={rowKey} style={styles.dockSnoozedRow}>
                            <SwipeableInboxRow
                              canDismiss={dismissCmd !== null}
                              dismissLabel="Archive"
                              canSnooze={false}
                              onDismiss={() => {
                                if (dismissCmd !== null) dispatch(dismissCmd as never);
                              }}
                              onSnooze={() => undefined}
                            >
                              <DockRow row={row} chat={chat} scope={scope} onShow={() => setSheetKey(rowKey)} />
                            </SwipeableInboxRow>
                          </View>
                        );
                      }
                      const showInChat = obj(row.showInChat);
                      const outcome = str(row, 'outcome').trim();
                      const showOutcome =
                        outcome.length > 0 &&
                        outcome.toLowerCase() !== 'answered' &&
                        outcome.toLowerCase() !== 'handled' &&
                        outcome.toLowerCase() !== 'done';
                      const age = str(row, 'age');
                      const rowStatus = str(row, 'status');
                      const iconName =
                        rowStatus === 'approved'
                          ? 'shield-check'
                          : rowStatus === 'denied' || rowStatus === 'dropped'
                            ? 'shield-x'
                            : 'message-circle-check';
                      const iconColor =
                        rowStatus === 'denied' || rowStatus === 'dropped' ? STATUS_COLOR.blocked : '#2fa865';
                      return (
                        <Pressable
                          key={`${rowKey}:${idx}`}
                          disabled={showInChat === null}
                          onPress={() => (showInChat !== null ? dispatch(showInChat as never) : undefined)}
                          style={({ pressed }) => [
                            styles.dockAnsweredRow,
                            pressed && showInChat !== null && { backgroundColor: P.ink(0.04) },
                          ]}
                        >
                          <Glyph name={iconName} size={13} color={iconColor} />
                          <Text style={styles.dockAnsweredTitle} numberOfLines={1}>
                            {str(row, 'title')}
                          </Text>
                          {showOutcome ? (
                            <Text style={styles.dockAnsweredOutcome} numberOfLines={1}>
                              {outcome}
                            </Text>
                          ) : null}
                          {age.length > 0 ? <Text style={styles.foldTime}>{age}</Text> : null}
                        </Pressable>
                      );
                    })
                  : null}
              </ScrollView>
            )}
          </View>
        </View>
        <Sheet visible={sheetRow !== null} onClose={() => setSheetKey(null)} maxHeight="85%">
          {sheetRow !== null ? (
            <ScrollView style={styles.askSheet} contentContainerStyle={styles.askSheetContent}>
              <DockRow row={sheetRow} chat={chat} scope={scope} onClose={() => setSheetKey(null)} />
            </ScrollView>
          ) : null}
        </Sheet>
        <Sheet
          visible={swipeSnoozeRow !== null && swipeSnoozeChoices.length > 0}
          onClose={() => setSwipeSnoozeRow(null)}
          title={swipeSnoozeRow ? `Snooze "${str(swipeSnoozeRow, 'title')}"` : 'Snooze'}
        >
          <View style={styles.snoozeSheetList}>
            {swipeSnoozeChoices.map((choice, index) => (
              <Pressable
                key={`swipe-snooze:${index}`}
                accessibilityRole="button"
                onPress={() => {
                  const cmd = obj(choice.command);
                  setSwipeSnoozeRow(null);
                  if (cmd !== null) dispatch(cmd as never);
                }}
                style={({ pressed }) => [
                  styles.snoozeSheetRow,
                  pressed && { backgroundColor: P.ink(0.06) },
                ]}
              >
                <Glyph name="moon" size={15} color={P.cardMuted} />
                <Text style={styles.snoozeSheetLabel}>{str(choice, 'label')}</Text>
              </Pressable>
            ))}
          </View>
        </Sheet>
      </TranscriptEnvProvider>
    </TranscriptFlagsProvider>
  );
}

/** The header's counts and their marks, with their words (desktop `work_dock_header`). */
const HEADER_GROUPS: { id: string; status: string; one: string; many: string }[] = [
  { id: 'needs', status: 'needs', one: ASKS_GROUP_SINGULAR, many: ASKS_GROUP_PLURAL },
  { id: 'blocked', status: 'blocked', one: 'blocked', many: 'blocked' },
  { id: 'moving', status: 'moving', one: 'in progress', many: 'in progress' },
];

/** The dock's rows (gx-chat-core `workDock.rows`). */
function dockRows(document: ChatDocument | null): JsonRecord[] {
  return arr(obj(document?.workDock)?.rows)
    .map(obj)
    .filter((row): row is JsonRecord => row !== null);
}

/** Combined Recent drawer rows (gx-chat-core `dock_with`'s `recent`, with fallback to `answered` + `done`). */
function dockRecent(document: ChatDocument | null): JsonRecord[] {
  const dock = obj(document?.workDock);
  if (Array.isArray(dock?.recent)) {
    return dock.recent.map(obj).filter((row): row is JsonRecord => row !== null);
  }
  return [...dockAnswered(document), ...dockDone(document)];
}

/** The dock's finished items (legacy `done` fallback for older chat cores). */
function dockDone(document: ChatDocument | null): JsonRecord[] {
  return arr(obj(document?.workDock)?.done)
    .map(obj)
    .filter((row): row is JsonRecord => row !== null);
}

/** The dock's snoozed asks, forms, pages and to-dos (gx-chat-core `dock_with`'s `snoozed`). */
function dockSnoozed(document: ChatDocument | null): JsonRecord[] {
  return arr(obj(document?.workDock)?.snoozed)
    .map(obj)
    .filter((row): row is JsonRecord => row !== null);
}

/** Recently answered items (legacy `answered` fallback for older chat cores). */
function dockAnswered(document: ChatDocument | null): JsonRecord[] {
  return arr(obj(document?.workDock)?.answered)
    .map(obj)
    .filter((row): row is JsonRecord => row !== null);
}

/**
 * The bar's counts: the Work panel's own numbers (`pillCounts`) when the chat has one, else the
 * rows' own (questions need him, a stuck line of work is blocked); only those above zero.
 */
function dockCounts(
  rows: JsonRecord[],
  board: JsonRecord | null,
): { group: (typeof HEADER_GROUPS)[number]; count: number }[] {
  return HEADER_GROUPS.map((group) => {
    if (board !== null) {
      const pair = arr(board.pillCounts).find((entry) => Array.isArray(entry) && entry[0] === group.id);
      return { group, count: Array.isArray(pair) && typeof pair[1] === 'number' ? pair[1] : 0 };
    }
    const count =
      group.id === 'needs'
        ? rows.filter((row) => isTrue(row, 'needs') && !isTrue(row, 'opened')).length
        : group.id === 'blocked'
          ? rows.filter((row) => str(row, 'status') === 'blocked').length
          : 0;
    return { group, count };
  }).filter((entry) => entry.count > 0);
}

/**
 * Whether the dock draws its bar: something is docked, or the chat has a Work panel and there is
 * something to count or a working status to carry (`status`, `dockStatusCard`). While it draws, the
 * bar carries the status and the working card does not show.
 */
export function workDockShown(document: ChatDocument, status: WorkingCardValue | null): boolean {
  const dock = obj(document.workDock);
  if (
    dockRows(document).length > 0 ||
    dockSnoozed(document).length > 0 ||
    dockRecent(document).length > 0 ||
    obj(dock?.undoMarkAllRead) !== null
  ) {
    return true;
  }
  const board = obj(document.coordinatorBoard);
  if (board === null) return false;
  return status !== null || dockCounts([], board).length > 0;
}

/**
 * Pure JS swipeable wrapper for phone Inbox rows (Q4688 A):
 * - Swipe left reveals green Read/Dismiss strip and triggers `onDismiss`.
 * - Swipe right reveals blue Snooze strip and triggers `onSnooze`.
 */
function SwipeableInboxRow({
  canDismiss,
  dismissLabel,
  canSnooze,
  onDismiss,
  onSnooze,
  children,
}: {
  canDismiss: boolean;
  dismissLabel: string;
  canSnooze: boolean;
  onDismiss: () => void;
  onSnooze: () => void;
  children: ReactNode;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const tx = useRef(new Animated.Value(0)).current;
  const threshold = 68;
  const maxDrag = 104;
  const callbacksRef = useRef({ canDismiss, canSnooze, onDismiss, onSnooze });
  callbacksRef.current = { canDismiss, canSnooze, onDismiss, onSnooze };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, gesture) => {
          const { canDismiss: d, canSnooze: s } = callbacksRef.current;
          if (!d && !s) return false;
          if (Math.abs(gesture.dx) < 12 || Math.abs(gesture.dx) < Math.abs(gesture.dy) * 1.4) return false;
          if (gesture.dx < 0 && !d) return false;
          if (gesture.dx > 0 && !s) return false;
          return true;
        },
        onPanResponderMove: (_evt, gesture) => {
          const { canDismiss: d, canSnooze: s } = callbacksRef.current;
          const minX = d ? -maxDrag : 0;
          const maxX = s ? maxDrag : 0;
          const clamped = Math.max(minX, Math.min(maxX, gesture.dx));
          tx.setValue(clamped);
        },
        onPanResponderRelease: (_evt, gesture) => {
          const { canDismiss: d, canSnooze: s, onDismiss: dismiss, onSnooze: snooze } = callbacksRef.current;
          if (gesture.dx <= -threshold && d) {
            Animated.spring(tx, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
            dismiss();
            return;
          }
          if (gesture.dx >= threshold && s) {
            Animated.spring(tx, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
            snooze();
            return;
          }
          Animated.spring(tx, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(tx, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
        },
      }),
    [tx],
  );

  if (!canDismiss && !canSnooze) return <>{children}</>;
  const snoozeBg = P.light ? '#dbeafe' : '#273c56';
  const snoozeFg = P.light ? '#1d4ed8' : '#93c5fd';
  const dismissBg = P.light ? '#dcfce7' : '#214e36';
  const dismissFg = P.light ? '#15803d' : '#86efac';

  return (
    <View style={styles.swipeContainer}>
      <View style={styles.swipeBackdrop} pointerEvents="none">
        {canSnooze ? (
          <View style={[styles.swipeActionLeft, { backgroundColor: snoozeBg }]}>
            <Glyph name="moon" size={14} color={snoozeFg} />
            <Text style={[styles.swipeActionText, { color: snoozeFg }]}>Snooze</Text>
          </View>
        ) : (
          <View style={styles.swipeSpacer} />
        )}
        {canDismiss ? (
          <View style={[styles.swipeActionRight, { backgroundColor: dismissBg }]}>
            <Text style={[styles.swipeActionText, { color: dismissFg }]}>{dismissLabel}</Text>
            <Glyph
              name={dismissLabel === 'Archive' || dismissLabel === 'Done' ? 'check' : 'x'}
              size={14}
              color={dismissFg}
            />
          </View>
        ) : (
          <View style={styles.swipeSpacer} />
        )}
      </View>
      <Animated.View
        {...panResponder.panHandlers}
        style={[styles.swipeForeground, { transform: [{ translateX: tx }] }]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

/** Bundled same-turn page burst row on phone (Q4683 A). */
function DockPageBundleRow({ row, chat }: { row: JsonRecord; chat: RustChat }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const body = useBodyColor();
  const [open, setOpen] = useState(false);
  const unread = isTrue(row, 'unread');
  const dismiss = obj(row.dismiss);
  const pages = arr(row.bundlePages)
    .map(obj)
    .filter((p): p is JsonRecord => p !== null);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((was) => !was)}
        style={({ pressed }) => [styles.dockPress, pressed && { backgroundColor: P.ink(0.04) }]}
      >
        <View style={styles.dockRow}>
          <View style={styles.dockIcon}>
            <Glyph name="stack" size={14} color={STATUS_COLOR.needs} />
          </View>
          <View style={styles.dockMain}>
            <Text
              numberOfLines={1}
              style={[styles.dockTitle, { color: unread ? P.foreground : P.cardMuted }]}
            >
              {str(row, 'title')}
            </Text>
          </View>
          <View style={styles.bundleActions}>
            <Pressable
              accessibilityRole="button"
              hitSlop={6}
              onPress={() => setOpen((was) => !was)}
              style={({ pressed }) => [styles.bundleButton, pressed && { backgroundColor: P.ink(0.09) }]}
            >
              <Text style={styles.bundleButtonText}>{open ? 'Collapse' : 'Expand'}</Text>
            </Pressable>
            {dismiss !== null ? (
              <Pressable
                accessibilityRole="button"
                hitSlop={6}
                onPress={() => chat.dispatch(dismiss as never)}
                style={({ pressed }) => [styles.bundleButton, pressed && { backgroundColor: P.ink(0.09) }]}
              >
                <Text style={styles.bundleButtonText}>Archive all</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Pressable>
      {open ? (
        <View style={styles.subRowsWrap}>
          {pages.map((page, idx) => {
            const pageOpen = obj(page.open);
            const isRead = isTrue(page, 'opened');
            return (
              <Pressable
                key={`${str(page, 'key')}:${idx}`}
                accessibilityRole="button"
                onPress={() => (pageOpen !== null ? chat.dispatch(pageOpen as never) : undefined)}
                style={({ pressed }) => [
                  styles.subRow,
                  pressed && { backgroundColor: P.ink(0.04) },
                ]}
              >
                <Glyph
                  name="file"
                  size={12}
                  color={STATUS_COLOR.needs}
                />
                <Text style={[styles.subRowText, { color: isRead ? P.cardMuted : P.foreground }]} numberOfLines={1}>
                  {str(page, 'title')}
                </Text>
                {str(page, 'age').length > 0 ? <Text style={styles.foldTime}>{str(page, 'age')}</Text> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/**
 * The Inbox header (Q4680 B + E, Q4688 A): `[inbox icon] Inbox [tappable ghost count chips]`
 * plus Work button and chevron.
 */
function DockHeader({
  rows,
  board,
  status,
  collapsible,
  open,
  onOpenGroup,
  onOpenWork,
  onToggle,
}: {
  rows: JsonRecord[];
  board: JsonRecord | null;
  status: WorkingCardValue | null;
  collapsible: boolean;
  open: boolean;
  onOpenGroup: (group: string) => void;
  onOpenWork: () => void;
  onToggle: () => void;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const { width } = useWindowDimensions();
  const awayFromBottom = useTranscriptBottomStore((store) => store.awayFromBottom);
  const jumpToBottom = useTranscriptBottomStore((store) => store.jumpToBottom);
  const counts = dockCounts(rows, board);
  const statusWidth =
    status === null ? 0 : 24 + (status.label ?? '').length * 7.4 + 12;
  const inboxLabelWidth = 18 + INBOX_NAME.length * 7.6 + 10;
  const room = width - 24 - 12 - 5 - (board !== null ? 32 : 0) - (collapsible ? 30 : 0) - 16 - statusWidth;
  const showInboxLabel = status === null || room >= inboxLabelWidth + 80;
  const named =
    (showInboxLabel ? inboxLabelWidth : 22) +
      counts.reduce(
        (sum, entry) =>
          sum +
          28 +
          String(entry.count).length * 8 +
          4 +
          (entry.count === 1 ? entry.group.one : entry.group.many).length * 7.4,
        0,
      ) +
      6 * Math.max(0, counts.length - 1) <=
    room;
  const jump = !collapsible && awayFromBottom && jumpToBottom !== null ? () => jumpToBottom() : undefined;
  return (
    <Pressable
      {...(collapsible
        ? {
            accessibilityRole: 'button' as const,
            accessibilityLabel: open ? 'Collapse Inbox' : 'Expand Inbox',
            accessibilityState: { expanded: open },
          }
        : { accessibilityRole: 'summary' as const })}
      onPress={collapsible ? onToggle : jump}
      style={({ pressed }) => [
        styles.dockHead,
        open ? styles.dockHeadOpen : styles.dockHeadShut,
        pressed && (collapsible || jump !== undefined) && { backgroundColor: P.ink(0.055) },
      ]}
    >
      {status === null ? null : (
        <View accessibilityLabel={status.ariaLabel} style={styles.dockStatus}>
          <WorkingLine card={status} />
        </View>
      )}
      {status === null ? null : <View style={styles.dockSpacer} />}
      <View style={status === null ? styles.dockCounts : styles.dockCountsBeside}>
        <View style={[styles.inboxTitleSlot, counts.length > 0 && styles.inboxTitleGap]}>
          <Glyph name="inbox" size={14} color={P.foreground} />
          {showInboxLabel ? <Text style={styles.inboxTitleText}>{INBOX_NAME}</Text> : null}
        </View>
        {counts.map(({ group, count }) => {
          const groupTitle = group.id === 'needs' ? ASKS_GROUP_NAME : group.id === 'blocked' ? 'Blocked' : 'In progress';
          const chipLabel = `${count} ${count === 1 ? group.one : group.many}`;
          return board !== null ? (
            <Pressable
              key={group.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${groupTitle} in Work: ${chipLabel}`}
              hitSlop={{ top: 6, bottom: 6, left: 3, right: 3 }}
              onPress={(event) => {
                event.stopPropagation?.();
                onOpenGroup(group.id);
              }}
              style={({ pressed }) => [
                styles.dockCountChip,
                pressed && {
                  backgroundColor: P.ink(P.light ? 0.08 : 0.12),
                  borderColor: P.ink(0.10),
                },
              ]}
            >
              {({ pressed }) => (
                <>
                  <StatusMarker status={group.status} size={13} />
                  <View style={styles.dockCountLabel}>
                    <Text style={styles.dockCountNumber}>{count}</Text>
                    {named ? (
                      <Text style={[styles.dockCountName, pressed && { color: P.foreground }]}>
                        {count === 1 ? group.one : group.many}
                      </Text>
                    ) : null}
                  </View>
                </>
              )}
            </Pressable>
          ) : (
            <View key={group.id} accessibilityLabel={chipLabel} style={styles.dockCount}>
              <StatusMarker status={group.status} size={13} />
              <Text style={styles.dockCountNumber}>{count}</Text>
              {named ? <Text style={styles.dockCountName}>{count === 1 ? group.one : group.many}</Text> : null}
            </View>
          );
        })}
      </View>
      {board !== null ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Work items"
          hitSlop={{ top: 10, bottom: 10, left: 6, right: 4 }}
          onPress={onOpenWork}
          style={({ pressed }) => [styles.dockHeadButton, pressed && { backgroundColor: P.neutralFillPressed }]}
        >
          <Glyph name="layout-board-split" size={14} color={P.cardMuted} />
        </Pressable>
      ) : null}
      {collapsible ? (
        <View style={styles.dockHeadButton}>
          <Glyph name={open ? 'chevron-down' : 'chevron-up'} size={14} color={P.muted} />
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * One dock row (desktop `dock_row`): its mark, its question (two lines at most), its age and the ⋯
 * that opens its menu, then its answers and Reply on one line; a tap shows it in its sheet
 * (`onShow`). In the sheet (`onClose`, desktop `dock_ask_modal`): the title whole, the work it
 * belongs to, its whole description, where it stands, its links, then its answers with Reply after
 * a divider; an answer, Open, Reply or a menu pick closes the sheet as it goes. A page's row never
 * opens: a tap opens the page.
 */
function DockRow({
  row,
  chat,
  scope,
  onShow,
  onClose,
}: {
  row: JsonRecord;
  chat: RustChat;
  scope: ReplyDraftScope | null;
  onShow?: () => void;
  onClose?: () => void;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const body = useBodyColor();
  const machineId = chat.machine?.id ?? '';
  const computerName = useMachinesStore((state) => {
    if (machineId.length === 0) return '';
    const entry = state.machines.find((machine) => machine.id === machineId);
    return entry?.name.trim() ?? '';
  });
  const [menu, setMenu] = useState(false);
  const [dupesOpen, setDupesOpen] = useState(false);
  const kind = str(row, 'kind');
  const unread = onClose === undefined && isTrue(row, 'unread');
  const duplicates = onClose === undefined
    ? arr(row.duplicates)
        .map(obj)
        .filter((d): d is JsonRecord => d !== null)
    : [];
  const sourcesCount = typeof row.sourcesCount === 'number' ? row.sourcesCount : duplicates.length + 1;
  const isThreadWait = kind === 'threadWait';
  const waitKind = str(row, 'waitKind');
  const page = isTrue(row, 'page') && obj(row.open) !== null;
  // Its answered/total count ("0/3") follows the page's draft while the row is drawn.
  usePageCountRefresh(chat.dispatch, page ? [str(row, 'pageId')] : []);
  // A form's or thread-wait row opens its target at once, as a page's opens the page (gx-chat-core
  // `details_fields`, Q4477): no sheet with only another Open in it.
  const direct = page || ((kind === 'form' || kind === 'thread' || isThreadWait) && obj(row.open) !== null);
  const opened = onClose !== undefined && !direct;
  // A question with details shows Details on its closed row, its answers only in its sheet under
  // the details. A computer too old to send `details` keeps today's row.
  const details = !opened && isTrue(row, 'details') && onShow !== undefined ? onShow : null;
  // An approval row's answers take no tap for a moment after it appears, so a tap meant for the row
  // that was there before lands on nothing (desktop `approval_armed`).
  const shownAt = useRef<{ key: string; at: number }>({ key: '', at: 0 });
  if (shownAt.current.key !== str(row, 'key')) shownAt.current = { key: str(row, 'key'), at: Date.now() };
  // A Collab message's row too: a guest chooses when it arrives (security review N5).
  const armed = () =>
    !['approval', 'collab'].includes(kind) || Date.now() - shownAt.current.at >= APPROVAL_ARM_MS;
  // In the sheet, whatever a row's buttons send closes it first.
  const dispatch: RustChat['dispatch'] = ((action: never) => {
    if (!armed()) return;
    if (onClose !== undefined) onClose();
    chat.dispatch(action);
  }) as RustChat['dispatch'];
  const busy = isTrue(row, 'busy');
  // An answered approval says so quietly for its few seconds, then leaves (gx-chat-core
  // extras/dock_approvals.rs); there is nothing to open.
  const settled = isTrue(row, 'settled');
  const inDock = onClose === undefined;
  const titleColor = settled ? P.cardMuted : inDock ? (unread ? P.foreground : P.cardMuted) : body;
  // Why an approval's answer did not land.
  const error = str(row, 'error');
  // Why the agent flagged an approval ("Dangerous rm operation …"), on the row itself.
  const note = obj(row.note);
  const noteText = note === null ? '' : str(note, 'text');
  const rawButtons = arr(row.buttons)
    .map(obj)
    .filter((button): button is JsonRecord => button !== null);
  // A thread-wait row shows its single direct action button (Open approval / Open thread), never a
  // bare Done button (gx-chat-core `thread_wait_dock_row`, Q4477).
  const answers = isThreadWait
    ? rawButtons.filter((button) => str(button, 'label') !== 'Done').slice(0, 1)
    : rawButtons;
  const reply = obj(row.reply);
  const needs = isTrue(row, 'needs');
  const menuRows = workMenuRows(
    row,
    str(row, 'mention'),
    chat.state?.composer.text ?? '',
    rowMarkdown(row, chat.state?.document?.questionForms),
  );
  const chips = arr(row.chips)
    .map(obj)
    .filter((chip): chip is JsonRecord => chip !== null);
  const description = str(row, 'body');
  // The description (or where a line of work stands) sits `OPENED_ROW_GAP` under the title and
  // its work item line: the column's own 4 when that line is drawn, the press's 2 when not.
  // Opened, the item pills lead the answers (gx-chat-core `item_pills`) and carry the item and
  // what waits on it; only its other parts (the steps) stay under the title.
  const pills = opened
    ? arr(row.itemPills)
        .map(obj)
        .filter((pill): pill is JsonRecord => pill !== null)
    : [];
  // Opened, a line of work's threads are their agents' logos at the left of the answers' line (the
  // desktop's `work_thread_logo`), not a line between the title and the text; its other parts
  // (a GitHub link, the steps) stay under the title.
  //
  // CDXC:Coordinators 2026-11-12 DECISION:
  // User, of the thread line between an opened row's title and text ("looks out of place in this
  // case. and the spacing above it is smaller than below it"): the logo alone, its name shown on
  // a press and hold (the phone has no hover), a tap opening the thread. The title, the text and
  // the answers are then 6 apart (two lines of text) and 12 before the answers.
  const threadChips =
    opened && !Array.isArray(row.waitedBy) ? chips.filter((chip) => str(chip, 'kind') === 'thread') : [];
  const shownChips = threadChips.length > 0 ? chips.filter((chip) => str(chip, 'kind') !== 'thread') : chips;
  const headChips = pills.length > 0 ? shownChips.filter((chip) => str(chip, 'kind') !== 'item') : shownChips;
  const itemLine = pills.length === 0 && Array.isArray(row.waitedBy);
  const bodyLead = itemLine || headChips.length > 0 ? OPENED_ROW_GAP - 4 : 4;
  const logos =
    threadChips.length > 0
      ? threadChips.map((chip, index) => (
          <ThreadLogo key={`logo:${index}`} chip={chip} dispatch={dispatch} />
        ))
      : null;
  const logosWidth = threadChips.length * (THREAD_LOGO + 6);
  const count = str(row, 'count');
  const markRead = str(row, 'kind') === 'finished' ? obj(row.dismiss) : null;
  // Every other closed row with a Dismiss or Mark as read in its menu leads its buttons with Mark
  // as read, the same command (desktop `dock_mark_read_icon`), unless it asks a question.
  const readButton = !opened && !settled && markRead === null && !rowAsksQuestion(row) ? obj(row.dismiss) : null;
  // A question form that needs the reader is the visuals list's checklist in the need-you pink
  // (desktop `row_mark`; the user: "use this icon for this one when it's a question form (keep
  // pink color)"); a page its page, everything else its status's mark.
  const questionForm = !page && kind === 'form' && str(row, 'status') === 'needs';
  const markStatus = page && str(row, 'status') === 'needs' ? 'page' : questionForm ? 'form' : str(row, 'status');
  const threadWaitApproval =
    isThreadWait && (waitKind === 'approval' || (waitKind !== 'signIn' && waitKind !== 'usageLimit' && isTrue(row, 'needsApproval')));
  const threadWaitWarn = isThreadWait && (waitKind === 'signIn' || waitKind === 'usageLimit');
  const openLabel =
    str(row, 'openLabel') || (threadWaitApproval ? 'Open approval' : isThreadWait ? 'Open thread' : 'Open');
  const answerLine =
    answers.length > 0 || (needs && (reply !== null || obj(row.open) !== null)) ? (
      <View style={opened ? styles.dockAnswersOpen : styles.dockAnswers}>
        <WorkAnswerLine
          answers={answers}
          reply={reply}
          replied={str(row, 'replied')}
          open={answers.length === 0 ? obj(row.open) : null}
          busy={busy}
          divider={opened}
          room={-(DOCK_INSETS + DOCK_LEAD)}
          question={str(row, 'title')}
          scope={scope}
          dispatch={dispatch as never}
          before={onClose === undefined ? undefined : () => onClose()}
          pills={pills}
          logos={logos}
          logosWidth={logosWidth}
          openLabel={openLabel}
          isPage={page}
          details={details}
          iconOnly={!opened && !isThreadWait}
          context={obj(row.context)}
          markRead={readButton}
        />
      </View>
    ) : logos !== null ? (
      // No answers to stand beside: the logos alone, at the left of their line.
      <View style={styles.dockAnswersOpen}>
        <View style={styles.threadLogos}>{logos}</View>
      </View>
    ) : null;
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityHint={direct || opened ? undefined : 'Shows the whole ask'}
        disabled={opened || settled}
        onPress={direct ? () => dispatch(row.open as never) : onShow}
        onLongPress={menuRows.length > 0 ? () => setMenu(true) : undefined}
        style={({ pressed }) => [
          styles.dockPress,
          opened && styles.dockPressOpen,
          pressed && !opened && { backgroundColor: P.ink(0.04) },
        ]}
      >
        <View style={styles.dockRow}>
          <View style={styles.dockIcon}>
            {kind === 'approval' || threadWaitApproval ? (
              <Glyph name="shield-alert" size={14} color={SidebarPalette.ROW_APPROVAL} />
            ) : kind === 'approvalSettled' ? (
              str(row, 'status') === 'denied' || str(row, 'status') === 'dropped' ? (
                <Glyph name="shield-x" size={14} color={SidebarPalette.ROW_APPROVAL} />
              ) : (
                <Glyph name="shield-check" size={14} color={STATUS_COLOR.finished} />
              )
            ) : threadWaitWarn ? (
              <Glyph name="alert-triangle" size={14} color={STATUS_COLOR.moving} />
            ) : kind === 'thread' && str(row, 'agentIcon').length > 0 ? (
              <AgentMark icon={str(row, 'agentIcon')} size={13} />
            ) : markStatus === 'page' ? (
              <Glyph name="file" size={14} color={STATUS_COLOR.needs} />
            ) : markStatus === 'form' ? (
              <Glyph name="list-check" size={14} color={STATUS_COLOR.needs} />
            ) : str(row, 'status') === 'needs' && (isTrue(row, 'needsYou') || str(row, 'key').startsWith('needs-you:')) ? (
              <Glyph name="checkbox" size={14} color={STATUS_COLOR.needs} />
            ) : str(row, 'status') === 'needs' ? (
              <Glyph name="help-circle" size={14} color={STATUS_COLOR.needs} />
            ) : (
              <StatusMarker status={markStatus} size={13} />
            )}
          </View>
          <View style={styles.dockMain}>
            <View style={styles.dockTitleRow}>
              <View style={styles.dockTitleFlex}>
                {direct && count.length > 0 ? (
                  <Text
                    numberOfLines={1}
                    style={[styles.dockTitle, { color: titleColor }]}
                  >
                    {str(row, 'title')}
                  </Text>
                ) : opened ? (
                  <LinkWords text={str(row, 'title')} runs={row.titleRuns} color={body} style={styles.dockTitle} />
                ) : (
                  <Text
                    numberOfLines={2}
                    style={[styles.dockTitle, { color: titleColor }]}
                  >
                    {str(row, 'title')}
                  </Text>
                )}
              </View>
              {str(row, 'answeredBy').length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${str(row, 'answeredBy')}. Open Live page to view their answers.`}
                  hitSlop={6}
                  onPress={(event) => {
                    event.stopPropagation?.();
                    if (obj(row.open) !== null) dispatch(row.open as never);
                    else onShow?.();
                  }}
                  style={({ pressed }) => [
                    styles.sourcesChip,
                    {
                      backgroundColor: P.light
                        ? pressed
                          ? 'rgba(22, 128, 73, 0.22)'
                          : 'rgba(22, 128, 73, 0.12)'
                        : pressed
                          ? 'rgba(52, 211, 153, 0.26)'
                          : 'rgba(52, 211, 153, 0.16)',
                      borderColor: P.light ? 'rgba(22, 128, 73, 0.30)' : 'rgba(52, 211, 153, 0.34)',
                    },
                  ]}
                >
                  <Glyph name="user" size={11} color={P.light ? '#168049' : '#34d399'} />
                  <Text style={[styles.sourcesChipText, { color: P.light ? '#168049' : '#34d399' }]}>
                    {str(row, 'answeredBy')}
                  </Text>
                </Pressable>
              ) : null}
              {duplicates.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: dupesOpen }}
                  hitSlop={6}
                  onPress={(event) => {
                    event.stopPropagation?.();
                    setDupesOpen((was) => !was);
                  }}
                  style={({ pressed }) => [
                    styles.sourcesChip,
                    pressed && { backgroundColor: P.ink(0.11) },
                  ]}
                >
                  <Text style={styles.sourcesChipText}>{`${sourcesCount} sources`}</Text>
                  <View style={dupesOpen ? styles.dockSnoozedChevronOpen : null}>
                    <Glyph name="chevron-down" size={10} color={P.muted} />
                  </View>
                </Pressable>
              ) : null}
            </View>
            {/* CDXC:Coordinators 2026-11-25 DECISION:
                User, of Inbox rows above the composer drawing a second, dimmer preview line under
                the title: "sir showing 2 lines here is NOT A THING. please only show the title line
                for all these work items in inbox!!!!" Supersedes the 2026-11-20 and 2026-11-24
                Inbox preview line: Inbox rows show only their title line (full detail text stays
                reachable through Details / tapping the row). */}
            {noteText.length > 0 ? (
              <Text style={[styles.dockNote, str(note, 'tone') === 'warning' && { color: P.light ? '#b45309' : '#f5a524' }]}>
                {noteText}
              </Text>
            ) : null}
            {error.length > 0 ? <Text style={styles.dockError}>{error}</Text> : null}
          </View>
          {/* A page or form's answered/total ("0/1"), quiet, at the title line's right end before
              the age (desktop `dock_row_look`; CDXC:Coordinators 2026-11-20: the user wants it on
              the right side of the row, not after the title). */}
          {direct && count.length > 0 ? <Text style={styles.pageCount}>{count}</Text> : null}
          <View style={styles.ageSlot}>
            <Text style={styles.foldTime}>{str(row, 'age')}</Text>
            {/* What the newest turn finished asks nothing: Mark as read stands on the row itself,
                always shown since the phone has no hover (the desktop shows it over the age under
                the pointer). It is the row's own silent `dismissWorkDockCard`, as its menu's Mark
                as read: the row leaves the dock, the agent is sent nothing and the item stays Done.

                CDXC:Coordinators 2026-11-18 DECISION:
                User, of a Done row in the dock: "i need a button on the right there to mark this
                one as read pls ... should be an icon button on the right side shown only when
                hovered". */}
            {markRead !== null ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Archive"
                hitSlop={{ top: 11, bottom: 11, left: 6, right: 6 }}
                onPress={() => dispatch(markRead as never)}
                style={({ pressed }) => [styles.dismiss, pressed && { backgroundColor: P.neutralFillPressed }]}
              >
                <Glyph name="check" size={14} color={P.cardMuted} />
              </Pressable>
            ) : null}
            {menuRows.length > 0 ? <WorkMenuButton active={menu} onPress={() => setMenu(true)} /> : null}
          </View>
        </View>
      </Pressable>
      {/* Opened, only the title line shares its width with the age and the ⋯; the work item line,
          the description and the lines under them run to the card's right edge, from the title's
          left edge (user, 2026-11-12: "It should take up the full width of this card when I expand").
          They sit outside the row's press, so only the title line shuts it; a tap under it does
          nothing and a long press on the description offers Copy (`WorkDescription`). */}
      {opened ? (
        <TextArea style={[styles.dockDetailArea, answerLine !== null && styles.dockDetailAreaAnswers]}>
          <View style={styles.dockDetail}>
            {itemLine ? (
              <ItemLine row={row} chips={chips} dispatch={dispatch} />
            ) : headChips.length > 0 ? (
              <View style={styles.dockLinks}>
                {headChips.map((chip, index) => (
                  <ItemChip key={`link:${index}`} chip={chip} dispatch={dispatch} />
                ))}
              </View>
            ) : null}
            {description.length > 0 ? (
              <View style={{ marginTop: bodyLead }}>
                <WorkDescription text={description} color={P.cardMuted} title={str(row, 'title')} dispatch={dispatch} />
              </View>
            ) : null}
            {arr(row.detail)
              .map((line) => (typeof line === 'string' ? line : ''))
              .filter((line) => line.length > 0)
              .map((line, index) => (
                <Text
                  key={`line:${index}`}
                  style={[styles.movingRowLine, index === 0 && description.length === 0 && { marginTop: bodyLead }]}
                >
                  {line}
                </Text>
              ))}
            {!isTrue(row, 'commandLines') && str(row, 'command').trim().length > 0 ? (
              <View style={{ marginTop: description.length > 0 ? 8 : bodyLead }}>
                <CommandStrip row={row} dispatch={chat.dispatch} computerName={computerName} />
              </View>
            ) : null}
          </View>
        </TextArea>
      ) : null}
      {/* A Needs you to-do's command strip on closed rows (opened rows render it directly inside
          the sheet body above, so clicking "Run on <computer>" keeps the sheet open for live status). */}
      {isTrue(row, 'commandLines') ? (
        <ApprovalCommand row={row} />
      ) : !opened && str(row, 'command').trim().length > 0 ? (
        <CommandStrip row={row} dispatch={chat.dispatch} computerName={computerName} compact />
      ) : null}
      {answerLine}
      {dupesOpen && duplicates.length > 0 ? (
        <View style={styles.subRowsWrap}>
          {duplicates.map((dupe, idx) => {
            const dupeOpen = obj(dupe.open);
            const label = str(dupe, 'sourceLabel') || str(dupe, 'title');
            return (
              <Pressable
                key={`${str(dupe, 'key')}:${idx}`}
                accessibilityRole="button"
                onPress={() => {
                  if (dupeOpen !== null) dispatch(dupeOpen as never);
                  else if (onShow) onShow();
                }}
                style={({ pressed }) => [styles.subRow, pressed && { backgroundColor: P.ink(0.04) }]}
              >
                <Glyph
                  name={isTrue(dupe, 'page') ? 'file' : str(dupe, 'kind') === 'form' ? 'list-check' : 'help-circle'}
                  size={12}
                  color={STATUS_COLOR.needs}
                />
                <Text style={[styles.subRowText, { color: P.cardMuted }]} numberOfLines={1}>
                  {label}
                </Text>
                {str(dupe, 'age').length > 0 ? <Text style={styles.foldTime}>{str(dupe, 'age')}</Text> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {menuRows.length > 0 ? (
        <Sheet visible={menu} onClose={() => setMenu(false)} title={str(row, 'title')}>
          <WorkMenuList
            rows={menuRows}
            onCopied={() => setMenu(false)}
            onPick={(command) => {
              setMenu(false);
              dispatch(command as never);
            }}
          />
        </Sheet>
      ) : null}
    </View>
  );
}

function displayCommand(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('!')) {
    const rest = trimmed.slice(1).trimStart();
    if (rest.length > 0) return rest;
  }
  return trimmed;
}

/**
 * Layout A ("Command strip with button") on phone: renders a quiet rounded bar with the command,
 * Copy, and a neutral "Run on <computer>" button when allowlisted; tapping runs the command on the
 * connected computer and turns the bar into live status (running, waiting for Touch ID / sign-in
 * on that computer, Done automatically, or failed/stopped with Retry). Falls back to the quiet
 * Copy-only chip for non-allowlisted commands.
 */
function CommandStrip({
  row,
  dispatch,
  computerName,
  compact = false,
}: {
  row: JsonRecord;
  dispatch: Dispatch;
  computerName: string;
  compact?: boolean;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const body = useBodyColor();
  const [copied, setCopied] = useState(false);
  const [outputOpen, setOutputOpen] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const rawCommand = str(row, 'command').trim();
  if (rawCommand.length === 0) return null;

  const runAction = obj(row.runCommand);
  const stopAction = obj(row.stopCommand);
  const run = obj(row.commandRun);
  const runState = run === null ? '' : str(run, 'state');
  const canRun = runAction !== null;

  if (!canRun && runState.length === 0) {
    return <CommandChip command={rawCommand} inline={!compact} />;
  }

  const cleanCmd = displayCommand(rawCommand);
  const runCmd = run !== null && str(run, 'command').trim().length > 0 ? str(run, 'command').trim() : cleanCmd;
  const hostName = computerName.trim();
  const runLabel = hostName.length > 0 ? `Run on ${hostName}` : 'Run on computer';
  const targetHost = hostName.length > 0 ? hostName : 'your computer';

  const copyNow = () => {
    void Clipboard.setStringAsync(cleanCmd);
    setCopied(true);
  };

  if (runState.length === 0) {
    const strip = (
      <View style={[styles.cmdStrip, compact && styles.cmdStripCompact]}>
        <Text
          numberOfLines={compact ? 1 : undefined}
          style={[styles.cmdStripCode, { color: body }]}
        >
          {cleanCmd}
        </Text>
        <View style={styles.cmdStripActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Copy command ${cleanCmd}`}
            hitSlop={WORK_BUTTON_SLOP}
            onPress={copyNow}
            style={({ pressed }) => [styles.cmdQuietBtn, pressed && { backgroundColor: P.ink(0.08) }]}
          >
            <Glyph name={copied ? 'check' : 'copy'} size={12} color={P.cardMuted} />
            <Text style={styles.cmdQuietBtnText}>{copied ? 'Copied' : 'Copy'}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${runLabel}: ${cleanCmd}`}
            hitSlop={WORK_BUTTON_SLOP}
            onPress={() => dispatch(runAction as never)}
            style={({ pressed }) => [styles.cmdRunBtn, pressed && { backgroundColor: P.ink(0.14) }]}
          >
            <Glyph name="player-play" size={11} color={body} />
            <Text style={[styles.cmdRunBtnText, { color: body }]}>{runLabel}</Text>
          </Pressable>
        </View>
      </View>
    );
    return compact ? <View style={styles.commandStripLine}>{strip}</View> : strip;
  }

  const output = run === null ? '' : str(run, 'output');
  const hintTitle = run === null ? '' : str(run, 'hintTitle');
  const rawHint = run === null ? '' : str(run, 'hint');
  const errorText = run === null ? '' : str(run, 'error');
  const hasOutput = output.trim().length > 0;
  const adaptedHint =
    rawHint.length > 0 && hostName.length > 0 ? rawHint.replace(/on this computer/gi, `on ${hostName}`) : rawHint;

  let dotColor = P.cardMuted;
  let statusLabel = `Running ${runCmd}\u2026`;
  let hint = `Started on ${targetHost}. Output stays tucked away unless you open it.`;
  let showStop = false;
  let showRetry = false;

  if (runState === 'running') {
    showStop = true;
  } else if (runState === 'waiting') {
    dotColor = '#e5a00d';
    statusLabel = hintTitle.length > 0 ? hintTitle : 'Waiting for Touch ID or your password';
    hint =
      adaptedHint.length > 0
        ? adaptedHint
        : `Use Touch ID or enter your password on ${targetHost} to approve. Ghostex will finish automatically once you approve.`;
    showStop = true;
  } else if (runState === 'succeeded') {
    dotColor = '#30a46c';
    statusLabel = 'Done automatically';
    hint = 'The command succeeded and your agent was told Done.';
  } else if (runState === 'stopped') {
    dotColor = P.cardMuted;
    statusLabel = errorText.length > 0 ? errorText : 'Stopped before it finished.';
    hint = '';
    showRetry = canRun;
  } else {
    dotColor = '#e5484d';
    statusLabel = errorText.length > 0 ? errorText : 'Command did not finish cleanly.';
    hint = '';
    showRetry = canRun;
  }

  const showHint = hint.length > 0 && (!compact || runState === 'waiting');
  const outputLines = hasOutput ? output.trimEnd().split('\n').slice(-12).join('\n') : '';

  const liveStrip = (
    <View style={[styles.cmdLiveBox, compact && styles.cmdStripCompact]}>
      <View style={styles.cmdLiveRow}>
        <View style={styles.cmdLiveStatus}>
          {runState === 'succeeded' ? (
            <Glyph name="check" size={13} color={dotColor} />
          ) : (
            <View style={[styles.cmdStatusDot, { backgroundColor: dotColor }]} />
          )}
          <Text
            numberOfLines={compact ? 1 : undefined}
            style={[styles.cmdLiveTitle, { color: body }]}
          >
            {statusLabel}
          </Text>
        </View>
        <View style={styles.cmdStripActions}>
          {hasOutput ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={WORK_BUTTON_SLOP}
              onPress={() => setOutputOpen((was) => !was)}
              style={({ pressed }) => [styles.cmdQuietBtn, pressed && { backgroundColor: P.ink(0.08) }]}
            >
              <Text style={styles.cmdQuietBtnText}>
                {outputOpen ? 'Hide output' : runState === 'succeeded' ? 'View output' : 'Show output'}
              </Text>
            </Pressable>
          ) : null}
          {showStop && stopAction !== null ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={WORK_BUTTON_SLOP}
              onPress={() => dispatch(stopAction as never)}
              style={({ pressed }) => [styles.cmdQuietBtn, pressed && { backgroundColor: P.ink(0.08) }]}
            >
              <Text style={styles.cmdQuietBtnText}>Stop</Text>
            </Pressable>
          ) : null}
          {showRetry ? (
            <>
              <Pressable
                accessibilityRole="button"
                hitSlop={WORK_BUTTON_SLOP}
                onPress={copyNow}
                style={({ pressed }) => [styles.cmdQuietBtn, pressed && { backgroundColor: P.ink(0.08) }]}
              >
                <Glyph name={copied ? 'check' : 'copy'} size={12} color={P.cardMuted} />
                <Text style={styles.cmdQuietBtnText}>{copied ? 'Copied' : 'Copy'}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                hitSlop={WORK_BUTTON_SLOP}
                onPress={() => dispatch(runAction as never)}
                style={({ pressed }) => [styles.cmdRunBtn, pressed && { backgroundColor: P.ink(0.14) }]}
              >
                <Glyph name="refresh" size={11} color={body} />
                <Text style={[styles.cmdRunBtnText, { color: body }]}>Retry</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>
      {showHint ? <Text style={styles.cmdLiveHint}>{hint}</Text> : null}
      {outputOpen && hasOutput ? (
        <View style={styles.cmdOutputBox}>
          <Text style={styles.cmdOutputText}>{outputLines}</Text>
        </View>
      ) : null}
    </View>
  );

  return compact ? <View style={styles.commandStripLine}>{liveStrip}</View> : liveStrip;
}

/**
 * A Needs you to-do's command under its title (`ghostex needs-you add --command`; desktop
 * `dock_command_chip`): the chat's monospace in a quiet chip, a tap copying it and saying Copied
 * for a moment. The row's long-press menu has Copy command too (`workMenuRows`).
 */
function CommandChip({ command, inline = false }: { command: string; inline?: boolean }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const body = useBodyColor();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  const chip = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Copy command ${command}`}
      hitSlop={WORK_BUTTON_SLOP}
      onPress={() => {
        void Clipboard.setStringAsync(command);
        setCopied(true);
      }}
      style={({ pressed }) => [styles.commandChip, pressed && { backgroundColor: P.ink(0.1) }]}
    >
      <Glyph name={copied ? 'check' : 'copy'} size={13} color={P.cardMuted} />
      <Text numberOfLines={1} style={[styles.commandChipText, { color: body }]}>
        {copied ? 'Copied' : command}
      </Text>
    </Pressable>
  );
  return inline ? chip : <View style={styles.commandChipLine}>{chip}</View>;
}

/**
 * An approval's command (gx-chat-core `extras/dock_approvals.rs`): its first lines, wrapped, never
 * cut without saying so; "Show N more lines" opens the rest in place and "Show fewer" folds it, and
 * the lines gxserver itself left out say so. A tap copies the whole command. Desktop:
 * `dock_command_block` (CDXC:SessionChat 2026-11-20 WHY there: a one-line chip hid most of a
 * multi-line command).
 */
function ApprovalCommand({ row }: { row: JsonRecord }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const body = useBodyColor();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  const command = str(row, 'command');
  if (command.trim().length === 0) return null;
  const more = typeof row.commandMore === 'number' ? row.commandMore : 0;
  const shown = more === 0 || open ? command : str(row, 'commandPreview');
  const cut = str(row, 'commandCut');
  // A Collab message's words are drawn in the chat's own type and copied as a message.
  const plain = isTrue(row, 'commandPlain');
  // Cut whole lines say so with "…" (a line cut short already ends with one).
  const ellipsis = more > 0 && !open && !shown.trimEnd().endsWith('…');
  return (
    <View style={styles.approvalCommandLine}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${plain ? 'Copy message' : 'Copy command'} ${command}`}
        onPress={() => {
          void Clipboard.setStringAsync(command);
          setCopied(true);
        }}
        style={({ pressed }) => [styles.approvalCommand, pressed && { backgroundColor: P.ink(0.1) }]}
      >
        <Text style={[plain ? styles.approvalMessageText : styles.commandChipText, { color: body }]}>
          {shown}
          {ellipsis ? '\n…' : ''}
        </Text>
        {copied ? <Text style={styles.approvalCommandMeta}>Copied</Text> : null}
      </Pressable>
      {more > 0 ? (
        <Pressable accessibilityRole="button" hitSlop={WORK_BUTTON_SLOP} onPress={() => setOpen((was) => !was)}>
          <Text style={styles.approvalCommandMeta}>
            {open ? 'Show fewer' : more === 1 ? 'Show 1 more line' : `Show ${more} more lines`}
          </Text>
        </Pressable>
      ) : null}
      {cut.length > 0 ? <Text style={styles.approvalCommandMeta}>{cut}</Text> : null}
    </View>
  );
}

/** How long a new approval row's answers wait before they take a tap. */
const APPROVAL_ARM_MS = 400;

/** A thread's logo button: 28 points square, like the buttons beside it. */
const THREAD_LOGO = 28;

/**
 * An opened dock row's thread as its agent's logo alone (desktop `work_thread_logo`): a tap opens
 * the thread, and pressing and holding shows its name over the logo for as long as it is held,
 * as a long press shows a cut choice's whole label (`ChoiceRow`); the name is also its VoiceOver label.
 */
function ThreadLogo({ chip, dispatch }: { chip: JsonRecord; dispatch: Dispatch }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const [held, setHeld] = useState(false);
  const command = obj(chip.command);
  const state = str(chip, 'state');
  const label = state.length > 0 ? `${str(chip, 'label')}, ${state}` : str(chip, 'label');
  return (
    <View style={styles.threadLogoSlot}>
      <Pressable
        accessibilityRole={command !== null ? 'button' : 'image'}
        accessibilityLabel={label}
        disabled={command === null}
        hitSlop={WORK_BUTTON_SLOP}
        onPress={() => (command !== null ? dispatch(command as never) : undefined)}
        onLongPress={() => setHeld(true)}
        onPressOut={() => setHeld(false)}
        style={({ pressed }) => [styles.threadLogo, pressed && { backgroundColor: P.ink(0.08) }]}
      >
        {str(chip, 'agentIcon').length > 0 ? (
          <AgentMark icon={str(chip, 'agentIcon')} size={14} />
        ) : (
          <Glyph name={CHIP_ICON.thread ?? 'robot'} size={14} color={P.muted} />
        )}
      </Pressable>
      {held ? (
        <View pointerEvents="none" style={styles.threadTip}>
          <Text numberOfLines={1} style={styles.threadTipText}>
            {label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** A link of a line of work: its thread with its agent's logo, a PR or issue, a file, its steps. */
function ItemChip({ chip, dispatch }: { chip: JsonRecord; dispatch: Dispatch }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const command = obj(chip.command);
  const kind = str(chip, 'kind');
  const state = str(chip, 'state');
  const stateColor = toneColor(str(chip, 'tone')) ?? P.muted;
  const usageLimit = kind === 'usageLimit';
  const tip = str(chip, 'title');
  return (
    <Pressable
      accessibilityRole={command !== null ? 'button' : undefined}
      accessibilityLabel={tip || (state.length > 0 ? `${str(chip, 'label')}, ${state}` : str(chip, 'label'))}
      disabled={command === null}
      hitSlop={6}
      onPress={() => (command !== null ? dispatch(command as never) : undefined)}
      style={styles.chip}
    >
      {kind === 'thread' && str(chip, 'agentIcon').length > 0 ? (
        <AgentMark icon={str(chip, 'agentIcon')} size={14} />
      ) : (
        <Glyph name={CHIP_ICON[kind] ?? 'link'} size={14} color={usageLimit ? stateColor : P.muted} />
      )}
      <Text style={[styles.chipText, usageLimit && { color: stateColor }, command !== null ? styles.linkDots : null]}>
        {str(chip, 'label')}
      </Text>
      {state.length > 0 ? <Text style={[styles.chipText, { color: stateColor }]}>{state}</Text> : null}
    </Pressable>
  );
}

/**
 * An opened ask row's line (desktop `item_line`): its own work item's name, then "· <item> waits on
 * this" when one other item waits on its answer, or "· N others wait", which lists them; its other
 * parts (the steps) after. The desktop keeps it one line; on a phone it wraps between its parts.
 */
function ItemLine({ row, chips, dispatch }: { row: JsonRecord; chips: JsonRecord[]; dispatch: Dispatch }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const [listing, setListing] = useState(false);
  const waited = arr(row.waitedBy)
    .map(obj)
    .filter((other): other is JsonRecord => other !== null);
  // `dot`: the "·" that leads it, kept with it so a wrapped line never starts with a lone dot.
  const name = (
    label: string,
    command: JsonRecord | null,
    shrink: number,
    floor: number,
    keyName: string,
    lead = false,
  ) => (
    <Pressable
      key={keyName}
      accessibilityRole={command !== null ? 'button' : undefined}
      disabled={command === null}
      hitSlop={6}
      onPress={() => (command !== null ? dispatch(command as never) : undefined)}
      style={[styles.itemName, { flexShrink: shrink, minWidth: floor }]}
    >
      {lead ? <Text style={styles.itemDot}>{'\u00b7'}</Text> : null}
      <Glyph name="stack" size={14} color={P.muted} />
      <Text numberOfLines={1} style={[styles.itemNameText, command !== null ? styles.linkDots : null]}>
        {label}
      </Text>
    </Pressable>
  );
  const parts: ReactNode[] = [];
  for (const [index, chip] of chips.entries()) {
    if (str(chip, 'kind') === 'item') parts.push(name(str(chip, 'label'), obj(chip.command), 1, 60, `item:${index}`));
  }
  const first = waited[0];
  if (waited.length === 1 && first !== undefined) {
    parts.push(name(str(first, 'title'), obj(first.command), 8, 110, 'waits', parts.length > 0));
    parts.push(
      <Text key="waits-words" style={styles.itemWords}>
        waits on this
      </Text>,
    );
  } else if (waited.length > 1) {
    const lead = parts.length > 0;
    parts.push(
      <View key="others" style={styles.itemName}>
        {lead ? <Text style={styles.itemDot}>{'\u00b7'}</Text> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: listing }}
          hitSlop={6}
          onPress={() => setListing((was) => !was)}
        >
          <Text style={[styles.itemWords, styles.linkDots]}>{waited.length} others wait</Text>
        </Pressable>
      </View>,
    );
  }
  const rest = chips.filter((chip) => str(chip, 'kind') !== 'item');
  return (
    <View style={styles.itemLineColumn}>
      {parts.length > 0 ? <View style={styles.itemLine}>{parts}</View> : null}
      {listing
        ? waited.map((other, index) => name(str(other, 'title'), obj(other.command), 1, 0, `other:${index}`))
        : null}
      {rest.length > 0 ? (
        <View style={styles.dockLinks}>
          {rest.map((chip, index) => (
            <ItemChip key={`rest:${index}`} chip={chip} dispatch={dispatch} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Snooze (1 hour, 6 hours or 24 hours, opened from a quiet "Snooze") and Cancel, on a docked ask,
 * form or page (gx-chat-core `snooze_choices`; desktop `snooze_cancel_row`). Null when neither.
 */
function SnoozeCancelRow({ card, dispatch }: { card: JsonRecord; dispatch: Dispatch }) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const choices = arr(card.snooze)
    .map(obj)
    .filter((choice): choice is JsonRecord => choice !== null);
  const cancel = obj(card.cancel);
  if (choices.length === 0 && cancel === null) return null;
  return (
    <View style={styles.snoozeRow}>
      {choices.length > 0 ? (
        <Pressable accessibilityRole="button" hitSlop={6} onPress={() => setOpen((was) => !was)}>
          <Text style={styles.quiet}>{open ? 'Snooze for' : 'Snooze'}</Text>
        </Pressable>
      ) : null}
      {open
        ? choices.map((choice, index) => (
            <Pressable
              key={`snooze:${index}`}
              accessibilityRole="button"
              accessibilityLabel={`Snooze for ${str(choice, 'label')}`}
              onPress={() => {
                setOpen(false);
                dispatch(choice.command as never);
              }}
              style={styles.snoozeChoice}
            >
              <Text style={styles.chipText}>{str(choice, 'label')}</Text>
            </Pressable>
          ))
        : null}
      {cancel !== null ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel it for good and tell the agent"
          hitSlop={6}
          onPress={() => dispatch(cancel as never)}
        >
          <Text style={styles.quiet}>Cancel</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** An unanswered form or page in the dock: its title, how many questions are open, and Open. */
function DockQuestionsCard({ card, dispatch }: { card: JsonRecord; dispatch: Dispatch }) {
  const styles = useStyles();
  const body = useBodyColor();
  return (
    <View style={styles.card}>
      <View style={styles.questionsCard}>
        <Glyph name="help-circle" size={14} color={SidebarPalette.ROW_QUESTION} />
        <View style={styles.movingText}>
          <Text style={[styles.title, { color: body, minWidth: 0 }]}>{str(card, 'title')}</Text>
          <Text style={styles.chipText}>{str(card, 'line')}</Text>
        </View>
        <ToneButton kind="secondary" label="Open" onPress={() => dispatch(card.command as never)} />
      </View>
      <SnoozeCancelRow card={card} dispatch={dispatch} />
    </View>
  );
}

function WorkCard({ card, dispatch }: { card: JsonRecord; dispatch: Dispatch }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const status = str(card, 'statusLabel');
  const right = [status, str(card, 'age')].filter((part) => part.length > 0).join(' · ');
  const line = str(card, 'line');
  const chips = arr(card.chips)
    .map(obj)
    .filter((chip): chip is JsonRecord => chip !== null);
  const buttons = arr(card.buttons)
    .map(obj)
    .filter((button): button is JsonRecord => button !== null);
  const busy = isTrue(card, 'busy');
  const body = useBodyColor();
  return (
    <View accessible={false} accessibilityLabel={`${str(card, 'title')}, ${status}`} style={styles.card}>
      <View style={styles.top}>
        <View style={styles.marker}>
          <StatusMarker status={str(card, 'status')} size={13} />
        </View>
        <Text style={[styles.title, { color: body }]}>{str(card, 'title')}</Text>
        {right.length > 0 ? <Text style={styles.right}>{right}</Text> : null}
        {/* A finished card in the dock goes away with its check (gx-chat-core `dock`). It asks no
            question, so it reads Archive, as the dock's finished row does; it sends nothing. */}
        {obj(card.dismiss) !== null ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Archive"
            hitSlop={8}
            onPress={() => dispatch(card.dismiss as never)}
            style={styles.dismiss}
          >
            <Glyph name="check" size={12} color={P.muted} />
          </Pressable>
        ) : null}
      </View>
      {line.length > 0 ? <Text style={styles.line}>{line}</Text> : null}
      {chips.length > 0 || buttons.length > 0 ? (
        <View style={styles.meta}>
          {/* Each part a quiet link at the chat's size: the thread with its agent's logo, a GitHub PR
              or issue with its state in that state's colour, a file, the steps; parts wrap, never
              cut (Q2205 A, desktop `work_card_part`). */}
          {chips.map((chip, index) => {
            const command = obj(chip.command);
            const kind = str(chip, 'kind');
            const state = str(chip, 'state');
            const agent = str(chip, 'agentIcon');
            const stateColor = toneColor(str(chip, 'tone')) ?? P.muted;
            const usageLimit = kind === 'usageLimit';
            const tip = str(chip, 'title');
            return (
              <Pressable
                key={`chip:${index}`}
                accessibilityRole={command !== null ? 'button' : undefined}
                accessibilityLabel={tip || (state.length > 0 ? `${str(chip, 'label')}, ${state}` : str(chip, 'label'))}
                disabled={command === null}
                hitSlop={6}
                onPress={() => (command !== null ? dispatch(command as never) : undefined)}
                style={styles.chip}
              >
                {kind === 'thread' && agent.length > 0 ? (
                  <AgentMark icon={agent} size={14} />
                ) : (
                  <Glyph name={CHIP_ICON[kind] ?? 'clock'} size={14} color={usageLimit ? stateColor : P.muted} />
                )}
                {/* A part that opens something wears the faint dotted underline of a link in the chat
                    (`LinkWords.tsx`): the phone has no hover, so it shows at rest. */}
                <Text
                  style={[
                    styles.chipText,
                    usageLimit && { color: stateColor },
                    command !== null ? styles.linkDots : null,
                  ]}
                >
                  {str(chip, 'label')}
                </Text>
                {state.length > 0 ? <Text style={[styles.chipText, { color: stateColor }]}>{state}</Text> : null}
              </Pressable>
            );
          })}
          {buttons.length > 0 ? (
            <View style={styles.buttons}>
              {buttons.map((button, index) => (
                <ToneButton
                  key={`answer:${index}`}
                  kind="secondary"
                  label={str(button, 'label')}
                  // The recommended answer carries the question forms' star (`askCard.tsx` `RecommendedMark`).
                  trailing={
                    isTrue(button, 'recommended') ? (
                      <Glyph name="star" size={10} color={tint(askColor(P.light), 0.75)} />
                    ) : undefined
                  }
                  accessibilityLabel={
                    isTrue(button, 'recommended') ? `${str(button, 'label')}, Recommended` : undefined
                  }
                  icon={isTrue(button, 'picked') ? 'check' : undefined}
                  disabled={busy}
                  onPress={() => dispatch(button.command as never)}
                />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={styles.snoozeIndent}>
        <SnoozeCancelRow card={card} dispatch={dispatch} />
      </View>
    </View>
  );
}

/**
 * Everything still running, as one quiet row ("Moving · 7" and their names) that opens to a list; a
 * row of the list goes to that item's newest card (gx-chat-core `moving_row`, desktop
 * `work_moving_row`).
 */
/**
 * The In progress lists the reader opened, by card key, kept outside the component: the row moves
 * to the newest reply (a new parent), and an opened list stays open across live updates, the end
 * of a turn and a new reply until the reader folds it (the user's "this gets collapsed after the
 * turn ends and new text comes in, let's not do that").
 */
const openedLists = new Set<string>();

function WorkMovingRow({ card, dispatch }: { card: JsonRecord; dispatch: Dispatch }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const listKey = str(card, 'key');
  const [open, setOpenState] = useState(() => openedLists.has(listKey));
  const setOpen = (next: (was: boolean) => boolean) =>
    setOpenState((was) => {
      const value = next(was);
      if (value) openedLists.add(listKey);
      else openedLists.delete(listKey);
      return value;
    });
  const rows = arr(card.rows)
    .map(obj)
    .filter((row): row is JsonRecord => row !== null);
  const body = useBodyColor();
  return (
    <View style={styles.moving}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={str(card, 'title')}
        onPress={() => setOpen((was) => !was)}
        style={styles.movingHead}
      >
        <FoldChevron open={open} size={12} color={P.muted} />
        {/* The same 14 px as the list's who-has-it marks under it. */}
        <StatusMarker status="moving" size={14} />
        <Text style={[styles.movingTitle, { color: body }]}>{str(card, 'title')}</Text>
        {/* Closed, it says who has what ("1 with you · 1 on GitHub · 5 threads"), what is with the
            user in the question colour (gx-chat-core `who_has`, Q2207 B). */}
        <Text numberOfLines={1} style={styles.movingSummary}>
          {open
            ? ''
            : arr(card.summaryParts)
                .map(obj)
                .filter((part): part is JsonRecord => part !== null)
                .map((part, index) => (
                  <Text key={`part:${index}`}>
                    {index > 0 ? ' · ' : ''}
                    <Text style={{ color: toneColor(str(part, 'tone')) ?? P.cardMuted }}>{str(part, 'text')}</Text>
                  </Text>
                ))}
        </Text>
      </Pressable>
      {open ? (
        // Grouped by who has it under quiet labels, the full text wrapping, no hairlines (Q2207 B;
        // the phone always takes the rows, never the desktop's table).
        <View style={styles.movingList}>
          {rows.map((row, index) => {
            const command = obj(row.command);
            const line = str(row, 'line');
            const who = obj(row.who);
            const group = str(row, 'group');
            const first = index === 0 || str(rows[index - 1], 'group') !== group;
            const count = arr(card.groups)
              .map(obj)
              .find((entry) => entry !== null && str(entry, 'key') === group);
            return (
              <View key={`row:${index}`}>
                {first ? (
                  <Text style={styles.movingGroup}>
                    {str(row, 'groupLabel')} · {count ? String(count.count ?? '') : ''}
                  </Text>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${str(row, 'title')}, ${who ? str(who, 'label') : ''}`}
                  disabled={command === null}
                  onPress={() => (command !== null ? dispatch(command as never) : undefined)}
                  style={styles.movingRow}
                >
                  <View style={styles.movingText}>
                    <Text style={[styles.movingRowTitle, { color: body }, command !== null ? styles.linkDots : null]}>
                      {str(row, 'title')}
                    </Text>
                    {/* Who has it, as a quiet line under the title (the user's "just put it under Item's title"). */}
                    <View style={styles.whoLine}>
                      <WhoMark who={who} />
                      <Text numberOfLines={1} style={styles.whoText}>
                        {who ? str(who, 'label') : ''}
                      </Text>
                    </View>
                    {line.length > 0 ? <Text style={styles.movingRowLine}>{line}</Text> : null}
                  </View>
                  <Text style={styles.foldTime}>{str(row, 'age')}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/** Who has a line of work: the thread's agent logo, GitHub's mark, the user, the coordinator's hat. */
function WhoMark({ who }: { who: JsonRecord | null }) {
  const P = useTranscriptTheme();
  const kind = who ? str(who, 'kind') : '';
  const agent = who ? str(who, 'agentIcon') : '';
  if (kind === 'thread') return <AgentMark icon={agent || null} size={14} />;
  if (kind === 'github') return <Glyph name="brand-github" size={14} color={P.muted} />;
  if (kind === 'you') return <Glyph name="user" size={14} color={SidebarPalette.ROW_QUESTION} />;
  if (kind === 'coordinator') return <Glyph name="coordinator-crown-points" size={14} color={P.muted} />;
  return <Glyph name="clock" size={14} color={P.muted} />;
}

/** The space between a work item card's lead-in and the item's title. */
const TURN_TITLE_GAP = 6;

/**
 * What a coordinator's turn did to one of its work items, as the chat's other one-line cards look
 * (the "Message from" card's shape, `singleLineCard.tsx`): the work items icon in the tile with the
 * item's state mark as its badge, "Work item added" then the item's title set apart and the line
 * that changed, the time, and the state it is in as a pill. A tap opens the item in the Work sheet
 * (`jumpToWorkCard`). Port of desktop `work_turn_card` (native_chat/work_cards.rs).
 *
 * CDXC:SessionChat 2026-11-15 DECISION: User, of a phone screenshot where "Work item added: Before
 * a …" was an outlined line with an orange dot beside filled "Message from" cards: "The work item
 * added card looks different from the other cards. We need to make them all look the same", then
 * Q3298 A on the event cards page (~/.local/share/agent-work/Ghostex/chat-event-cards/event-cards.html):
 * every event card wears the message card's look. The phone drew these with `WorkFoldLine`, the
 * quiet line meant for an item's earlier card, because the core marks them `folded`; a card with a
 * `lead` is this card instead, as on the desktop. The item's title is cut, never collapsed: on a
 * tight row the time steps aside first (`singleLineTitleFit`, Q3300 A).
 */
function WorkTurnCard({ card, dispatch }: { card: JsonRecord; dispatch: Dispatch }) {
  const P = useTranscriptTheme();
  const status = str(card, 'status') || str(card, 'foldStatus');
  const color = status === 'dropped' ? P.muted : (STATUS_COLOR[status] ?? P.cardMuted);
  const lead = str(card, 'lead');
  const title = str(card, 'title');
  const detail = str(card, 'detail').replace(/\n/g, ' ');
  const label = str(card, 'statusLabel');
  const time = str(card, 'time');
  const command = obj(card.command);
  const titled = title.length > 0;
  const fit = useSingleLineTitleFit({ hasTime: time.length > 0, marks: 0, leadGap: TURN_TITLE_GAP });
  const showTime = titled ? fit.showTime : time.length > 0;
  return (
    <Pressable
      disabled={command === null}
      onPress={() => (command !== null ? dispatch(command as never) : undefined)}
      accessibilityRole={command !== null ? 'button' : undefined}
      accessibilityLabel={[titled ? `${lead}: ${title}` : lead, detail, label].filter((part) => part.length > 0).join(', ')}
      style={({ pressed }) => [singleLineShell(P), pressed && command !== null && singleLinePressed(P)]}
    >
      <View style={turnStyles.row}>
        <SingleLineTileBox>
          <Glyph
            name="layout-board-split"
            size={SINGLE_LINE_CARD.tile.glyphSize}
            color={P.ink(SINGLE_LINE_CARD.tile.glyphAlpha)}
          />
          <SingleLineBadge fill="transparent">
            <StatusMarker status={status} size={SINGLE_LINE_CARD.badge.size} />
          </SingleLineBadge>
        </SingleLineTileBox>
        <View style={turnStyles.title} onLayout={titled ? fit.onTitleLayout : undefined}>
          {/* The lead-in is quieter than the item's title it names; alone, it is the title. */}
          <Text
            numberOfLines={1}
            onLayout={titled ? fit.onLeadLayout : undefined}
            style={[SINGLE_LINE_TITLE, turnStyles.lead, { color: titled ? P.cardMuted : P.foreground }]}
          >
            {lead}
          </Text>
          {titled ? (
            <Text numberOfLines={1} style={[SINGLE_LINE_TITLE, turnStyles.item, { color: P.foreground }]}>
              {title}
            </Text>
          ) : null}
          {/* The line that changed gives way first. */}
          {detail.length > 0 ? (
            <Text numberOfLines={1} style={[turnStyles.detail, { color: P.muted }]}>
              {detail}
            </Text>
          ) : null}
        </View>
        {showTime ? (
          <Text numberOfLines={1} onLayout={fit.onTimeLayout} style={[turnStyles.time, { color: P.muted }]}>
            {time}
          </Text>
        ) : null}
        {label.length > 0 ? <SingleLinePill label={label} color={color} /> : null}
      </View>
    </Pressable>
  );
}

const turnStyles = {
  row: {
    height: SINGLE_LINE_HEADER_HEIGHT,
    paddingHorizontal: SINGLE_LINE_CARD.paddingX,
    flexDirection: 'row',
    alignItems: 'center',
    gap: TITLE_ROW_GAP,
  },
  // The title clips, so nothing in it paints over the time.
  title: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: TURN_TITLE_GAP, overflow: 'hidden' },
  lead: { flexShrink: 0 },
  // The item's title keeps at least a few letters and ends in "…".
  item: { flexShrink: 1, minWidth: SINGLE_LINE_CARD.nameMin },
  detail: { flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 18 },
  time: { flexShrink: 0, fontSize: 12, lineHeight: 16 },
} as const;

/** An item's earlier card, or a settled ask: one quiet line, what that turn did, and when. */
function WorkFoldLine({ card, dispatch }: { card: JsonRecord; dispatch: Dispatch }) {
  const styles = useStyles();
  const status = str(card, 'foldStatus') || str(card, 'status');
  const command = obj(card.command);
  // A turn's line opens the Work sheet at the first line of work it names.
  return (
    <Pressable
      accessibilityRole={command !== null ? 'button' : undefined}
      disabled={command === null}
      onPress={() => (command !== null ? dispatch(command as never) : undefined)}
      accessibilityLabel={str(card, 'foldText')}
      style={styles.fold}
    >
      <StatusMarker status={status} size={11} dim />
      {/* The question or title gives way; the outcome and time stay whole. */}
      <Text numberOfLines={1} style={styles.foldText}>
        {str(card, 'foldText')}
      </Text>
      {str(card, 'foldOutcome').length > 0 ? (
        <Text numberOfLines={1} style={styles.foldOutcome}>
          {str(card, 'foldOutcome')}
        </Text>
      ) : null}
      <Text style={styles.foldTime}>{str(card, 'time')}</Text>
    </Pressable>
  );
}

const useStyles = themedStyles((P) => ({
  stack: { gap: 6, marginTop: 8 },
  dock: { gap: 6, paddingHorizontal: 12, paddingBottom: 6 },
  dockCards: { gap: 6 },
  dockLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: P.inputBorder,
    backgroundColor: P.cardPanel,
  },
  linkDots: { textDecorationLine: 'underline', textDecorationStyle: 'dotted', textDecorationColor: P.muted },
  questionsCard: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  snoozeIndent: { paddingLeft: 22 },
  snoozeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 14, rowGap: 4, paddingTop: 2 },
  snoozeChoice: { paddingHorizontal: 8, borderRadius: 6, backgroundColor: 'rgba(127,127,127,0.12)' },
  quiet: { fontSize: PROSE_SIZE, lineHeight: PROSE_LINE, color: P.muted },
  whoLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  whoText: { flexShrink: 1, fontSize: PROSE_SIZE, lineHeight: PROSE_LINE, color: P.muted },
  // In the rows' column, as the working card under it (the desktop stack's 768), 8 under the
  // transcript (the desktop stack's own gap, `composer.rs` footer `pt`).
  dockColumn: { width: '100%', maxWidth: 768, alignSelf: 'center', paddingHorizontal: 12, paddingTop: STACK_GAP },
  dockSurface: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: P.inputBorder,
    backgroundColor: P.cardPanel,
  },
  dockRows: { padding: 4 },
  // The Snoozed row: the "N more need you" line's quiet words, with a moon and a chevron.
  dockSnoozed: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8 },
  dockSnoozedMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  dockSnoozedLabel: { fontSize: PROSE_SIZE, lineHeight: PROSE_LINE, color: P.muted },
  dockSnoozedChevronOpen: { transform: [{ rotate: '180deg' }] },
  dockSnoozedRow: { opacity: 0.72 },
  // The header: the band over the rows while open, as the desktop's (`work_dock_header`).
  dockHead: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingLeft: 12, paddingRight: 6 },
  dockHeadOpen: {
    borderBottomWidth: 1,
    borderBottomColor: P.inputBorder,
    backgroundColor: P.ink(0.035),
    borderTopLeftRadius: 11,
    borderTopRightRadius: 11,
  },
  dockHeadShut: { borderRadius: 11 },
  dockCounts: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4, overflow: 'hidden' },
  dockCountsBeside: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 4 },
  inboxTitleSlot: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 0 },
  inboxTitleGap: { marginRight: 6 },
  inboxTitleText: { fontSize: WORKING_VISUAL.fontSize, fontWeight: '600', color: P.foreground },
  dockStatus: { flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, overflow: 'hidden' },
  dockSpacer: { flexGrow: 1, minWidth: 8 },
  dockCount: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 0 },
  dockCountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dockCountLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dockCountNumber: { fontSize: WORKING_VISUAL.fontSize, color: P.foreground, fontVariant: ['tabular-nums'] },
  dockCountName: { fontSize: WORKING_VISUAL.fontSize, color: P.cardMuted },
  dockTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dockTitleFlex: { flex: 1, minWidth: 0 },
  sourcesChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 0,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: P.ink(0.10),
    backgroundColor: P.ink(0.05),
  },
  sourcesChipText: { fontSize: PROSE_SIZE - 2, color: P.cardMuted },
  subRowsWrap: { paddingLeft: 22, paddingRight: 4, paddingBottom: 4, gap: 2 },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 10,
    paddingRight: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderLeftWidth: 2,
    borderLeftColor: P.ink(0.10),
  },
  subRowText: { flex: 1, minWidth: 0, fontSize: PROSE_SIZE - 1, lineHeight: PROSE_LINE - 2 },
  bundleActions: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  bundleButton: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: P.ink(0.10),
    backgroundColor: P.ink(0.04),
  },
  bundleButtonText: { fontSize: PROSE_SIZE - 1.5, color: P.foreground },
  swipeContainer: { position: 'relative', overflow: 'hidden', borderRadius: 8 },
  swipeBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
  },
  swipeActionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
  },
  swipeActionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  swipeActionText: { fontSize: PROSE_SIZE - 1, fontWeight: '600' },
  swipeSpacer: { flex: 1 },
  swipeForeground: { backgroundColor: P.cardPanel, borderRadius: 8 },
  dockMarkSummary: { flex: 1, minWidth: 0, fontSize: PROSE_SIZE - 1.5, color: P.muted, paddingLeft: 8 },
  dockUndoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: P.ink(0.08),
    backgroundColor: P.ink(0.04),
  },
  dockUndoText: { flex: 1, minWidth: 0, fontSize: PROSE_SIZE - 0.5, color: P.foreground },
  dockUndoButton: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: P.ink(0.12),
    backgroundColor: P.ink(0.06),
  },
  dockUndoButtonText: { fontSize: PROSE_SIZE - 1, fontWeight: '600', color: P.foreground },
  dockUndoClose: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 5 },
  dockAnsweredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    opacity: 0.72,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  dockAnsweredTitle: { flex: 1, minWidth: 0, fontSize: PROSE_SIZE - 0.5, color: P.cardMuted },
  dockAnsweredOutcome: {
    flexShrink: 0,
    maxWidth: 130,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
    backgroundColor: P.ink(0.05),
    fontSize: PROSE_SIZE - 2,
    color: P.muted,
  },
  snoozeSheetList: { gap: 4, paddingVertical: 4 },
  snoozeSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  snoozeSheetLabel: { fontSize: PROSE_SIZE, color: P.foreground },
  dockHeadButton: { width: 28, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  dockPress: { gap: 2, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8 },
  dockPressOpen: { paddingBottom: 2 },
  dockDetailArea: { paddingHorizontal: 8, paddingBottom: 6 },
  // The answers' line sits `OPENED_ROW_GAP` under the text.
  dockDetailAreaAnswers: { paddingBottom: OPENED_ROW_GAP },
  dockRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  // An opened row is its own card, a little lighter than the dock (desktop `dock_row`).
  // A dock row's ask in its sheet (`DockRow` with `onClose`): the sheet's own panel is its card.
  askSheet: { flexGrow: 0 },
  askSheetContent: { paddingHorizontal: 8, paddingBottom: 8 },
  dockIcon: { height: PROSE_LINE, justifyContent: 'center' },
  dockMain: { flex: 1, minWidth: 0, gap: 2 },
  dockTitle: { fontSize: PROSE_SIZE, lineHeight: PROSE_LINE },
  dockNote: { fontSize: PROSE_SIZE - 1, lineHeight: PROSE_LINE - 2, color: P.cardMuted, marginTop: 2 },
  dockError: { fontSize: PROSE_SIZE - 1, lineHeight: PROSE_LINE - 2, color: SidebarPalette.ROW_APPROVAL, marginTop: 2 },
  // Under the title, from its left edge (the mark's 14 and the row's 10 gap past the row's 8).
  commandChipLine: { flexDirection: 'row', paddingLeft: 8 + 14 + 10, paddingRight: 8, paddingBottom: 6 },
  commandChip: {
    flexShrink: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: P.ink(0.05),
  },
  commandChipText: { flexShrink: 1, fontFamily: MONO_FONT, fontSize: CODE_SIZE },
  commandStripLine: { paddingLeft: 8 + 14 + 10, paddingRight: 8, paddingBottom: 6 },
  cmdStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: P.ink(0.05),
    borderWidth: 1,
    borderColor: P.ink(0.09),
  },
  cmdStripCompact: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
  },
  cmdStripCode: {
    flex: 1,
    minWidth: 120,
    fontFamily: MONO_FONT,
    fontSize: CODE_SIZE,
  },
  cmdStripActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 5,
  },
  cmdQuietBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
  },
  cmdQuietBtnText: {
    fontSize: CODE_SIZE,
    fontWeight: '500',
    color: P.cardMuted,
  },
  cmdRunBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
    backgroundColor: P.ink(0.08),
    borderWidth: 1,
    borderColor: P.ink(0.14),
  },
  cmdRunBtnText: {
    fontSize: CODE_SIZE,
    fontWeight: '500',
  },
  cmdLiveBox: {
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: P.ink(0.05),
    borderWidth: 1,
    borderColor: P.ink(0.09),
  },
  cmdLiveRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cmdLiveStatus: {
    flex: 1,
    minWidth: 140,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  cmdStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  cmdLiveTitle: {
    flex: 1,
    fontSize: PROSE_SIZE - 1,
    fontWeight: '500',
  },
  cmdLiveHint: {
    fontSize: PROSE_SIZE - 2,
    lineHeight: PROSE_LINE - 3,
    color: P.cardMuted,
  },
  cmdOutputBox: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 7,
    backgroundColor: P.ink(0.04),
    borderWidth: 1,
    borderColor: P.ink(0.08),
  },
  cmdOutputText: {
    fontFamily: MONO_FONT,
    fontSize: CODE_SIZE - 1,
    lineHeight: 16,
    color: P.cardMuted,
  },
  approvalCommandLine: { paddingLeft: 8 + 14 + 10, paddingRight: 8, paddingBottom: 6, gap: 4 },
  approvalCommand: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: P.ink(0.05) },
  approvalCommandMeta: { fontSize: CODE_SIZE, color: P.cardMuted },
  approvalMessageText: { flexShrink: 1, fontSize: PROSE_SIZE, lineHeight: PROSE_LINE },
  pageCount: { flexShrink: 0, fontSize: PROSE_SIZE, lineHeight: PROSE_LINE, color: P.cardMuted },
  ageSlot: { flexDirection: 'row', alignItems: 'center', gap: 4, height: PROSE_LINE },
  dockAnswers: { paddingLeft: 31, paddingRight: 8, paddingBottom: 6 },
  dockAnswersOpen: { paddingLeft: 31, paddingRight: 8, paddingBottom: 8 },
  // Under the title's text, not the mark: the mark and its gap (DOCK_LEAD).
  dockDetail: { gap: 4, marginLeft: DOCK_LEAD },
  threadLogos: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  threadLogoSlot: { width: THREAD_LOGO, height: THREAD_LOGO },
  threadLogo: { width: THREAD_LOGO, height: THREAD_LOGO, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  // Over the logo, left edges together, drawn over the text above it.
  threadTip: {
    position: 'absolute',
    left: 0,
    bottom: THREAD_LOGO + 6,
    zIndex: 3,
    elevation: 3,
    maxWidth: 260,
    paddingHorizontal: 11,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: P.menuBorder,
    backgroundColor: P.menu,
  },
  threadTipText: { fontSize: PROSE_SIZE, lineHeight: PROSE_LINE, color: P.menuForeground },
  dockLinks: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 14, rowGap: 4 },
  itemLineColumn: { gap: 4 },
  // On a phone's width the names and "waits on this" wrap rather than cut each other to a few
  // letters (the desktop keeps one line); a name longer than the line is still cut at its end.
  itemLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6, rowGap: 2, minWidth: 0 },
  itemName: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemNameText: { flexShrink: 1, fontSize: PROSE_SIZE, lineHeight: 20, color: P.cardMuted },
  itemDot: { flexShrink: 0, fontSize: PROSE_SIZE, color: P.muted, opacity: 0.6 },
  itemWords: { flexShrink: 0, fontSize: PROSE_SIZE, lineHeight: 20, color: P.cardMuted },
  dockMore: { paddingLeft: 31, paddingRight: 8, paddingTop: 2, paddingBottom: 6, fontSize: PROSE_SIZE, color: P.muted },
  dockFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 5,
    paddingBottom: 4,
    paddingRight: 8,
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: P.ink(0.06),
  },
  dockMarkSeen: {
    marginLeft: 'auto',
    flexShrink: 0,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: P.ink(0.10),
    backgroundColor: P.ink(0.04),
  },
  dockMarkSeenText: { fontSize: PROSE_SIZE - 1, color: P.foreground },
  dismiss: { width: 20, height: PROSE_LINE, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  dockFold: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  dockLineText: { flex: 1, minWidth: 0, fontSize: PROSE_SIZE, color: P.cardMuted },
  card: {
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: P.inputBorder,
    backgroundColor: P.cardPanel,
  },
  // On a narrow screen the status and age wrap under the title rather than squeeze it.
  top: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', columnGap: 8 },
  marker: { width: 14, height: PROSE_LINE, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, minWidth: 140, fontSize: PROSE_SIZE, lineHeight: PROSE_LINE, fontWeight: '500', color: P.prose },
  right: { marginLeft: 'auto', fontSize: PROSE_SIZE, lineHeight: PROSE_LINE, color: P.muted },
  line: { paddingLeft: 22, fontSize: PROSE_SIZE, lineHeight: PROSE_LINE, color: P.cardMuted },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 14,
    rowGap: 4,
    paddingLeft: 22,
    paddingTop: 2,
  },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: PROSE_LINE, flexShrink: 1, maxWidth: '100%' },
  chipText: { flexShrink: 1, fontSize: PROSE_SIZE, lineHeight: PROSE_LINE, color: P.cardMuted },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginLeft: 'auto' },
  fold: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: P.inputBorder,
  },
  foldText: { flex: 1, minWidth: 0, fontSize: PROSE_SIZE, color: P.cardMuted },
  foldTime: { fontSize: PROSE_SIZE, color: P.muted },
  foldOutcome: { flexShrink: 0, maxWidth: '60%', fontSize: PROSE_SIZE, fontWeight: '500', color: P.cardMuted },
  // The work item cards' own background, border and radius.
  moving: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: P.inputBorder,
    backgroundColor: P.cardPanel,
    overflow: 'hidden',
  },
  movingHead: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 36, paddingHorizontal: 12 },
  movingTitle: { fontSize: PROSE_SIZE, fontWeight: '500', color: P.prose },
  movingSummary: { flex: 1, minWidth: 0, fontSize: PROSE_SIZE, color: P.cardMuted },
  movingList: { paddingHorizontal: 12, paddingBottom: 8 },
  movingGroup: {
    paddingTop: 8,
    paddingBottom: 2,
    fontSize: PROSE_SIZE,
    lineHeight: PROSE_LINE,
    fontWeight: '500',
    color: P.muted,
  },
  movingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4 },
  movingMarker: { width: 20, height: PROSE_LINE, alignItems: 'center', justifyContent: 'center' },
  movingText: { flex: 1, minWidth: 0 },
  movingRowTitle: { fontSize: PROSE_SIZE, lineHeight: PROSE_LINE, color: P.prose },
  movingRowLine: { fontSize: PROSE_SIZE, lineHeight: PROSE_LINE, color: P.cardMuted },
}));
