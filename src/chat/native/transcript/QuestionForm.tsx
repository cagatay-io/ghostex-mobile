/**
 * A question form an agent wrote as a ```questions block, drawn where the block sits in its reply:
 * every question at once, choices picked with a tap, a note or text box per question, and one Send
 * button. The rules (picks, Other, what is sent, the answered state) are the chat core's
 * (`questionForms`, packages/gx-chat-core/src/questions/forms.rs); this file only lays them out.
 *
 * CDXC:SessionChat 2026-10-11 SEE-ALSO:
 * Desktop draws the same form in apps/desktop/src/app/native_chat/question_form.rs; the grammar is
 * packages/gx-chat-core/src/transcript/question_forms.rs. Change them together.
 */

import { createContext, useCallback, useContext } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Json } from '../../rust/document';
import { useTranscriptEnv } from './context';
import { useRevealFocusedField } from './fieldReveal';
import { useEchoedText } from '../cards/useEchoedText';
import { AskCard, AskHead, AskOption, PrimaryButton, SoftButton, answeredColor, type AskTone } from '../cards/askCard';
import type { GlyphName } from '../cards/icons';
import { arr, obj, str, type JsonRecord } from './json';
import { SingleLinePill } from './singleLineCard';
import { MONO_FONT } from './theme';
import { QuestionFlashFrame } from './OpenQuestions';

/** The document's `questionForms`, by form id. */
const FormsContext = createContext<{ [id: string]: Json }>({});
export const QuestionFormsProvider = FormsContext.Provider;

function letter(index: number): string {
  return index < 26 ? String.fromCharCode(97 + index) : String(index + 1);
}

/** The form's own notes box's hint; desktop (question_form.rs) says the same. */
const NOTES_PLACEHOLDER = 'Anything else? (optional)';

function placeholder(question: JsonRecord | null, draft: JsonRecord | null): string {
  if (question?.text === true) return str(question, 'placeholder') || 'Your answer (optional)';
  return draft?.otherPicked === true ? 'What would you prefer instead? (optional)' : 'Note (optional)';
}

/** The form, outlined for a moment when the Previous question pill or a Q-tag link lands on it. */
export function QuestionForm({ id, source }: { id: string; source: string }) {
  const { theme } = useTranscriptEnv();
  return (
    <QuestionFlashFrame target={id} light={theme.light}>
      <QuestionFormCard id={id} source={source} />
    </QuestionFlashFrame>
  );
}

