/**
 * The answers a reader sent from an agent's HTML page or an in-chat questions form, drawn as a
 * receipt instead of the JSON message gxserver typed into the session (`pageAnswers`,
 * packages/gx-chat-core/src/transcript/page_answers.rs).
 *
 * CDXC:SessionChat 2026-10-11 SEE-ALSO:
 * Desktop draws the same card in apps/desktop/src/app/native_chat/page_answers.rs. Change them together. The agent's own question receipts (QuestionExchangeCards.tsx) take the same `PlainAnswer`.
 */

import { createContext, useContext, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ProjectedMessage } from '../../rust/document';
import { useNativeChatUi, useTranscriptEnv, useTranscriptFlags } from './context';
import { Glyph } from './icons';
import { LinkWords } from './LinkWords';
import {
  SINGLE_LINE_CARD,
  SINGLE_LINE_HEADER_HEIGHT,
  SINGLE_LINE_TITLE,
  SingleLineTile,
  singleLinePressed,
  singleLineShell,
} from './singleLineCard';
import { FoldChevron } from './foldChevron';
import { useDisclosure } from './state';
import { MESSAGE_PART_GAP } from './theme';
import { arr, num, obj, str, type JsonRecord } from './json';

/** The green that marks an answered page or form (desktop `answered_color`). */
export { answeredColor } from '../cards/askCard';

/** Set under Quiet View's own answers line, whose card opens without a line of its own (quietView.tsx). */
export const AnswersUnderQuietLine = createContext(false);

/** About two lines of a note at a phone's width: a longer note folds to two lines with More. */
const NOTE_TWO_LINES = 110;

/**
 * The folded answers card and, opened, each question once (CDXC:SessionChat 2026-11-13 DECISION in
 * desktop page_answers.rs, Q2990 A to Q2997). Under Quiet View's own line (`AnswersUnderQuietLine`)
 * the card opens straight onto its rows without a line of its own.
 *
 * CDXC:SessionChat 2026-11-17 DECISION: the user picked Q3764 B and Q3765 "Yes, the same look on the
 * phone" (desktop `answers_rows` in page_answers.rs has their words): the reader's note leads as a
 * quoted line, each answered question shows its question on one line with no tag (a long press shows
 * all of it with its tag) and each pick as a quiet pill (the core's `picks`), Other's words in quotes
 * with "Your own answer", and the skipped questions fold into one "N skipped" row, shut by default,
 * that opens onto one dimmed line each with their links kept. Supersedes the tags beside each
 * question and the one line of skipped questions.
 */
export function PageAnswersCard({ message }: { message: ProjectedMessage }) {
  const quietBodyOnly = useContext(AnswersUnderQuietLine);
  const cards = [obj(message.pageAnswers), ...arr(message.extraPageAnswers).map(obj)].filter(
    (card): card is JsonRecord => card !== null,
  );
  // When one message carries several envelopes under Quiet View, keep each card's own header
  // visible and opened by default so the forms stay distinct (desktop transcript.rs / page_answers.rs).
  return (
    <PageAnswersCards
      rowId={message.id}
      cards={cards}
      delivery={message.startupDelivery ?? null}
      bodyOnly={quietBodyOnly && cards.length === 1}
      defaultOpen={quietBodyOnly && cards.length > 1}
    />
  );
}

/** Shared stacked renderer used by transcript rows (`PageAnswersCard`). */
export function PageAnswersCards({
  rowId = '',
  cards,
  delivery = null,
  bodyOnly = false,
  defaultOpen = false,
}: {
  rowId?: string;
  cards: JsonRecord[];
  delivery?: NonNullable<ProjectedMessage['startupDelivery']> | null;
  bodyOnly?: boolean;
  defaultOpen?: boolean;
}) {
  if (cards.length === 0) return null;
  const last = cards.length - 1;
  const rendered = cards.map((answers, index) => (
    <SinglePageAnswersCard
      key={`${str(answers, 'pageId')}:${str(answers, 'by')}:${index}`}
      rowId={rowId}
      occurrence={index}
      answers={answers}
      delivery={index === last ? delivery : null}
      bodyOnly={bodyOnly}
      defaultOpen={defaultOpen}
    />
  ));
  return cards.length === 1 ? rendered[0] : <View style={styles.stack}>{rendered}</View>;
}

