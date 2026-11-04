/**
 * A coordinator's board, the Board pill's sheet: its lines of work grouped by who has the ball
 * (Later, Needs you, Blocked, Moving, Done today, Ideas), each row with its tags and latest status.
 * Groups, rows, tags, folds and counts come from the core (gx-chat-core
 * `extras/coordinator_board.rs`, where the user's decision lives); this only lays them out. A row
 * opens its thread, its question card or its link, as the desktop's side panel does
 * (`apps/desktop/src/app/native_chat/coordinator_board.rs`).
 */

import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import type { ChatDocument } from '../../rust/document';
import type { UserAction } from '../../rust/actions';
import type { RustChat } from '../../rust/useRustChat';
import { SidebarPalette } from '../../../theme/palette';
import { Glyph } from './icons';
import { arr, asJson, isTrue, num, obj, str } from './json';
import { PROSE_SIZE, themedStyles, useTranscriptTheme } from '../transcript/theme';
import { remoteWorkerNotice } from './remoteWorker';

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
      return '#8b78f0';
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
  const board = obj(document.coordinatorBoard);
  if (board === null) return null;
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
                return (
                  <Pressable
                    key={str(row, 'key') || String(index)}
                    accessibilityRole={command !== null ? 'button' : 'text'}
                    accessibilityLabel={`${str(row, 'title')}. ${str(row, 'detail')}`}
                    onPress={command !== null ? () => run(command) : undefined}
                    style={styles.row}
                  >
                    <View style={styles.rowTitleLine}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {str(row, 'title')}
                      </Text>
                      <Text style={styles.age}>{str(row, 'age')}</Text>
                    </View>
                    <View style={styles.rowDetailLine}>
                      {arr(obj(row)?.tags).map((tag, tagIndex) => {
                        const tint = toneColor(str(tag, 'tone'));
                        const pr = str(tag, 'kind') === 'pr';
                        return (
                          <View
                            key={`${str(tag, 'kind')}:${tagIndex}`}
                            style={[styles.tag, tint !== null && !pr && { borderColor: tint }]}
                          >
                            {pr && tint !== null ? <View style={[styles.tagDot, { backgroundColor: tint }]} /> : null}
                            <Text style={[styles.tagText, tint !== null && !pr && { color: tint }]}>
                              {str(tag, 'label')}
                            </Text>
                          </View>
                        );
                      })}
                      <Text style={styles.detail} numberOfLines={1}>
                        {str(row, 'detail')}
                      </Text>
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
  row: {
    paddingLeft: 38,
    paddingVertical: 5,
    gap: 3,
  },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  rowDetailLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: P.ink(0.14),
  },
  tagDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  tagText: {
    color: P.cardMuted,
    fontSize: PROSE_SIZE - 3,
  },
  detail: {
    flex: 1,
    color: P.cardMuted,
    fontSize: PROSE_SIZE - 2,
  },
  more: {
    paddingLeft: 38,
    paddingVertical: 4,
    color: P.cardMuted,
    fontSize: PROSE_SIZE - 1,
  },
}));
