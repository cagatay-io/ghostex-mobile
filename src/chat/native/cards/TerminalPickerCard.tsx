/**
 * The `/resume` picker card (Claude Code and Codex) and the pass-through card (every other agent):
 * an agent screen that owns the keyboard, drawn in the chat and driven from it. Port of desktop
 * `terminal_picker.rs`.
 *
 * CDXC:SessionChat 2026-10-11 SEE-ALSO: the user's mirror and pass-through decision in packages/gx-chat-core/src/questions/terminal_picker.rs.
 * On the phone a tapped row is picked (gxserver sends the moves, then Enter), typing filters, and Cancel is Esc; the pass-through
 * card sends Up/Down/Enter/Esc from buttons. Desktop twin: apps/desktop/src/app/native_chat/terminal_picker.rs.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type ScrollViewInstance,
} from 'react-native';

import type { ChatDocument } from '../../rust/document';
import type { RustChat } from '../../rust/useRustChat';
import { arr, asJson, obj, str } from './json';
import { MONO_FONT, themedStyles, useTranscriptTheme } from '../transcript/theme';
import { CARD_TEXT_SIZE, CardHeader, ChatButton, StatusCard, useCardText, useWellStyle } from './primitives';
import type { CardHostAction } from './types';

/** How long the field trusts its own typing over the agent's repaint (`TYPING_GRACE` on desktop). */
const TYPING_GRACE_MS = 1500;

export function TerminalPickerCard({
  chat,
  document,
  notice,
}: {
  chat: RustChat;
  document: ChatDocument;
  notice: Record<string, unknown>;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const cardText = useCardText();
  const { height } = useWindowDimensions();
  const { dispatch } = chat;
  const picker = obj(obj(obj(notice.dialog)?.presentation)?.picker) ?? {};
  const keys = obj(picker.keys);
  const query = str(picker, 'query');
  const [value, setValue] = useState(query);
  const editedAt = useRef(0);
  // The agent's own search is the truth (Esc clears it there), except while the user is still typing ahead of its repaint.
  useEffect(() => {
    if (Date.now() - editedAt.current > TYPING_GRACE_MS) setValue(query);
  }, [query]);
  const send = (answer: unknown) => dispatch({ type: 'answer', answer: asJson(answer) });
  const onChangeText = (text: string) => {
    editedAt.current = Date.now();
    setValue(text);
    send({ ...(obj(picker.queryAnswer) ?? {}), pickerQuery: text });
  };

  const body: ReactNode[] = [
    <TextInput
      key="search"
      style={styles.search}
      value={value}
      onChangeText={onChangeText}
      maxLength={512}
      autoCorrect={false}
      autoCapitalize="none"
      returnKeyType="go"
      submitBehavior="blurAndSubmit"
      onSubmitEditing={() => send(keys?.enter)}
      placeholder={str(picker, 'placeholder')}
      placeholderTextColor={P.placeholder}
    />,
    <ScrollView key="rows" style={{ maxHeight: height * 0.45 }} contentContainerStyle={styles.rows} nestedScrollEnabled>
      {arr(picker.rows).map((row, index) => {
        const heading = str(row, 'heading');
        const detail = str(row, 'detail');
        const selected = obj(row)?.selected === true;
        return (
          <View key={`${index}:${str(row, 'title')}`}>
            {heading ? <Text style={styles.heading}>{heading}</Text> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={str(row, 'title')}
              accessibilityState={{ selected }}
              onPress={() => send(obj(row)?.answer)}
              style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && styles.rowPressed]}
            >
              <Text numberOfLines={1} style={styles.rowTitle}>
                {str(row, 'title')}
              </Text>
              {detail ? (
                <Text numberOfLines={1} style={styles.rowDetail}>
                  {detail}
                </Text>
              ) : null}
            </Pressable>
          </View>
        );
      })}
    </ScrollView>,
  ];
  const message = str(picker, 'message');
  if (message) {
    body.push(
      <Text key="message" style={styles.hint}>
        {message}
      </Text>,
    );
  }
  const position = str(picker, 'position');
  body.push(
    <Text key="hint" style={styles.hint}>
      {position ? `${position} · ` : ''}Tap a conversation to{' '}
      {str(picker, 'title').startsWith('Fork') ? 'fork' : 'resume'} it
    </Text>,
  );
  if (typeof document.noticeError === 'string') {
    body.push(
      <Text key="error" accessibilityRole="alert" style={cardText.prose}>
        {document.noticeError}
      </Text>,
    );
  }
  const actions = [
    <ChatButton key="up" label="↑" onPress={() => send(keys?.up)} />,
    <ChatButton key="down" label="↓" onPress={() => send(keys?.down)} />,
    <ChatButton key="cancel" label="Cancel" onPress={() => send(keys?.escape)} />,
  ];
  return (
    <StatusCard header={<CardHeader icon="terminal-2" title={str(picker, 'title')} />} body={body} actions={actions} />
  );
}

