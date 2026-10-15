/**
 * The terminal notice card: a state the agent's terminal is stuck in (a trust prompt, an expired
 * login, a usage limit, a dialog), with the choices that answer it. Drawn from `terminalNotice`
 * and `noticeVisible`; port of desktop `notice.rs` and `terminal_dialog.rs`.
 *
 * The "Show terminal output" disclosure is not drawn: React and desktop hide it in chats narrower
 * than 1070px, which every phone is.
 *
 * CDXC:SessionChat 2026-10-11 DECISION: User picked the proposed notices design: a notice is a tone card (ToneCard.tsx) washed in
 * the tone the chat core gives it, with its actions in the footer (the account switch first and filled, Terminal view beside it,
 * Dismiss quiet at the right end). The `/resume` picker, pass-through and side-question cards keep their own shells.
 * SEE-ALSO: apps/desktop/src/app/native_chat/notice.rs, packages/gx-chat-core/src/questions/notice_tone.rs
 */

import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';

import type { ChatDocument } from '../../rust/document';
import type { RustChat } from '../../rust/useRustChat';
import { arr, asJson, isTrue, num, obj, str } from './json';
import { MONO_FONT, themedStyles, useTranscriptTheme } from '../transcript/theme';
import { CARD_TEXT_SIZE, CHOICE_ROW_CHROME, ChoiceRow, ChoiceRowLabelMeasure, useCardText, useWellStyle } from './primitives';
import { Glyph } from './icons';
import { ToneButton, ToneCard } from './ToneCard';
import { PanelBlocks } from './PanelBlocks';
import { SideQuestionCard } from './SideQuestionCard';
import { PassthroughCard, TerminalPickerCard } from './TerminalPickerCard';
import type { CardHostAction } from './types';

