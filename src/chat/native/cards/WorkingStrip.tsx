/**
 * The line above the composer while the agent works, drawn from `workingStrip`. Port of desktop
 * `working_strip.rs`: the spark and the stint word (`label`, "Brewing…"), or, when the terminal
 * shows something more specific (compaction, running shells), the activity card with its clock
 * and progress. Every word, clock and percent comes from the document; the strip only animates.
 *
 * The armed Delayed Send / Close After Done items on the right of the row come from the app shell,
 * not the document (desktop's `armed_actions`); the screen builds them from the session's row in the
 * inventory (`armedActions`) and a tap opens Delayed Actions, as desktop's click does.
 */

import { useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';

import type { ChatDocument } from '../../rust/document';
import type { RustChat } from '../../rust/useRustChat';
import { Glyph as ComposerGlyph } from '../composer/icons';
import { Glyph, Spark } from './icons';
import { arr, isTrue, num, obj, str } from './json';
import type { JsonRecord } from './json';
import { MONO_FONT, themedStyles, useTranscriptTheme } from '../transcript/theme';
import { CARD_TEXT_SIZE, PulseDot, SWEEP_EASING, Spinner, StatusCard, useLoop } from './primitives';

/** `packages/gx-chat-core/visual/working-strip.json`. */
const VISUAL = {
  minHeight: 24,
  paddingX: 6,
  gap: 8,
  sparkBox: 16,
  sparkSize: 14,
  fontSize: 12.5,
  pulseMs: 1600,
  spinMs: 9000,
  armedIconGap: 6,
  armedColumnGap: 16,
  armedRowGap: 2,
  delayedSendColor: '#f6c945',
  closeAfterDoneColor: '#ff9aa2',
};

/** One armed timer on the working row (`SessionChatArmedAction` in `armed-actions.ts`). */
export type ArmedAction = { id: 'delayedSend' | 'closeAfterDone'; label: string };

export function WorkingStrip({
  chat,
  document,
  armed = [],
  onArmedPress,
  pills,
}: {
  chat: RustChat;
  document: ChatDocument;
  armed?: readonly ArmedAction[];
  /** Opens Delayed Actions; without it the items are drawn but not pressable. */
  onArmedPress?: () => void;
  /** The pills' row (`ChatPills.tsx`), on its own line under the word as desktop draws a narrow chat. */
  pills?: ReactNode;
}) {
  const styles = useStyles();
  const strip = document.workingStrip;
  const activity = obj(strip?.presentation);
  const label = typeof strip?.label === 'string' ? strip.label : null;
  // A running turn keeps its word beside a background-task card (the core sends both); the word
  // always comes first, then the pills, then the card (desktop `working_strip.rs`).
  const parts = [
    label !== null || armed.length > 0 ? <WorkingRow key="row" label={label} armed={armed} onArmedPress={onArmedPress} /> : null,
    pills !== undefined ? <View key="pills">{pills}</View> : null,
    activity !== null ? <WorkingActivity key="activity" activity={activity} /> : null,
  ].filter((part) => part !== null);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return <View style={styles.stack}>{parts}</View>;
}

/**
 * The working row: spark and word on the left while the agent works, the armed items pushed right,
 * wrapping onto a left-aligned second line when they do not fit (`working_row`).
 */
function WorkingRow({
  label,
  armed,
  onArmedPress,
}: {
  label: string | null;
  armed: readonly ArmedAction[];
  onArmedPress: (() => void) | undefined;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const aria = [label, ...armed.map((action) => action.label)].filter((part): part is string => part !== null).join(', ');
  return (
    <View accessibilityRole="text" accessibilityLabel={aria} style={styles.row}>
      <View style={styles.lead}>
        {label !== null ? (
          <>
            <WorkingSpark />
            <Text style={styles.word} numberOfLines={1}>
              {label}
            </Text>
          </>
        ) : null}
      </View>
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
          <View style={styles.sparkBox}>
            <ComposerGlyph
              name="clock"
              size={VISUAL.sparkSize}
              color={action.id === 'delayedSend' ? VISUAL.delayedSendColor : VISUAL.closeAfterDoneColor}
            />
          </View>
          <Text style={[styles.armedLabel, { color: P.foreground }]}>{action.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** The spark: a slow turn with a breathing scale and opacity, as `working_spark.rs` draws it. */
function WorkingSpark() {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const pulse = useLoop(VISUAL.pulseMs, Easing.linear);
  const spin = useLoop(VISUAL.spinMs, Easing.linear);
  const breathe = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0] });
  return (
    <View style={styles.sparkBox}>
      <Animated.View
        style={{
          opacity: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }),
          transform: [
            { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
            { scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1.12] }) },
          ],
        }}
      >
        <Spark size={VISUAL.sparkSize} color={P.foreground} />
      </Animated.View>
    </View>
  );
}

