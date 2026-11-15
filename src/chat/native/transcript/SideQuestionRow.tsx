/**
 * A `/btw` side question kept in the transcript after Close (desktop `side_question_row` in
 * `native_chat/side_question.rs`): folded to one line where it was asked, opening to the answer.
 *
 * CDXC:SessionChat 2026-11-15 DECISION: User, picking Q3402 C on the event cards page
 * (~/.local/share/agent-work/Ghostex/chat-event-cards/more-cards.html): the row is the shared one-line
 * card all the way (`singleLineCard.tsx`): the side question's bubble in the tile, just the question as
 * the title and the time, no chevron and no "Side question" pill; it opens to the answer under the
 * card's hairline, as a message card opens. "Not added to the conversation" and Copy move to a long
 * press: the transcript menu's Copy, Add to Chat and Reply take the answer, and the note is its last
 * row. Supersedes the outlined row with its own footer.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Json, ProjectedMessage } from '../../rust/document';
import { SideAnswer } from '../cards/SideQuestionCard';
import { useNativeChatUi, useTranscriptEnv } from './context';
import { obj, str } from './json';
import { useInnerGap } from './messageSpacing';
import {
  SINGLE_LINE_CARD,
  SINGLE_LINE_HEADER_HEIGHT,
  SINGLE_LINE_TITLE,
  SingleLineTileBox,
  TITLE_ROW_GAP,
  singleLinePressed,
  singleLineShell,
} from './singleLineCard';
import { Glyph } from '../cards/icons';
import { useDisclosure } from './state';
import { openTranscriptMenu } from './transcriptMenuStore';

/** The gap under a side question at Message spacing Default (desktop `side_question.rs`). */
const GAP_BELOW = 13;

/** The long press's note, its last row: the answer never went into the conversation. */
const NOT_ADDED = 'Not added to the conversation';

export function SideQuestionRow({ message }: { message: ProjectedMessage }) {
  const { theme, dispatch } = useTranscriptEnv();
  const { disclosures } = useNativeChatUi();
  const card = obj(message.sideQuestion);
  const [open, toggle] = useDisclosure(disclosures, `side-question:${message.id}`);
  const answer = str(card, 'answer');
  const question = str(card, 'question');
  const time = typeof message.time === 'string' ? message.time : '';
  // Message spacing Compact shrinks the gap under it like the row gap (`messageSpacing.ts`).
  const gapBelow = useInnerGap(GAP_BELOW);
  return (
    <View style={[styles.row, gapBelow !== GAP_BELOW && { paddingBottom: gapBelow }]}>
      <View style={singleLineShell(theme)}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Side question: ${question}. ${NOT_ADDED}`}
          accessibilityState={{ expanded: open }}
          onPress={toggle}
          onLongPress={
            answer.length > 0
              ? () =>
                  openTranscriptMenu({
                    selection: answer,
                    actions: [{ label: NOT_ADDED, icon: 'message-circle', run: () => {} }],
                  })
              : undefined
          }
          style={({ pressed }) => [styles.header, pressed && singleLinePressed(theme)]}
        >
          <SingleLineTileBox>
            <Glyph
              name="message-circle"
              size={SINGLE_LINE_CARD.tile.glyphSize}
              color={theme.ink(SINGLE_LINE_CARD.tile.glyphAlpha)}
            />
          </SingleLineTileBox>
          <Text style={[SINGLE_LINE_TITLE, styles.question, { color: theme.foreground }]} numberOfLines={1}>
            {question}
          </Text>
          {time.length > 0 ? <Text style={[styles.time, { color: theme.muted }]}>{time}</Text> : null}
        </Pressable>
        {open ? (
          <View style={[styles.body, { borderTopColor: theme.ink(SINGLE_LINE_CARD.borderAlpha) }]}>
            {answer.length > 0 ? (
              <SideAnswer
                dispatch={dispatch}
                markdown={str(card, 'answerMarkdown')}
                references={card?.answerReferences as Json}
              />
            ) : (
              <Text style={[styles.note, { color: theme.muted }]}>No answer was saved for this side question.</Text>
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingBottom: GAP_BELOW },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: TITLE_ROW_GAP,
    paddingHorizontal: SINGLE_LINE_CARD.paddingX,
    height: SINGLE_LINE_HEADER_HEIGHT,
  },
  question: { flex: 1, minWidth: 0 },
  time: { flexShrink: 0, fontSize: 12, lineHeight: 16 },
  body: { borderTopWidth: 1, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10 },
  note: { fontSize: 13 },
});
