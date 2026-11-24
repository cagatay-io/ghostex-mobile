/**
 * What the transcript area shows while it has no rows. Port of desktop `new_session_welcome.rs`
 * and `transcript_reveal.rs`:
 *
 * - `loadingStage` set (or no status yet): the loading hold, blank; the skeleton rows while
 *   Ghostex is not answering (`transcriptSkeleton`, no text: the core retries every 2 s), or the
 *   core's `loadingNotice` (a read running long) and its Try now button;
 * - `newSessionWelcome`: the agent mark and "What should we build with X?";
 * - a ready transcript with no rows: nothing (React's empty message list);
 * - otherwise `emptyState`'s title and detail, with its retry button when the chat errored.
 *
 * The transcript screen renders this in place of its list when `items` is empty.
 */

import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';

import type { ChatDocument } from '../../rust/document';
import type { RustChat } from '../../rust/useRustChat';
import { AgentMark } from './agentMark';
import { chatLookOf } from '../transcript/context';
import { themedStyles } from '../transcript/theme';
import { ChatButton } from './primitives';
import { ChiefWelcome } from './ChiefWelcome';
import { useChatShown } from '../chatShown';

/**
 * Starter prompts shown on a fresh Native Chat welcome so Day-0 users can fill the composer in one tap.
 * Mirrors desktop `STARTER_PROMPTS` in `apps/desktop/src/app/native_chat/new_session_welcome.rs`.
 */
const STARTER_PROMPTS: readonly { id: string; label: string; prompt: string }[] = [
  {
    id: 'starter-overview',
    label: 'Summarize this codebase',
    prompt: 'Give me a quick architecture overview of this project and where the main entry points live.',
  },
  {
    id: 'starter-changes',
    label: 'Review recent changes',
    prompt: 'Review the recent git changes in this repo and flag any bugs or edge cases.',
  },
  {
    id: 'starter-bug',
    label: 'Find and fix a bug',
    prompt: 'Help me investigate and fix a bug in this codebase. First, tell me how tests are run here.',
  },
];

const PROMPT_QUEUE_HINT = 'Keep typing while your agent works. Send to queue follow-up prompts.';

