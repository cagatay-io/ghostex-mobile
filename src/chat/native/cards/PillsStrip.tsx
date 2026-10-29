/**
 * The pill strip along the chat box's top edge (`NativeComposer.tsx` draws it inside the box): a
 * faintly tinted band with a hairline under it and the box's top corners, holding the chat's pills
 * on the right: the armed timers, the ? (a question waits), Resources, Workers, Links, Tasks,
 * Subagents and Background, and the ↓ jump-to-bottom at the left of them while the strip shows.
 * Pills that don't fit scroll sideways and fade at the edge that hides more. With no pill there is
 * no strip; it grows in and shrinks away with the chat box's own ease (`composer-animation.json`).
 * Each pill opens its own sheet (`ChatPills.tsx`). Port of desktop `pills_strip.rs`.
 *
 * CDXC:SessionChat 2026-10-29 SEE-ALSO:
 * The user's words (option E) are on packages/gx-chat-core/src/extras/chat_pills.rs.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, ScrollView, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import type { ChatDocument } from '../../rust/document';
import type { RustChat } from '../../rust/useRustChat';
import type { GhostexSessionLinks } from '../../../contract/mobileSummary';
import { Glyph as ComposerGlyph } from '../composer/icons';
import { sessionLinksChatPill } from '../sessionLinks';
import { useTranscriptBottomStore } from '../transcript/bottomStore';
import { themedStyles, useTranscriptTheme } from '../transcript/theme';
import { HorizontalFade } from '../transcript/verticalFade';
import { IconPill, LinksPill, Pill, PillMenuSheet, QuestionPill } from './ChatPills';
import { VISUAL, type ArmedAction } from './WorkingStrip';

/** The session's links and the Links pill's tap, from the screen that knows the session (`TerminalScreen`). */
export type PillsStripLinks = { links: GhostexSessionLinks | undefined; onOpen: () => void };

/** The strip's band: a pill's 22 with 5 above and below; its hairline under it (desktop `STRIP_HEIGHT`). */
const BAND = 22 + 5 * 2;
const STRIP = BAND + 1;
/** The width of the fade at an edge that hides pills (desktop `PILLS_FADE`). */
const PILLS_FADE = 24;
/** The band's tint over the box's fill (desktop `STRIP_TINT`). */
const STRIP_TINT = 0.035;
/** `packages/gx-chat-core/visual/composer-animation.json`: the chat box's own ease. */
const EASE_MS = 280;
const EASE = Easing.bezier(0.32, 0.72, 0, 1);

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

/** The Links pill goes before the first of these, after Resources and Workers (desktop `links_pill_index`). */
const AFTER_LINKS: ReadonlySet<string> = new Set(['tasks', 'subagents', 'background']);

/** Whether the question pill shows: a question form or page waits (the core's `openQuestions.count`). */
function questionWaiting(document: ChatDocument): boolean {
  return (document.openQuestions?.count ?? 0) > 0;
}

/** Whether the strip shows: a panel pill, the ?, the Links pill or an armed timer calls for it; the ↓ only joins them. */
export function pillsStripShown(
  document: ChatDocument,
  armed: readonly ArmedAction[],
  links: PillsStripLinks | null,
  muted: string,
): boolean {
  return (
    armed.length > 0 ||
    questionWaiting(document) ||
    (document.workingCard?.pills.length ?? 0) > 0 ||
    (links !== null && sessionLinksChatPill(links.links, muted) !== null)
  );
}