export function PassthroughCard({
  chat,
  document,
  notice,
  onHostAction,
}: {
  chat: RustChat;
  document: ChatDocument;
  notice: Record<string, unknown>;
  onHostAction?: CardHostAction;
}) {
  const styles = useStyles();
  const cardText = useCardText();
  const wellStyle = useWellStyle();
  const { dispatch } = chat;
  const screenScroll = useRef<ScrollViewInstance>(null);
  const passthrough = obj(notice.passthrough) ?? {};
  const keys = obj(passthrough.keys);
  const body: ReactNode[] = [];
  if (typeof notice.detail === 'string') {
    body.push(
      <Text key="detail" style={cardText.prose}>
        {notice.detail}
      </Text>,
    );
  }
  body.push(
    <View key="screen" style={[wellStyle, styles.screen]}>
      {/* The agent's picker is at the bottom of the tail, so the box keeps its end in view. */}
      <ScrollView
        ref={screenScroll}
        nestedScrollEnabled
        onContentSizeChange={() => screenScroll.current?.scrollToEnd({ animated: false })}
      >
        <ScrollView horizontal nestedScrollEnabled>
          <Text style={styles.mono}>{str(passthrough, 'screen')}</Text>
        </ScrollView>
      </ScrollView>
    </View>,
    <Text key="hint" style={styles.hint}>
      The buttons below send keys to the agent's terminal.
    </Text>,
  );
  if (typeof document.noticeError === 'string') {
    body.push(
      <Text key="error" accessibilityRole="alert" style={cardText.prose}>
        {document.noticeError}
      </Text>,
    );
  }
  const actions: ReactNode[] = (
    [
      ['up', '↑'],
      ['down', '↓'],
      ['left', '←'],
      ['right', '→'],
      ['enter', 'Enter'],
      ['escape', 'Esc'],
    ] as const
  ).map(([key, label]) => (
    <ChatButton key={key} label={label} onPress={() => dispatch({ type: 'answer', answer: asJson(keys?.[key]) })} />
  ));
  if (onHostAction) {
    actions.push(
      <ChatButton
        key="terminal"
        icon="terminal-2"
        label="Terminal View"
        onPress={() => onHostAction('terminalView')}
      />,
    );
  }
  return (
    <StatusCard header={<CardHeader icon="terminal-2" title={str(notice, 'title')} />} body={body} actions={actions} />
  );
}

const useStyles = themedStyles((P) => ({
  search: {
    color: P.foreground,
    fontSize: CARD_TEXT_SIZE,
    borderWidth: 1,
    borderColor: P.inputBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: P.background,
  },
  rows: {
    gap: 2,
  },
  heading: {
    color: P.cardMuted,
    fontSize: 12,
    paddingHorizontal: 10,
    paddingTop: 6,
  },
  row: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 1,
  },
  rowSelected: {
    backgroundColor: P.border,
  },
  rowPressed: {
    backgroundColor: P.border,
    opacity: 0.8,
  },
  rowTitle: {
    color: P.foreground,
    fontSize: CARD_TEXT_SIZE,
  },
  rowDetail: {
    color: P.cardMuted,
    fontSize: 12,
  },
  hint: {
    color: P.cardMuted,
    fontSize: 12,
  },
  screen: {
    maxHeight: 320,
  },
  mono: {
    color: P.cardMuted,
    fontFamily: MONO_FONT,
    fontSize: 11,
    lineHeight: 15,
  },
}));
