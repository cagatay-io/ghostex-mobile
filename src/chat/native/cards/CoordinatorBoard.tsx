/**
 * A coordinator's board, the Board pill's sheet: its lines of work grouped by who has the ball
 * (Backlog, To do, Needs you, Blocked, Moving, Done today, Removed), each a card of its title and
 * its work's links.
 * Groups, rows, tags, folds and counts come from the core (gx-chat-core
 * `extras/coordinator_board.rs`, where the user's decision lives); this only lays them out. A row
 * opens its thread, its question card or its link, as the desktop's side panel does
 * (`apps/desktop/src/app/native_chat/coordinator_board.rs`).
 */

import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import type { ChatDocument } from '../../rust/document';
import type { UserAction } from '../../rust/actions';
import type { RustChat } from '../../rust/useRustChat';
import { SidebarPalette } from '../../../theme/palette';
import { Glyph } from './icons';
import { arr, asJson, isTrue, num, obj, str } from './json';
import { PROSE_SIZE, themedStyles, useTranscriptTheme } from '../transcript/theme';
import { remoteWorkerNotice } from './remoteWorker';
import { AgentMark } from './agentMark';

/** Each group's colour: the sidebar's question pink, approval red and working amber. */
const GROUP_COLOR: Record<string, string | null> = {
  needs: SidebarPalette.ROW_QUESTION,
  blocked: SidebarPalette.ROW_APPROVAL,
  moving: '#c68a06',
  done: '#2fa865',
};

/** The Board pill's coloured counts: Needs you, Blocked, Moving, each in its group's colour. */
export function boardPillCounts(document: ChatDocument): { color: string; count: number }[] {
  return arr(obj(document.coordinatorBoard)?.pillCounts).flatMap((pair) => {
    if (!Array.isArray(pair) || typeof pair[0] !== 'string' || typeof pair[1] !== 'number') return [];
    const color = GROUP_COLOR[pair[0]];
    return color ? [{ color, count: pair[1] }] : [];
  });
}

/** A chip's words: what the link is, then its label ("PR #414", "Issue #12", "GHX-142"). */
function chipLabel(kind: string, label: string): string {
  switch (kind) {
    case 'pr':
      return `PR ${label}`;
    case 'issue':
      return `Issue ${label}`;
    default:
      return label;
  }
}

/** A tag's tint (`BoardTag::tone`), or null for the muted chip. */
function toneColor(tone: string): string | null {
  switch (tone) {
    case 'question':
      return SidebarPalette.ROW_QUESTION;
    case 'bad':
      return SidebarPalette.ROW_APPROVAL;
    case 'running':
    case 'warn':
      return '#c68a06';
    case 'good':
      return '#2fa865';
    case 'held':
    case 'merged':
      return '#8b78f0';
    case 'closed':
      return '#8a8f98';
    default:
      return null;
  }
}

/** The group's marker: a ring with a dot, a filled disc, a dashed ring or a check. */
function GroupMarker({ group }: { group: string }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const color = GROUP_COLOR[group] ?? P.cardMuted;
  if (group === 'done') return <Glyph name="circle-check-filled" size={12} color={color} />;
  if (group === 'blocked' || group === 'moving') {
    return <View style={[styles.disc, { backgroundColor: color }]} />;
  }
  if (group === 'needs') {
    return (
      <View style={[styles.ring, { borderColor: color }]}>
        <View style={[styles.ringDot, { backgroundColor: color }]} />
      </View>
    );
  }
  return <View style={[styles.ring, { borderColor: color, borderStyle: 'dashed' }]} />;
}