/**
 * Compaction and running shells: a status card with the activity, its clock and its progress.
 *
 * CDXC:SessionChat 2026-09-11 DECISION: User: put the compaction hint in an info-circle tooltip immediately right of the title, replacing the visible hint line.
 */
function WorkingActivity({ activity }: { activity: Record<string, unknown> }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const percent = num(activity, 'percent');
  const indeterminate = isTrue(activity, 'indeterminate');
  const elapsed = str(activity, 'elapsedLabel');
  const tokens = str(activity, 'tokens');
  const hint = str(activity, 'hint');
  const header = (
    <View style={styles.activityHeader}>
      <View style={styles.activityLead}>
        {isTrue(activity, 'shellsRunning') ? (
          <Spinner size={14} color={P.controlPrimary} />
        ) : (
          <PulseDot size={6} color={P.controlPrimary} active />
        )}
      </View>
      <View style={styles.activityTitle}>
        <Text style={styles.activityLabel}>{str(activity, 'label')}</Text>
        {hint.length > 0 ? (
          <View accessibilityLabel={hint} accessible>
            <Glyph name="info-circle" size={14} color={P.muted} />
          </View>
        ) : null}
      </View>
      {elapsed.length > 0 ? <Text style={styles.activityClock}>{elapsed}</Text> : null}
      {tokens.length > 0 ? <Text style={styles.activityClock}>{tokens}</Text> : null}
      {percent !== null ? <Text style={styles.activityPercent}>{`${percent}%`}</Text> : null}
    </View>
  );
  const body =
    percent !== null || indeterminate
      ? [<ProgressTrack key="progress" percent={percent} />]
      : [];
  return (
    <View accessibilityRole="progressbar" style={styles.fill}>
      <StatusCard header={header} body={body} />
    </View>
  );
}

/**
 * The background tasks the agent left running, as the Background pill's sheet shows them
 * (`ChatPills.tsx`, desktop `background_tasks.rs`; gx-chat-core words them): one row per task with
 * its own clock and "+N more". Pressing and holding a row shows its command, as hover does on the
 * desktop; tapping or holding the (i) by the clock shows what the row means, as its tooltip does there.
 */
export function BackgroundTasksMenu({ tasks }: { tasks: JsonRecord }) {
  const styles = useStyles();
  const rows = arr(tasks.rows)
    .map((row) => obj(row))
    .filter((row): row is JsonRecord => row !== null);
  const more = str(tasks, 'more');
  const info = str(tasks, 'info');
  return (
    <View accessibilityRole="progressbar" style={styles.backgroundMenu}>
      <Text style={styles.backgroundMeta} numberOfLines={1}>
        {str(tasks, 'meta')}
      </Text>
      <View style={styles.backgroundRows}>
        {rows.map((row, index) => (
          <BackgroundTaskRow key={str(row, 'id') || index} row={row} info={info} />
        ))}
        {more.length > 0 ? (
          // A remainder under named rows lines up with their titles; alone it is the line.
          <Text style={[styles.backgroundMuted, rows.length > 0 ? styles.backgroundIndent : null]}>{more}</Text>
        ) : null}
      </View>
    </View>
  );
}

