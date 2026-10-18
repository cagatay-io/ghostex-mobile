/**
 * The agent's blocking question (`AskUserQuestion` and the like) and its approval request, drawn
 * from `questionCard` and `prompt`. Port of desktop `question.rs` and `approval.rs`: the same
 * copy, the same actions and payloads.
 *
 * While `prompt.kind` is `question` desktop draws this card in place of the composer; the screen
 * decides that (see `questionReplacesComposer`).
 */

import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';

import type { ChatDocument } from '../../rust/document';
import type { RustChat } from '../../rust/useRustChat';
import { Glyph } from './icons';
import { arr, isTrue, obj, str } from './json';
import { MONO_FONT, themedStyles, useTranscriptTheme } from '../transcript/theme';
import { AskCard, AskHead, AskOption, PrimaryButton, ProgressDots } from './askCard';
import { SingleLineTile } from '../transcript/singleLineCard';
import { CARD_LINE_HEIGHT, CARD_TEXT_SIZE, CardButton, CardHeader, StatusCard, useCardText } from './primitives';
import { ApprovalCard } from './ApprovalCard';
import { useEchoedText } from './useEchoedText';

/** Desktop returns the question card instead of the composer for a `question` prompt. */
export function questionReplacesComposer(document: ChatDocument | null | undefined): boolean {
  return document?.questionCard?.visible === true && str(document.prompt, 'kind') === 'question';
}

export function QuestionCard({ chat, document }: { chat: RustChat; document: ChatDocument }) {
  const cardText = useCardText();
  const card = document.questionCard;
  if (card?.visible !== true) return null;
  if (card.loading) {
    return (
      <StatusCard
        header={<CardHeader icon="help-circle" title="Question" />}
        body={[
          <Text key="restoring" style={cardText.prose}>
            Restoring your answer…
          </Text>,
        ]}
      />
    );
  }
  if (str(document.prompt, 'kind') === 'approval') {
    return <ApprovalCard chat={chat} document={document} />;
  }
  return <QuestionPromptCard chat={chat} document={document} />;
}

function QuestionPromptCard({ chat, document }: { chat: RustChat; document: ChatDocument }) {
  const cardText = useCardText();
  const styles = useStyles();
  const P = useTranscriptTheme();
  const { dispatch } = chat;
  const { height } = useWindowDimensions();
  const card = document.questionCard;
  const prompt = document.prompt;
  const questions = arr(obj(prompt)?.questions);
  const count = questions.length;
  const index = card.questionIndex ?? 0;
  const question = questions[index];
  const draft = card.drafts[index] ?? { indices: [], other: '' };
  const busy = card.busy;
  const multi = isTrue(question, 'multiSelect');
  const header = str(question, 'header');
  const promptKey = useMemo(() => JSON.stringify(prompt), [prompt]);
  const [collapsedKey, setCollapsedKey] = useState<string | null>(null);
  const collapsed = collapsedKey === promptKey;

  const reportText = useCallback((text: string) => dispatch({ type: 'questionText', text }), [dispatch]);
  const [other, setOther] = useEchoedText(`${promptKey}:${index}`, draft.other ?? '', reportText);
  const allowCustom = obj(question)?.allowCustom !== false;

  // The header names the ask over the question's own header and its place (desktop question.rs, CDXC:SessionChat 2026-10-11).
  const detail = collapsed
    ? str(question, 'question')
    : count > 1
      ? header.length > 0
        ? `${header} · ${index + 1} of ${count}`
        : `${index + 1} of ${count}`
      : header;
  const head = (
    <AskHead
      lead={<SingleLineTile glyph='checklist' badge='ask' ring={P.cardPanel} />}
      title="Needs your answer"
      detail={detail}
      trailing={count > 1 && !collapsed ? <ProgressDots index={index} count={count} /> : undefined}
      chevron={collapsed ? 'closed' : 'open'}
      accessibilityLabel={collapsed ? 'Show the question and its options' : 'Hide the question and its options'}
      onPress={() => setCollapsedKey(collapsed ? null : promptKey)}
    />
  );

  const footer = (
    <>
      {index > 0 ? <CardButton label="←" disabled={busy} onPress={() => dispatch({ type: 'questionBack' })} /> : null}
      {allowCustom ? (
        <View style={styles.answerField}>
          <Glyph name="pencil" size={13} color={P.muted} />
          <TextInput
            accessibilityLabel="Your answer"
            style={styles.answerInput}
            value={other}
            onChangeText={setOther}
            editable={!busy}
            multiline
            submitBehavior="submit"
            returnKeyType="send"
            onSubmitEditing={() => dispatch({ type: 'questionNext' })}
            placeholder="Or write your own answer…"
            placeholderTextColor={P.placeholder}
          />
        </View>
      ) : (
        <View style={styles.spacer} />
      )}
      <CardButton label="Cancel" disabled={busy} onPress={() => dispatch({ type: 'questionCancel' })} />
      <PrimaryButton label={card.controls.label} disabled={busy || card.controls.disabled} onPress={() => dispatch({ type: 'questionNext' })} />
    </>
  );

  return (
    <AskCard head={head} footer={footer}>
      {collapsed ? null : (
        <View style={styles.body}>
          <Text style={styles.question}>{str(question, 'question')}</Text>
          {multi ? <Text style={[cardText.hint, styles.multiHint]}>Select one or more options.</Text> : null}
          <ScrollView style={{ maxHeight: height * 0.45 }} contentContainerStyle={styles.options} nestedScrollEnabled>
            {arr(obj(question)?.options).map((option, optionIndex) => {
              // A multi-select note is sent beside the picks, so they stay visible while it is typed.
              const selected = (multi || draft.other.trim().length === 0) && draft.indices.includes(optionIndex);
              const preview = str(option, 'preview');
              return (
                <View key={optionIndex} style={styles.optionWithPreview}>
                  <AskOption
                    label={str(option, 'label')}
                    detail={str(option, 'description')}
                    picked={selected}
                    multiple={multi}
                    enabled={!busy}
                    onPress={() => dispatch({ type: 'questionOption', index: optionIndex })}
                  />
                  {/* The mockup Claude shows beside the option, under the row that picks it (desktop question.rs). */}
                  {preview.length > 0 ? (
                    <ScrollView style={styles.optionPreview} nestedScrollEnabled>
                      <Text style={styles.commandText} selectable>
                        {preview}
                      </Text>
                    </ScrollView>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}
    </AskCard>
  );
}

const useStyles = themedStyles((P) => ({
  body: {
    gap: 12,
  },
  question: {
    color: P.foreground,
    fontSize: 15,
    lineHeight: 22,
  },
  multiHint: {
    marginTop: -6,
  },
  options: {
    gap: 8,
  },
  answerField: {
    flexGrow: 1,
    flexBasis: 160,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: P.inputBorder,
    backgroundColor: P.light ? P.background : P.cardRow,
  },
  answerInput: {
    flex: 1,
    minWidth: 0,
    maxHeight: 96,
    color: P.foreground,
    fontSize: 13.5,
    lineHeight: 20,
    paddingVertical: 6,
    paddingHorizontal: 0,
  },
  spacer: {
    flexGrow: 1,
  },
  optionWithPreview: {
    gap: 6,
  },
  optionPreview: {
    maxHeight: 160,
    marginLeft: 28,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: P.wellFill,
  },
  commandText: {
    color: P.cardMuted,
    fontFamily: MONO_FONT,
    fontSize: 13,
    lineHeight: 20,
  },
}));
