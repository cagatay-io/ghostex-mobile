/**
 * The pill strip along the chat box's top edge (`NativeComposer.tsx` draws it inside the box): a
 * faintly tinted band with a hairline under it and the box's top corners, holding all of the
 * chat's pills in one horizontal scrolling row with uniform spacing (`PILL_GAP`): the where pill
 * (`WherePill.tsx`), the Saved draft pill (`SavedDraftPill.tsx`), view status chips ("Summary view"
 * or "Detailed view"), armed timers, the ? (a question waits), hidden page pills, panel pills
 * (Resources, Workers, Autopilot, Tasks, Subagents, Background, etc.), Boost, Links and the Session
 * details ring. History (`SentHistorySheet.tsx`) leads the panel side, after the view chips, where
 * the desktop draws it right of its ↓. The ↓ jump-to-bottom is never here: it floats over the transcript
 * (`LoneScrollBottom` in `WorkingCard.tsx`, layout A of 2026-11-12).
 *
 * With no pill there is no strip; it grows in and shrinks away with the chat box's own ease
 * (`composer-animation.json`). Each pill opens its own sheet (`ChatPills.tsx`, `WherePill.tsx`,
 * `SavedDraftPill.tsx`, `Boosts.tsx`, `SessionDetailsSheet.tsx`).
 *
 * CDXC:SessionChat 2026-10-29 SEE-ALSO:
 * The user's words (option E) are on packages/gx-chat-core/src/extras/chat_pills.rs. Desktop's
 * `pills_strip.rs` keeps its own non-scrolling fit and pinned-left where pill for wide windows.
 *
 * CDXC:SessionChat 2026-11-22 DECISION:
 * User (Android phone, where the pinned where pill plus uncollapsible Boost, Links and Session
 * details ring overflowed the non-scrolling `PillsFit` box and clipped Boost under the where pill
 * with no way to scroll): make the where pill a regular pill with the same shape and spacing as the
 * others, and make the whole row scroll horizontally with a finger swipe through every pill.
 * Supersedes the 2026-11-10 non-scrolling fit (`PillsFit` / "+N" overflow) and the 2026-11-17
 * pinned-left where pill on the phone.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import type { ChatDocument, ChatPill, NativeSwitchOffer, ViewChip } from '../../rust/document';
import { BLOCKED_PILL } from './CoordinatorBoard';
import { INTRO_PILL, coordinatorIntro } from './CoordinatorIntro';
import type { UserAction } from '../../rust/actions';
import type { RustChat } from '../../rust/useRustChat';
import type { GhostexSessionLinks } from '../../../contract/mobileSummary';
import { FlowerGlyph } from '../../../components/sessions/icons';
import { Glyph as ComposerGlyph } from '../composer/icons';
import { sessionLinksChatPill } from '../sessionLinks';
import { SessionDetailsPill, sessionDetailsRingOf } from './SessionDetailsSheet';
import { themedStyles, useTranscriptTheme } from '../transcript/theme';
import { LinksPill, PagePill, Pill, QuestionPill } from './ChatPills';
import type { HiddenPage } from './hiddenPages';
import { BoostPill, BoostSheet, registerBoostSheetOpener } from './Boosts';
import { NativeSwitchPill } from './NativeSwitchPill';
import { SavedDraftPill, SavedDraftSheet } from './SavedDraftPill';
import { SentHistoryPill, SentHistorySheet } from './SentHistorySheet';
import { WherePill, WhereSheet } from './WherePill';
import { VISUAL, type ArmedAction } from './WorkingStrip';

/** The new-chat "No project" and "Coordinator" toggle pills, shown at the strip's left end while a draft is idle. */
export type DraftStripToggles = {
  busy: boolean;
  noProject: boolean;
  canToggleNoProject: boolean;
  onToggleNoProject: () => void;
  coordinatorOn: boolean;
  canToggleCoordinator: boolean;
  onToggleCoordinator: () => void;
};

/** The session's links and the Links pill's tap, from the screen that knows the session (`TerminalScreen`). */
export type PillsStripLinks = {
  links: GhostexSessionLinks | undefined;
  /** Whether a suggestions-only session shows the "N suggested" pill (false for coordinators, Chief and coordinator threads). */
  showSuggested?: boolean;
  onOpen: () => void;
};

