/**
 * What a needs-you work item offers, drawn once for both places the phone shows it (the dock on the
 * chat box, `WorkCards.tsx`, and the Work sheet's opened cards, `CoordinatorBoard.tsx`): its answers
 * as the dock's filled buttons, the recommended one starred, Reply after them (after a thin divider
 * on an opened row), and one menu of what every item repeats: Show in chat, Dismiss, Snooze with its
 * lengths, and Mention. Port of desktop `native_chat/work_actions.rs` and the dock row's ⋯ menu
 * (`work_cards.rs` `row_menu`); the rows' words and commands are the chat core's
 * (gx-chat-core `extras/work_cards.rs` `dock` and `panel_actions`).
 *
 * CDXC:Coordinators 2026-11-11 DECISION:
 * User, of the desktop's opened row: "C. Answers and one menu" (only the answers stay buttons; Show
 * in chat, Dismiss, Snooze and Mention are one ⋯ menu), Reply after a divider, and "i dont like the
 * choices wrapping, please make them never wrap… should just show a dropdown". Then, of the phone:
 * "please please make sure we make the work items work the same way as it does on desktop". The
 * phone has no hover, so its ⋯ always shows, and its menu is a sheet on the dock and a list in place
 * on the Work sheet (iOS shows no sheet over a sheet); the answers that do not fit one line fold
 * into "Choose an answer", which opens them one per line under it.
 */

import { plural } from '../../../plural';
import { useCallback, useState, type ReactNode } from 'react';
import * as Clipboard from 'expo-clipboard';
import {
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { SidebarPalette } from '../../../theme/palette';
import { Glyph, type GlyphName } from './icons';
import { arr, isTrue, obj, str, type JsonRecord } from './json';
import { Sheet } from '../composer/Sheet';
import { askColor, tint } from './askCard';
import { PROSE_SIZE, themedStyles, useTranscriptTheme } from '../transcript/theme';
import { openQuestionReply } from '../transcript/QuestionReply';
import { Markdown } from '../transcript/markdown/Markdown';
import { messageCommands } from '../transcript/markdown/runCommands';
import { replyDraftRow, SESSION_REPLY_ROW, useReplyDraft, type ReplyDraftScope } from './replyDrafts';

/** Every button's touch area: 8 above and below a 28-point button make Apple's 44. */
export const WORK_BUTTON_SLOP = { top: 8, bottom: 8, left: 3, right: 3 };

/** The button the answers fold into when they do not fit one line (desktop `CHOOSE_ANSWER`). */
/*
 * CDXC:Coordinators 2026-11-15 DECISION:
 * User, of an opened ask whose "Choose an answer" wrapped to two lines beside a "Repl / y": "This
 * looks broken at the bottom please say just Choices instead of choose an answer there". One short
 * word everywhere the answers fold (the dock, the Work sheet, an opened ask; desktop too).
 */
export const CHOOSE_ANSWER = 'Choices';

/**
 * A button's width, roughly as `WorkButton` draws it on one line: its label at 14 points grown by
 * the phone's text size (`fontScale`: Android's and iOS's larger text), its sides, and an icon or
 * mark. Generous, so an estimate never lets a row cut an answer.
 */
function buttonWidth(label: string, icon: boolean, mark: boolean, fontScale: number): number {
  return label.length * 8.6 * fontScale + 24 + (icon ? 20 : 0) + (mark ? 16 : 0);
}

/** Each status's colour, the board's (`CoordinatorBoard.tsx` `GROUP_COLOR`, desktop `group_look`). */
export const STATUS_COLOR: Record<string, string> = {
  needs: SidebarPalette.ROW_QUESTION,
  blocked: SidebarPalette.ROW_APPROVAL,
  waiting: '#7fa1c4',
  moving: '#c68a06',
  finished: '#2fa865',
};

/** An item pill's sides and dot. */
const PILL_PAD = 7;
const PILL_DOT = 6;

type PillFit = 'full' | 'dots' | 'plus' | 'none';

/** The item pills' widths, each with the 6 gap after it: whole, dots only, one "+N" pill. */
function pillWidths(pills: JsonRecord[], fontScale: number): [number, number, number] {
  if (pills.length === 0) return [0, 0, 0];
  const gaps = 6 * pills.length;
  const full = pills.reduce(
    (sum, pill) => sum + PILL_PAD * 2 + PILL_DOT + 4 + str(pill, 'id').length * 7.6 * fontScale + 2,
    0,
  );
  const dots = (PILL_PAD * 2 + PILL_DOT + 2) * pills.length;
  const plus = PILL_PAD * 2 + `+${pills.length}`.length * 7.6 * fontScale + 2;
  return [full + gaps, dots + gaps, plus + 6];
}

function pillFit(widths: [number, number, number], room: number): PillFit {
  if (widths[0] <= room) return 'full';
  if (widths[1] <= room) return 'dots';
  // Past "+N" the pills step out of the line: the answers and Reply never give way to them.
  if (widths[2] <= room) return 'plus';
  return 'none';
}

/**
 * An opened row's item pills, leading its answers (gx-chat-core `item_pills`; desktop
 * `item_pill_elements`): a dot in the item's state colour (an item that waits on the answer in the
 * blocked red) and its short id. A tap opens the item in the Work sheet; a long press reads its
 * whole name and state, with Open. `dots` drops the ids, `plus` is one "+N" pill that lists them.
 *
 * CDXC:Coordinators 2026-11-12 DECISION:
 * User, of the line under an opened row's title: "has to be pills looking, and small, only show id
 * (hover to read which work item), and show dot color for each one before the id in the pill".
 */
function ItemPills({ pills, fit, dispatch }: { pills: JsonRecord[]; fit: PillFit; dispatch: (action: never) => void }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const [reading, setReading] = useState<JsonRecord[] | null>(null);
  if (pills.length === 0) return null;
  const open = (pill: JsonRecord) => {
    const command = obj(pill.command);
    if (command !== null) dispatch(command as never);
  };
  return (
    <>
      {fit === 'none' ? null : fit === 'plus' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={pills.map((pill) => str(pill, 'tip')).join(', ')}
          onPress={() => setReading(pills)}
          style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
        >
          <Text style={styles.pillText}>{`+${pills.length}`}</Text>
        </Pressable>
      ) : (
        pills.map((pill, index) => (
          <Pressable
            key={`pill:${index}`}
            accessibilityRole="button"
            accessibilityLabel={str(pill, 'tip')}
            accessibilityHint="Long-press to read it"
            hitSlop={4}
            onPress={() => open(pill)}
            onLongPress={() => setReading([pill])}
            style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
          >
            <View style={[styles.pillDot, { backgroundColor: STATUS_COLOR[str(pill, 'state')] ?? P.cardMuted }]} />
            {fit === 'full' ? <Text style={styles.pillText}>{str(pill, 'id')}</Text> : null}
          </Pressable>
        ))
      )}
      <Sheet visible={reading !== null} onClose={() => setReading(null)} title="Work items">
        <View>
          {(reading ?? []).map((pill, index) => (
            <Pressable
              key={`read:${index}`}
              accessibilityRole="button"
              onPress={() => {
                setReading(null);
                open(pill);
              }}
              style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
            >
              <View style={[styles.pillDot, { backgroundColor: STATUS_COLOR[str(pill, 'state')] ?? P.cardMuted }]} />
              <Text style={[styles.menuText, { flex: 1 }]} numberOfLines={2}>
                {str(pill, 'tip')}
              </Text>
              <Glyph name="external-link" size={15} color={P.cardMuted} />
            </Pressable>
          ))}
        </View>
      </Sheet>
    </>
  );
}