export function NoticeCard({
  chat,
  document,
  onHostAction,
}: {
  chat: RustChat;
  document: ChatDocument;
  onHostAction?: CardHostAction;
}) {
  const cardText = useCardText();
  const styles = useStyles();
  const look: DialogLook = { styles, P: useTranscriptTheme(), cardText, wellStyle: useWellStyle() };
  const { dispatch } = chat;
  const { height } = useWindowDimensions();
  const notice = obj(document.terminalNotice);
  const key = `notice:${str(notice, 'kind')}:${str(notice, 'detectedAt')}`;
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [choiceWidths, setChoiceWidths] = useState<Record<string, number>>({});
  const dialogInput = useDialogInput(obj(notice?.dialog));
  if (notice === null || document.noticeVisible !== true) return null;

  const busy = document.questionCard?.busy === true;
  const choices = arr(notice.choices);
  const answerable = choices.length > 0;
  const dialog = obj(notice.dialog);
  // A tabbed Claude panel with option rows (`/plugin`'s install scope) shows its details above the rows and never folds them
  // away (notice.rs, terminal_prompts.rs `highlighted_row`).
  const panel = arr(obj(dialog?.presentation)?.blocks).length > 0;
  const foldable = answerable && !panel;
  const collapsed = foldable && expandedKey !== key;
  const rateLimit = choices.some((choice) => str(choice, 'label').startsWith('Wait here, then continue automatically'));

  if (obj(obj(dialog?.presentation)?.picker) !== null) {
    return <TerminalPickerCard chat={chat} document={document} notice={notice} />;
  }
  if (obj(notice.passthrough) !== null) {
    return <PassthroughCard chat={chat} document={document} notice={notice} onHostAction={onHostAction} />;
  }
  if (dialog !== null && Array.isArray(dialog.rows) && dialog.rows.length === 0) {
    if (obj(obj(dialog.presentation)?.sideQuestion) !== null) {
      return <SideQuestionCard chat={chat} dialog={dialog} />;
    }
    const copyTitle = str(obj(obj(dialog.presentation)?.copy), 'title');
    const panelTitle = str(obj(dialog.presentation), 'title');
    const parts = terminalDialogParts(chat, dialog, busy, dialogInput, look);
    return (
      <ToneCard
        tone={str(notice, 'tone')}
        title={copyTitle || panelTitle || str(dialog, 'title')}
        body={parts.body}
        footerEnd={parts.actions}
      />
    );
  }

  const body: ReactNode[] = [];
  // The notice's own actions sit at the footer's right end, ahead of a live dialog's buttons and Dismiss.
  const actions: ReactNode[] = [];
  const footerEnd: ReactNode[] = [];
  if (panel && !rateLimit && dialog !== null) {
    const parts = terminalDialogParts(chat, dialog, busy, dialogInput, look);
    body.push(...parts.body);
    footerEnd.push(...parts.actions);
  }
  if (!collapsed && !panel && typeof notice.detail === 'string') {
    body.push(
      <Text key="detail" style={cardText.prose}>
        {notice.detail}
      </Text>
    );
  }
  // The command a collapsed approval card is asking to run (`collapsedDetail` in the chat core).
  if (collapsed && typeof notice.collapsedDetail === 'string') {
    body.push(
      <Text key="collapsed-detail" style={styles.monoText}>
        {notice.collapsedDetail}
      </Text>
    );
  }
  if (answerable) {
    const shown = collapsed ? (num(notice, 'collapsedChoiceCount') ?? 2) : choices.length;
    const labels = choices.slice(0, shown).map((choice) => str(choice, collapsed ? 'collapsedLabel' : 'label'));
    /*
     * CDXC:SessionChat 2026-09-27 DECISION: User: when a notice card's choices do not fit side by side, "make buttons appear full
     * width and on top of each other", for every card like the model switch confirmation. Each collapsed button starts at the width
     * the widest label needs on one line and the row wraps, so the buttons share the row in equal halves only when every label fits
     * whole, and otherwise stack full width. Until the labels are measured they sit side by side as before.
     * SEE-ALSO: apps/desktop/src/app/native_chat/notice.rs
     */
    const widths = labels.map((label) => choiceWidths[label]);
    const widest = collapsed && widths.every((width) => width !== undefined) ? Math.max(...(widths as number[])) : null;
    const stacked = widest !== null && !Number.isFinite(widest);
    const choiceStyle = !collapsed || stacked ? null : widest === null ? styles.collapsedChoice : { flexGrow: 1, flexShrink: 1, flexBasis: widest + CHOICE_ROW_CHROME, minWidth: 0 };
    body.push(
      <ScrollView
        key="choices"
        style={{ maxHeight: height * 0.45 }}
        contentContainerStyle={collapsed && !stacked ? styles.choicesRow : styles.choicesColumn}
        nestedScrollEnabled
      >
        {collapsed
          ? labels.map((label, index) => (
              <ChoiceRowLabelMeasure
                key={`measure:${index}`}
                label={label}
                onWidth={(width) => setChoiceWidths((previous) => (previous[label] === width ? previous : { ...previous, [label]: width }))}
              />
            ))
          : null}
        {choices.slice(0, shown).map((choice, index) => (
          <View key={`${num(choice, 'index') ?? index}`} style={choiceStyle}>
            {/* CDXC:SessionChat 2026-09-26 DECISION: User: a notice card's choice must never wrap onto 2 lines; truncate it with "..." and show the whole label on hover. The phone has no hover, so pressing and holding shows it. SEE-ALSO: apps/desktop/src/app/native_chat/notice.rs */}
            <ChoiceRow
              label={str(choice, collapsed ? 'collapsedLabel' : 'label')}
              selected={false}
              dense={collapsed}
              singleLine
              disabled={busy}
              onPress={() => dispatch({ type: 'answer', answer: asJson(obj(choice)?.answer) })}
            />
          </View>
        ))}
      </ScrollView>
    );
  }
  if (!collapsed && !rateLimit && !panel && dialog !== null) {
    const parts = terminalDialogParts(chat, dialog, busy, dialogInput, look);
    body.push(...parts.body);
    footerEnd.push(...parts.actions);
  }
  // Only sign-in and usage-limit notices offer the account panel (notice.rs).
  const kind = str(notice, 'kind');
  if (!collapsed && obj(document.accountPanel) !== null && (kind === 'loginExpired' || kind === 'usageLimit') && onHostAction) {
    actions.push(
      <ToneButton key="switch-account" kind="primary" icon="switch-horizontal" label="Switch account" onPress={() => onHostAction('switchAccount')} />
    );
  }
  for (const action of arr(notice.actions)) {
    if (collapsed && str(action, 'kind') !== 'trustAndRemember') continue;
    if (str(action, 'kind') === 'switchToTerminal') {
      if (onHostAction) {
        actions.push(
          <ToneButton key={`action:${str(action, 'id')}`} kind="secondary" icon="terminal-2" label="Terminal view" onPress={() => onHostAction('terminalView')} />
        );
      }
      continue;
    }
    // The first action the chat answers itself is the one filled button when no account switch took that place.
    actions.push(
      <ToneButton
        key={`action:${str(action, 'id')}`}
        kind={actions.length === 0 ? 'primary' : 'secondary'}
        label={str(action, 'label')}
        onPress={() => dispatch({ type: 'answer', answer: asJson(obj(action)?.answer) })}
      />
    );
  }
  if ((notice.choices === null || notice.choices === undefined) && (notice.dialog === null || notice.dialog === undefined)) {
    footerEnd.push(<ToneButton key="dismiss" kind="secondary" label="Dismiss" onPress={() => dispatch({ type: 'dismissNotice' })} />);
  }
  if (typeof document.noticeError === 'string') {
    body.push(
      <Text key="error" accessibilityRole="alert" style={cardText.prose}>
        {document.noticeError}
      </Text>
    );
  }
  return (
    <ToneCard
      tone={str(notice, 'tone')}
      title={(panel && str(obj(dialog?.presentation), 'title')) || str(notice, 'title')}
      trailing={foldable ? <Glyph name={collapsed ? 'chevron-right' : 'chevron-down'} size={14} color={look.P.muted} /> : undefined}
      body={body}
      footerEnd={[...actions, ...footerEnd]}
      accessibilityLabel={collapsed ? 'Show all options' : 'Show less'}
      onPressHeader={foldable ? () => setExpandedKey(collapsed ? key : null) : undefined}
    />
  );
}

