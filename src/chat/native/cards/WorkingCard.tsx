/**
 * The working card at the transcript's end (`workingCard`, decided in
 * packages/gx-chat-core/src/extras/working_card.rs). Port of desktop `working_card.rs`: one line with
 * the spark, the label and the pills, which a tap opens to the running tool's call and a section per
 * pill. It is drawn over the transcript's bottom edge; the transcript keeps its height free below the
 * newest row (`workingLaneStore.ts`), so at the bottom it sits after the last message and scrolled
 * up it stays where it is: one card in both places, and nothing moves.
 *
 * The label stays on one line, cut with an ellipsis at its end so the pills keep their full width;
 * pressing and holding the card shows the whole label under the line, as hovering does on the
 * desktop. The armed Delayed Send / Close After Done timers come from the app shell, not the
 * document (desktop's `armed_actions`); a tap opens Delayed Actions.
 */

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import type { ChatDocument, WorkingCard as WorkingCardValue } from '../../rust/document';
import type { RustChat } from '../../rust/useRustChat';
import { Glyph as ComposerGlyph } from '../composer/icons';
import { useTranscriptBottomStore } from '../transcript/bottomStore';
import { useWorkingLaneStore } from '../transcript/workingLaneStore';
import { MONO_FONT, themedStyles, useTranscriptTheme } from '../transcript/theme';
import { AgentFleetMenu, AgentTasksMenu, CoordinatorThreadsMenu } from './AgentPanels';
import { IconPill, Pill, QuestionPill } from './ChatPills';
import { Glyph } from './icons';
import { isTrue, num, obj, str } from './json';
import { PulseDot, Spinner } from './primitives';
import { BackgroundTasksMenu, ProgressTrack, VISUAL, WorkingSpark, type ArmedAction } from './WorkingStrip';

/** The transcript's end padding under its newest row (`Transcript.tsx` `END_PADDING`). */
const LANE_BOTTOM = 16;
/** The transcript rows' column (`Transcript.tsx` `ROW_MAX_WIDTH`). */
const ROW_MAX_WIDTH = 768;
const HEADER_PAD_Y = 6;

const SECTION_TITLES: Record<string, string> = {
  threads: 'Threads',
  tasks: 'Tasks',
  subagents: 'Subagents',
  background: 'Background tasks',
};