function QuestionFormCard({ id, source }: { id: string; source: string }) {
  const { theme, dispatch } = useTranscriptEnv();
  const form = obj(useContext(FormsContext)[id]);
  if (form === null) {
    return <Text style={[styles.source, { color: theme.cardMuted }]}>{source}</Text>;
  }
  const phase = str(form, 'state');
  const enabled = phase === 'open';
  const error = str(form, 'error');
  const questions = arr(form.questions);
  // The tile carries the form's state: amber while it waits, green once answered (desktop question_form.rs).
  const tone: AskTone = error.length > 0 ? 'quiet' : phase === 'answered' ? 'answered' : 'ask';
  const icon: GlyphName = error.length > 0 ? 'alert-circle' : phase === 'answered' ? 'check' : 'help-circle';
  const detail =
    error.length > 0
      ? "Couldn't be shown"
      : phase === 'answered'
        ? 'Sent to the agent'
        : phase === 'sending'
          ? 'Sending…'
          : phase === 'queued'
            ? 'Queued'
            : questions.length === 1
              ? '1 question'
              : `${questions.length} questions`;
  const drafts = arr(form.drafts);
  const questionViews = questions.map((question, index) => (
    <View key={index} style={index > 0 ? [styles.later, { borderTopColor: theme.ink(0.06) }] : undefined}>
      <FormQuestion
        formId={id}
        index={index}
        question={obj(question)}
        draft={obj(drafts[index])}
        otherLabel={str(form, 'otherLabel')}
        enabled={enabled}
        answered={phase === 'answered'}
      />
    </View>
  ));
  // The form's own notes box under the last question (the SessionChat 2026-10-14 DECISION in
  // packages/gx-chat-core/src/questions/forms.rs).
  const notes = str(form, 'notes');
  const body =
    form.takesNotes === true && (enabled || notes.trim().length > 0) ? (
      <>
        {questionViews}
        <View style={[styles.later, { borderTopColor: theme.ink(0.06) }]}>
          <FormNotes formId={id} notes={notes} enabled={enabled} />
        </View>
      </>
    ) : (
      questionViews
    );
  // An answered form is one line that opens the read-only form and closes it again; the core says
  // which (`collapsed`, the SessionChat 2026-10-12 DECISION in packages/gx-chat-core/src/questions/forms.rs).
  if (phase === 'answered' && error.length === 0) {
    const open = form.collapsed !== true;
    return (
      <AskCard
        singleLine
        head={
          <AskHead
            singleLine
            title={str(form, 'title') || 'Questions'}
            trailing={<SingleLinePill icon="check" label="Answered" color={answeredColor(theme.light)} />}
            accessibilityLabel={open ? 'Hide the questions' : 'Show the questions'}
            onPress={() => dispatch({ type: 'formToggle', form: id })}
          />
        }
      >
        {open ? body : null}
      </AskCard>
    );
  }
  const head = <AskHead icon={icon} tone={tone} title={str(form, 'title') || 'Questions'} detail={detail} />;
  if (error.length > 0) {
    return (
      <AskCard head={head}>
        <View style={styles.errorBody}>
          <Text style={{ color: theme.error }}>These questions could not be shown: {error}</Text>
          {form.resent === true ? (
            // Desktop question_form.rs RESENT_NOTE: gxserver asked the agent to send them again.
            <Text style={[styles.detail, { color: theme.cardMuted }]}>Ghostex asked the agent to send these questions again.</Text>
          ) : null}
          <Text style={[styles.source, { color: theme.cardMuted }]}>{source}</Text>
        </View>
      </AskCard>
    );
  }
  const canSend = form.canSend === true;
  const sendError = str(form, 'sendError');
  const status =
    phase === 'answered'
      ? 'Sent to the agent.'
      : phase === 'queued'
        ? "Queued: it goes to the agent once it's ready."
        : phase === 'sending'
        ? 'Sending…'
        : sendError.length > 0
          ? sendError
          : 'Questions you leave blank are sent as skipped.';
  const sendLabel = phase === 'answered' ? 'Sent' : phase === 'queued' ? 'Queued' : str(form, 'submit');
  const footer = (
    <>
      <Text style={[styles.status, { color: enabled && sendError.length > 0 ? theme.error : theme.muted }]}>{status}</Text>
      {enabled ? (
        // Skip all sends at once, every question not yet answered skipped (the core's `skip_all`; the
        // SessionChat 2026-10-16 DECISION on `SKIPPED` in packages/gx-visual/src/questions.rs).
        <SoftButton label="Skip all" onPress={() => dispatch({ type: 'formSkipAll', form: id })} />
      ) : null}
      <PrimaryButton label={sendLabel} disabled={!canSend} onPress={() => dispatch({ type: 'formSend', form: id })} />
    </>
  );
  return (
    <AskCard head={head} footer={footer}>
      {body}
    </AskCard>
  );
}

function FormNotes({ formId, notes, enabled }: { formId: string; notes: string; enabled: boolean }) {
  const { theme, dispatch } = useTranscriptEnv();
  const report = useCallback((text: string) => dispatch({ type: 'formNotes', form: formId, text }), [dispatch, formId]);
  const [text, setText] = useEchoedText(`${formId}:notes`, notes, report);
  const reveal = useRevealFocusedField();
  if (!enabled) {
    return (
      <Text selectable style={[styles.detail, { color: theme.cardMuted }]}>
        Notes: {notes}
      </Text>
    );
  }
  return (
    <TextInput
      multiline
      value={text}
      placeholder={NOTES_PLACEHOLDER}
      placeholderTextColor={theme.placeholder}
      accessibilityLabel="Notes"
      onFocus={reveal}
      onContentSizeChange={reveal}
      onChangeText={setText}
      style={[
        styles.input,
        { color: theme.foreground, borderColor: theme.inputBorder, backgroundColor: theme.light ? theme.background : theme.cardRow },
      ]}
    />
  );
}