/** The strip's band: a pill's 25 with 5 above and below; its hairline under it (desktop `STRIP_HEIGHT`). */
const BAND = 25 + 5 * 2;
const STRIP = BAND + 1;
/** The gap between two pills (desktop `PILL_GAP`). */
const PILL_GAP = 6;
/** The band's tint over the box's fill (desktop `STRIP_TINT`). */
const STRIP_TINT = 0.035;
/** `packages/gx-chat-core/visual/composer-animation.json`: the chat box's own ease. */
const EASE_MS = 240;
const EASE = Easing.bezier(0.22, 0.61, 0.36, 1);

/** `over` laid over `base` at `alpha`, both `#rrggbb`; `base` as it is for any other colour. */
export function mixHex(base: string, over: string, alpha: number): string {
  const parse = (color: string) =>
    /^#[0-9a-f]{6}$/i.test(color) ? [1, 3, 5].map((at) => parseInt(color.slice(at, at + 2), 16)) : null;
  const from = parse(base);
  const to = parse(over);
  if (from === null || to === null) return base;
  return `#${from
    .map((channel, index) => Math.round(channel + ((to[index] ?? channel) - channel) * alpha))
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}

/** Whether the question pill shows: a question form or page waits (the core's `openQuestions.count`). */
function questionWaiting(document: ChatDocument): boolean {
  // What the dock above the box cannot show (gx-chat-core `pill_count`): one place per question.
  return (document.openQuestions?.pillCount ?? 0) > 0;
}

/** Whether the strip shows: the Saved draft pill, a view chip, a panel pill, the ?, the Links pill or an armed timer calls for it. */
const NO_PILLS: readonly string[] = [];

/**
 * The pills the strip leaves out while the work dock's bar shows above the chat box: the Work
 * pill, whose sheet the bar's Work items button opens (`WorkCards.tsx` `DockHeader`), and the red
 * Blocked pill, whose count the bar shows. Both leave the desktop's pills row the same way
 * (`pills_strip.rs`).
 *
 * CDXC:Coordinators 2026-11-12 DECISION:
 * User, of the phone's bar with its Work items button beside "● 6" and the Work pill "▦ ● 6" in
 * the row under it: remove the Work items pill from the pills row, since the bar's button does the
 * same thing; only while the chat shows the bar, so a chat with work items and no bar keeps it.
 * Then, of the Blocked pill: "match the desktop: drop the Blocked pill too while the bar shows (keep
 * it where there's no bar)".
 */
export const PILLS_IN_DOCK_BAR: readonly string[] = ['board', BLOCKED_PILL];

export function pillsStripShown(
  document: ChatDocument,
  armed: readonly ArmedAction[],
  links: PillsStripLinks | null,
  muted: string,
  hiddenPages = 0,
  omitPills: readonly string[] = NO_PILLS,
  hasDraftToggles = false,
): boolean {
  return (
    hasDraftToggles ||
    hiddenPages > 0 ||
    armed.length > 0 ||
    (document.savedDraftPill ?? null) !== null ||
    (document.wherePill ?? null) !== null ||
    document.nativeSwitch?.showChip === true ||
    // The Boost pill (`Boosts.tsx`) is always there while the computer has Boosts.
    (document.boosts ?? null) !== null ||
    (document.viewChips?.length ?? 0) > 0 ||
    // History shows once the chat has a sent message (gx-chat-core `composer/sent_history.rs`).
    document.sentHistory?.enabled === true ||
    questionWaiting(document) ||
    (document.workingCard?.pills ?? []).some((id) => !omitPills.includes(id)) ||
    (links !== null && sessionLinksChatPill(links.links, muted, false, links.showSuggested ?? true) !== null) ||
    // The Session details ring lives in the strip, so a chat with the panel always has one.
    sessionDetailsRingOf(document) !== null
  );
}

export function PillsStrip({
  chat,
  document,
  armed,
  onArmedPress,
  links,
  onStashedPress,
  onSessionDetailsPress,
  onOpenFolder,
  menu,
  onMenuChange,
  hiddenPages = [],
  onShowPage,
  onClosePage,
  omitPills = NO_PILLS,
  onSwitchToNative,
  onCancelSwitchToNative,
  onDismissNativeSwitch,
  draftToggles = null,
}: {
  chat: RustChat;
  /** Pills left out of the strip (`PILLS_IN_DOCK_BAR` while the dock's bar shows). */
  omitPills?: readonly string[];
  document: ChatDocument;
  /** The new-chat "No project" and "Coordinator" toggle pills, placed at the strip's left end (Q4833 A, Q4834 C). */
  draftToggles?: DraftStripToggles | null;
  /** Opens the "Switch to Native?" confirm sheet (`Q4768`, `Q4769`). */
  onSwitchToNative?: (offer: NativeSwitchOffer) => void;
  /** Cancels a queued mid-reply Terminal -> Native switch (`Q4771`). */
  onCancelSwitchToNative?: () => void;
  /** Dismisses the "Switch to Native" chip per agent (`Q4770`). */
  onDismissNativeSwitch?: (family: string) => void;
  /** The chat's hidden pages, oldest first (`hiddenPages.ts`), drawn first among the panel pills. */
  hiddenPages?: readonly HiddenPage[];
  /** A tap on a page's pill: the page opens again. */
  onShowPage?: (page: HiddenPage) => void;
  /** A long press on a page's pill: the page closes for good. */
  onClosePage?: (page: HiddenPage) => void;
  menu: string | null;
  onMenuChange: (menu: string | null) => void;
  armed: readonly ArmedAction[];
  /** Opens Delayed Actions; without it the timers are drawn but not pressable. */
  onArmedPress?: () => void;
  links: PillsStripLinks | null;
  /** Opens Saved prompts: the Stashed pill opens that list rather than a sheet of its own (desktop `chat_pills.rs`). */
  onStashedPress?: () => void;
  /** Opens the Session details sheet: the ring at the strip's right end, while the chat has the panel. */
  onSessionDetailsPress?: () => void;
  /** Opens the project's Files browser: the where pill's Open folder, left out without it. */
  onOpenFolder?: () => void;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const reduceMotion = useReducedMotion();
  const savedDraft = document.savedDraftPill ?? null;
  const [draftOpen, setDraftOpen] = useState(false);
  const closeDraft = useCallback(() => setDraftOpen(false), []);
  // The where pill and its sheet (`WherePill.tsx`).
  const where = document.wherePill ?? null;
  // The Boost pill and its sheet (`Boosts.tsx`).
  const boosts = document.boosts ?? null;
  const [boostOpen, setBoostOpen] = useState(false);
  const closeBoost = useCallback(() => setBoostOpen(false), []);
  // Opening the sheet reads the Boosts again (the computer's Settings may have changed them) and is
  // what the one-time callout asked for.
  const openBoosts = useCallback(() => {
    if (boosts?.hint != null) chat.dispatch({ type: 'dismissBoostHint' });
    chat.dispatch({ type: 'refreshBoosts' });
    setBoostOpen(true);
  }, [boosts, chat]);
  useEffect(() => {
    registerBoostSheetOpener(() => {
      chat.dispatch({ type: 'refreshBoosts' });
      setBoostOpen(true);
    });
    return () => registerBoostSheetOpener(null);
  }, [chat]);
  useEffect(() => {
    if (boosts === null) setBoostOpen(false);
  }, [boosts]);
  // Whether the queued "Switching to Native" chip's reason shows under the strip
  // (`NativeSwitchPill.tsx`); it goes with the queued state.
  const nativeSwitchQueued = document.nativeSwitch?.showChip === true && document.nativeSwitch.queued;
  const [nativeSwitchInfoShown, setNativeSwitchInfoShown] = useState(false);
  useEffect(() => {
    if (!nativeSwitchQueued) setNativeSwitchInfoShown(false);
  }, [nativeSwitchQueued]);
  const nativeSwitchReason = nativeSwitchQueued ? (document.nativeSwitch?.queuedTooltip ?? '') : '';
  const [whereOpen, setWhereOpen] = useState(false);
  const closeWhere = useCallback(() => setWhereOpen(false), []);
  useEffect(() => {
    if (where === null) setWhereOpen(false);
  }, [where]);
  // A draft answered or withdrawn elsewhere takes its sheet with it.
  useEffect(() => {
    if (savedDraft === null) setDraftOpen(false);
  }, [savedDraft]);
  // The box's width, which the Saved draft pill shortens its label by (`savedDraft.ts`).
  const [stripWidth, setStripWidth] = useState(0);
  const hasDraftToggles =
    draftToggles !== null && (draftToggles.canToggleNoProject || draftToggles.canToggleCoordinator);
  const shown = pillsStripShown(
    document,
    armed,
    links,
    P.cardMuted,
    hiddenPages.length,
    omitPills,
    hasDraftToggles,
  );
  // Grows in and shrinks away; drawn while it shrinks, dropped once it has.
  const open = useRef(new Animated.Value(shown ? 1 : 0)).current;
  const [drawn, setDrawn] = useState(shown);
  useEffect(() => {
    if (shown) setDrawn(true);
    if (reduceMotion) {
      open.setValue(shown ? 1 : 0);
      if (!shown) setDrawn(false);
      return undefined;
    }
    const run = Animated.timing(open, {
      toValue: shown ? 1 : 0,
      duration: EASE_MS,
      easing: EASE,
      useNativeDriver: false,
    });
    run.start(({ finished }) => {
      if (finished && !shown) setDrawn(false);
    });
    return () => run.stop();
  }, [shown, reduceMotion, open]);
  const linksPill = links ? sessionLinksChatPill(links.links, P.cardMuted, P.light, links.showSuggested ?? true) : null;
  const card = document.workingCard;
  const pills = (card?.pills ?? [])
    .filter((id) => !omitPills.includes(id))
    .map((id) => (document.chatPills ?? []).find((pill) => pill.id === id))
    .filter((pill) => pill !== undefined);
  const pressPill = (pill: ChatPill) =>
    // Autopilot's pill opens its sheet like any other (its rows are the pill's `menu`, gx-chat-core
    // `extras/autopilot.rs`); a tap never toggles it.
    pill.id === 'stashed'
      ? onStashedPress?.()
      : pill.id === BLOCKED_PILL
        ? // Blocked opens the board at its Blocked group (gx-chat-core `show_group`), through
          // the board focus the chat screen keeps for the pill sheet.
          chat.dispatch({ type: 'showCoordinatorBoardGroup', group: 'blocked' } as unknown as UserAction)
        : pill.id === INTRO_PILL && coordinatorIntro(document)?.opensFlowPage === true
          ? /*
             * CDXC:Coordinators 2026-11-26 DECISION:
             * The user, of a coordinator's How to use pill: "make the tips just open this page directly",
             * and then "Yes, do the phone change". In a coordinator's chat the pill opens the coordinator
             * flow page in the chat's page sheet (the core's Open of its `/visual/<id>` address) instead
             * of the tips sheet, as on the desktop (`chat_pills.rs`). A chat core without
             * `opensFlowPage` keeps the tips sheet.
             */
            chat.dispatch({ type: 'openCoordinatorFlowPage' })
          : // The Work pill opens the Work sheet, collapsed dock or not, as the desktop's opens its Work
          // panel: a collapsed dock keeps its bar, whose tap opens it again (`WorkCards.tsx` `DockHeader`).
          onMenuChange(pill.id);
  /*
   * CDXC:SessionDetails 2026-11-11 DECISION:
   * User, of the ring button in the phone's chat header: "Please move the new session details button
   * to the pills bar above the composer on mobile (keep in header on desktop)". The ring and its
   * percentage close the strip, after Links. It stands for the context meter too: while the chat
   * has the panel the meter's ring under the box steps aside (`OptionPills.tsx`), and the sheet's
   * Context card carries Compact context; a computer that cannot serve the panel keeps the meter
   * and its Context sheet.
   */
  const ring = onSessionDetailsPress !== undefined ? sessionDetailsRingOf(document) : null;
  const questions = document.openQuestions;
  return (
    <>
      {drawn ? (
        <Animated.View
          accessibilityRole="toolbar"
          accessibilityLabel="Chat pills"
          style={[
            styles.strip,
            { height: open.interpolate({ inputRange: [0, 1], outputRange: [0, STRIP] }), opacity: open },
          ]}
        >
          <ScrollView
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={styles.bandScroll}
            contentContainerStyle={styles.band}
            onLayout={(event) => setStripWidth(event.nativeEvent.layout.width)}
          >
            {shown && hasDraftToggles && draftToggles !== null ? (
              <DraftTogglePills toggles={draftToggles} />
            ) : null}
            {shown && where !== null ? (
              <WherePill pill={where} tier="full" open={whereOpen} onPress={() => setWhereOpen(true)} />
            ) : null}
            {shown && document.nativeSwitch?.showChip === true ? (
              <NativeSwitchPill
                offer={document.nativeSwitch}
                onPress={() => {
                  const offer = document.nativeSwitch;
                  if (offer == null) return;
                  if (offer.queued) onCancelSwitchToNative?.();
                  else onSwitchToNative?.(offer);
                }}
                onDismiss={() => {
                  const offer = document.nativeSwitch;
                  if (offer == null) return;
                  if (offer.queued) onCancelSwitchToNative?.();
                  else onDismissNativeSwitch?.(offer.family);
                }}
                infoShown={nativeSwitchInfoShown}
                onInfoPress={(hold) => setNativeSwitchInfoShown((current) => hold || !current)}
              />
            ) : null}
            {shown && savedDraft !== null ? (
              <SavedDraftPill
                pill={savedDraft}
                width={stripWidth}
                open={draftOpen}
                onPress={() => setDraftOpen(true)}
              />
            ) : null}
            {shown
              ? (document.viewChips ?? []).map((chip) => (
                  <ViewChipButton key={chip.id} chip={chip} onPress={() => chat.dispatch(chip.command)} />
                ))
              : null}
            {shown && document.sentHistory?.enabled === true ? (
              <SentHistoryPill
                open={document.sentHistory.open}
                onPress={() => chat.dispatch({ type: 'sentHistory' })}
              />
            ) : null}
            {armed.map((action) => (
              <Pressable
                key={action.id}
                disabled={onArmedPress === undefined}
                onPress={onArmedPress}
                accessibilityRole="button"
                accessibilityLabel={`${action.label}. Manage delayed actions`}
                hitSlop={6}
                style={({ pressed }) => [styles.armed, pressed ? styles.armedPressed : null]}
              >
                <ComposerGlyph
                  name="clock"
                  size={VISUAL.sparkSize}
                  color={action.id === 'delayedSend' ? VISUAL.delayedSendColor : VISUAL.closeAfterDoneColor}
                />
                <Text style={styles.armedLabel} numberOfLines={1}>
                  {action.label}
                </Text>
              </Pressable>
            ))}
            {questions !== undefined && questions !== null && questionWaiting(document) ? (
              <QuestionPill
                count={questions.pillCount ?? 0}
                newest={questions.newest ?? null}
                accessibilityLabel={questions.accessibilityLabel}
                onPress={() => chat.dispatch({ type: 'previousQuestion' })}
              />
            ) : null}
            {hiddenPages.map((page) => (
              <PagePill
                key={page.pageId}
                page={page}
                tier="full"
                onPress={() => onShowPage?.(page)}
                onLongPress={() => onClosePage?.(page)}
              />
            ))}
            {pills.map((pill) => (
              <Pill key={pill.id} pill={pill} open={pill.id === menu} onPress={() => pressPill(pill)} />
            ))}
            {boosts !== null ? <BoostPill boosts={boosts} open={boostOpen} onPress={openBoosts} /> : null}
            {links && linksPill !== null ? <LinksPill key="links" pill={linksPill} onPress={links.onOpen} /> : null}
            {ring !== null ? <SessionDetailsPill ring={ring} onPress={onSessionDetailsPress!} /> : null}
          </ScrollView>
          <View style={styles.hairline} />
        </Animated.View>
      ) : null}
      {drawn && nativeSwitchInfoShown && nativeSwitchReason.length > 0 ? (
        <Text style={styles.nativeSwitchReason} accessibilityRole="text">
          {nativeSwitchReason}
        </Text>
      ) : null}
      <SentHistorySheet chat={chat} document={document} />
      <SavedDraftSheet pill={savedDraft} open={draftOpen} onClose={closeDraft} dispatch={chat.dispatch} />
      <BoostSheet boosts={boosts} open={boostOpen} onClose={closeBoost} dispatch={chat.dispatch} />
      <WhereSheet
        pill={where}
        open={whereOpen}
        onClose={closeWhere}
        dispatch={chat.dispatch}
        {...(onOpenFolder !== undefined ? { onOpenFolder } : {})}
      />
    </>
  );
}

/**
 * The new-chat "No project" and "Coordinator" toggle pills at the strip's left end, matching the
 * existing 25pt strip pills and neutral active style (Q4833 A, Q4834 C; desktop `pills_strip.rs`).
 */
function DraftTogglePills({ toggles }: { toggles: DraftStripToggles }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  return (
    <>
      {toggles.canToggleNoProject ? (
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="No project"
          accessibilityState={{ checked: toggles.noProject, disabled: toggles.busy }}
          disabled={toggles.busy}
          hitSlop={4}
          onPress={toggles.onToggleNoProject}
          style={({ pressed }) => [
            styles.draftPill,
            toggles.noProject ? styles.draftPillActive : null,
            pressed ? styles.draftPillPressed : null,
            toggles.busy ? styles.draftPillBusy : null,
          ]}
        >
          {toggles.noProject ? (
            <ComposerGlyph name="check" size={14} color={P.foreground} />
          ) : (
            <FlowerGlyph size={14} color={P.cardMuted} />
          )}
          <Text style={[styles.draftPillLabel, toggles.noProject ? styles.draftPillLabelActive : null]} numberOfLines={1}>
            No project
          </Text>
        </Pressable>
      ) : null}
      {toggles.canToggleCoordinator ? (
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="Coordinator"
          accessibilityState={{ checked: toggles.coordinatorOn, disabled: toggles.busy }}
          disabled={toggles.busy}
          hitSlop={4}
          onPress={toggles.onToggleCoordinator}
          style={({ pressed }) => [
            styles.draftPill,
            toggles.coordinatorOn ? styles.draftPillActive : null,
            pressed ? styles.draftPillPressed : null,
            toggles.busy ? styles.draftPillBusy : null,
          ]}
        >
          <ComposerGlyph
            name={toggles.coordinatorOn ? 'check' : 'coordinator-crown-points'}
            size={14}
            color={toggles.coordinatorOn ? P.foreground : P.cardMuted}
          />
          <Text
            style={[styles.draftPillLabel, toggles.coordinatorOn ? styles.draftPillLabelActive : null]}
            numberOfLines={1}
          >
            Coordinator
          </Text>
        </Pressable>
      ) : null}
    </>
  );
}

/** A view chip's icon, the one its View menu row shows (`composer/menus.ts`; desktop `view_chip_icon`). */
function viewChipGlyph(id: string): 'list-check' | 'list-details' | 'eye-off' | 'eye' {
  switch (id) {
    case 'summary':
      return 'list-check';
    // Quiet View's chip (gx-chat-core `transcript/quiet_view.rs` `view_chip`).
    case 'quiet':
      return 'eye-off';
    case 'full':
      return 'eye';
    default:
      return 'list-details';
  }
}

/**
 * One view status chip: quieter than the pills (a faint fill, no outline) at their height, with its
 * view's icon at the left and its X at the right.
 *
 * CDXC:SessionChat 2026-11-11 DECISION:
 * The desktop chip shows its view's icon at the left, which turns into the X on hover (gx-chat-core
 * extras/chat_pills.rs `view_chips` has the user's words). A phone has no hover, so the user picked
 * "icon at the left, X kept at the right": the icon tells the two views apart at a glance, the X says
 * a tap turns the view off.
 */
function ViewChipButton({ chip, onPress }: { chip: ViewChip; onPress: () => void }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={chip.ariaLabel}
      hitSlop={6}
      style={({ pressed }) => [styles.chip, pressed ? styles.chipPressed : null]}
    >
      <ComposerGlyph name={viewChipGlyph(chip.id)} size={12} color={P.cardMuted} />
      <Text style={styles.chipLabel} numberOfLines={1}>
        {chip.label}
      </Text>
      <ComposerGlyph name="x" size={10} color={P.cardMuted} />
    </Pressable>
  );
}

/**
 * How the row of pills fits `avail`: how many of the last panel pills go into the "+N" pill and how
 * many of the last ones left drop their label, as few as can be, labels before pills. `fixed` are
 * the widths of the pills that always show and `pills` the panel pills' (with label, without).
 * Port of desktop `plan_strip`.
 */
export function planStrip(
  avail: number,
  fixed: readonly number[],
  pills: readonly { full: number; icon: number }[],
  overflow: number,
  gap: number,
): { hidden: number; collapsed: number } {
  const { hidden, collapsed } = planStripTiers(
    avail,
    fixed,
    pills.map((pill) => ({ ...pill, least: pill.icon })),
    overflow,
    gap,
  );
  return { hidden, collapsed };
}

/**
 * `planStrip` for pills with a third, narrowest width (a hidden page's pill: full, icon and count,
 * icon and dot; a panel pill's last two are the same). The last pills shown take their narrowest
 * width only once every pill shown has dropped its label, and before any goes into "+N": `tiny` of
 * the last `collapsed`. Port of desktop `plan_strip_tiers`.
 */
export function planStripTiers(
  avail: number,
  fixed: readonly number[],
  pills: readonly { full: number; icon: number; least: number }[],
  overflow: number,
  gap: number,
): { hidden: number; collapsed: number; tiny: number } {
  const n = pills.length;
  const fixedTotal = fixed.reduce((sum, width) => sum + width, 0);
  for (let hidden = 0; hidden <= n; hidden += 1) {
    const visible = n - hidden;
    for (let collapsed = 0; collapsed <= visible; collapsed += 1) {
      const tinyMost = collapsed === visible ? visible : 0;
      for (let tiny = 0; tiny <= tinyMost; tiny += 1) {
        let total = fixedTotal;
        let count = fixed.length;
        for (let index = 0; index < visible; index += 1) {
          const pill = pills[index];
          total +=
            index >= visible - tiny
              ? (pill?.least ?? 0)
              : index >= visible - collapsed
                ? (pill?.icon ?? 0)
                : (pill?.full ?? 0);
          count += 1;
        }
        if (hidden > 0) {
          total += overflow;
          count += 1;
        }
        total += gap * Math.max(0, count - 1);
        if (total <= avail + 0.5) return { hidden, collapsed, tiny };
      }
    }
  }
  return { hidden: n, collapsed: 0, tiny: 0 };
}

const useStyles = themedStyles((P) => ({
  /** Inside the box's border, at its top, with its top corners. */
  strip: {
    overflow: 'hidden',
    borderTopLeftRadius: 21,
    borderTopRightRadius: 21,
    backgroundColor: P.ink(STRIP_TINT),
  },
  bandScroll: {
    height: BAND,
    flexGrow: 0,
  },
  band: {
    height: BAND,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: PILL_GAP,
  },
  /** A pill's 25 (its 1px border included), quieter: a faint fill and no outline. */
  chip: {
    height: 25,
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 5,
    paddingLeft: 8,
    paddingRight: 6,
    borderRadius: 13,
    backgroundColor: P.ink(0.04),
  },
  chipPressed: {
    backgroundColor: P.ink(0.08),
  },
  chipLabel: {
    color: P.cardMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  /** The hairline under the band, the box's border colour. */
  hairline: {
    height: 1,
    backgroundColor: P.composerBorder,
  },
  // The queue chip's sentence under its list (`QueueList.tsx` `waitReason`).
  nativeSwitchReason: { color: P.muted, fontSize: 11.5, paddingHorizontal: 14, paddingTop: 6 },
  armed: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: VISUAL.armedIconGap,
  },
  armedPressed: {
    opacity: 0.8,
  },
  armedLabel: {
    color: P.foreground,
    fontSize: VISUAL.fontSize,
    lineHeight: VISUAL.fontSize * 1.5,
  },
  draftPill: {
    height: 25,
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 5,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: P.ink(0.1),
  },
  draftPillActive: {
    backgroundColor: P.ink(0.1),
    borderColor: P.ink(0.28),
  },
  draftPillPressed: {
    backgroundColor: P.ink(0.14),
  },
  draftPillBusy: {
    opacity: 0.6,
  },
  draftPillLabel: {
    color: P.cardMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  draftPillLabelActive: {
    color: P.foreground,
    fontWeight: '500',
  },
}));