export function WorkingCard({
  chat,
  document,
  armed,
  onArmedPress,
}: {
  chat: RustChat;
  document: ChatDocument;
  armed: readonly ArmedAction[];
  /** Opens Delayed Actions; without it the timers are drawn but not pressable. */
  onArmedPress?: () => void;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const awayFromBottom = useTranscriptBottomStore((store) => store.awayFromBottom);
  const jumpToBottom = useTranscriptBottomStore((store) => store.jumpToBottom);
  const [held, setHeld] = useState(false);
  const card = document.workingCard;
  const visible = card?.visible === true || armed.length > 0;
  const showJump = awayFromBottom && jumpToBottom !== null;
  const jump = showJump ? (
    <IconPill glyph='arrow-down' accessibilityLabel='Scroll to bottom' color={P.primary} onPress={() => jumpToBottom?.()} />
  ) : null;
  const shown = visible && card !== undefined;
  useEffect(() => {
    if (!shown) useWorkingLaneStore.setState({ height: 0 });
  }, [shown]);
  useEffect(() => () => useWorkingLaneStore.setState({ height: 0 }), []);
  if (!shown || card === undefined) {
    return jump !== null ? (
      <View pointerEvents='box-none' style={styles.layer}>
        <View pointerEvents='box-none' style={[styles.column, styles.lone]}>
          {jump}
        </View>
      </View>
    ) : null;
  }
  const open = card.expandable && card.open;
  const toggle = () => chat.dispatch({ type: 'toggleWorkingCard', open: !open });
  const questions = document.openQuestions;
  const question = questions !== undefined && questions !== null && questions.count > 0 ? questions : null;
  const pills = card.sections
    .map((id) => (document.chatPills ?? []).find((pill) => pill.id === id))
    .filter((pill) => pill !== undefined);
  const label = card.label;
  return (
    <View pointerEvents='box-none' style={styles.layer}>
      <View pointerEvents='box-none' style={styles.column}>
      <Animated.View
        layout={LinearTransition.duration(200)}
        onLayout={(event) => {
          const height = event.nativeEvent.layout.height;
          if (Math.abs(useWorkingLaneStore.getState().height - height) > 0.5) useWorkingLaneStore.setState({ height });
        }}
        accessibilityRole='summary'
        accessibilityLabel={card.ariaLabel}
        style={styles.card}
      >
        <Pressable
          disabled={!card.expandable && label === null}
          onPress={card.expandable ? toggle : undefined}
          onLongPress={label !== null ? () => setHeld(true) : undefined}
          onPressOut={() => setHeld(false)}
          accessibilityRole='button'
          accessibilityState={{ expanded: open }}
          accessibilityHint={card.expandable ? 'Opens what the agent is doing' : undefined}
          style={({ pressed }) => [styles.header, pressed && card.expandable && styles.headerPressed]}
        >
          <Lead card={card} />
          <View style={styles.labelSlot}>
            {label !== null ? (
              <Text
                style={card.labelKind === 'tool' || card.labelKind === 'activity' ? styles.labelStrong : styles.label}
                numberOfLines={1}
                ellipsizeMode='tail'
              >
                {label}
              </Text>
            ) : null}
            {card.labelKind === 'activity' ? <ActivityTrailing activity={obj(card.activity)} /> : null}
          </View>
          {/* Right to left from the card's edge: panel pills, question, timers, then scroll-to-bottom
              leftmost, so one appearing moves none of the others. */}
          <View style={styles.pills}>
            {jump}
            {armed.map((action) => (
              <Pressable
                key={action.id}
                disabled={onArmedPress === undefined}
                onPress={onArmedPress}
                accessibilityRole='button'
                accessibilityLabel={`${action.label}. Manage delayed actions`}
                hitSlop={6}
                style={({ pressed }) => [styles.armed, pressed ? styles.armedPressed : null]}
              >
                <ComposerGlyph
                  name='clock'
                  size={VISUAL.sparkSize}
                  color={action.id === 'delayedSend' ? VISUAL.delayedSendColor : VISUAL.closeAfterDoneColor}
                />
                <Text style={styles.armedLabel} numberOfLines={1}>
                  {action.label}
                </Text>
              </Pressable>
            ))}
            {question !== null ? (
              <QuestionPill
                count={question.count}
                newest={question.newest ?? null}
                accessibilityLabel={question.accessibilityLabel}
                onPress={() => chat.dispatch({ type: 'previousQuestion' })}
              />
            ) : null}
            {pills.map((pill) => (
              <Pill key={pill.id} pill={pill} />
            ))}
          </View>
        </Pressable>
        {held && label !== null ? <Text style={styles.fullLabel}>{label}</Text> : null}
        {open ? (
          <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
            <CardBody chat={chat} document={document} card={card} />
          </Animated.View>
        ) : null}
      </Animated.View>
      </View>
    </View>
  );
}

function Lead({ card }: { card: WorkingCardValue }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  if (card.labelKind === null) return null;
  if (card.labelKind === 'activity') {
    return (
      <View style={styles.sparkBox}>
        {isTrue(obj(card.activity), 'shellsRunning') ? (
          <Spinner size={14} color={P.controlPrimary} />
        ) : (
          <PulseDot size={6} color={P.controlPrimary} active />
        )}
      </View>
    );
  }
  if (card.labelKind === 'worked') {
    return (
      <View style={styles.sparkBox}>
        <Glyph name='check' size={VISUAL.sparkSize} color={P.muted} />
      </View>
    );
  }
  return card.working ? <WorkingSpark /> : null;
}

/** A live activity's progress track, clock, tokens and percent after its label (compaction). */
function ActivityTrailing({ activity }: { activity: Record<string, unknown> | null }) {
  const styles = useStyles();
  if (activity === null) return null;
  const percent = num(activity, 'percent');
  const indeterminate = isTrue(activity, 'indeterminate');
  const elapsed = str(activity, 'elapsedLabel');
  const tokens = str(activity, 'tokens');
  return (
    <>
      {percent !== null || indeterminate ? (
        <View style={styles.track}>
          <ProgressTrack percent={percent} />
        </View>
      ) : null}
      {elapsed.length > 0 ? <Text style={styles.numbers}>{elapsed}</Text> : null}
      {tokens.length > 0 ? <Text style={styles.numbers}>{tokens}</Text> : null}
      {percent !== null ? <Text style={styles.numbers}>{`${percent}%`}</Text> : null}
    </>
  );
}

/** The open card: the running tool's call, then one section per pill with its rows. */
function CardBody({ chat, document, card }: { chat: RustChat; document: ChatDocument; card: WorkingCardValue }) {
  const styles = useStyles();
  const tool = obj(card.tool);
  const close = () => chat.dispatch({ type: 'toggleWorkingCard', open: false });
  return (
    <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} nestedScrollEnabled>
      {tool !== null ? (
        <View style={styles.section}>
          <SectionTitle title={str(tool, 'title')} meta={str(tool, 'label')} />
          <ScrollView nestedScrollEnabled style={styles.detail}>
            <Text selectable style={styles.detailText}>
              {str(tool, 'detail')}
            </Text>
          </ScrollView>
        </View>
      ) : null}
      {card.sections.map((id) => (
        <View key={id} style={styles.section}>
          <SectionTitle title={SECTION_TITLES[id] ?? id} meta='' />
          {id === 'threads' ? (
            <CoordinatorThreadsMenu chat={chat} document={document} onDone={close} />
          ) : id === 'tasks' ? (
            <AgentTasksMenu chat={chat} document={document} />
          ) : id === 'subagents' ? (
            <AgentFleetMenu chat={chat} document={document} onDone={close} />
          ) : id === 'background' && obj(document.backgroundTasksPanel) !== null ? (
            <BackgroundTasksMenu tasks={obj(document.backgroundTasksPanel)!} />
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

function SectionTitle({ title, meta }: { title: string; meta: string }) {
  const styles = useStyles();
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {meta.length > 0 ? (
        <Text style={styles.sectionMeta} numberOfLines={1}>
          {meta}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = themedStyles((P) => ({
  /** Over the transcript's bottom edge, in the rows' column. */
  layer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: LANE_BOTTOM,
    alignItems: 'center',
  },
  column: {
    width: '100%',
    maxWidth: ROW_MAX_WIDTH,
    paddingHorizontal: 16,
  },
  /** Scroll-to-bottom alone, at the card's right end where the pills sit. */
  lone: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingRight: 16 + 10,
  },
  card: {
    borderWidth: 1,
    borderColor: P.inputBorder,
    borderRadius: 12,
    backgroundColor: P.cardPanel,
    overflow: 'hidden',
  },
  header: {
    minHeight: VISUAL.minHeight + HEADER_PAD_Y * 2,
    paddingLeft: 12,
    paddingRight: 10,
    paddingTop: HEADER_PAD_Y,
    paddingBottom: HEADER_PAD_Y,
    flexDirection: 'row',
    alignItems: 'center',
    gap: VISUAL.gap,
  },
  headerPressed: {
    backgroundColor: P.ink(0.04),
  },
  sparkBox: {
    width: VISUAL.sparkBox,
    height: VISUAL.sparkBox,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelSlot: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: VISUAL.gap,
  },
  label: {
    flexShrink: 1,
    color: P.muted,
    fontSize: VISUAL.fontSize,
    lineHeight: VISUAL.fontSize * 1.5,
  },
  labelStrong: {
    flexShrink: 1,
    color: P.foreground,
    fontSize: 13,
    lineHeight: 19.5,
  },
  fullLabel: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    color: P.foreground,
    fontSize: 13,
    lineHeight: 19.5,
  },
  numbers: {
    flexShrink: 0,
    color: P.muted,
    fontSize: VISUAL.fontSize,
    fontVariant: ['tabular-nums'],
  },
  track: {
    width: 48,
    flexShrink: 0,
  },
  pills: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 6,
  },
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
  body: {
    maxHeight: 360,
  },
  bodyContent: {
    gap: 12,
    paddingTop: 2,
    paddingBottom: 10,
  },
  section: {
    gap: 6,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    color: P.foreground,
    fontSize: 13,
  },
  sectionMeta: {
    flex: 1,
    minWidth: 0,
    color: P.cardMuted,
    fontSize: 13,
  },
  detail: {
    maxHeight: 200,
    marginHorizontal: 12,
    padding: 10,
    borderRadius: 6,
    backgroundColor: P.input,
  },
  detailText: {
    color: P.prose,
    fontFamily: MONO_FONT,
    fontSize: 12,
    lineHeight: 17,
  },
}));
