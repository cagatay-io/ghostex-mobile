/**
 * One-click answers under an agent's question: the marked line gx-chat-core puts under the question
 * (`transcript/inline_answers.rs`), drawn as one compact segmented pill, or one answer per row when the pill
 * does not fit on the line. The state is the question's one-question form in the document's `questionForms`
 * (open, sending, queued, answered, changing);
 * this file only lays it out and sends the taps, as desktop `inline_answers.rs` does.
 *
 * CDXC:SessionChat 2026-11-05 SEE-ALSO: The decision (Q1245 C, the segmented pill on the line under the question; Q1247 B, Change while queued or after) is in packages/gx-chat-core/src/transcript/inline_answers.rs.
 */

import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { useTranscriptEnv, useTranscriptFlags } from '../context';
import { arr, obj, str, type JsonRecord } from '../json';
import { QuestionFlashFrame } from '../OpenQuestions';
import { useQuestionFormState } from '../QuestionForm';
import { openQuestionReply } from '../QuestionReply';
import { replyDraftScopeOf, SESSION_REPLY_ROW, useReplyDraft } from '../../cards/replyDrafts';

/** The reader's own answer as the status quotes it: its first line, at most 48 characters. */
function short(text: string): string {
  const line = (text.split('\n')[0] ?? '').trim();
  const cut = Array.from(line).slice(0, 48).join('');
  return cut.length < line.length || text.trim().includes('\n') ? `${cut}…` : cut;
}

/**
 * The question's words as its Reply sheet's title (gx-chat-core `reply_name`): without its leading
 * tag or Markdown marks, cut with … past 60 characters.
 */