function BackgroundTaskRow({ row, info }: { row: JsonRecord; info: string }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const [revealed, setRevealed] = useState(false);
  const [infoShown, setInfoShown] = useState(false);
  const prefix = str(row, 'prefix');
  const title = str(row, 'title');
  const command = str(row, 'command');
  const elapsed = str(row, 'elapsed');
  return (
    <Pressable
      accessibilityRole="text"
      accessibilityLabel={[prefix, title, elapsed].filter((part) => part.length > 0).join(' ')}
      accessibilityHint={command.length > 0 ? 'Press and hold to see the command' : undefined}
      disabled={command.length === 0}
      onLongPress={() => setRevealed(true)}
      onPressOut={() => setRevealed(false)}
    >
      <View style={styles.backgroundRow}>
        <View style={styles.backgroundSpinner}>
          <Spinner size={12} color={P.controlPrimary} />
        </View>
        <Text style={styles.backgroundTitle} numberOfLines={1} ellipsizeMode="tail">
          {prefix.length > 0 ? `${prefix} ` : ''}
          <Text style={styles.backgroundTitleStrong}>{title}</Text>
        </Text>
        <View style={styles.backgroundTrailing}>
          {info.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={info}
              hitSlop={8}
              onPress={() => setInfoShown((shown) => !shown)}
              onLongPress={() => setInfoShown(true)}
            >
              <Glyph name="info-circle" size={14} color={P.muted} />
            </Pressable>
          ) : null}
          {elapsed.length > 0 ? <Text style={styles.activityClock}>{elapsed}</Text> : null}
        </View>
      </View>
      {infoShown ? <Text style={[styles.backgroundMuted, styles.backgroundIndent]}>{info}</Text> : null}
      {revealed ? <Text style={styles.backgroundCommand}>{command}</Text> : null}
    </Pressable>
  );
}

function ProgressTrack({ percent }: { percent: number | null }) {
  const styles = useStyles();
  const [width, setWidth] = useState(0);
  const sweep = useLoop(1800, SWEEP_EASING, percent === null);
  return (
    <View style={styles.track} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {percent !== null ? (
        <View style={[styles.trackFill, { width: `${Math.max(0, Math.min(100, percent))}%` }]} />
      ) : (
        <Animated.View
          style={[
            styles.trackFill,
            styles.trackSweep,
            { transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-0.35 * width, width] }) }] },
          ]}
        />
      )}
    </View>
  );
}

const useStyles = themedStyles((P) => ({
  row: {
    minHeight: VISUAL.minHeight,
    paddingHorizontal: VISUAL.paddingX,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: VISUAL.armedColumnGap,
    rowGap: VISUAL.armedRowGap,
  },
  lead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: VISUAL.gap,
    minWidth: 0,
    flexShrink: 1,
    marginRight: 'auto',
  },
  stack: {
    width: '100%',
    gap: 8,
  },
  armed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: VISUAL.armedIconGap,
    minWidth: 0,
  },
  armedPressed: {
    opacity: 0.8,
  },
  armedLabel: {
    flexShrink: 1,
    fontSize: VISUAL.fontSize,
    lineHeight: VISUAL.fontSize * 1.5,
  },
  sparkBox: {
    width: VISUAL.sparkBox,
    height: VISUAL.sparkBox,
    alignItems: 'center',
    justifyContent: 'center',
  },
  word: {
    flexShrink: 1,
    color: P.muted,
    fontSize: VISUAL.fontSize,
    lineHeight: VISUAL.fontSize * 1.5,
  },
  fill: {
    width: '100%',
  },
  activityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activityLead: {
    height: 22,
    justifyContent: 'center',
  },
  activityTitle: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activityLabel: {
    flexShrink: 1,
    color: P.foreground,
    fontSize: 14,
    lineHeight: 22,
  },
  activityClock: {
    color: P.muted,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  activityPercent: {
    color: P.ink(0.8),
    fontSize: 14,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  backgroundMuted: {
    color: P.muted,
    fontSize: 13,
    lineHeight: 19.5,
  },
  backgroundRows: {
    gap: 6,
  },
  /** The sheet's body under its title row (`AgentPanels.tsx` `menu`). */
  backgroundMenu: {
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  /** The running count, the other sheets' muted detail (`AgentPanels.tsx` `meta`). */
  backgroundMeta: {
    color: P.cardMuted,
    fontSize: CARD_TEXT_SIZE,
  },
  backgroundIndent: {
    paddingLeft: 22,
  },
  backgroundTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backgroundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backgroundSpinner: {
    width: 12,
    height: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backgroundTitle: {
    flex: 1,
    minWidth: 0,
    color: P.foreground,
    fontSize: 14,
    lineHeight: 21,
  },
  /** The Threads header title's weight (`CardHeader` `headerTitle`), not bold. */
  backgroundTitleStrong: {
    fontWeight: '500',
  },
  backgroundCommand: {
    marginTop: 2,
    marginLeft: 22,
    color: P.muted,
    fontFamily: MONO_FONT,
    fontSize: 11.5,
    lineHeight: 16,
  },
  track: {
    height: 4,
    width: '100%',
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: P.ink(0.1),
  },
  trackFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: P.controlPrimary,
  },
  trackSweep: {
    position: 'absolute',
    left: 0,
    width: '35%',
  },
}));