/** The themed styles a terminal dialog draws with, read by the card that owns it. */
type DialogLook = {
  styles: ReturnType<typeof useStyles>;
  P: ReturnType<typeof useTranscriptTheme>;
  cardText: ReturnType<typeof useCardText>;
  wellStyle: ReturnType<typeof useWellStyle>;
};

/** The body rows and footer actions of a terminal dialog (`render_terminal_dialog`). */
function terminalDialogParts(
  chat: RustChat,
  dialog: Record<string, unknown>,
  busy: boolean,
  [inputValue, setInputValue]: DialogInput,
  { styles, P, cardText, wellStyle }: DialogLook
): { body: ReactNode[]; actions: ReactNode[] } {
  const { dispatch } = chat;
  const dialogId = str(dialog, 'id');
  const body: ReactNode[] = [];
  const actions: ReactNode[] = [];
  if (dialogId === 'codex-transcript-pager') {
    body.push(
      <Text key="pager" style={cardText.prose}>
        {str(dialog, 'body')}
      </Text>
    );
    actions.push(
      <ToneButton
        key="restore"
        kind="primary"
        label={busy ? 'Restoring chat…' : 'Restore chat'}
        onPress={() => dispatch({ type: 'answer', answer: { kind: 'terminalDialog', dialogId, dialogAction: 'cancel' } })}
      />
    );
    return { body, actions };
  }
  const presentation = obj(dialog.presentation);
  const copy = obj(presentation?.copy);
  const hasRows = arr(dialog.rows).length > 0;
  if (copy !== null) {
    // Written copy reads as the card's prose, and its buttons already say what the keyboard hint would.
    arr(copy.paragraphs).forEach((paragraph, index) => {
      body.push(
        <Text key={`copy:${index}`} style={cardText.prose}>
          {typeof paragraph === 'string' ? paragraph : ''}
        </Text>
      );
    });
  } else if (arr(presentation?.blocks).length > 0) {
    body.push(<PanelBlocks key="blocks" chat={chat} dialog={dialog} blocks={arr(presentation?.blocks)} />);
  } else if (!hasRows && str(dialog, 'body').length > 0) {
    body.push(
      <View key="dialog-body" style={[wellStyle, styles.dialogBody]}>
        <ScrollView nestedScrollEnabled>
          <Text style={styles.monoText}>{str(dialog, 'body')}</Text>
        </ScrollView>
      </View>
    );
  }
  const input = str(dialog, 'input');
  if (input === 'text' || input === 'search') {
    const search = input === 'search';
    const multiline = isTrue(presentation, 'multilineInput');
    const submit = () =>
      dispatch({
        type: 'answer',
        answer: { kind: 'terminalDialog', dialogId, dialogAction: search ? 'text' : 'submit', text: inputValue },
      });
    body.push(
      <TextInput
        key="input"
        style={[styles.dialogInput, multiline && styles.dialogInputMultiline]}
        value={inputValue}
        onChangeText={setInputValue}
        editable={!busy}
        multiline={multiline}
        maxLength={search ? 512 : 8192}
        submitBehavior="submit"
        returnKeyType={search ? 'search' : 'done'}
        onSubmitEditing={submit}
        placeholder={search ? 'Search options…' : 'Enter text…'}
        placeholderTextColor={P.placeholder}
      />
    );
    actions.push(<ToneButton key="submit" kind="primary" label={search ? 'Search' : str(presentation, 'submitLabel')} onPress={submit} />);
  }
  if (input === 'key') {
    body.push(
      <TextInput
        key="key"
        accessibilityLabel="Press the new shortcut"
        style={styles.keyInput}
        value=""
        placeholder="Tap here, then press the new shortcut"
        placeholderTextColor={P.muted}
        onKeyPress={(event) => {
          const pressed = event.nativeEvent.key;
          const text = pressed === ' ' ? ' ' : pressed;
          dispatch({ type: 'answer', answer: { kind: 'terminalDialog', dialogId, dialogAction: 'key', text, keyModifiers: 0 } });
        }}
      />
    );
  }
  // Written copy and blocks come with buttons for everything the key-hint footer says.
  if (copy === null && arr(presentation?.blocks).length === 0 && str(dialog, 'footer').length > 0) {
    body.push(
      <Text key="footer" style={cardText.prose}>
        {str(dialog, 'footer')}
      </Text>
    );
  }
  for (const action of arr(presentation?.actions)) {
    actions.push(
      <ToneButton
        key={`dialog-action:${str(action, 'action')}`}
        kind="secondary"
        label={str(action, 'label')}
        onPress={() =>
          dispatch({ type: 'answer', answer: { kind: 'terminalDialog', dialogId, dialogAction: asJson(obj(action)?.action) } })
        }
      />
    );
  }
  return { body, actions };
}

