/**
 * The card a published HTML page (`ghostex show`) gets in the transcript: a window bar with three
 * dots and the file name, a scaled-down picture of the page fading out at its bottom, then the
 * title, "Live page · file.html", the Answered pill once the page's answers were sent (or a
 * Withdrawn pill once a later block withdrew its questions), and
 * Open. Until the picture exists (the desktop app takes it the first time the page is opened in its
 * floating page window) the window shows a page icon and the file name. A touch screen has no hover, so the
 * desktop's "Open page" label over the picture is left out; the whole card opens the page.
 *
 * CDXC:SessionChat 2026-10-11 SEE-ALSO:
 * The user's decision is on server/src/visual_pages/thumbnail.rs. Desktop and the web build draw the
 * same card in apps/desktop/src/app/native_chat/page_card.rs; the picture comes through the core
 * (packages/gx-chat-core/src/transcript/page_thumbnails.rs) and the measurements are
 * packages/gx-chat-core/visual/page-card.json. Change them together.
 */

import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { useMachinesStore } from '../../../machines/store';
import { useMachineShares, useShareLinksSupported } from '../../../sharing/api';
import { ShareLinkSheet } from '../../../sharing/ShareLinkSheet';
import { useNativeChatUi, useTranscriptEnv, useTranscriptFlags } from './context';
import { Glyph } from './icons';
import { str, type JsonRecord } from './json';
import { answeredColor } from './PageAnswersCard';
import { askColor } from '../cards/askCard';
import { CardMoreMenu, pageMenuRows } from '../cards/CardMoreMenu';
import {
  askedPageThumbnail,
  pageThumbnailKey,
  usePageThumbnailStore,
  type PageThumbnailTheme,
} from './pageThumbnails';
import { QuestionFlashFrame } from './OpenQuestions';
import {
  SINGLE_LINE_CARD,
  SINGLE_LINE_HEADER_HEIGHT,
  SINGLE_LINE_TITLE,
  SingleLinePill,
  SingleLineTile,
  TITLE_ROW_GAP,
  singleLinePressed,
  singleLineShell,
} from './singleLineCard';
import { useDisclosure } from './state';
import { VerticalFade } from './verticalFade';

/** `packages/gx-chat-core/visual/page-card.json`. */
const VISUAL = {
  radius: 14,
  barHeight: 34,
  dotSize: 9,
  dotGap: 6,
  previewHeight: 148,
  fadeHeight: 60,
  footerPaddingX: 14,
  footerPaddingY: 11,
  titleSize: 14,
  detailSize: 12,
  thumbnailWidth: 800,
  thumbnailHeight: 500,
};
/**
 * Phone preview max height: keeps the original compact `148pt` card height (`page-card.json` /
 * desktop `62c7130a0`) while shrinking smoothly at the thumbnail's 1.6 aspect ratio on narrow
 * split panes with no blank bottom gap.
 */
const PHONE_PREVIEW_MAX_HEIGHT = VISUAL.previewHeight;
/** Subtle bottom fade height for the cropped preview edge. */
const PHONE_FADE_HEIGHT = 28;

/** The card, outlined for a moment when the Previous question pill or a Q-tag link lands on it. */
export function PageCard({
  answer,
  onLayout,
}: {
  answer: JsonRecord | null;
  onLayout: (event: LayoutChangeEvent) => void;
}) {
  const { theme } = useTranscriptEnv();
  return (
    <QuestionFlashFrame target={str(answer, 'pageId')} light={theme.light}>
      <PageCardBody answer={answer} onLayout={onLayout} />
    </QuestionFlashFrame>
  );
}

