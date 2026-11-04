/**
 * A coordinator's board, the Board pill's sheet: its lines of work grouped by who has the ball
 * (Later, Needs you, Blocked, Moving, Done today, Ideas), each row with its tags and latest status.
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
                return (
                  <Pressable
                    key={key}
                    accessibilityRole={command !== null ? 'button' : 'text'}
                    accessibilityLabel={str(row, 'title')}
                    onPress={command !== null ? () => run(command) : undefined}
                    style={styles.card}
                  >
                    <View style={styles.cardTitleLine}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {str(row, 'title')}
                      </Text>
                      <Text style={styles.age}>{str(row, 'age')}</Text>
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
                      ) : remove !== null ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={armed === key ? 'Tap again to move it to Removed' : 'Remove from the board'}
                          hitSlop={8}
                          onPress={() => tapRemove(key, remove)}
                          style={[styles.remove, armed === key && styles.removeArmed]}
                        >
                          <Glyph
                            name="x"
                            size={11}
                            color={armed === key ? SidebarPalette.ROW_APPROVAL : P.cardMuted}
                          />
                        </Pressable>
                      ) : null}
                    </View>
                    <View style={styles.chipLine}>
                      {tags.length === 0 ? <Text style={styles.noLinks}>No links yet</Text> : null}
                      {tags.map((tag, tagIndex) => {
                        const tint = toneColor(str(tag, 'tone'));
                        const open = obj(obj(tag)?.command);
                        const coloured = str(tag, 'kind') === 'release' || str(tag, 'kind') === 'question';
                        return (
                          <Pressable
                            key={`${str(tag, 'kind')}:${tagIndex}`}
                            accessibilityRole={open !== null ? 'link' : 'text'}
                            onPress={open !== null ? () => run(open) : undefined}
                            style={[styles.tag, coloured && tint !== null && { borderColor: tint }]}
                          >
                            {!coloured ? (
                              <View style={[styles.tagDot, { backgroundColor: tint ?? P.cardMuted }]} />
                            ) : null}
                            <Text style={[styles.tagText, coloured && tint !== null && { color: tint }]} numberOfLines={1}>
                              {chipLabel(str(tag, 'kind'), str(tag, 'label'))}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
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
    overflow: 'hidden',
  },
  noLinks: {
    color: P.cardMuted,
    fontSize: PROSE_SIZE - 2,
  },
  tag: {
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
