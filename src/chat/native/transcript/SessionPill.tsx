/**
 * Another session's agent pill (gx-chat-core `transcript/session_mentions.rs`, where the user's
 * decision lives): a hairline rounded frame around the agent's logo and `+<title>`, the same look
 * desktop draws (`session_pill` in inter_agent_message.rs, `session_pill_link` in
 * markdown_links.rs). A pill the core marks `logo: false` sits beside the card's own agent tile
 * and leaves the logo to it (CDXC:SessionChat 2026-10-28 on `card_pill`). A tap switches to that
 * session; a session that is gone draws muted and does nothing.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CoordinatorGlyph } from '../../../components/sessions/icons';
import { SidebarPalette } from '../../../theme/palette';
import { AgentMark } from '../cards/agentMark';
import { useTranscriptEnv } from './context';
import { obj, str, type JsonRecord } from './json';

export function SessionPill({
  pill,
  onOpen,
  onLongPress,
}: {
  /** The card's `pill`, or a `session` reference: `label`, `agentIcon`, `coordinator`, `missing`, `logo`. */
  pill: JsonRecord;
  /** A mention link opens through the core like any link; a card's pill names its session. */
  onOpen?: () => void;
  onLongPress?: () => void;
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
        showsLogo ? null : styles.textOnly,
        {
          borderColor: theme.ink(0.14),
          backgroundColor: pressed && !missing ? theme.ink(0.08) : theme.ink(0.03),
        },
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
      <Text style={[styles.label, { color: missing ? theme.cardMuted : theme.foreground }]} numberOfLines={1}>
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
  textOnly: { paddingHorizontal: 8 },
  faded: { opacity: 0.45 },
  label: { fontSize: 12.5, lineHeight: 16, fontWeight: '500', flexShrink: 1 },
});