export function CoordinatorBoardMenu({
  chat,
  document,
  onDone,
}: {
  chat: RustChat;
  document: ChatDocument;
  onDone: () => void;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  // The row whose × was tapped once, waiting three seconds for the second tap (desktop
  // `REMOVE_ARMED_FOR`, as the links list's ×).
  const [armed, setArmed] = useState<string | null>(null);
  useEffect(() => {
    if (armed === null) return;
    const timer = setTimeout(() => setArmed(null), 3000);
    return () => clearTimeout(timer);
  }, [armed]);
  const board = obj(document.coordinatorBoard);
  if (board === null) return null;
  const tapRemove = (key: string, remove: unknown) => {
    if (armed === key) {
      setArmed(null);
      chat.dispatch(asJson(remove) as unknown as UserAction);
    } else {
      setArmed(key);
    }
  };
  const run = (command: unknown) => {
    const type = str(command, 'type');
    if (type.length === 0) return;
    // A thread on another computer: the phone talks only to the coordinator's computer.
    if (type === 'openCoordinatorThread' && str(command, 'serverId').trim().length > 0) {
      const notice = remoteWorkerNotice('another computer');
      Alert.alert(notice.title, notice.message);
      return;
    }
    chat.dispatch(asJson(command) as unknown as UserAction);
    onDone();
  };
  return (
    <View accessibilityLabel="Board" style={styles.menu}>
      <Text style={styles.meta} numberOfLines={1}>
        {isTrue(board, 'empty') ? 'Nothing open' : str(board, 'meta')}
      </Text>
      <ScrollView style={styles.rows} nestedScrollEnabled>
        {arr(board.groups).map((group) => {
          const id = str(group, 'id');
          const open = isTrue(group, 'open');
          const more = str(group, 'moreLabel');
          return (
            <View key={id}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                accessibilityLabel={`${str(group, 'title')}, ${num(group, 'count') ?? 0}`}
                onPress={() => chat.dispatch({ type: 'toggleCoordinatorBoardGroup', group: id })}
                style={styles.groupLine}
              >
                <Glyph name={open ? 'chevron-down' : 'chevron-right'} size={12} color={P.cardMuted} />
                <GroupMarker group={id} />
                <Text style={styles.groupTitle}>{str(group, 'title')}</Text>
                <Text style={styles.groupCount}>{num(group, 'count') ?? 0}</Text>
              </Pressable>
              {arr(obj(group)?.rows).map((row, index) => {
                const command = obj(obj(row)?.command);
                const openThread = obj(obj(row)?.openThread);
                const key = str(row, 'key') || String(index);
                const remove = obj(obj(row)?.remove);
                const restore = obj(obj(row)?.restore);
                const tags = arr(obj(row)?.tags);
                const answers = arr(obj(row)?.answers);
                const reference = str(row, 'reference');
                const note = str(row, 'note');
                // A tap puts the card's reference in the chat box so the user can comment on it
                // (desktop `insert_board_reference`); a question's card jumps to it instead.
                const tapCard =
                  reference.length > 0
                    ? () => {
                        chat.dispatch({
                          type: 'insertBoardReference',
                          reference,
                          text: chat.state?.composer.text ?? '',
                        } as unknown as UserAction);
                        onDone();
                      }
                    : command !== null
                      ? () => run(command)
                      : undefined;
                // At most two chips fit beside the age; the rest are counted in "+N" (desktop
                // `fit_chips`), so a card keeps its two lines.
                const shownTags = tags.slice(0, 2);
                const hiddenTags = tags.length - shownTags.length;
                return (
                  <Pressable
                    key={key}
                    accessibilityRole={tapCard !== undefined ? 'button' : 'text'}
                    accessibilityLabel={str(row, 'title')}
                    accessibilityHint={remove !== null ? 'Long-press to remove it from the board' : undefined}
                    onPress={tapCard}
                    onLongPress={remove !== null ? () => setArmed(key) : undefined}
                    style={styles.card}
                  >
                    <View style={styles.cardTitleLine}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {str(row, 'title')}
                      </Text>
                      {openThread !== null ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Open the thread ${str(row, 'title')}`}
                          hitSlop={6}
                          onPress={() => run(openThread)}
                          style={styles.agentButton}
                        >
                          <AgentMark icon={str(row, 'agentIcon') || null} size={14} />
                        </Pressable>
                      ) : null}
                      {restore !== null ? (
                        <Text
                          accessibilityRole="button"
                          accessibilityLabel="Restore to the board"
                          style={styles.restore}
                          onPress={() => chat.dispatch(asJson(restore) as unknown as UserAction)}
                        >
                          Restore
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.chipLine}>
                      <View style={styles.chips}>
                        {answers.length > 0 ? (
                          <View style={styles.answers}>
                            {answers.map((answer, answerIndex) => (
                              <Pressable
                                key={`answer:${answerIndex}`}
                                accessibilityRole="button"
                                accessibilityLabel={`Answer ${str(answer, 'label')}`}
                                onPress={() =>
                                  chat.dispatch(asJson(obj(answer)?.command) as unknown as UserAction)
                                }
                                style={[
                                  styles.answer,
                                  answerIndex > 0 && styles.answerDivider,
                                  isTrue(answer, 'picked') && styles.answerPicked,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.tagText,
                                    (isTrue(answer, 'picked') || isTrue(answer, 'recommended')) && styles.answerStrong,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {str(answer, 'label')}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        ) : tags.length === 0 ? (
                          <Text style={note.length > 0 ? styles.note : styles.noLinks} numberOfLines={1}>
                            {note.length > 0 ? note : 'No links yet'}
                          </Text>
                        ) : null}
                        {(answers.length > 0 ? [] : shownTags).map((tag, tagIndex) => {
                          const tint = toneColor(str(tag, 'tone'));
                          const open = obj(obj(tag)?.command);
                          const coloured = str(tag, 'kind') === 'release' || str(tag, 'kind') === 'question';
                          return (
                            <Pressable
                              key={`${str(tag, 'kind')}:${tagIndex}`}
                              accessibilityRole={open !== null ? 'link' : 'text'}
                              accessibilityLabel={str(tag, 'title') || str(tag, 'label')}
                              onPress={open !== null ? () => run(open) : undefined}
                              style={[styles.tag, coloured && tint !== null && { borderColor: tint }]}
                            >
                              {!coloured ? (
                                <View style={[styles.tagDot, { backgroundColor: tint ?? P.cardMuted }]} />
                              ) : null}
                              <Text
                                style={[styles.tagText, coloured && tint !== null && { color: tint }]}
                                numberOfLines={1}
                                ellipsizeMode="tail"
                              >
                                {chipLabel(str(tag, 'kind'), str(tag, 'label'))}
                              </Text>
                            </Pressable>
                          );
                        })}
                        {answers.length === 0 && hiddenTags > 0 ? (
                          <View style={styles.tag}>
                            <Text style={styles.tagText}>{`+${hiddenTags}`}</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.age}>{str(row, 'age')}</Text>
                    </View>
                    {remove !== null && armed === key ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Tap to move it to Removed"
                        hitSlop={8}
                        onPress={() => tapRemove(key, remove)}
                        style={styles.removeBadge}
                      >
                        <Glyph name="x" size={11} color={SidebarPalette.ROW_APPROVAL} />
                      </Pressable>
                    ) : null}
                  </Pressable>
                );
              })}
              {more.length > 0 ? (
                <Text
                  accessibilityRole="button"
                  style={styles.more}
                  onPress={() => chat.dispatch({ type: 'coordinatorBoardMore', group: id })}
                >
                  {more}
                </Text>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const useStyles = themedStyles((P) => ({
  menu: {
    flexShrink: 1,
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  meta: {
    color: P.cardMuted,
    fontSize: PROSE_SIZE,
  },
  rows: {
    flexShrink: 1,
  },
  groupLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 7,
  },
  groupTitle: {
    color: P.foreground,
    fontSize: PROSE_SIZE,
    fontWeight: '600',
  },
  groupCount: {
    color: P.cardMuted,
    fontSize: PROSE_SIZE,
    fontVariant: ['tabular-nums'],
  },
  ring: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  disc: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  /** A line of work's card: two lines, always (desktop `board_card`). */
  card: {
    position: 'relative',
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: P.ink(0.08),
    backgroundColor: P.ink(0.035),
  },
  cardTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowTitle: {
    flex: 1,
    color: P.foreground,
    fontSize: PROSE_SIZE,
  },
  age: {
    color: P.cardMuted,
    fontSize: PROSE_SIZE - 2,
    fontVariant: ['tabular-nums'],
  },
  agentButton: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: P.ink(0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 24,
  },
  chips: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    overflow: 'hidden',
  },
  /** The red × that floats over a long-pressed card's top-right corner (desktop `board_remove_badge`). */
  removeBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.5)',
    backgroundColor: P.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noLinks: {
    color: P.cardMuted,
    fontSize: PROSE_SIZE - 2,
  },
  /** The coordinator's own line for a card with no links: a step brighter than "No links yet". */
  note: {
    flexShrink: 1,
    color: P.prose,
    fontSize: PROSE_SIZE - 2,
  },
  /** An item's one-click answers, one segmented pill (desktop `board_answers`). */
  answers: {
    flexDirection: 'row',
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: P.ink(0.14),
    overflow: 'hidden',
  },
  answer: {
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  answerDivider: {
    borderLeftWidth: 1,
    borderLeftColor: P.ink(0.14),
  },
  answerPicked: {
    backgroundColor: P.ink(0.14),
  },
  answerStrong: {
    color: P.foreground,
  },
  tag: {
    flexShrink: 1,
    maxWidth: 160,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: P.ink(0.12),
  },
  tagDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tagText: {
    flexShrink: 1,
    color: P.cardMuted,
    fontSize: PROSE_SIZE - 2,
  },
  remove: {
    width: 18,
    height: 18,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeArmed: {
    backgroundColor: 'rgba(239, 68, 68, 0.16)',
  },
  restore: {
    paddingHorizontal: 5,
    color: P.cardMuted,
    fontSize: PROSE_SIZE - 2,
  },
  more: {
    paddingLeft: 12,
    paddingVertical: 4,
    color: P.cardMuted,
    fontSize: PROSE_SIZE - 1,
  },
}));