/** A square icon button's side (`WorkButton` `iconOnly`): a one-line button's height. */
const ICON_BUTTON = 30;
/** The glyph of a Needs you row's Details button for a question or form popup (desktop `DETAILS_ICON`). */
const DETAILS_GLYPH: GlyphName = 'message-question';
/** The glyph of a Needs you row's Open button for a Live page (desktop `PAGE_OPEN_ICON`). */
const PAGE_OPEN_GLYPH: GlyphName = 'external-link';
/** A Needs you row's Jump to context (desktop `CONTEXT_ICON`). */
const CONTEXT_GLYPH: GlyphName = 'message-share';
/** A Needs you row's Archive action (desktop `MARK_READ_ICON`). */
const MARK_READ_GLYPH: GlyphName = 'check';

/** A Reply button's width as `WorkAnswerLine` measures it. */
function replyWidthOf(replied: string, fontScale: number): number {
  return buttonWidth(replyLabel(replied), true, false, fontScale);
}

/** A Reply's label: the words it sent, cut short so the button stays a button (desktop `reply_answer`). */
function replyLabel(replied: string): string {
  if (replied.length === 0) return 'Reply';
  return replied.length > 32 ? `${replied.slice(0, 31).trimEnd()}…` : replied;
}

/** Opens a work item's Reply sheet, which keeps its draft for the chat (`replyDrafts.ts`). */
export function openWorkReply(reply: JsonRecord, scope: ReplyDraftScope | null): void {
  openQuestionReply({
    form: typeof reply.form === 'string' ? reply.form : null,
    tag: str(reply, 'tag'),
    name: str(reply, 'name'),
    ...(typeof reply.item === 'string' ? { item: reply.item, key: str(reply, 'key') } : {}),
    ...(typeof reply.questions === 'string' ? { questions: reply.questions, to: str(reply, 'to') } : {}),
    scope,
  });
}

/**
 * Whether a dock row carries a question the reader must answer, so it has no Mark as read: an ask
 * with answers, a one-click question, a form or page with open questions, an approval with buttons,
 * a to-do that offers its own choices. A page that only waits to be seen (its dismiss reads "Mark
 * as read"), a to-do with only Done, a blocked line of work and a notice with no answers ask
 * nothing. Desktop has the same rule (native_chat/work_actions.rs `row_asks_question`).
 */
export function rowAsksQuestion(row: JsonRecord): boolean {
  const key = str(row, 'key');
  const buttons = arr(row.buttons);
  if (key.startsWith('work-ask:')) return true;
  if (key.startsWith('dock-questions:')) {
    const label = str(row, 'dismissLabel');
    return label !== 'Archive' && label !== 'Done' && label !== 'Mark as read';
  }
  const onlyDone = buttons.length === 0 || (buttons.length === 1 && str(buttons[0], 'label') === 'Done');
  if (key.startsWith('needs-you:')) return !onlyDone;
  return buttons.length > 0;
}

/**
 * An opened row's (and an opened Work sheet card's) space between its title with its work item
 * line, its description and its answers: the question card's (desktop question.rs, 12 from the
 * head to the text and from the text to the options; `OPENED_ROW_GAP` in work_cards.rs).
 *
 * CDXC:Coordinators 2026-11-12 DECISION:
 * User, of an opened row: "please add space between the title/description/choice buttons they're
 * too close together now".
 */
export const OPENED_ROW_GAP = 12;

