/**
 * A coordinator's threads' approval cards, relayed to its own chat (`relayedApprovals` in the chat
 * core's document, `packages/gx-chat-core/src/extras/relayed_approvals.rs`, which holds the user's
 * decision): the card under the thread's "waiting for an answer" report, the Approvals pill's
 * sheet, and, in the thread's own chat, the "Approved from <coordinator>" line. The board's Needs
 * you row draws the same buttons (`CoordinatorBoard.tsx`). Port of desktop `relayed_approval.rs`.
 *
 * A tap sends `answerRelayedApproval`; the core turns it into the thread card's own answer for the
 * thread's session. Every button is a neutral fill, never the dark primary one: the card sits on
 * the chat's glass (the user's standing rule, no black fills on glass).
 */

import { useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';

import type { ChatDocument } from '../../rust/document';
import type { RustChat } from '../../rust/useRustChat';
import { SidebarPalette } from '../../../theme/palette';
import { Glyph, type GlyphName } from './icons';
import { arr, isTrue, obj, str, type JsonRecord } from './json';
import { relayedCards } from './relayedApprovals';
import { CARD_TEXT_SIZE } from './primitives';
import { AutoBlockLine, CommandBox, PendingAnswerNote, ToneButton, ToneCard, dimPending } from './ToneCard';
import { themedStyles, useTranscriptTheme } from '../transcript/theme';
import {
  SINGLE_LINE_CARD,
  SINGLE_LINE_HEADER_HEIGHT,
  SINGLE_LINE_TITLE,
  SingleLineBadge,
  SingleLineTileBox,
  TITLE_ROW_GAP,
  singleLinePressed,
  singleLineShell,
} from '../transcript/singleLineCard';

type Dispatch = RustChat['dispatch'];

/** "2:15 PM" for an ISO time, empty when it does not parse. */
function clock(at: string): string {
  const time = Date.parse(at);
  if (Number.isNaN(time)) return '';
  return new Date(time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** One relayed card: open with the thread's own buttons, or one line saying how it ended. */
export function RelayedApprovalCard({
  card,
  dispatch,
  pinned,
}: {
  card: JsonRecord;
  dispatch: Dispatch;
  /** Its buttons stay in sight and only its body scrolls when it is taller than its room (the sheet). */
  pinned?: boolean;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const [codeOpen, setCodeOpen] = useState(false);
  if (!isTrue(card, 'open')) return <RelayedSettledRow card={card} />;
  const key = str(card, 'key');
  const busy = isTrue(card, 'busy');
  const code = str(card, 'code');
  const preview = str(card, 'codePreview');
  const more = str(card, 'codeMore');
  const reason = str(obj(card.reason), 'text');
  const error = str(card, 'error');
  const detail = [str(card, 'header'), str(card, 'threadTitle'), str(card, 'source')]
    .filter((part) => part.length > 0)
    .join(' · ');
  const choices = arr(card.choices)
    .map(obj)
    .filter((choice): choice is JsonRecord => choice !== null);
  const lasting = choices.map((choice) => str(choice, 'tooltip')).filter((tip) => tip.length > 0);
  return (
    <ToneCard
      tone="approval"
      icon="shield-check"
      pinFooter={pinned}
      title={str(card, 'title')}
      detail={detail}
      body={dimPending(
        [
          code.length > 0 ? (
            <View key="code" style={styles.code}>
              <CommandBox
                command={codeOpen || preview.length === 0 ? code : preview}
                shell={str(card, 'codeLabel') === 'Command'}
              />
              {more.length > 0 ? (
                <Text
                  accessibilityRole="button"
                  accessibilityLabel={codeOpen ? 'Show less of the command' : `Show all of the command, ${more}`}
                  style={styles.more}
                  onPress={() => setCodeOpen((was) => !was)}
                >
                  {codeOpen ? 'Show less' : 'Show all'}
                </Text>
              ) : null}
            </View>
          ) : null,
          reason.length > 0 ? (
            <Text key="reason" style={styles.reason}>
              {reason}
            </Text>
          ) : null,
          // The phone has no hover, so what a lasting choice changes is said under the card.
          ...lasting.map((tip, index) => (
            <Text key={`tip:${index}`} style={styles.tip}>
              {tip}
            </Text>
          )),
          str(card, 'autoBlockAt').length > 0 ? <AutoBlockLine key="auto-block" at={str(card, 'autoBlockAt')} /> : null,
          error.length > 0 ? (
            <Text key="error" style={styles.error}>
              {error}
            </Text>
          ) : null,
        ].filter(Boolean),
        busy,
      )}
      footerStart={
        busy
          ? [<PendingAnswerNote key="pending" words="Sending…" />]
          : [
              <Pressable
                key="open"
                accessibilityRole="link"
                accessibilityLabel="Open the thread"
                hitSlop={6}
                onPress={() =>
                  dispatch({
                    type: 'openCoordinatorThread',
                    projectId: str(card, 'projectId'),
                    sessionId: str(card, 'sessionId'),
                  })
                }
                style={styles.note}
              >
                <Glyph name="shield-check" size={13} color={P.muted} />
                <Text style={styles.noteText}>{str(card, 'note')}</Text>
              </Pressable>,
            ]
      }
      footerEnd={choices.map((choice, index) => (
        <ToneButton
          key={`choice:${index}`}
          kind="secondary"
          label={str(choice, 'label')}
          disabled={busy}
          onPress={() => dispatch({ type: 'answerRelayedApproval', key, choice: index })}
        />
      ))}
    />
  );
}

/** How a settled card ended, as its tile's badge: a green check, a red cross or an amber clock. */
const SETTLED_BADGE: Record<string, { fill: string; icon: GlyphName }> = {
  good: { fill: SINGLE_LINE_CARD.badge.fill, icon: 'check' },
  bad: { fill: SINGLE_LINE_CARD.badge.errorFill, icon: 'x' },
  warn: { fill: '#d97706', icon: 'clock' },
};

/**
 * An ended card as the shared one-line card (`singleLineCard.tsx`): the approvals shield in the
 * tile with how it ended as the badge, how it ended as the title and when; a tap opens the whole
 * sentence and the command it asked about.
 *
 * CDXC:SessionChat 2026-11-15 DECISION: User, picking Q3401 B on the event cards page
 * (~/.local/share/agent-work/Ghostex/chat-event-cards/more-cards.html): a settled approval is the
 * shared card that opens, not the smaller tinted line whose sentence wrapped to two lines. Desktop
 * `relayed_settled_row` (native_chat/relayed_approval.rs).
 */
function RelayedSettledRow({ card }: { card: JsonRecord }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const [open, setOpen] = useState(false);
  const badge = SETTLED_BADGE[str(card, 'settledTone')];
  const time = clock(str(card, 'settledAt'));
  const lead = str(card, 'settledLead');
  const sentence = str(card, 'settledText');
  const code = str(card, 'code');
  return (
    <View style={singleLineShell(P)}>
      <Pressable
        onPress={() => setOpen((was) => !was)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${lead} ${sentence}`}
        style={({ pressed }) => [styles.settledHeader, pressed && singleLinePressed(P)]}
      >
        <SingleLineTileBox>
          <Glyph
            name="shield-check"
            size={SINGLE_LINE_CARD.tile.glyphSize}
            color={P.ink(SINGLE_LINE_CARD.tile.glyphAlpha)}
          />
          {badge !== undefined ? (
            <SingleLineBadge fill={badge.fill}>
              <Glyph name={badge.icon} size={SINGLE_LINE_CARD.badge.glyphSize + 2} color="#ffffff" />
            </SingleLineBadge>
          ) : null}
        </SingleLineTileBox>
        <Text numberOfLines={1} style={[SINGLE_LINE_TITLE, styles.settledTitle]}>
          {lead.replace(/\.$/u, '')}
        </Text>
        {time.length > 0 ? <Text style={styles.settledTime}>{time}</Text> : null}
      </Pressable>
      {open ? (
        <View style={styles.settledBody}>
          {sentence.length > 0 ? <Text style={styles.settledSentence}>{sentence}</Text> : null}
          {code.length > 0 ? <CommandBox command={code} shell={str(card, 'codeLabel') === 'Command'} /> : null}
        </View>
      ) : null}
    </View>
  );
}

/** The Approvals pill's sheet: every card that waits on the user. */
export function RelayedApprovalsMenu({ chat, document }: { chat: RustChat; document: ChatDocument }) {
  const styles = useStyles();
  const { height } = useWindowDimensions();
  const open = relayedCards(document).filter((card) => isTrue(card, 'open'));
  // CDXC:SessionChat 2026-11-16 DECISION: User: a card's Yes / No stay pinned at its bottom and
  // only its command area scrolls. Each card is at most about half the screen, so it always fits
  // the sheet (80% of the screen) with its buttons in sight; several cards scroll as a list.
  // SEE-ALSO: apps/desktop/src/app/native_chat/relayed_approval.rs (`approvals_menu_body`).
  const cardMax = Math.max(240, Math.round(height * 0.55));
  return (
    <ScrollView style={styles.menu} contentContainerStyle={styles.menuList} nestedScrollEnabled>
      {open.map((card) => (
        <View key={str(card, 'key')} style={{ maxHeight: cardMax }}>
          <RelayedApprovalCard card={card} dispatch={chat.dispatch} pinned />
        </View>
      ))}
    </ScrollView>
  );
}

/**
 * The board row's buttons for its thread's open card: one segmented pill, the thread card's own
 * choices, and the question on the line under it (the phone has no tooltip).
 */
export function BoardRelayButtons({ card, dispatch }: { card: JsonRecord; dispatch: Dispatch }) {
  const styles = useStyles();
  const key = str(card, 'key');
  const busy = isTrue(card, 'busy');
  const choices = arr(card.choices)
    .map(obj)
    .filter((choice): choice is JsonRecord => choice !== null);
  return (
    <View style={styles.segmented}>
      {choices.map((choice, index) => (
        <Pressable
          key={`relay:${index}`}
          accessibilityRole="button"
          accessibilityLabel={`${str(choice, 'label')}: ${str(card, 'title')}`}
          disabled={busy}
          onPress={() => dispatch({ type: 'answerRelayedApproval', key, choice: index })}
          style={({ pressed }) => [
            styles.segment,
            index > 0 && styles.segmentDivider,
            pressed && styles.segmentPressed,
            busy && styles.segmentBusy,
          ]}
        >
          <Text
            style={[styles.segmentText, str(choice, 'tone') === 'deny' && { color: SidebarPalette.ROW_APPROVAL }]}
            numberOfLines={1}
          >
            {str(choice, 'label')}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const useStyles = themedStyles((P) => ({
  code: {
    gap: 4,
  },
  more: {
    color: P.muted,
    fontSize: 12.5,
  },
  reason: {
    color: '#f5a524',
    fontSize: 12.5,
    lineHeight: 17,
  },
  tip: {
    color: P.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  error: {
    color: '#ef9999',
    fontSize: 12.5,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  noteText: {
    color: P.muted,
    fontSize: 12,
  },
  settledHeader: {
    height: SINGLE_LINE_HEADER_HEIGHT,
    paddingHorizontal: SINGLE_LINE_CARD.paddingX,
    flexDirection: 'row',
    alignItems: 'center',
    gap: TITLE_ROW_GAP,
  },
  settledTitle: { flex: 1, minWidth: 0, color: P.foreground },
  settledTime: { flexShrink: 0, fontSize: 12, lineHeight: 16, color: P.muted },
  settledBody: {
    borderTopWidth: 1,
    borderTopColor: P.ink(0.06),
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 6,
  },
  settledSentence: { fontSize: 13, lineHeight: 19, color: P.cardMuted },
  /**
   * The list shrinks to the room the sheet has (80% of the screen at most), so on a short phone
   * it scrolls inside the sheet. Without `flexShrink` it kept its full height and ran past the
   * sheet's bottom edge, and the last card's buttons could not be scrolled to (2026-11-16).
   */
  menu: {
    maxHeight: 560,
    flexShrink: 1,
  },
  menuList: {
    gap: 8,
    paddingBottom: 8,
  },
  segmented: {
    flexDirection: 'row',
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: P.ink(0.14),
    overflow: 'hidden',
    flexShrink: 1,
  },
  segment: {
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  segmentDivider: {
    borderLeftWidth: 1,
    borderLeftColor: P.ink(0.14),
  },
  segmentPressed: {
    backgroundColor: P.ink(0.1),
  },
  segmentBusy: {
    opacity: 0.5,
  },
  segmentText: {
    color: P.foreground,
    fontSize: 12.5,
  },
}));