type DialogInput = [string, (value: string) => void];

/**
 * The dialog's text field value. It follows the dialog's own `inputValue` whenever the terminal
 * reports a new one or a different dialog opens, and Submit sends what is typed.
 */
function useDialogInput(dialog: Record<string, unknown> | null): DialogInput {
  const identity = `${str(dialog, 'id')}:${str(dialog, 'title')}:${str(dialog, 'input')}`;
  const serverValue = str(dialog, 'inputValue');
  const [value, setValue] = useState(serverValue);
  useEffect(() => setValue(serverValue), [identity, serverValue]);
  return [value, setValue];
}

const useStyles = themedStyles((P) => ({
  choicesColumn: {
    gap: 6,
  },
  choicesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  collapsedChoice: {
    flex: 1,
    minWidth: 0,
  },
  dialogBody: {
    maxHeight: 256,
    backgroundColor: P.light ? P.input : 'rgba(29,29,29,0.3)',
  },
  monoText: {
    color: P.cardMuted,
    fontFamily: MONO_FONT,
    fontSize: 12,
    lineHeight: 17,
  },
  dialogInput: {
    color: P.foreground,
    fontSize: CARD_TEXT_SIZE,
    borderWidth: 1,
    borderColor: P.inputBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: P.background,
  },
  dialogInputMultiline: {
    minHeight: 60,
    maxHeight: 140,
  },
  keyInput: {
    color: P.foreground,
    fontSize: CARD_TEXT_SIZE,
    borderWidth: 1,
    borderColor: P.border,
    borderRadius: 6,
    padding: 8,
  },
}));