function shortName(question: string): string {
  const plain = question
    .replace(/^\s*Q\d+[:.)]?\s*/iu, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/[*`]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  const chars = Array.from(plain);
  return chars.length <= 60 ? plain : `${chars.slice(0, 59).join('').trimEnd()}…`;
}

/** `rgba()` of a `#rrggbb` colour at `alpha`; other colour strings come back as they are. */
function withAlpha(color: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (match === null) return color;
  const value = parseInt(match[1]!, 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

export function InlineAnswers({ mark }: { mark: JsonRecord }) {
  const { theme, dispatch } = useTranscriptEnv();
  const formId = str(mark, 'form');
  const form = useQuestionFormState(formId);
  // Asked by a work item too: drawn once, as its ask card (gx-chat-core work_cards.rs `card_tags`).
  const { workAskTags } = useTranscriptFlags();
  const covered = form?.coveredByCard === true || workAskTags.has(str(mark, 'tag').toUpperCase());
  const phase = form === null ? 'open' : str(form, 'state') || 'open';
  const changing = form?.changing === true;
  const withdrawn = form?.tagWithdrawn === true || phase === 'withdrawn' || phase === 'canceled';
  const firstDraft = obj(arr(form?.drafts)[0]);
  const pickedRaw = arr(firstDraft?.indices)[0];
  const picked = typeof pickedRaw === 'number' ? pickedRaw : null;
  const sent = phase === 'sending' || phase === 'queued' || phase === 'answered';
  const clickable = !withdrawn && (phase === 'open' || (changing && phase !== 'sending'));
  // A newer copy of this question sits further down; every copy answers it there.
  const askedAgain = form?.askedAgain === true && phase === 'open' && !changing && !withdrawn;
  const ownAnswer = sent && form !== null ? str(form, 'ownAnswer') : '';
  const words = ownAnswer.length > 0 ? ` “${short(ownAnswer)}”` : '';
  const tag = str(mark, 'tag');
  const edge = withAlpha(theme.foreground, 0.16);
  const inkText = theme.light ? '#fafafa' : '#111113';
  const choices = arr(mark.choices).map((choice) => obj(choice)).filter((choice) => choice !== null);
  /*
   * CDXC:SessionChat 2026-11-15 WHY:
   * On an iPhone a question's three long answers ("Rebuild my desktop from the fix branch now", ...) drew as one
   * segmented pill that ran off the screen: the second was cut to "Push the" and the third could not be reached.
   * The pill on one line is measured against the line's own width (split screen and large text included); when
   * it does not fit, the answers stack one per row, full width, and a long answer wraps inside its row. Desktop
   * inline_answers.rs stacks the same way.
   */
  const [lineWidth, setLineWidth] = useState(0);
  const [naturalWidth, setNaturalWidth] = useState(0);
  const onLine = useCallback((event: LayoutChangeEvent) => {
    const next = Math.floor(event.nativeEvent.layout.width);
    setLineWidth((was) => (was === next ? was : next));
  }, []);
  const onNatural = useCallback((event: LayoutChangeEvent) => {
    const next = Math.ceil(event.nativeEvent.layout.width);
    setNaturalWidth((was) => (was === next ? was : next));
  }, []);
  const stacked = lineWidth > 0 && naturalWidth > lineWidth;

  let status: { text: string; link: string | null } | null = null;
  if (withdrawn) status = { text: 'Withdrawn', link: null };
  else if (changing) status = { text: 'Pick another answer ·', link: 'Cancel' };
  else if (askedAgain) status = { text: 'Asked again below', link: null };
  else if (phase === 'sending') status = { text: `Sending${words}…`, link: null };
  else if (phase === 'queued') status = { text: `Queued${words} ·`, link: 'Change' };
  else if (phase === 'answered') status = { text: `Sent${words} ·`, link: 'Change' };

  if (covered) return null;
  const divider = StyleSheet.hairlineWidth * 2;
  const own = clickable ? '✎' : null;
  const replyDraftText = useReplyDraft(replyDraftScopeOf(dispatch), SESSION_REPLY_ROW);
  const hasReplyDraft = own !== null && replyDraftText.trim().length > 0;
  // The words a segment shows, the same in the drawn pill and in the measured copy.
  const content = (choice: JsonRecord, index: number, wrap: boolean) => {
    const label = str(choice, 'label');
    const chosen = sent && picked === index;
    const recommended = choice.recommended === true && !sent;
    return (
      <>
        {recommended ? <View style={[styles.dot, { backgroundColor: withAlpha(theme.foreground, 0.55) }]} /> : null}
        <Text
          style={[styles.label, wrap && styles.wrapped, { color: chosen ? inkText : theme.foreground }]}
          numberOfLines={wrap ? undefined : 1}
        >
          {chosen ? `${label} ✓` : label}
        </Text>
      </>
    );
  };
  return (
    <QuestionFlashFrame target={formId} light={theme.light}>
      <View style={styles.row} onLayout={onLine}>
        {/* The pill on one line at its whole width, never seen: what decides whether it fits. */}
        <View
          style={styles.measureRoom}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <View style={[styles.pill, styles.measured]} onLayout={onNatural}>
            {choices.map((choice, index) => (
              <View key={index} style={[styles.segment, index > 0 && { borderLeftWidth: divider }]}>
                {content(choice, index, false)}
              </View>
            ))}
            {own !== null ? (
              <View style={[styles.segment, choices.length > 0 && { borderLeftWidth: divider }]}>
                <Text style={styles.label}>{own}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={[styles.pillWrap, stacked && styles.stackedPillWrap]}>
          <View
            style={[styles.pill, stacked && styles.stackedPill, { borderColor: edge }]}
            accessibilityRole="radiogroup"
          >
            {choices.map((choice, index) => {
              const label = str(choice, 'label');
              const chosen = sent && picked === index;
              const recommended = choice.recommended === true && !sent;
              const faded = (sent && !chosen && !changing) || withdrawn;
              const active = clickable && !(chosen && !changing);
              return (
                <Pressable
                  key={index}
                  disabled={!active}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: chosen, disabled: !active }}
                  accessibilityLabel={recommended ? `${label}, recommended` : label}
                  onPress={() => dispatch({ type: 'inlineAnswer', form: formId, choice: index })}
                  style={({ pressed }) => [
                    styles.segment,
                    stacked && styles.stackedSegment,
                    index > 0 &&
                      (stacked
                        ? { borderTopWidth: divider, borderTopColor: edge }
                        : { borderLeftWidth: divider, borderLeftColor: edge }),
                    {
                      backgroundColor: chosen
                        ? theme.foreground
                        : withAlpha(theme.foreground, pressed && active ? 0.1 : 0.035),
                    },
                    faded && styles.faded,
                  ]}
                >
                  {content(choice, index, stacked)}
                </Pressable>
              );
            })}
            {own !== null ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Write your own answer"
                onPress={() => openQuestionReply({ form: formId, tag, name: shortName(str(mark, 'question')) })}
                style={({ pressed }) => [
                  styles.segment,
                  stacked && styles.stackedSegment,
                  choices.length > 0 &&
                    (stacked
                      ? { borderTopWidth: divider, borderTopColor: edge }
                      : { borderLeftWidth: divider, borderLeftColor: edge }),
                  { backgroundColor: withAlpha(theme.foreground, pressed ? 0.1 : 0.035) },
                ]}
              >
                <Text style={[styles.label, stacked && styles.wrapped, { color: theme.cardMuted }]}>
                  {stacked ? `${own}  Write your own answer` : own}
                </Text>
                {stacked && hasReplyDraft ? (
                  <View
                    pointerEvents="none"
                    style={[styles.draftDotInset, { backgroundColor: theme.light ? theme.foreground : '#ffffff' }]}
                  />
                ) : null}
              </Pressable>
            ) : null}
          </View>
          {!stacked && hasReplyDraft ? (
            <View
              pointerEvents="none"
              style={[styles.draftDot, { backgroundColor: theme.light ? theme.foreground : '#ffffff' }]}
            />
          ) : null}
        </View>
        {status !== null ? (
          <View style={styles.status}>
            <Text style={[styles.statusText, { color: theme.cardMuted }]}>{status.text}</Text>
            {status.link !== null ? (
              <Pressable
                hitSlop={8}
                accessibilityRole="button"
                onPress={() => dispatch({ type: 'inlineAnswerChange', form: formId })}
              >
                <Text style={[styles.statusText, styles.statusLink, { color: theme.cardMuted }]}>{status.link}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </QuestionFlashFrame>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  pillWrap: { position: 'relative', flexShrink: 1 },
  stackedPillWrap: { width: '100%' },
  pill: { flexDirection: 'row', borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: 9, overflow: 'hidden', flexShrink: 1 },
  stackedPill: { flexDirection: 'column', width: '100%' },
  draftDot: { position: 'absolute', top: -2, right: -2, width: 6, height: 6, borderRadius: 3 },
  draftDotInset: { position: 'absolute', top: 4, right: 6, width: 6, height: 6, borderRadius: 3 },
  measureRoom: { position: 'absolute', left: 0, top: 0, width: 20000, flexDirection: 'row', opacity: 0 },
  measured: { flexShrink: 0, borderColor: 'transparent' },
  segment: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 32, paddingHorizontal: 13 },
  stackedSegment: { paddingVertical: 7 },
  label: { fontSize: 13.5, fontWeight: '600' },
  wrapped: { flexShrink: 1 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  faded: { opacity: 0.4 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusText: { fontSize: 12 },
  statusLink: { textDecorationLine: 'underline' },
});