export function EmptyTranscript({ chat, document }: { chat: RustChat; document: ChatDocument | null }) {
  const styles = useStyles();
  const retry = () => chat.dispatch({ type: 'retry' });
  const stage =
    document === null ? 'indicator' : (document.loadingStage ?? (document.status == null ? 'indicator' : null));
  if (document === null || stage !== null) {
    if (document?.transcriptSkeleton === true) return <TranscriptSkeleton document={document} />;
    const notice = document?.loadingNotice ?? null;
    return (
      <View style={styles.region}>
        {notice !== null ? (
          <View accessibilityRole="text" accessibilityLabel={notice.title} style={styles.notice}>
            <Text style={styles.muted}>{notice.title}</Text>
            {notice.detail ? <Text style={styles.noticeDetail}>{notice.detail}</Text> : null}
            <View style={styles.noticeAction}>
              <ChatButton label={notice.action} onPress={retry} />
            </View>
          </View>
        ) : null}
      </View>
    );
  }
  // Ask Ghostex AI's own card in place of the mark and the headline (ChiefWelcome.tsx).
  if (document.chiefWelcome !== null && document.chiefWelcome !== undefined) {
    return <ChiefWelcome chat={chat} card={document.chiefWelcome} />;
  }
  const welcome = document.newSessionWelcome;
  if (welcome !== null && welcome !== undefined) {
    const showStarters = welcome.showTitle !== false;
    return (
      <View style={[styles.region, styles.welcome]}>
        <View style={styles.markCard}>
          <AgentMark icon={welcome.icon} size={28} />
        </View>
        {showStarters ? (
          <>
            {/* One line at every width, shrunk to fit a narrow phone (CDXC:SessionChat 2026-11-20 in gx-chat-core
                `extras/welcome.rs`: "make the text there not wrap"). */}
            <Text style={styles.welcomeTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {(welcome.title || 'What should we work on?').replace(/\n/g, ' ')}
            </Text>
            <View style={styles.starterBlock}>
              <View style={styles.starterChips}>
                {STARTER_PROMPTS.map((starter) => (
                  <Pressable
                    key={starter.id}
                    accessibilityRole="button"
                    accessibilityLabel={starter.label}
                    hitSlop={4}
                    onPress={() => chat.composer?.replace(starter.prompt)}
                    style={({ pressed }) => [styles.starterChip, pressed ? styles.starterChipPressed : null]}
                  >
                    <Text style={styles.starterChipText} numberOfLines={1}>
                      {starter.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.queueHint}>{PROMPT_QUEUE_HINT}</Text>
            </View>
          </>
        ) : null}
      </View>
    );
  }
  if (document.view?.kind === 'ready') return <View style={styles.region} />;
  return (
    <View style={[styles.region, styles.empty]}>
      <Text style={styles.emptyTitle}>{document.emptyState?.title ?? ''}</Text>
      <Text style={styles.muted}>{document.emptyState?.detail ?? ''}</Text>
      {document.status === 'error' ? (
        <ChatButton label={document.emptyState?.action ?? 'Try again'} onPress={retry} />
      ) : null}
    </View>
  );
}

/**
 * `packages/gx-chat-core/visual/transcript-skeleton.json`, the rows the desktop's loading hold
 * draws while Ghostex is not answering (`transcript_reveal.rs`; CDXC:SessionChat 2026-10-08 in
 * `packages/gx-chat-core/src/session/constants.rs`).
 */
const SKELETON = {
  topPadding: 32,
  rowGap: 32,
  barHeight: 10,
  barGap: 12,
  bubbleHeight: 60,
  bubbleRadius: 16,
  tint: 0.12,
  pulseMs: 1400,
  pulseMinOpacity: 0.5,
  rows: [
    { user: true, widths: [0.42] },
    { user: false, widths: [0.94, 0.88, 0.97, 0.62, 0.91, 0.84, 0.96, 0.9, 0.78, 0.93, 0.5] },
    { user: true, widths: [0.3] },
    { user: false, widths: [0.9, 0.96, 0.8, 0.92, 0.45, 0.95, 0.87, 0.98, 0.83, 0.91, 0.76, 0.94, 0.89, 0.58] },
    { user: true, widths: [0.52] },
    { user: false, widths: [0.86, 0.7, 0.93, 0.97, 0.82, 0.9, 0.88, 0.64] },
  ],
} as const;

/**
 * The skeleton follows the chat look the way your messages do (desktop `transcript_skeleton`): Left
 * aligned puts its bubbles on the left, Band draws them across the column, and Compact halves the
 * gap between its rows. Before the first read carries `chatLook` it draws at Default.
 */
function TranscriptSkeleton({ document }: { document: ChatDocument }) {
  const styles = useStyles();
  const look = chatLookOf(document);
  const bubbleLook =
    look.userStyle === 'band'
      ? styles.skeletonBand
      : look.messageLayout === 'left'
        ? styles.skeletonBubbleLeft
        : null;
  const pulse = useRef(new Animated.Value(1)).current;
  // Only while the chat is on screen (`chatShown.ts`).
  const shown = useChatShown();
  useEffect(() => {
    if (!shown) return undefined;
    const half = SKELETON.pulseMs / 2;
    const easing = Easing.inOut(Easing.quad);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: SKELETON.pulseMinOpacity, duration: half, easing, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: half, easing, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, shown]);
  return (
    <Animated.View
      accessibilityLabel="Loading chat…"
      style={[styles.skeleton, look.spacing === 'compact' && styles.skeletonCompact, { opacity: pulse }]}
    >
      {SKELETON.rows.map((row, index) =>
        row.user ? (
          <View key={index} style={[styles.skeletonBubble, { width: `${row.widths[0] * 100}%` }, bubbleLook]} />
        ) : (
          <View key={index} style={styles.skeletonLines}>
            {row.widths.map((width, line) => (
              <View key={line} style={[styles.skeletonBar, { width: `${width * 100}%` }]} />
            ))}
          </View>
        ),
      )}
    </Animated.View>
  );
}

const useStyles = themedStyles((P) => ({
  region: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  welcome: {
    gap: 14,
  },
  markCard: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: P.border,
    backgroundColor: P.markCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeTitle: {
    color: P.foreground,
    fontSize: 22,
    lineHeight: 27.5,
    fontWeight: '600',
    textAlign: 'center',
  },
  starterBlock: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  starterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  starterChip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: P.ink(P.light ? 0.09 : 0.1),
    backgroundColor: P.ink(P.light ? 0.04 : 0.05),
  },
  starterChipPressed: {
    backgroundColor: P.ink(P.light ? 0.08 : 0.1),
  },
  starterChipText: {
    color: P.foreground,
    opacity: 0.9,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '500',
  },
  queueHint: {
    maxWidth: 320,
    color: P.muted,
    opacity: 0.85,
    fontSize: 12.5,
    lineHeight: 17.5,
    textAlign: 'center',
  },
  empty: {
    gap: 14,
    paddingBottom: 24,
  },
  emptyTitle: {
    color: P.primary,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },
  muted: {
    color: P.muted,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },
  notice: {
    maxWidth: '100%',
    alignItems: 'center',
    gap: 6,
  },
  noticeDetail: {
    color: P.muted,
    opacity: 0.75,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },
  noticeAction: {
    marginTop: 8,
  },
  skeleton: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingTop: SKELETON.topPadding,
    gap: SKELETON.rowGap,
  },
  skeletonBubble: {
    alignSelf: 'flex-end',
    height: SKELETON.bubbleHeight,
    borderRadius: SKELETON.bubbleRadius,
    backgroundColor: P.ink(SKELETON.tint),
  },
  skeletonCompact: {
    gap: SKELETON.rowGap / 2,
  },
  skeletonBubbleLeft: {
    alignSelf: 'flex-start',
  },
  skeletonBand: {
    alignSelf: 'stretch',
    width: '100%',
    borderRadius: 8,
  },
  skeletonLines: {
    gap: SKELETON.barGap,
  },
  skeletonBar: {
    height: SKELETON.barHeight,
    borderRadius: SKELETON.barHeight / 2,
    backgroundColor: P.ink(SKELETON.tint),
  },
}));
