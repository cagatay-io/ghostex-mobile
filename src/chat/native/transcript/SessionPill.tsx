/**
 * Another session's agent pill (gx-chat-core `transcript/session_mentions.rs`, where the user's
 * decision lives): a hairline rounded frame around the agent's logo and the session's title, the
 * same look desktop draws (`session_pill_link` in markdown_links.rs). A card's pill (the core marks
 * it `logo: false`) sits beside the card's own agent tile, leaves the logo to it
 * (CDXC:SessionChat 2026-10-28 on `card_pill`) and reads as part of the card's title: no frame,
 * the line's own type and colour (`textStyle`), a fill only while pressed (CDXC:SessionChat
 * 2026-10-29 DECISION on desktop `session_pill` in inter_agent_message.rs). A tap switches to that session; a session that is gone
 * draws muted and does nothing.
 */

import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';

import { CoordinatorGlyph } from '../../../components/sessions/icons';
import { SidebarPalette } from '../../../theme/palette';
import { AgentMark } from '../cards/agentMark';
import { useTranscriptEnv } from './context';
import { obj, str, type JsonRecord } from './json';

/** How far a card name's pressed fill reaches past the name (desktop `CARD_PILL_PAD`). */
const CARD_PILL_PAD = 3;

export function SessionPill({
  pill,
  onOpen,
  onLongPress,
  textStyle,
}: {
  /** The card's `pill`, or a `session` reference: `label`, `agentIcon`, `coordinator`, `missing`, `logo`. */
  pill: JsonRecord;
  /** A mention link opens through the core like any link; a card's pill names its session. */
  onOpen?: () => void;
  onLongPress?: () => void;
  /**
   * A card's session name: the type and colour of the words before it (`Message to`), so the two
   * read as one title (CDXC:SessionChat 2026-10-29 DECISION on desktop `session_pill` in
   * inter_agent_message.rs).
   */
  textStyle?: StyleProp<TextStyle>;
}) {
  const { theme, dispatch } = useTranscriptEnv();
  const missing = pill.missing === true;
  const showsLogo = pill.logo !== false;
  const session = obj(pill.session);
  const open =
    onOpen ??
    (session !== null
      ? () =>
          dispatch({
            type: 'openAgentSession',
            projectId: str(session, 'projectId'),
            sessionId: str(session, 'sessionId'),
          })
      : undefined);
  const icon = str(pill, 'agentIcon');
  return (
    <Pressable
      disabled={missing || open === undefined}
      onPress={open}
      {...(onLongPress !== undefined ? { onLongPress } : {})}
      accessibilityRole="link"
      accessibilityLabel={`${str(pill, 'label')}: ${str(pill, 'title')}`}
      hitSlop={4}
      style={({ pressed }) => [
        styles.pill,
        showsLogo
          ? { borderColor: theme.ink(0.14), backgroundColor: pressed && !missing ? theme.ink(0.08) : theme.ink(0.03) }
          : [styles.cardPill, pressed && !missing ? { backgroundColor: theme.ink(0.08) } : null],
      ]}
    >
      {showsLogo ? (
        <View style={missing ? styles.faded : null}>
          {pill.coordinator === true ? (
            <CoordinatorGlyph size={12} color={theme.light ? '#000000' : SidebarPalette.ROW_COORDINATOR_CROWN} />
          ) : (
            <AgentMark icon={icon.length > 0 ? icon : null} size={12} />
          )}
        </View>
      ) : null}
      <Text
        style={
          showsLogo
            ? [styles.label, { color: missing ? theme.cardMuted : theme.foreground }]
            : [styles.cardLabel, textStyle, missing ? { color: theme.cardMuted } : null]
        }
        numberOfLines={1}
      >
        {str(pill, 'label')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexShrink: 1,
    minWidth: 0,
    gap: 4,
    paddingHorizontal: 6,
    height: 20,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  // The fill reaches past the name on each side and the margin takes it back: no space at rest.
  cardPill: { paddingHorizontal: CARD_PILL_PAD, marginHorizontal: -CARD_PILL_PAD, height: 'auto', borderWidth: 0, borderRadius: 5 },
  cardLabel: { flexShrink: 1 },
  faded: { opacity: 0.45 },
  label: { fontSize: 12.5, lineHeight: 16, fontWeight: '500', flexShrink: 1 },
});