function SinglePageAnswersCard({
  rowId = '',
  occurrence = 0,
  answers,
  delivery,
  bodyOnly,
  defaultOpen,
}: {
  rowId?: string;
  occurrence?: number;
  answers: JsonRecord;
  delivery: NonNullable<ProjectedMessage['startupDelivery']> | null;
  bodyOnly: boolean;
  defaultOpen: boolean;
}) {
  const { theme, dispatch } = useTranscriptEnv();
  const { disclosures } = useNativeChatUi();
  const { canRemoveQueued, sendFailureCardPromptId } = useTranscriptFlags();
  // Answers on their way to the agent (gx-chat-core `session/answer_echoes.rs`): the card shows at
  // once with a spinner at its bottom left, or why they could not be delivered with Retry and Remove.
  const failed = delivery?.state === 'failed';
  // Left the queue and the conversation never showed it: the fact and Remove, no spinner (CDXC:SessionChat 2026-10-31 in packages/gx-chat-core/src/session/startup_sends.rs).
  const unconfirmed = delivery?.state === 'unconfirmed';
  const promptId = delivery?.promptId ?? '';
  const removable = promptId.length > 0 && (unconfirmed || (delivery?.state === 'queued' && canRemoveQueued));
  const removeAction = (
    <Pressable
      hitSlop={6}
      accessibilityRole="button"
      onPress={() => dispatch({ type: 'removeQueue', promptId })}
    >
      <Text style={[styles.deliveryAction, { color: theme.primary }]}>Remove</Text>
    </Pressable>
  );
  const errorColor = theme.light ? '#b91c1c' : '#fb7185';
  const more = num(answers, 'more') ?? 0;
  const pageId = str(answers, 'pageId');
  const by = str(answers, 'by');
  const scope = rowId.length > 0 ? `${rowId}:${occurrence}:` : `${occurrence}:`;
  const cardKey = `answers-card:${scope}${pageId}:${by}`;
  const [toggledOpen, toggle] = useDisclosure(disclosures, cardKey, defaultOpen);
  const open = bodyOnly || toggledOpen;
  // Older chat cores sent no `skipped` or `extra`: their words stand in.
  const rows = arr(answers?.rows).map((row) => {
    const value = str(row, 'value');
    const label = str(row, 'label');
    return {
      row,
      label,
      value,
      tag: str(row, 'tag'),
      note: str(row, 'note'),
      skipped: obj(row)?.skipped === true || value === 'Skipped' || value === 'Not answered',
      extra: obj(row)?.extra === true || (str(row, 'tag').length === 0 && label === 'Additional notes'),
    };
  });
  const questions = rows.filter((row) => !row.extra);
  const answeredCount = questions.filter((row) => !row.skipped).length;
  const skippedRows = questions.filter((row) => row.skipped);
  // The phone's short count: "3 of 4" when some were skipped, else "3 answered".
  const count =
    questions.length === 0
      ? ''
      : skippedRows.length === 0
        ? `${answeredCount} answered`
        : answeredCount === 0
          ? `${skippedRows.length} skipped`
          : `${answeredCount} of ${questions.length}`;
  const notesCount = rows.filter((row) => row.extra).length;
  const answeredRows = rows.filter((row) => !row.extra && !row.skipped);
  const [skippedOpen, toggleSkipped] = useDisclosure(disclosures, `${cardKey}:skipped`, false);
  const page = obj(answers?.page);
  const pageUrl = str(page, 'url');
  const hairline = theme.ink(0.05);
  const body = (
    <View style={[styles.rows, bodyOnly ? styles.rowsBodyOnly : null]}>
      {open
        ? rows
            .filter((row) => row.extra)
            .map((row) => {
              const index = rows.indexOf(row);
              const drawn = rows.filter((other) => other.extra).indexOf(row);
              return (
                <View
                  key={`note:${index}`}
                  style={[
                    styles.row,
                    drawn > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: hairline } : null,
                  ]}
                >
                  <Text style={[styles.noteLabel, { color: theme.muted }]}>Your note</Text>
                  <AnswerNote disclosureKey={`${cardKey}:note:${index}`} note={row.value} lead />
                </View>
              );
            })
        : null}
      {open
        ? answeredRows.map((row, at) => {
            const index = rows.indexOf(row);
            const drawn = notesCount + at;
            const picks = Array.isArray(obj(row.row)?.picks)
              ? arr(obj(row.row)?.picks).map((pick) => String(pick))
              : null;
            const other = obj(row.row)?.other === true;
            // Other's words are the question's note: they are the answer, not a note on it.
            const own = other && row.note.length > 0 ? row.note : '';
            const note = own.length > 0 ? '' : row.note;
            const labels = picks === null ? null : other && own.length === 0 ? [...picks, 'Other'] : picks;
            return (
              <View
                key={index}
                style={[
                  styles.row,
                  drawn > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: hairline } : null,
                ]}
              >
                <QuestionLine tag={row.tag} label={row.label} runs={obj(row.row)?.labelRuns} />
                {labels === null ? (
                  <Text style={[styles.answer, { color: theme.foreground }]}>{row.value}</Text>
                ) : labels.length > 0 ? (
                  <View style={styles.pills}>
                    {labels.map((label, pick) => (
                      <Text
                        key={pick}
                        numberOfLines={1}
                        style={[
                          styles.pill,
                          { color: theme.foreground, borderColor: theme.ink(0.1), backgroundColor: theme.ink(0.04) },
                        ]}
                      >
                        {label}
                      </Text>
                    ))}
                  </View>
                ) : null}
                {own.length > 0 ? (
                  <View>
                    <Text style={[styles.own, { color: theme.foreground }]}>{`“${own}”`}</Text>
                    <Text style={[styles.ownAside, { color: theme.muted }]}>Your own answer</Text>
                  </View>
                ) : null}
                {note.length > 0 ? <AnswerNote disclosureKey={`${cardKey}:note:${index}`} note={note} /> : null}
              </View>
            );
          })
        : null}
      {open && skippedRows.length > 0 ? (
        <View
          style={
            notesCount + answeredRows.length > 0
              ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: hairline }
              : null
          }
        >
          <Pressable
            hitSlop={4}
            accessibilityRole="button"
            accessibilityState={{ expanded: skippedOpen }}
            accessibilityLabel={skippedOpen ? 'Hide the skipped questions' : 'Show the skipped questions'}
            onPress={toggleSkipped}
            style={[styles.skippedHead, skippedOpen ? styles.skippedHeadOpen : null]}
          >
            <FoldChevron open={skippedOpen} size={13} color={theme.muted} />
            <Text style={[styles.skippedLabel, { color: theme.muted }]}>{skippedRows.length} skipped</Text>
          </Pressable>
          {skippedOpen ? (
            <View style={styles.skippedList}>
              {skippedRows.map((row) => (
                <SkippedLine key={rows.indexOf(row)} tag={row.tag} label={row.label} runs={obj(row.row)?.labelRuns} />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
      {open && more > 0 ? <Text style={[styles.more, { color: theme.muted }]}>and {more} more</Text> : null}
      {unconfirmed ? (
        <View style={styles.delivery} accessibilityRole="text">
          <Text style={[styles.deliveryText, { color: theme.muted }]}>{delivery?.waitReason ?? ''}</Text>
          {removable ? removeAction : null}
        </View>
      ) : null}
      {delivery !== null && !failed && !unconfirmed ? (
        <View style={styles.delivery} accessibilityRole="progressbar">
          <ActivityIndicator size={12} color={theme.muted} />
          <Text style={[styles.deliveryText, { color: theme.muted }]}>
            {delivery.state === 'queued'
              ? delivery.waitReason?.length
                ? delivery.waitReason
                : 'Waiting for the agent to finish its turn…'
              : delivery.state === 'reconnecting'
                ? "Reconnecting to Ghostex… your answers go out as soon as it's back."
                : 'Sending to the agent…'}
          </Text>
          {removable ? removeAction : null}
        </View>
      ) : null}
      {failed ? (
        <View style={styles.delivery} accessibilityRole="alert">
          <Text style={[styles.deliveryText, { color: errorColor }]}>
            {delivery?.errorMessage
              ? `Your answers could not be delivered: ${delivery.errorMessage}`
              : 'Your answers could not be delivered.'}
          </Text>
          {promptId.length > 0 ? (
            <>
              {promptId === sendFailureCardPromptId ? null : (
                <Pressable
                  hitSlop={6}
                  accessibilityRole="button"
                  onPress={() => dispatch({ type: 'retryQueue', promptId })}
                >
                  <Text style={[styles.deliveryAction, { color: theme.primary }]}>Retry</Text>
                </Pressable>
              )}
              {removeAction}
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
  const hasBody = open || delivery !== null;
  if (bodyOnly) {
    return (
      <View style={[styles.lined, { borderColor: theme.inputBorder, backgroundColor: theme.cardPanel }]}>{body}</View>
    );
  }
  return (
    <View style={singleLineShell(theme)}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? 'Hide your answers' : 'Show your answers'}
        onPress={toggle}
        style={({ pressed }) => [styles.head, pressed ? singleLinePressed(theme) : null]}
      >
        <SingleLineTile glyph="question" badge="check" />
        <Text numberOfLines={1} style={[SINGLE_LINE_TITLE, styles.title, { color: theme.foreground }]}>
          {str(answers, 'title')}
        </Text>
        {count.length > 0 || by.length > 0 ? (
          <Text numberOfLines={1} style={[styles.count, { color: theme.muted }]}>
            {by.length > 0 ? (count.length > 0 ? `${by} · ${count}` : by) : count}
          </Text>
        ) : null}
        {pageUrl.length > 0 ? (
          <Pressable
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Open the page"
            onPress={() => dispatch({ type: 'openMarkdownLink', href: pageUrl, external: false })}
            style={({ pressed }) => [styles.openPage, pressed ? singleLinePressed(theme) : null]}
          >
            <Glyph name="arrow-up-right" size={15} color={theme.muted} />
          </Pressable>
        ) : null}
      </Pressable>
      {hasBody ? <View style={styles.body}>{body}</View> : null}
    </View>
  );
}

/**
 * A row's first line: its question on one line; a long press shows all of it with its tag. The
 * question's links open on a tap (`labelRuns`, gx-chat-core `questions/form_links.rs`).
 */
function QuestionLine({ tag, label, runs }: { tag: string; label: string; runs: unknown }) {
  const { theme } = useTranscriptEnv();
  const [whole, setWhole] = useState(false);
  return (
    <Pressable onLongPress={() => setWhole((shown) => !shown)} style={styles.questionLine}>
      {whole && tag.length > 0 ? <Text style={[styles.tag, { color: theme.muted }]}>{tag}</Text> : null}
      <View style={styles.questionText}>
        <LinkWords
          text={label}
          runs={runs}
          color={theme.muted}
          style={styles.question}
          numberOfLines={whole ? undefined : 1}
        />
      </View>
    </Pressable>
  );
}

/** One skipped question, dimmed, on one line, its links kept; a long press shows all of it with its tag. */
function SkippedLine({ tag, label, runs }: { tag: string; label: string; runs: unknown }) {
  const { theme } = useTranscriptEnv();
  const [whole, setWhole] = useState(false);
  return (
    <Pressable onLongPress={() => setWhole((shown) => !shown)} style={[styles.questionLine, styles.skippedLine]}>
      {whole && tag.length > 0 ? <Text style={[styles.tag, { color: theme.muted }]}>{tag}</Text> : null}
      <View style={styles.questionText}>
        <LinkWords
          text={label}
          runs={runs}
          color={theme.muted}
          style={styles.skippedText}
          numberOfLines={whole ? undefined : 1}
        />
      </View>
    </Pressable>
  );
}

/**
 * A note behind a thin rule, two lines until More opens it: muted under its answer, or, for the
 * reader's own note on the whole form (`lead`), in the foreground's normal type.
 */
function AnswerNote({ disclosureKey, note, lead = false }: { disclosureKey: string; note: string; lead?: boolean }) {
  const { theme } = useTranscriptEnv();
  const { disclosures } = useNativeChatUi();
  const [whole, toggleWhole] = useDisclosure(disclosures, disclosureKey, false);
  const long = note.length > NOTE_TWO_LINES || note.split('\n').length > 2;
  return (
    <View style={styles.noteBox}>
      <Text
        numberOfLines={long && !whole ? 2 : undefined}
        style={[
          styles.note,
          lead ? styles.leadNote : null,
          { color: lead ? theme.foreground : theme.muted, borderLeftColor: theme.ink(0.1) },
        ]}
      >
        {note}
      </Text>
      {long ? (
        <Pressable hitSlop={6} accessibilityRole="button" onPress={toggleWhole}>
          <Text style={[styles.moreNote, { color: theme.foreground }]}>{whole ? 'Less' : 'More'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: MESSAGE_PART_GAP, minWidth: 0 },
  head: {
    height: SINGLE_LINE_HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: SINGLE_LINE_CARD.paddingX,
  },
  title: { flex: 1, minWidth: 0 },
  count: { flexShrink: 0, fontSize: 12.5, lineHeight: 18 },
  openPage: { width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center', marginRight: -4 },
  body: { paddingHorizontal: SINGLE_LINE_CARD.paddingX, paddingBottom: 10 },
  lined: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingBottom: 10 },
  rows: { minWidth: 0 },
  rowsBodyOnly: { paddingTop: 2 },
  row: { paddingVertical: 8, gap: 2, minWidth: 0 },
  noteLabel: { fontSize: 11.5, lineHeight: 16 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 1, minWidth: 0 },
  pill: {
    flexShrink: 1,
    maxWidth: '100%',
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 1,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '500',
  },
  own: { fontSize: 13, lineHeight: 19, fontWeight: '500' },
  ownAside: { fontSize: 12.5, lineHeight: 18 },
  skippedHead: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8 },
  skippedHeadOpen: { paddingBottom: 3 },
  skippedLabel: { fontSize: 12.5, lineHeight: 18 },
  skippedList: { paddingBottom: 4 },
  skippedLine: { opacity: 0.75 },
  skippedText: { fontSize: 12.5, lineHeight: 22 },
  leadNote: { fontSize: 13, lineHeight: 19 },
  questionLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8, minWidth: 0 },
  questionText: { flex: 1, minWidth: 0 },
  question: { fontSize: 13, lineHeight: 19 },
  tag: { fontSize: 10.5, lineHeight: 19, flexShrink: 0, opacity: 0.75 },
  answer: { fontSize: 15, lineHeight: 21, fontWeight: '500' },
  noteBox: { marginTop: 3, alignItems: 'flex-start', gap: 1 },
  note: { fontSize: 12.5, lineHeight: 18, borderLeftWidth: 2, paddingLeft: 8, alignSelf: 'stretch' },
  moreNote: { fontSize: 12.5, lineHeight: 18, fontWeight: '500' },
  more: { fontSize: 12, paddingTop: 2 },
  delivery: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingTop: 10 },
  deliveryText: { fontSize: 12, lineHeight: 18 },
  deliveryAction: { fontSize: 12, lineHeight: 18, fontWeight: '500' },
});