/**
 * The part of an opened work row or card under its title line: it takes a tap itself, so a tap
 * there never shuts the row or card around it (only its title line does), while the links, chips
 * and buttons inside keep their own taps.
 *
 * CDXC:Coordinators 2026-11-12 DECISION:
 * User, of an opened row whose command he could not copy: "let's make collapsing require clicking
 * on the header of the card not the inner part please".
 */
export function TextArea({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return (
    <View style={style} onStartShouldSetResponder={() => true}>
      {children}
    </View>
  );
}

/** A Markdown text as words to copy: a link becomes its label. */
function plainWords(markdown: string): string {
  return markdown.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
}

/**
 * A work ask's description in an opened row or card. A long press opens Copy text and, for a
 * command in it (an inline span the core marked, gx-chat-core `native_markdown::ask_markdown`),
 * what a reply's command offers in the transcript's long-press menu: Copy command and Paste in
 * terminal, or Run in terminal for a command block (`MessageActions.tsx`).
 */
export function WorkDescription({
  text,
  color,
  title,
  dispatch,
}: {
  text: string;
  color: string;
  title: string;
  dispatch: (action: never) => void;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const [open, setOpen] = useState(false);
  const commands = messageCommands(text);
  const items: { label: string; icon: GlyphName; run: () => void }[] = [
    { label: 'Copy text', icon: 'copy', run: () => void Clipboard.setStringAsync(plainWords(text)) },
  ];
  for (const { command, inline } of commands) {
    const named = commands.length > 1 ? ` ${command.length > 32 ? `${command.slice(0, 31)}\u2026` : command}` : '';
    if (inline) {
      items.push({ label: `Copy command${named}`, icon: 'copy', run: () => void Clipboard.setStringAsync(command) });
      items.push({
        label: `Paste in terminal${named}`,
        icon: 'terminal-2',
        run: () => dispatch({ type: 'pasteInTerminal', command } as never),
      });
    } else {
      items.push({
        label: `Run in terminal${named}`,
        icon: 'terminal-2',
        run: () => dispatch({ type: 'runInTerminal', command } as never),
      });
    }
  }
  return (
    <>
      <Pressable accessibilityHint="Long-press to copy" delayLongPress={350} onLongPress={() => setOpen(true)}>
        <Markdown text={text} color={color} breaks selectable={false} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={title}>
        <View>
          {items.map((item) => (
            <Pressable
              key={item.label}
              accessibilityRole="button"
              onPress={() => {
                setOpen(false);
                item.run();
              }}
              style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
            >
              <Glyph name={item.icon} size={15} color={P.cardMuted} />
              <Text style={styles.menuText} numberOfLines={1}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Sheet>
    </>
  );
}

/** The recommended answer's star, the question forms' (`askCard.tsx`). */
function Star() {
  const P = useTranscriptTheme();
  return <Glyph name="star" size={10} color={tint(askColor(P.light), 0.75)} />;
}

/**
 * A work item's button: the tone card's neutral filled button (`ToneButton`, never the dark primary
 * fill on glass), but it grows to a second line instead of having a fixed height, so a long label
 * wraps and is never clipped.
 *
 * CDXC:Coordinators 2026-11-11 WHY:
 * User, of a docked ask on Ghostex 11.4.0 for Android whose first answer ("Release 11.4.1 once the
 * running fixes land") lost its second line to the 28-point button: "Bug with the q choices in work
 * items text cut off ... if we make choices show as dropdown like in desktop would be fixed".
 */
function WorkButton({
  label,
  icon,
  trailing,
  disabled,
  onPress,
  accessibilityLabel,
  keep,
  iconOnly,
  quiet,
  hasDot,
}: {
  label: string;
  icon?: GlyphName;
  /** Only its icon, in a square at the buttons' height: the dock's Details and Reply (its label
   * is what a screen reader says). */
  iconOnly?: boolean;
  /** Quiet neutral button (the folded row's "Details" button beside answer buttons: subtle neutral
   * fill and border, muted text, never accent-coloured). */
  quiet?: boolean;
  trailing?: ReactNode;
  disabled?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  /** Hold the label's whole width: the line was measured to fit it, so it never squeezes. */
  keep?: boolean;
  /** Small top-right dot when the inline Reply button has an unsent draft. */
  hasDot?: boolean;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const labelColor = quiet === true ? P.cardMuted : P.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled === true}
      hitSlop={WORK_BUTTON_SLOP}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        keep === true && styles.kept,
        iconOnly === true && styles.iconButton,
        quiet === true
          ? {
              backgroundColor: pressed ? P.ink(0.11) : P.ink(0.05),
              borderColor: P.ink(0.12),
            }
          : { backgroundColor: pressed ? P.neutralFillPressed : P.neutralFill },
        disabled === true && styles.disabled,
      ]}
    >
      {icon !== undefined ? <Glyph name={icon} size={iconOnly === true ? 16 : 14} color={labelColor} /> : null}
      {iconOnly === true ? null : (
        <Text style={[styles.buttonLabel, keep === true && styles.kept, { color: labelColor }]}>{label}</Text>
      )}
      {iconOnly === true ? null : trailing}
      {hasDot === true ? (
        <View
          pointerEvents="none"
          style={[styles.draftDot, { backgroundColor: P.light ? P.foreground : '#ffffff' }]}
        />
      ) : null}
    </Pressable>
  );
}

/**
 * The answers of a folded ask, one a row, each whole: a long one wraps to more lines, never cut; the
 * recommended one keeps its star and the one given its check (desktop `answer_menu_rows`).
 */
function AnswerChoices({
  answers,
  disabled,
  onPick,
  onReply,
}: {
  answers: JsonRecord[];
  disabled: boolean;
  onPick: (command: JsonRecord) => void;
  /** Reply as the list's last row, when the line had no room for it beside Choose an answer. */
  onReply?: () => void;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  return (
    <View>
      {answers.map((answer, index) => {
        const command = obj(answer.command);
        const picked = isTrue(answer, 'picked');
        const recommended = isTrue(answer, 'recommended');
        const off = disabled || command === null || isTrue(answer, 'locked');
        return (
          <Pressable
            key={`choice:${index}`}
            accessibilityRole="button"
            accessibilityLabel={`${str(answer, 'label')}${recommended ? ', Recommended' : ''}`}
            accessibilityState={{ disabled: off && !picked, selected: picked }}
            disabled={off}
            onPress={() => (command !== null ? onPick(command) : undefined)}
            style={({ pressed }) => [
              styles.choice,
              pressed && styles.menuRowPressed,
              off && !picked && styles.disabled,
            ]}
          >
            {picked ? <Glyph name="check" size={15} color={P.foreground} /> : null}
            <Text style={styles.choiceText}>{str(answer, 'label')}</Text>
            {recommended ? <Star /> : null}
          </Pressable>
        );
      })}
      {onReply !== undefined ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reply"
          disabled={disabled}
          onPress={onReply}
          style={({ pressed }) => [styles.choice, pressed && styles.menuRowPressed, disabled && styles.disabled]}
        >
          <Glyph name="arrow-back-up" size={15} color={P.foreground} />
          <Text style={styles.choiceText}>Reply</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * An item's answers and its Reply on one line, never wrapped: when they do not all fit the line,
 * the answers fold into "Choose an answer" (desktop `answers_dropdown`), which opens them one a
 * row, each whole: a sheet on the dock, a list in place on the Work sheet (`chooser`), as iOS shows
 * no sheet over a sheet. Once one is given, only that one stays when they do not fit. A row with no
 * answers shows what it asks for in their place: Open for a page or form (`open`), else Reply.
 * `divider`: an opened row, whose Reply stands apart after a thin line. Every button grows to more
 * lines rather than cut its words (`WorkButton`).
 */
export function WorkAnswerLine({
  answers,
  reply,
  replied,
  open,
  busy,
  divider,
  room,
  scope,
  dispatch,
  before,
  question = '',
  chooser = 'sheet',
  initialChoosing = false,
  pills = [],
  logos,
  logosWidth = 0,
  openLabel = 'Open',
  isPage = false,
  details = null,
  iconOnly = false,
  context = null,
  markRead = null,
}: {
  answers: JsonRecord[];
  reply: JsonRecord | null;
  replied: string;
  open?: JsonRecord | null;
  busy: boolean;
  divider: boolean;
  /** The line's width in points; the screen's width less `room` when negative. */
  room: number;
  scope: ReplyDraftScope | null;
  dispatch: (action: never) => void;
  /** Runs before a Reply or an answer goes (the Work sheet closes for the Reply sheet). */
  before?: (kind: 'reply' | 'answer') => void;
  /** The ask, over the answers in the Choose an answer sheet. */
  question?: string;
  chooser?: 'sheet' | 'inline';
  /** The folded answers start open (the Work sheet's closed card asked for them). */
  initialChoosing?: boolean;
  /** An opened row's item pills, before its answers (`ItemPills`). */
  pills?: JsonRecord[];
  /** An opened row's threads as their logos, after the item pills at the line's left, and their width. */
  logos?: ReactNode;
  logosWidth?: number;
  /** What a form's or page's button says: Answer while it asks something (gx-chat-core `openLabel`). */
  openLabel?: string;
  /** Whether this row opens a Live page (external-link icon) rather than a question/form popup (message-question icon). */
  isPage?: boolean;
  /** A closed row whose question has details: Details (which shows them, with the answers under
   * them) and Reply in the answers' place (gx-chat-core `details_fields`). */
  details?: (() => void) | null;
  /** The dock's closed row: Details (for anything that opens something) and Reply as icon
   * buttons; answers keep their words.
   *
   * CDXC:Coordinators 2026-11-19 DECISION: the user, of the dock rows' "Open" and "Reply": "They
   * should be just icon buttons. Same for details ... Let's just unify the icon details for all of
   * them" (desktop `dock_row_icon_action`). */
  iconOnly?: boolean;
  /** Jump to context, just before Reply so Reply is always the rightmost button: what opens the
   * chat that asked when that is another chat, today a thread's to-do (gx-chat-core
   * `work_cards::context_of`; desktop `dock_context_icon`). A computer that sends none draws no
   * button. */
  context?: JsonRecord | null;
  /** Mark as read, the first of the dock's closed row's buttons: the row's own `dismiss`, the
   * command its menu's Dismiss / Mark as read sends (desktop `dock_mark_read_icon`).
   *
   * CDXC:Coordinators 2026-11-21 DECISION: the user, of Needs you rows with Details and Reply:
   * "can we add the message open icon to mark as read to be to the left of the current 2 buttons
   * that are there?" */
  markRead?: JsonRecord | null;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const { width, fontScale } = useWindowDimensions();
  const [choosing, setChoosing] = useState(initialChoosing);
  // The line's own width and each button's whole width, measured (`measured`), so the fold holds at
  // any width the window gets (split screen, a folded or unfolded foldable, a small phone) rather
  // than trusting the screen's width and a guess at the letters'.
  const [lineWidth, setLineWidth] = useState(0);
  const [measured, setMeasured] = useState<Record<string, number>>({});
  const measure = useCallback(
    (key: string) => (event: LayoutChangeEvent) => {
      const next = Math.ceil(event.nativeEvent.layout.width);
      setMeasured((was) => (was[key] === next ? was : { ...was, [key]: next }));
    },
    [],
  );
  const onLine = useCallback((event: LayoutChangeEvent) => {
    const next = Math.floor(event.nativeEvent.layout.width);
    setLineWidth((was) => (was === next ? was : next));
  }, []);
  const row = reply !== null ? replyDraftRow(reply as never) : null;
  const replyDraftText = useReplyDraft(scope, row !== null ? SESSION_REPLY_ROW : null);
  const given = answers.some((answer) => isTrue(answer, 'picked'));
  const locked = given || answers.some((answer) => isTrue(answer, 'locked'));
  const lineRoom = lineWidth > 0 ? lineWidth : room > 0 ? room : width + room;
  const replyButton =
    reply !== null ? (
      <WorkButton
        key="reply"
        keep={replied.length === 0}
        iconOnly={iconOnly}
        hasDot={!iconOnly && replied.length === 0 && !locked && replyDraftText.trim().length > 0}
        accessibilityLabel={iconOnly && replied.length > 0 ? `Replied: ${replied}` : undefined}
        label={replyLabel(replied)}
        icon={replied.length > 0 ? 'check' : 'arrow-back-up'}
        disabled={(busy || locked) && replied.length === 0}
        onPress={() => {
          if (replied.length > 0) return;
          before?.('reply');
          openWorkReply(reply, scope);
        }}
      />
    ) : null;
  const contextButton =
    context != null ? (
      <WorkButton
        key="context"
        keep
        iconOnly
        label="Jump to context"
        icon={CONTEXT_GLYPH}
        onPress={() => {
          // Into the chat: the Work sheet closes as it does for a Reply.
          before?.('reply');
          dispatch(context as never);
        }}
      />
    ) : null;
  const markReadButton =
    markRead != null ? (
      <WorkButton
        key="read"
        keep
        iconOnly
        label="Archive"
        icon={MARK_READ_GLYPH}
        onPress={() => dispatch(markRead as never)}
      />
    ) : null;
  // CDXC:Coordinators 2026-11-24 DECISION (ask-details-page, Layout C + "Details"):
  // Keep answer buttons visible on the folded row and put a quiet neutral "Details" button beside
  // them to open the full bottom sheet.
  const detailsButton =
    details != null ? <WorkButton key="details" keep quiet label="Details" onPress={details} /> : null;
  const detailsWidth =
    detailsButton !== null ? (measured.details ?? buttonWidth('Details', false, false, fontScale)) + 6 : 0;
  const contextWidth =
    detailsWidth + (contextButton !== null ? ICON_BUTTON + 6 : 0) + (markReadButton !== null ? ICON_BUTTON + 6 : 0);
  const pillRoom = pillWidths(pills, fontScale);
  if (answers.length === 0) {
    // A form or page offers Reply after its Open (gx-chat-core `questionsReply`).
    const alone =
      (open != null
        ? (iconOnly ? ICON_BUTTON : buttonWidth(openLabel, true, false, fontScale)) +
          (replyButton !== null ? 6 + (iconOnly ? ICON_BUTTON : replyWidthOf(replied, fontScale)) : 0)
        : iconOnly
          ? ICON_BUTTON
          : replyWidthOf(replied, fontScale)) + contextWidth;
    const lead = (
      <>
        {pills.length > 0 || logos != null ? (
          <View style={styles.lead}>
            <ItemPills pills={pills} fit={pillFit(pillRoom, lineRoom - alone - logosWidth)} dispatch={dispatch} />
            {logos}
          </View>
        ) : null}
        {divider ? <View style={styles.flex} /> : null}
      </>
    );
    if (open != null) {
      const openGlyph = isPage === true ? PAGE_OPEN_GLYPH : DETAILS_GLYPH;
      return (
        <View style={styles.line}>
          {lead}
          {markReadButton}
          {iconOnly ? (
            <WorkButton
              keep
              iconOnly
              label={isPage === true ? 'Open page' : 'Details'}
              icon={openGlyph}
              onPress={() => dispatch(open as never)}
            />
          ) : (
            <WorkButton keep label={openLabel} icon={openGlyph} onPress={() => dispatch(open as never)} />
          )}
          {contextButton}
          {replyButton}
        </View>
      );
    }
    return detailsButton !== null || replyButton !== null || contextButton !== null || pills.length > 0 || logos != null ? (
      <View style={styles.line}>
        {lead}
        {markReadButton}
        {detailsButton}
        {contextButton}
        {replyButton}
      </View>
    ) : null;
  }
  const answer = (command: JsonRecord) => {
    if (busy || locked) return;
    setChoosing(false);
    before?.('answer');
    dispatch(command as never);
  };
  const answerButton = (choice: JsonRecord, index: number, keep: boolean) => {
    const picked = isTrue(choice, 'picked');
    const recommended = isTrue(choice, 'recommended');
    const command = obj(choice.command);
    return (
      <WorkButton
        key={`answer:${index}`}
        keep={keep}
        label={str(choice, 'label')}
        icon={picked ? 'check' : undefined}
        trailing={recommended ? <Star /> : undefined}
        accessibilityLabel={recommended ? `${str(choice, 'label')}, Recommended` : undefined}
        disabled={(busy || locked) && !picked}
        onPress={() => (command !== null ? answer(command) : undefined)}
      />
    );
  };
  const answerKey = (choice: JsonRecord) =>
    `answer:${str(choice, 'label')}:${isTrue(choice, 'picked')}:${isTrue(choice, 'recommended')}`;
  const replyKey = `reply:${replyLabel(replied)}`;
  const widths = answers.map(
    (choice) =>
      measured[answerKey(choice)] ??
      buttonWidth(str(choice, 'label'), isTrue(choice, 'picked'), isTrue(choice, 'recommended'), fontScale),
  );
  const replyAlone =
    reply !== null ? (measured[replyKey] ?? (iconOnly ? ICON_BUTTON : replyWidthOf(replied, fontScale))) : 0;
  const replyWidth = (reply !== null ? replyAlone + 6 + (divider ? 13 : 0) : 0) + contextWidth;
  const chooseWidth = measured.choose ?? buttonWidth(CHOOSE_ANSWER, true, false, fontScale);
  const answersWidth = widths.reduce((sum, value) => sum + value, 0) + 6 * Math.max(0, widths.length - 1);
  // The item pills lead: the answers fold first, then the pills drop their ids, then they are one "+N".
  const fits = answersWidth + replyWidth + pillRoom[0] + logosWidth <= lineRoom;
  /*
   * CDXC:Coordinators 2026-11-15 WHY:
   * User, on an Android foldable in split screen, of a docked ask whose chips broke inside their
   * words ("Y / es", "fix / them", "Re / ply"): "The choice options in the left side are being
   * wrapped weird please show a dropdown button in this case." The fold was decided from the screen's
   * width and a letter-count guess, which split screen and a large text size both outran, and the
   * buttons shrank below their words. Now the line and every button are measured, a shown answer
   * keeps its whole width, and any two or more answers that do not fit fold into Choose an answer;
   * Reply joins the list too when the line has no room for it beside the dropdown.
   */
  const fold = !given && !fits && answers.length > 1;
  const shown = fits || !given ? answers : answers.filter((choice) => isTrue(choice, 'picked'));
  const replyInList = fold && reply !== null && replied.length === 0 && chooseWidth + replyWidth > lineRoom;
  const replyFromList =
    replyInList && reply !== null
      ? () => {
          if (busy || locked) return;
          setChoosing(false);
          before?.('reply');
          openWorkReply(reply, scope);
        }
      : undefined;
  const list = (
    <AnswerChoices answers={answers} disabled={busy || locked} onPick={answer} onReply={replyFromList} />
  );
  const used = fold
    ? chooseWidth + (replyInList ? 0 : replyWidth)
    : (fits ? answersWidth : shown.reduce((sum, choice) => sum + widths[answers.indexOf(choice)]!, 0)) + replyWidth;
  return (
    <View style={styles.column} onLayout={onLine}>
      {/* Every button at its whole width, unseen, to measure the line by (`measured`). */}
      <View style={styles.measure} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {answers.map((choice, index) => (
          <View key={`m:${index}`} style={styles.measureItem} onLayout={measure(answerKey(choice))}>
            {answerButton(choice, index, true)}
          </View>
        ))}
        {replyButton !== null ? (
          <View style={styles.measureItem} onLayout={measure(replyKey)}>
            {replyButton}
          </View>
        ) : null}
        {detailsButton !== null ? (
          <View style={styles.measureItem} onLayout={measure('details')}>
            {detailsButton}
          </View>
        ) : null}
        <View style={styles.measureItem} onLayout={measure('choose')}>
          <WorkButton keep label={CHOOSE_ANSWER} icon="chevron-down" onPress={() => undefined} />
        </View>
      </View>
      <View style={styles.line}>
        {/* The pills and logos give way (clipped, then left out) before a button ever shrinks. */}
        {pills.length > 0 || logos != null ? (
          <View style={styles.lead}>
            <ItemPills pills={pills} fit={pillFit(pillRoom, lineRoom - used - logosWidth)} dispatch={dispatch} />
            {logos}
          </View>
        ) : null}
        {/* Opened: the item pills at the left, the answers and Reply at the right edge (user,
            2026-11-12: "move the answer buttons to bottom right. keep work item tag bottom left"). */}
        {divider ? <View style={styles.flex} /> : null}
        {markReadButton}
        {fold ? (
          <WorkButton
            keep
            label={CHOOSE_ANSWER}
            icon={chooser === 'inline' && choosing ? 'chevron-up' : 'chevron-down'}
            accessibilityLabel={`${CHOOSE_ANSWER}, ${plural(answers.length, 'answer', 'answers')}`}
            disabled={busy}
            onPress={() => setChoosing((was) => !was)}
          />
        ) : (
          shown.map((choice) => answerButton(choice, answers.indexOf(choice), fits))
        )}
        {detailsButton}
        {contextButton}
        {replyButton !== null && divider && !replyInList ? <View style={styles.divider} /> : null}
        {replyInList ? null : replyButton}
      </View>
      {fold && chooser === 'inline' && choosing ? <View style={styles.choicesBox}>{list}</View> : null}
      {fold && chooser === 'sheet' ? (
        <Sheet visible={choosing} onClose={() => setChoosing(false)} title={CHOOSE_ANSWER}>
          {question.length > 0 ? <Text style={[styles.choiceQuestion, { color: P.cardMuted }]}>{question}</Text> : null}
          {list}
        </Sheet>
      ) : null}
    </View>
  );
}

/** One row of an item's menu. */
export type WorkMenuRow = {
  label: string;
  icon: GlyphName;
  command?: JsonRecord;
  snooze?: JsonRecord[];
  /** Words a pick copies to the clipboard (Copy as Markdown). */
  copy?: string;
  destructive?: boolean;
};

/** "Answers: A, B (recommended: A)" for a question's choices, "" for none. */
function answersLine(choices: JsonRecord[]): string {
  const labels = choices.map((choice) => str(choice, 'label')).filter((label) => label.length > 0);
  if (labels.length === 0) return '';
  const recommended = choices.filter((choice) => isTrue(choice, 'recommended')).map((choice) => str(choice, 'label'));
  return `Answers: ${labels.join(', ')}${recommended.length > 0 ? ` (recommended: ${recommended.join(', ')})` : ''}`;
}

/**
 * What a dock row's Copy as Markdown copies, "" for a row that has none (desktop `row_markdown`,
 * native_chat/work_cards.rs): a work item ask's or a one-click question's title as a heading, its
 * detail and its answers line; a form's title and each question it still asks (`forms` is the
 * document's `questionForms`, the waiting tags `reply.tag`), each with its detail and answers; a
 * page's title (a link to it when its mention carries one) and the tags it still asks.
 *
 * CDXC:Coordinators 2026-11-13 DECISION:
 * User: a work item ask in the dock needs "Copy as Markdown" in its menu, copying its title and full
 * detail as Markdown plus its answers; form and page rows copy their title and each open question.
 */
export function rowMarkdown(row: JsonRecord, forms: { [id: string]: unknown } | undefined): string {
  const join = (parts: string[]) =>
    parts
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .join('\n\n');
  const records = (value: unknown) =>
    arr(value)
      .map(obj)
      .filter((entry): entry is JsonRecord => entry !== null);
  const title = str(row, 'title').trim();
  const reply = obj(row.reply);
  const tags = reply !== null ? str(reply, 'tag') : '';
  const kind = str(row, 'kind');
  if (kind === 'ask' || kind === 'question') {
    return join([`## ${title}`, str(row, 'body'), answersLine(records(row.buttons))]);
  }
  if (kind !== 'form') return '';
  if (isTrue(row, 'page')) {
    // Its mention is `[Name](url) (Q12 to Q14)` (gx-chat-core `questions_mention`), or the name in
    // quotes when the page has no address: the heading is the link, else the title.
    const mention = str(row, 'mention');
    const link = (tags.length > 0 ? mention.replace(/ \([^()]*\)$/u, '') : mention).trimEnd();
    const heading = link.startsWith('[') && link.endsWith(')') ? link : title;
    return join([`## ${heading}`, tags.length > 0 ? `Open questions: ${tags}` : '']);
  }
  const form = obj(forms?.[reply !== null ? str(reply, 'questions') : '']);
  const waiting = tags.split(/\s+/).filter((tag) => tag.length > 0);
  const parts = [`## ${title}`];
  for (const question of records(form?.questions)) {
    const tag = str(question, 'tag');
    if (waiting.length > 0 && !waiting.includes(tag)) continue;
    const name = str(question, 'title').trim();
    parts.push(
      join([
        `### ${tag.length > 0 ? `${tag} ${name}` : name}`,
        str(question, 'detail'),
        answersLine(records(question.choices)),
      ]),
    );
  }
  return join(parts);
}

/**
 * An item's menu rows from its actions (desktop `row_menu`): Show in chat, Mark answered, Dismiss (or Mark as read), Snooze with its
 * lengths, Copy as Markdown when `markdown` has words (`rowMarkdown`), then Mention in chat box,
 * which puts the item, form or page in the chat box.
 */
export function workMenuRows(
  actions: JsonRecord | null,
  mention: string,
  composerText: string,
  markdown = '',
): WorkMenuRow[] {
  if (actions === null) return [];
  const rows: WorkMenuRow[] = [];
  // A snoozed row's Unsnooze (gx-chat-core `dock_with`'s `snoozed`): back under Needs you now.
  const unsnooze = obj(actions.unsnooze);
  if (unsnooze !== null) rows.push({ label: 'Unsnooze', icon: 'alarm-off', command: unsnooze });
  // A Needs you to-do's command (gx-chat-core `extras::needs_you`), as its chip copies it.
  const command = str(actions, 'command').trim();
  if (command.length > 0) rows.push({ label: 'Copy command', icon: 'copy', copy: command });
  const show = obj(actions.showInChat);
  if (show !== null) rows.push({ label: 'Show in chat', icon: 'message-share', command: show });
  // Mark answered, beside Dismiss: one answered in the chat box closes by hand (gx-chat-core
  // `questions::later::mark_answered`, CDXC:Coordinators 2026-11-16 DECISION).
  const markAnswered = obj(actions.markAnswered);
  if (markAnswered !== null) rows.push({ label: 'Mark answered', icon: 'circle-check', command: markAnswered });
  const dismiss = obj(actions.dismiss);
  // Dismiss, or Archive on a row that asks no question (a Needs you to-do, a page that only
  // waits to be seen, what the newest turn finished): gx-chat-core's `dismissLabel`. Both send the
  // agent nothing; gxserver tells it with its next message (server/src/session_chat_dismissed.rs).
  if (dismiss !== null) {
    const label = str(actions, 'dismissLabel');
    const archive =
      label === 'Archive' ||
      label === 'Archive all' ||
      label === 'Done' ||
      label === 'Mark all done' ||
      label === 'Mark as read';
    rows.push({
      label: archive ? (label === 'Archive all' ? 'Archive all' : 'Archive') : label || 'Dismiss',
      icon: archive ? 'check' : 'x',
      command: dismiss,
    });
  }
  const snooze = arr(actions.snooze)
    .map(obj)
    .filter((choice): choice is JsonRecord => choice !== null);
  if (snooze.length > 0) rows.push({ label: 'Snooze', icon: 'moon', snooze });
  if (markdown.length > 0) rows.push({ label: 'Copy as Markdown', icon: 'markdown', copy: markdown });
  if (mention.length > 0) {
    rows.push({
      label: 'Mention in chat box',
      icon: 'quote',
      command: { type: 'insertBoardReference', reference: mention, text: composerText },
    });
  }
  return rows;
}

/**
 * An item's menu as a list: its rows, and Snooze opening its lengths in place with a back row, as
 * the desktop's dropdown opens its submenu. `onPick` runs a row's command.
 */
export function WorkMenuList({
  rows,
  onPick,
  onCopied,
  header,
}: {
  rows: WorkMenuRow[];
  onPick: (command: JsonRecord) => void;
  /** After a row that copies (`copy`) put its words on the clipboard: the sheet closes. */
  onCopied?: () => void;
  header?: ReactNode;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const [snoozing, setSnoozing] = useState<JsonRecord[] | null>(null);
  if (snoozing !== null) {
    return (
      <View>
        <Pressable accessibilityRole="button" onPress={() => setSnoozing(null)} style={styles.menuRow}>
          <Glyph name="chevron-left" size={15} color={P.cardMuted} />
          <Text style={[styles.menuText, { color: P.cardMuted }]}>Snooze for</Text>
        </Pressable>
        {snoozing.map((choice, index) => (
          <Pressable
            key={`snooze:${index}`}
            accessibilityRole="button"
            accessibilityLabel={`Snooze for ${str(choice, 'label')}`}
            onPress={() => {
              const command = obj(choice.command);
              setSnoozing(null);
              if (command !== null) onPick(command);
            }}
            style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
          >
            <Glyph name="moon" size={15} color={P.cardMuted} />
            <Text style={styles.menuText}>{str(choice, 'label')}</Text>
          </Pressable>
        ))}
      </View>
    );
  }
  return (
    <View>
      {header}
      {rows.map((row) => (
        <Pressable
          key={row.label}
          accessibilityRole="button"
          onPress={() => {
            if (row.snooze !== undefined) setSnoozing(row.snooze);
            else if (row.copy !== undefined) {
              void Clipboard.setStringAsync(row.copy);
              onCopied?.();
            } else if (row.command) onPick(row.command);
          }}
          style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
        >
          <Glyph name={row.icon} size={15} color={P.cardMuted} />
          <Text style={[styles.menuText, styles.flex]}>{row.label}</Text>
          {row.snooze !== undefined ? <Glyph name="chevron-right" size={14} color={P.cardMuted} /> : null}
        </Pressable>
      ))}
    </View>
  );
}

/** The ⋯ that opens an item's menu: always shown, since a phone has no hover. */
export function WorkMenuButton({ onPress, active }: { onPress: () => void; active?: boolean }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="More actions"
      accessibilityState={{ expanded: active === true }}
      hitSlop={{ top: 11, bottom: 11, left: 8, right: 8 }}
      onPress={onPress}
      style={({ pressed }) => [styles.dots, (pressed || active === true) && { backgroundColor: P.neutralFillPressed }]}
    >
      <Glyph name="dots" size={14} color={P.cardMuted} />
    </Pressable>
  );
}

const useStyles = themedStyles((P) => ({
  column: { width: '100%', minWidth: 0, gap: 6 },
  // One line: its buttons shrink and wrap their words rather than run past it or wrap below.
  line: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  // An item pill (desktop `item_pill_elements`): small and round, a dot and a short id.
  pill: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 22,
    paddingHorizontal: PILL_PAD,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: P.ink(0.1),
    backgroundColor: P.ink(0.04),
  },
  pillPressed: { backgroundColor: P.ink(0.08) },
  pillDot: { width: PILL_DOT, height: PILL_DOT, borderRadius: PILL_DOT / 2 },
  pillText: { fontSize: PROSE_SIZE, lineHeight: 18, color: P.cardMuted, fontVariant: ['tabular-nums'] },
  button: {
    minHeight: 28,
    flexShrink: 1,
    maxWidth: '100%',
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  buttonLabel: { flexShrink: 1, fontSize: PROSE_SIZE, lineHeight: 20, fontWeight: '400' },
  iconButton: { width: ICON_BUTTON, height: ICON_BUTTON, minHeight: ICON_BUTTON, paddingHorizontal: 0, paddingVertical: 0, flexShrink: 0 },
  // A button the line was measured to hold: it keeps its words' whole width.
  kept: { flexShrink: 0 },
  // The line's item pills and logos: the part that gives way, clipped rather than pushing a button.
  lead: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0, overflow: 'hidden' },
  // Unseen and out of the flow: wide enough that every button lays out at its whole width.
  measure: { position: 'absolute', left: 0, top: 0, width: 10000, opacity: 0, alignItems: 'flex-start' },
  measureItem: { flexDirection: 'row' },
  disabled: { opacity: 0.5 },
  choicesBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: P.ink(0.1),
    backgroundColor: P.ink(0.04),
    paddingVertical: 2,
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  choiceText: { flexShrink: 1, color: P.foreground, fontSize: PROSE_SIZE + 1, lineHeight: 21 },
  choiceQuestion: { paddingHorizontal: 16, paddingBottom: 8, fontSize: PROSE_SIZE, lineHeight: 20 },
  divider: { width: 1, height: 16, marginHorizontal: 3, backgroundColor: P.ink(0.1) },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 16 },
  menuRowPressed: { backgroundColor: P.neutralFillPressed },
  menuText: { color: P.foreground, fontSize: PROSE_SIZE + 1 },
  flex: { flex: 1 },
  dots: { width: 26, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  draftDot: { position: 'absolute', top: -2, right: -2, width: 6, height: 6, borderRadius: 3 },
}));