function PageCardBody({
  answer,
  onLayout,
}: {
  answer: JsonRecord | null;
  onLayout: (event: LayoutChangeEvent) => void;
}) {
  const { theme, dispatch, collapsePageCards } = useTranscriptEnv();
  const { disclosures, homeMachineId } = useNativeChatUi();
  const machine = useMachinesStore((state) =>
    homeMachineId ? state.machines.find((candidate) => candidate.id === homeMachineId) : undefined,
  );
  const canShare = useShareLinksSupported(machine);
  const { pages: sharedPages } = useMachineShares(homeMachineId);
  const [shareOpen, setShareOpen] = useState(false);
  const flags = useTranscriptFlags();
  const url = str(answer, 'url');
  const file = str(answer, 'file');
  const title = str(answer, 'title') || 'Live page';
  const pageId = str(answer, 'pageId');
  const answered = pageId.length > 0 && flags.answeredPages.has(pageId);
  const openQuestions = pageId.length > 0 ? (flags.pageOpenQuestions[pageId] ?? 0) : 0;
  const collapsible = collapsePageCards === true;
  const cardKey = pageId.length > 0 ? pageId : url.length > 0 ? url : title;
  const [expanded, toggleExpanded] = useDisclosure(disclosures, `page-card:${cardKey}`, false);
  const collapsed = collapsible && !expanded;
  // Its questions a later block withdrew, some or all (desktop `page_card.rs`): the card says so
  // where an answered page says Answered.
  const withdrawnEntry = !answered && pageId.length > 0 ? flags.withdrawnPages[pageId] : undefined;
  // One the reader removed without answering says Canceled in the same place (gx-chat-core `questions/later.rs`).
  const canceled = !answered && flags.canceledQuestions.has(pageId);
  // A page that waited only to be looked at and was cleared from the dock (Mark all read, Dismiss)
  // reads Seen (gx-chat-core `questions/later.rs` `mark_seen`, desktop `page_card.rs`).
  const seenOnly = answer?.awaitsSeen === true && !Array.isArray(answer?.questions);
  // A page its agent retired is on that removed list too, but reads Replaced (`replaced`).
  const withdrawn = canceled && withdrawnEntry?.replaced !== true
    ? seenOnly
      ? { label: 'Seen', hint: 'Seen, no answer needed' }
      : { label: 'Canceled', hint: 'Canceled, no answer needed' }
    : withdrawnEntry === undefined
      ? null
      : // A newer `ghostex show` of the same file replaced it (gx-chat-core `Asker::replaced`).
        withdrawnEntry.replaced === true
        ? { label: 'Replaced', hint: 'Replaced by a newer version of this page' }
        : withdrawnEntry.tags.length >= withdrawnEntry.total
        ? { label: 'Withdrawn', hint: 'Withdrawn, no answer needed' }
        : {
            label: `${withdrawnEntry.tags.length} of ${withdrawnEntry.total} withdrawn`,
            hint: `${withdrawnEntry.tags.join(', ')}: withdrawn, no answer needed`,
          };
  // A page still waiting offers For later; one put off says so and offers Back to unanswered
  // (gx-chat-core `questions/later.rs`, desktop `page_card.rs`).
  const later = !answered && flags.laterQuestions.has(pageId);
  const waiting = later || (!answered && flags.unansweredQuestions.has(pageId));
  const thumbnailTheme: PageThumbnailTheme = theme.light ? 'light' : 'dark';
  const entry = usePageThumbnailStore((state) =>
    pageId.length > 0 ? state.pages[pageThumbnailKey(pageId, answered, thumbnailTheme)] : undefined,
  );
  // While a post-answer refresh is loading, keep the unanswered same-theme picture up so the card
  // does not flash back to its placeholder.
  const unansweredEntry = usePageThumbnailStore((state) =>
    answered && pageId.length > 0 ? state.pages[pageThumbnailKey(pageId, false, thumbnailTheme)] : undefined,
  );

  // Asked once per `(pageId, answered, theme)` (an answered page is pictured again, and switching
  // dark/light fetches the matching themed picture), not per mount.
  useEffect(() => {
    if (!collapsed && pageId.length > 0 && askedPageThumbnail(pageId, answered, thumbnailTheme)) {
      dispatch({ type: 'loadPageThumbnail', pageId, theme: thumbnailTheme });
    }
  }, [answered, collapsed, dispatch, pageId, thumbnailTheme]);
  // While the picture is on its way, ask again when the core says to; a card that left the list
  // asks nothing until it is drawn again.
  const retryInMs = entry !== undefined && !entry.settled ? entry.retryInMs : null;
  const revision = entry?.revision ?? 0;
  useEffect(() => {
    if (collapsed || pageId.length === 0 || retryInMs === null) return undefined;
    const timer = setTimeout(
      () => dispatch({ type: 'loadPageThumbnail', pageId, theme: thumbnailTheme }),
      retryInMs,
    );
    return () => clearTimeout(timer);
  }, [collapsed, dispatch, pageId, retryInMs, revision, thumbnailTheme]);

  // Answered, with the reader's answers card right under it, which names the page and opens it
  // again (Q2995, desktop `answers_right_below`).
  if (answered && flags.answersBelow.has(pageId)) return null;
  const open = () => dispatch({ type: 'openMarkdownLink', href: url, external: false });
  if (collapsed) {
    const countLabel = openQuestions === 1 ? '1 open question' : `${openQuestions} open questions`;
    return (
      <View style={singleLineShell(theme)} onLayout={onLayout}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: false }}
          accessibilityLabel={`Expand page ${title}`}
          onPress={toggleExpanded}
          style={({ pressed }) => [styles.compactHead, pressed ? singleLinePressed(theme) : null]}
        >
          <SingleLineTile
            glyph="file-type-html"
            badge={openQuestions > 0 ? 'ask' : answered ? 'check' : undefined}
          />
          <Text numberOfLines={1} style={[SINGLE_LINE_TITLE, styles.compactTitle, { color: theme.foreground }]}>
            {title}
          </Text>
          {openQuestions > 0 ? <SingleLinePill label={countLabel} color={askColor(theme.light)} /> : null}
          <Pressable
            style={({ pressed }) => [styles.open, { backgroundColor: theme.controlPrimary }, pressed && { opacity: 0.8 }]}
            onPress={(event) => {
              event.stopPropagation();
              open();
            }}
            accessibilityRole="button"
            accessibilityLabel="Open"
          >
            <Text style={[styles.openText, { color: theme.background }]}>Open</Text>
            <Glyph name="arrow-up-right" size={13} color={theme.background} />
          </Pressable>
        </Pressable>
      </View>
    );
  }
  const activeThumbnail = entry?.png ? entry : unansweredEntry;
  const picture = activeThumbnail?.png ?? null;
  const transparent = activeThumbnail?.transparent === true;
  // Mirrors desktop `page_card.rs`: card shell/footer uses `cardRow` while the preview canvas uses
  // `background` so transparent 2x themed thumbnails composite directly onto the native dark/light
  // chat surface (no muddy grey box), and opaque fallbacks fill the same box edge-to-edge.
  const cardSurface = theme.cardRow;
  const previewSurface = transparent ? theme.background : cardSurface;
  const detail = file.length > 0 ? `Live page · ${file}` : 'Live page';
  const good = answeredColor(theme.light);
  const barContent = (
    <>
      <View style={styles.dots}>
        {[0, 1, 2].map((index) => (
          <View key={index} style={[styles.dot, { backgroundColor: theme.muted, opacity: 0.3 }]} />
        ))}
      </View>
      <Text numberOfLines={1} style={[styles.barLabel, { color: theme.muted }]}>
        {file.length > 0 ? file : title}
      </Text>
      {/* Balances the dots so the name sits in the middle of the bar, and holds the collapse glyph in Summary view. */}
      <View style={styles.dotsBalance}>
        {collapsible ? <Glyph name="chevron-up" size={14} color={theme.muted} /> : null}
      </View>
    </>
  );
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: cardSurface, borderColor: pressed ? theme.muted : theme.border },
      ]}
      onPress={open}
      accessibilityRole="link"
      accessibilityLabel={`Open page ${title}`}
      onLayout={onLayout}
    >
      {collapsible ? (
        <Pressable
          style={({ pressed }) => [
            styles.bar,
            { backgroundColor: theme.cardPanel, borderBottomColor: theme.border },
            pressed ? singleLinePressed(theme) : null,
          ]}
          onPress={(event) => {
            event.stopPropagation();
            toggleExpanded();
          }}
          accessibilityRole="button"
          accessibilityState={{ expanded: true }}
          accessibilityLabel="Collapse page preview"
        >
          {barContent}
        </Pressable>
      ) : (
        <View style={[styles.bar, { backgroundColor: theme.cardPanel, borderBottomColor: theme.border }]}>
          {barContent}
        </View>
      )}
      <View
        style={[
          styles.preview,
          picture !== null ? styles.previewPicture : styles.previewPlaceholder,
          { backgroundColor: picture !== null ? previewSurface : theme.background },
        ]}
      >
        {picture !== null ? (
          <View style={styles.pictureFrame}>
            <Image
              source={{ uri: `data:image/png;base64,${picture}` }}
              style={styles.picture}
              resizeMode="stretch"
              accessibilityIgnoresInvertColors
            />
          </View>
        ) : (
          <View style={styles.placeholder}>
            <Glyph name="file-code" size={22} color={theme.muted} />
            <Text numberOfLines={1} style={[styles.placeholderLabel, { color: theme.muted }]}>
              {file.length > 0 ? file : title}
            </Text>
          </View>
        )}
        {picture !== null ? (
          <VerticalFade id="page-card-fade" color={cardSurface} from={0} to={1} style={styles.fade} />
        ) : null}
      </View>
      <View style={styles.footer}>
        <View style={styles.text}>
          <Text numberOfLines={1} style={[styles.title, { color: theme.foreground }]}>
            {title}
          </Text>
          <Text numberOfLines={1} style={[styles.detail, { color: theme.muted }]}>
            {detail}
          </Text>
        </View>
        {withdrawn !== null ? (
          <View
            style={[styles.answered, { backgroundColor: `${theme.muted}24` }]}
            accessibilityRole="text"
            accessibilityLabel={withdrawn.hint}
          >
            <Text style={[styles.answeredText, { color: theme.muted }]}>{withdrawn.label}</Text>
          </View>
        ) : null}
        {answered ? (
          <View style={[styles.answered, { backgroundColor: `${good}24` }]}>
            <Glyph name="check" size={11} color={good} />
            <Text style={[styles.answeredText, { color: good }]}>Answered</Text>
          </View>
        ) : null}
        {canShare && pageId.length > 0 && sharedPages.has(pageId) ? (
          <View style={[styles.answered, { backgroundColor: `${good}24` }]}>
            <Glyph name="world" size={11} color={good} />
            <Text style={[styles.answeredText, { color: good }]}>Shared</Text>
          </View>
        ) : null}
        <Pressable
          style={({ pressed }) => [styles.open, { backgroundColor: theme.controlPrimary }, pressed && { opacity: 0.8 }]}
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel="Open"
        >
          <Text style={[styles.openText, { color: theme.background }]}>Open</Text>
          <Glyph name="arrow-up-right" size={13} color={theme.background} />
        </Pressable>
      </View>
      {waiting || pageId.length > 0 ? (
        <View style={styles.laterRow}>
          {later ? (
            <View style={[styles.answered, { backgroundColor: `${theme.muted}24` }]}>
              <Glyph name="clock" size={11} color={theme.muted} />
              <Text style={[styles.answeredText, { color: theme.muted }]}>For later</Text>
            </View>
          ) : null}
          {waiting ? (
            <Pressable
              style={({ pressed }) => [
                styles.later,
                { backgroundColor: `${theme.foreground}${pressed ? '26' : '1a'}` },
              ]}
              onPress={() => dispatch({ type: 'questionForLater', id: pageId, later: !later })}
              accessibilityRole="button"
              accessibilityLabel={later ? 'Back to unanswered' : 'For later'}
              hitSlop={4}
            >
              <Text style={[styles.laterText, { color: theme.foreground }]}>
                {later ? 'Back to unanswered' : 'For later'}
              </Text>
            </Pressable>
          ) : null}
          {pageId.length > 0 ? (
            // This page: Snooze while it waits, Star, Copy reference and Reference in chat; Share:
            // optional Share link, Export page and Import answers (`cards/CardMoreMenu.tsx` `pageMenuRows`).
            <CardMoreMenu
              rows={pageMenuRows(pageId, {
                snooze: waiting,
                starred: flags.starredPages.has(pageId),
                shared: canShare ? sharedPages.has(pageId) : null,
                title,
                url,
              })}
              dispatch={dispatch}
              color={theme.foreground}
              onShare={canShare ? () => setShareOpen(true) : undefined}
            />
          ) : null}
        </View>
      ) : null}
      {canShare && pageId.length > 0 ? (
        <ShareLinkSheet
          visible={shareOpen}
          machine={machine}
          target={{ kind: 'page', pageId, title }}
          onClose={() => setShareOpen(false)}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: VISUAL.radius, overflow: 'hidden' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: VISUAL.barHeight,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  dots: { flexDirection: 'row', gap: VISUAL.dotGap },
  dot: { width: VISUAL.dotSize, height: VISUAL.dotSize, borderRadius: VISUAL.dotSize / 2 },
  dotsBalance: { width: VISUAL.dotSize * 3 + VISUAL.dotGap * 2, alignItems: 'flex-end', justifyContent: 'center' },
  compactHead: {
    height: SINGLE_LINE_HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: TITLE_ROW_GAP,
    paddingHorizontal: SINGLE_LINE_CARD.paddingX,
  },
  compactTitle: { flex: 1, minWidth: 0 },
  barLabel: { flex: 1, minWidth: 0, textAlign: 'center', fontSize: 11.5 },
  preview: { width: '100%', overflow: 'hidden' },
  previewPicture: { maxHeight: PHONE_PREVIEW_MAX_HEIGHT },
  previewPlaceholder: { height: VISUAL.previewHeight, alignItems: 'center', justifyContent: 'center' },
  // Full width at the stored 1.6 aspect ratio, clipped cleanly at the bottom: the top of the page
  // is what it opens on, with no blank gap on narrow panes.
  pictureFrame: {
    width: '100%',
    aspectRatio: VISUAL.thumbnailWidth / VISUAL.thumbnailHeight,
    flexShrink: 0,
  },
  picture: { width: '100%', height: '100%' },
  placeholder: { alignItems: 'center', gap: 6, maxWidth: '80%' },
  placeholderLabel: { fontSize: 11.5 },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: PHONE_FADE_HEIGHT },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: VISUAL.footerPaddingX,
    paddingVertical: VISUAL.footerPaddingY,
  },
  text: { flex: 1, minWidth: 0 },
  title: { fontSize: VISUAL.titleSize, fontWeight: '600' },
  detail: { fontSize: VISUAL.detailSize },
  answered: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  answeredText: { fontSize: 11, fontWeight: '600' },
  open: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 28, paddingHorizontal: 11, borderRadius: 8 },
  openText: { fontSize: 12.5, fontWeight: '600' },
  /** For later / Back to unanswered and the ⋯ menu, under the footer: the phone's card is too narrow for more buttons beside Open. */
  laterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: VISUAL.footerPaddingX,
    paddingBottom: VISUAL.footerPaddingY,
  },
  later: { height: 28, paddingHorizontal: 11, borderRadius: 8, justifyContent: 'center' },
  laterText: { fontSize: 12.5, fontWeight: '500' },
});