function FormQuestion({
  formId,
  index,
  question,
  draft,
  otherLabel,
  enabled,
  answered,
}: {
  formId: string;
  index: number;
  question: JsonRecord | null;
  draft: JsonRecord | null;
  otherLabel: string;
  enabled: boolean;
  answered: boolean;
}) {
  const { theme, dispatch } = useTranscriptEnv();
  const tag = str(question, 'tag');
  const detail = str(question, 'detail');
  const multiple = question?.multiple === true;
  const isText = question?.text === true;
  const picked = new Set(arr(draft?.indices).filter((value): value is number => typeof value === 'number'));
  const choices = arr(question?.choices);
  const written = str(draft, 'other');
  const pick = (choice: number) => dispatch({ type: 'formChoice', form: formId, question: index, choice });
  const report = useCallback(
    (text: string) => dispatch({ type: 'formText', form: formId, question: index, text }),
    [dispatch, formId, index]
  );
  const [text, setText] = useEchoedText(`${formId}:${index}`, written, report);
  const reveal = useRevealFocusedField();
  const skipped = draft?.skipped === true;
  return (
    <View style={styles.question}>
      <View style={styles.questionHead}>
        {tag.length > 0 ? (
          <Text style={[styles.tag, { color: theme.muted, backgroundColor: `${theme.muted}2e` }]}>{tag}</Text>
        ) : null}
        <Text style={[styles.questionTitle, { color: theme.foreground }]}>{str(question, 'title')}</Text>
      </View>
      {detail.length > 0 ? <Text style={[styles.detail, { color: theme.cardMuted }]}>{detail}</Text> : null}
      {!isText && multiple ? <Text style={[styles.hint, { color: theme.muted }]}>Pick any that apply.</Text> : null}
      {!isText
        ? choices.map((choice, choiceIndex) => (
            <AskOption
              key={choiceIndex}
              keyLabel={letter(choiceIndex)}
              label={str(choice, 'label')}
              detail={str(choice, 'detail')}
              recommended={obj(choice)?.recommended === true}
              picked={picked.has(choiceIndex)}
              multiple={multiple}
              enabled={enabled}
              answered={answered}
              onPress={() => pick(choiceIndex)}
            />
          ))
        : null}
      {!isText ? (
        <AskOption
          keyLabel={letter(choices.length)}
          label={otherLabel}
          picked={draft?.otherPicked === true}
          multiple={multiple}
          other
          enabled={enabled}
          answered={answered}
          onPress={() => pick(choices.length)}
        />
      ) : null}
      {enabled ? (
        <TextInput
          multiline
          value={text}
          placeholder={placeholder(question, draft)}
          placeholderTextColor={theme.placeholder}
          onFocus={reveal}
          onContentSizeChange={reveal}
          onChangeText={setText}
          style={[
            styles.input,
            { color: theme.foreground, borderColor: theme.inputBorder, backgroundColor: theme.light ? theme.background : theme.cardRow },
            isText && styles.textAnswer,
          ]}
        />
      ) : written.trim().length > 0 ? (
        <Text selectable style={[styles.detail, { color: theme.cardMuted }]}>
          {isText ? written : `Note: ${written}`}
        </Text>
      ) : skipped ? (
        <Text style={[styles.detail, { color: theme.muted }]}>Skipped</Text>
      ) : isText ? (
        <Text style={[styles.detail, { color: theme.muted }]}>Not answered</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  later: { marginTop: 16, paddingTop: 16, borderTopWidth: 1 },
  errorBody: { gap: 8 },
  question: { gap: 8 },
  // The user's pick (desktop question_form.rs): the tag is a filled chip above the title.
  questionHead: { alignItems: 'flex-start', gap: 4 },
  tag: { fontFamily: MONO_FONT, fontSize: 10.5, lineHeight: 18, fontWeight: '500', paddingHorizontal: 7, borderRadius: 999, overflow: 'hidden' },
  questionTitle: { alignSelf: 'stretch', fontSize: 15, lineHeight: 22, fontWeight: '500' },
  detail: { fontSize: 13, lineHeight: 19 },
  hint: { fontSize: 12 },
  input: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13.5, minHeight: 38, textAlignVertical: 'top' },
  textAnswer: { minHeight: 70 },
  status: { flex: 1, fontSize: 12.5 },
  source: { fontFamily: MONO_FONT, fontSize: 12 },
});
