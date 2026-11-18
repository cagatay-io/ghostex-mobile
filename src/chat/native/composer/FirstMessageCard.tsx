/**
 * The card at the top of the chat box while a new coordinator's first message waits in its agent's
 * input box: "First message" and its note, the message (two lines, Show all for the rest), Edit and
 * Start. What it says and does comes from the chat core (packages/gx-chat-core/src/composer/first_message.rs,
 * the `firstMessageCard` key); this file only lays it out, quiet like a queued message's row (`QueueList.tsx`).
 *
 * On the phone a message's actions normally sit in its long-press menu; Edit and Start are this card's
 * own controls (like a card's buttons), so they stay on screen.
 *
 * CDXC:Coordinators 2026-11-18 SEE-ALSO: the user's decision (Q3950 A: a card inside the chat box) is
 * recorded in server/src/session_chat_first_message.rs; the desktop draws the same card in
 * apps/desktop/src/app/native_chat/first_message_card.rs.
 */

import { Pressable, ScrollView, Text, View } from 'react-native';

import type { UserAction } from '../../rust/actions';
import type { ChatDocument } from '../../rust/document';
import { Glyph, type GlyphName } from './icons';
import { isTrue, num, obj, str } from './json';
import { themedStyles, useTranscriptTheme } from '../transcript/theme';

/** A message longer than this many characters gets Show all even on two lines (they wrap). Desktop: `LONG_TEXT_CHARS`. */
const LONG_TEXT_CHARS = 140;
/** The buttons' height: at least 32 for a finger. */
const BUTTON_HEIGHT = 32;
const TEXT_SIZE = 15;
const TEXT_LINE_HEIGHT = 21;

export function FirstMessageCard({
  document,
  dispatch,
}: {
  document: ChatDocument;
  dispatch: (action: UserAction) => void;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const card = obj(document.firstMessageCard);
  if (card === null) return null;
  const busy = isTrue(card, 'busy');
  const expanded = isTrue(card, 'expanded');
  const collapsedLines = num(card, 'collapsedLines') ?? 2;
  const message = str(card, 'text');
  // Collapsed, the card shows the message without its blank lines (the core's `preview`), so the
  // skill line's blank line does not take one of the two lines from the request under it.
  const preview = str(card, 'preview') || message;
  const title = str(card, 'title');
  const note = str(card, 'note');
  const expandable = (num(card, 'lines') ?? 0) > collapsedLines || message.length > LONG_TEXT_CHARS;
  const toggleLabel = str(card, expanded ? 'showLessLabel' : 'showAllLabel');
  return (
    <View style={[styles.card, busy ? styles.busy : null]} accessibilityLabel={title}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {note.length > 0 ? (
          <Text style={styles.note} numberOfLines={1}>
            {`· ${note}`}
          </Text>
        ) : null}
      </View>
      {expanded ? (
        <ScrollView style={styles.scroll} nestedScrollEnabled alwaysBounceVertical={false}>
          <Text style={styles.text} selectable>
            {message}
          </Text>
        </ScrollView>
      ) : (
        <Text style={styles.text} numberOfLines={collapsedLines} ellipsizeMode="tail">
          {preview}
        </Text>
      )}
      <View style={styles.footer}>
        {expandable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={toggleLabel}
            accessibilityState={{ expanded }}
            hitSlop={8}
            onPress={() => dispatch({ type: 'firstMessageToggle' })}
            style={({ pressed }) => [styles.toggle, pressed ? styles.togglePressed : null]}
          >
            <Text style={styles.toggleLabel}>{toggleLabel}</Text>
            <Glyph name={expanded ? 'chevron-up' : 'chevron-down'} size={12} color={P.muted} />
          </Pressable>
        ) : null}
        <View style={styles.actions}>
          <CardButton
            label={str(card, 'editLabel')}
            icon="pencil"
            primary={false}
            disabled={busy}
            onPress={() => dispatch({ type: 'firstMessageEdit' })}
          />
          <CardButton
            label={str(card, 'startLabel')}
            icon="player-play"
            primary
            disabled={busy}
            onPress={() => dispatch({ type: 'firstMessageStart' })}
          />
        </View>
      </View>
    </View>
  );
}

/** A footer button in the phone's tone card fills (`ToneButton` in `cards/ToneCard.tsx`), a little taller for touch. */
function CardButton({
  label,
  icon,
  primary,
  disabled,
  onPress,
}: {
  label: string;
  icon: GlyphName;
  primary: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const fill = primary ? P.controlPrimary : P.neutralFill;
  const pressedFill = primary ? P.controlPrimary : P.neutralFillPressed;
  const ink = primary ? P.background : P.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: pressed ? pressedFill : fill, borderColor: primary ? P.controlPrimary : 'transparent' },
        pressed && primary ? styles.primaryPressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <Glyph name={icon} size={14} color={ink} />
      <Text style={[styles.buttonLabel, { color: ink }]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = themedStyles((P) => ({
  card: {
    gap: 4,
    marginBottom: 6,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: P.border,
    backgroundColor: P.composerBackground,
  },
  busy: { opacity: 0.7 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  title: { color: P.foreground, fontSize: 12.5, lineHeight: 18, fontWeight: '600', flexShrink: 0 },
  note: { flex: 1, minWidth: 0, color: P.muted, fontSize: 12.5, lineHeight: 18 },
  text: { color: P.primary, fontSize: TEXT_SIZE, lineHeight: TEXT_LINE_HEIGHT },
  scroll: { maxHeight: 10 * TEXT_LINE_HEIGHT },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 4, borderRadius: 6 },
  togglePressed: { opacity: 0.6 },
  toggleLabel: { color: P.muted, fontSize: 12.5, lineHeight: 18 },
  actions: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  button: {
    minHeight: BUTTON_HEIGHT,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  primaryPressed: { opacity: 0.88 },
  buttonLabel: { fontSize: 13, fontWeight: '500' },
  disabled: { opacity: 0.5 },
}));