export function PillsStrip({
  chat,
  document,
  armed,
  onArmedPress,
  links,
}: {
  chat: RustChat;
  document: ChatDocument;
  armed: readonly ArmedAction[];
  /** Opens Delayed Actions; without it the timers are drawn but not pressable. */
  onArmedPress?: () => void;
  links: PillsStripLinks | null;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const reduceMotion = useReducedMotion();
  const awayFromBottom = useTranscriptBottomStore((store) => store.awayFromBottom);
  const jumpToBottom = useTranscriptBottomStore((store) => store.jumpToBottom);
  const [menu, setMenu] = useState<string | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const shown = pillsStripShown(document, armed, links, P.cardMuted);
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
    const run = Animated.timing(open, { toValue: shown ? 1 : 0, duration: EASE_MS, easing: EASE, useNativeDriver: false });
    run.start(({ finished }) => {
      if (finished && !shown) setDrawn(false);
    });
    return () => run.stop();
  }, [shown, reduceMotion, open]);
  const linksPill = links ? sessionLinksChatPill(links.links, P.cardMuted) : null;
  const card = document.workingCard;
  const pills = (card?.pills ?? [])
    .map((id) => (document.chatPills ?? []).find((pill) => pill.id === id))
    .filter((pill) => pill !== undefined);
  const panelPills = pills.map((pill) => (
    <Pill key={pill.id} pill={pill} open={pill.id === menu} onPress={() => setMenu(pill.id)} />
  ));
  if (links && linksPill !== null) {
    const at = pills.findIndex((pill) => AFTER_LINKS.has(pill.id));
    panelPills.splice(at === -1 ? panelPills.length : at, 0, <LinksPill key="links" pill={linksPill} onPress={links.onOpen} />);
  }
  const questions = document.openQuestions;
  const showJump = awayFromBottom && jumpToBottom !== null;
  return (
    <>
      {drawn ? (
        <Animated.View
          accessibilityRole="toolbar"
          accessibilityLabel="Chat pills"
          style={[styles.strip, { height: open.interpolate({ inputRange: [0, 1], outputRange: [0, STRIP] }), opacity: open }]}
        >
          <View style={styles.band}>
            <PillsScroll>
              {/* The ↓ at the left of the pills, so it appearing moves none of them. */}
              {shown && showJump ? (
                <IconPill glyph="arrow-down" accessibilityLabel="Scroll to bottom" color={P.primary} onPress={() => jumpToBottom?.()} />
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
                  count={questions.count}
                  newest={questions.newest ?? null}
                  accessibilityLabel={questions.accessibilityLabel}
                  onPress={() => chat.dispatch({ type: 'previousQuestion' })}
                />
              ) : null}
              {panelPills}
            </PillsScroll>
          </View>
          <View style={styles.hairline} />
        </Animated.View>
      ) : null}
      <PillMenuSheet chat={chat} document={document} open={menu} onClose={closeMenu} />
    </>
  );
}

/**
 * The pills' scroll: right-aligned while they fit, scrolling sideways when they don't, with a fade
 * into the band's colour at an edge that hides more of them.
 *
 * CDXC:SessionChat 2026-10-28 SEE-ALSO:
 * The user's words (no cut background, no inner shadow) are on desktop `pills_strip_scroll` in
 * apps/desktop/src/app/native_chat/pills_strip.rs.
 */
function PillsScroll({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const [edges, setEdges] = useState({ left: false, right: false });
  const metrics = useRef({ x: 0, width: 0, content: 0 });
  const update = () => {
    const { x, width, content } = metrics.current;
    const next = { left: x > 0.5, right: content - width - x > 0.5 };
    setEdges((was) => (was.left === next.left && was.right === next.right ? was : next));
  };
  // The band's colour over the box's fill, opaque, which the fades ramp into.
  const edge = mixHex(P.composerBackground, P.foreground, STRIP_TINT);
  return (
    <View style={styles.scrollArea}>
      <ScrollView
        horizontal
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsHorizontalScrollIndicator={false}
        alwaysBounceHorizontal={false}
        overScrollMode="never"
        directionalLockEnabled
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={(event) => {
          metrics.current.x = event.nativeEvent.contentOffset.x;
          update();
        }}
        onLayout={(event) => {
          metrics.current.width = event.nativeEvent.layout.width;
          update();
        }}
        onContentSizeChange={(width) => {
          metrics.current.content = width;
          update();
        }}
      >
        <View style={styles.pills}>{children}</View>
      </ScrollView>
      {edges.left ? (
        <HorizontalFade id="strip-fade-left" color={edge} from={1} to={0} style={[styles.fade, styles.fadeLeft]} />
      ) : null}
      {edges.right ? (
        <HorizontalFade id="strip-fade-right" color={edge} from={0} to={1} style={[styles.fade, styles.fadeRight]} />
      ) : null}
    </View>
  );
}

const useStyles = themedStyles((P) => ({
  /** Inside the box's border, at its top, with its top corners. */
  strip: {
    overflow: 'hidden',
    borderTopLeftRadius: 21,
    borderTopRightRadius: 21,
    backgroundColor: P.ink(STRIP_TINT),
  },
  band: {
    height: BAND,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  /** The hairline under the band, the box's border colour. */
  hairline: {
    height: 1,
    backgroundColor: P.composerBorder,
  },
  scrollArea: {
    flex: 1,
    minWidth: 0,
    height: '100%',
  },
  scroll: {
    flexGrow: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  pills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: PILLS_FADE,
  },
  fadeLeft: { left: 0 },
  fadeRight: { right: 0 },
  armed: {
    flexDirection: 'row',
    alignItems: 'center',
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
}));
