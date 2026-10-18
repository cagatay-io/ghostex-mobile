/**
 * The card every question the chat shows is drawn in: an agent's own question tool
 * (`QuestionCard.tsx`) and its answered record (`QuestionExchangeCards.tsx`), a ```questions form
 * (`transcript/QuestionForm.tsx`) and the answers sent from a form or an HTML page
 * (`transcript/PageAnswersCard.tsx`). A tinted tile and a two-line title lead it, the options are
 * radio or checkbox rows that light up in the asking colour, and the answers come back as plain text under their question.
 *
 * CDXC:SessionChat 2026-10-11 SEE-ALSO:
 * The desktop's copy is apps/desktop/src/app/native_chat/ask_card.rs; the HTML question pages draw it in server/src/visual_pages/kit.rs. Change them together.
 */

import type { ReactNode } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Glyph, type GlyphName } from './icons';
import { SINGLE_LINE_CARD, SINGLE_LINE_HEADER_HEIGHT, SINGLE_LINE_TITLE, singleLineShell } from '../transcript/singleLineCard';
import { MONO_FONT, themedStyles, useTranscriptTheme, type TranscriptTheme } from '../transcript/theme';

/** What a card's tile says about the question: waiting, answered, or closed without an answer. */
export type AskTone = 'ask' | 'answered' | 'quiet';

/** The colour a waiting question and the option the reader picked share. */
export function askColor(light: boolean): string {
  return light ? '#b45309' : '#fbbf24';
}

/** The green that marks an answer. */
export function answeredColor(light: boolean): string {
  return light ? '#059669' : '#34d399';
}

export function toneColor(tone: AskTone, P: TranscriptTheme): string {
  return tone === 'ask' ? askColor(P.light) : tone === 'answered' ? answeredColor(P.light) : P.muted;
}

/** `#rrggbb` at an alpha. */
export function tint(hex: string, alpha: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  return `${hex}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')}`;
}

/**
 * The card's shell around its head, its body and its footer band. `singleLine` is an answered card
 * that folds to a `singleLine` head: the shell every one-line card shares (`singleLineCard.ts`).
 */
export function AskCard({
  head,
  children,
  footer,
  style,
  singleLine,
}: {
  head: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  style?: StyleProp<ViewStyle>;
  singleLine?: boolean;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const hasBody = children !== undefined && children !== null && children !== false;
  return (
    <View style={[styles.card, singleLine === true && singleLineShell(P), style]}>
      {head}
      {hasBody ? <View style={[styles.body, singleLine === true && styles.singleLineBody]}>{children}</View> : null}
      {footer !== undefined && footer !== null ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

/** The 28px tile that leads the card's head; a one-line card's is smaller so the row keeps its height. */
export function AskTile({ icon, tone, small }: { icon: GlyphName; tone: AskTone; small?: boolean }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const hue = toneColor(tone, P);
  // A waiting question's amber is a light tint; the answered and quiet tiles keep their strength (desktop ask_card.rs).
  const [ring, fill, ink] = tone === 'ask' ? [0.14, 0.09, 0.8] : [0.22, 0.15, 1];
  const box = small === true ? SINGLE_LINE_CARD.iconBox : 28;
  return (
    <View
      style={[
        styles.tile,
        { width: box, height: box, borderRadius: (box * 2) / 7, backgroundColor: tint(hue, fill), borderColor: tint(hue, ring) },
      ]}
    >
      <Glyph name={icon} size={small === true ? SINGLE_LINE_CARD.iconSize : 15} color={ink < 1 ? tint(hue, ink) : hue} />
    </View>
  );
}

/**
 * The head row: tile, title over a muted detail line, then whatever trails it. With `onPress` the
 * whole row folds the card and lights edge to edge when pressed. `singleLine` is the 44pt head of a
 * card that folds to one line, in the fold's title type (`singleLineCard.ts`).
 */
export function AskHead({
  icon,
  tone,
  title,
  detail,
  trailing,
  chevron,
  onPress,
  accessibilityLabel,
  singleLine,
}: {
  icon: GlyphName;
  tone: AskTone;
  title: string;
  detail?: string;
  trailing?: ReactNode;
  /** `open` / `closed` draws the fold chevron. */
  chevron?: 'open' | 'closed';
  onPress?: () => void;
  accessibilityLabel?: string;
  singleLine?: boolean;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const compact = singleLine === true;
  const headStyle = compact ? [styles.head, styles.singleLineHead] : styles.head;
  const content = (
    <>
      <AskTile icon={icon} tone={tone} small={compact} />
      <View style={styles.titles}>
        <Text style={compact ? [styles.title, SINGLE_LINE_TITLE] : styles.title} numberOfLines={1}>
          {title}
        </Text>
        {detail !== undefined && detail.length > 0 ? (
          <Text style={styles.detail} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      {trailing}
      {chevron !== undefined ? <Glyph name={chevron === 'open' ? 'chevron-up' : 'chevron-down'} size={14} color={P.muted} /> : null}
    </>
  );
  if (onPress === undefined) return <View style={headStyle}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [headStyle, pressed && { backgroundColor: P.pressedFill }]}
    >
      {content}
    </Pressable>
  );
}

/** One short bar per question, the asked ones lit: the progress through a multi-question ask. */
export function ProgressDots({ index, count }: { index: number; count: number }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const hue = tint(askColor(P.light), 0.8);
  return (
    <View style={styles.dots}>
      {Array.from({ length: count }, (_, dot) => (
        <View key={dot} style={[styles.dot, { backgroundColor: dot <= index ? hue : P.ink(0.12) }]} />
      ))}
    </View>
  );
}

/** A muted keycap: an option's letter. */
export function Keycap({ label, lit }: { label: string; lit: boolean }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  return <Text style={[styles.keycap, { color: lit ? P.foreground : P.muted }]}>{label}</Text>;
}

/** One option the reader can pick: radio or checkbox, label over its detail, an optional keycap. */
export function AskOption({
  label,
  detail,
  picked,
  multiple,
  keyLabel,
  recommended,
  other,
  enabled,
  answered,
  onPress,
}: {
  label: string;
  detail?: string;
  picked: boolean;
  multiple: boolean;
  keyLabel?: string;
  recommended?: boolean;
  /** "Other / none of these": its label stays muted until it is picked. */
  other?: boolean;
  enabled: boolean;
  /** The question was answered and sent: a pick reads green, like the answers card. */
  answered?: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  // A pick waiting to be sent is a light amber tint; once sent it reads green at full strength (desktop ask_card.rs).
  const sent = answered === true;
  const hue = sent ? answeredColor(P.light) : askColor(P.light);
  const [edge, wash] = sent ? [0.55, 0.08] : [0.32, 0.04];
  const markHue = sent ? hue : tint(hue, 0.85);
  const showDetail = detail !== undefined && detail.length > 0 && detail !== label;
  return (
    <Pressable
      accessibilityRole={multiple ? 'checkbox' : 'radio'}
      accessibilityLabel={label}
      accessibilityState={{ checked: picked, disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        {
          borderColor: picked ? tint(hue, edge) : P.controlBorder,
          backgroundColor: picked ? tint(hue, wash) : pressed ? P.pressedFill : P.light ? P.background : P.cardRow,
        },
        !enabled && !picked && styles.dimmed,
      ]}
    >
      <View style={[styles.mark, multiple ? styles.checkbox : styles.radio, { borderColor: picked ? markHue : P.mutedInk(0.7) }, picked && multiple && { backgroundColor: markHue }]}>
        {picked && multiple ? <Glyph name="check" size={11} color={P.background} /> : null}
        {picked && !multiple ? <View style={[styles.radioDot, { backgroundColor: markHue }]} /> : null}
      </View>
      <View style={styles.optionBody}>
        <View style={styles.optionLine}>
          <Text style={[styles.optionLabel, { color: other === true && !picked ? P.cardMuted : P.foreground }]}>{label}</Text>
          {recommended === true ? <Text style={styles.recommended}>Recommended</Text> : null}
        </View>
        {showDetail ? <Text style={styles.optionDetail}>{detail}</Text> : null}
      </View>
      {keyLabel !== undefined ? <Keycap label={keyLabel} lit={picked} /> : null}
    </Pressable>
  );
}

/**
 * The filled button that moves the ask on (Next, Send answer, Send).
 */
export function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled === true}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.primary,
        pressed && styles.primaryPressed,
        disabled === true && styles.disabled,
      ]}
    >
      <Text style={styles.primaryLabel}>{label}</Text>
    </Pressable>
  );
}

/**
 * The quiet button beside the primary one (the question form's Skip all): a faint fill of the
 * foreground, the normal text colour, no border, the primary button's size.
 *
 * CDXC:SessionChat 2026-10-16 DECISION: User: "skip all looks disabled cuz it's darker color"; shown a mockup of options, they picked "soft fill": the foreground at 10% on the dark theme and 7% on the light one, normal text colour, no border. Send answers keeps the solid fill. Matches the desktop `ask_soft_button` (apps/desktop/src/app/native_chat/ask_card.rs) and the page kit's `.gx-skip-all`.
 */
export function SoftButton({ label, onPress }: { label: string; onPress: () => void }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.soft, { backgroundColor: P.ink(P.light ? (pressed ? 0.11 : 0.07) : pressed ? 0.15 : 0.1) }]}
    >
      <Text style={styles.softLabel}>{label}</Text>
    </Pressable>
  );
}

/** An answer as plain text: the foreground colour at medium weight, no chip, border or fill (desktop `plain_answer`). */
export function PlainAnswer({ children }: { children: string }) {
  const styles = useStyles();
  return (
    <Text selectable style={styles.plainAnswer}>
      {children}
    </Text>
  );
}

/** The muted words beside or under an answer. */
export function AnswerAside({ children, italic }: { children: string; italic?: boolean }) {
  const styles = useStyles();
  return <Text style={[styles.aside, italic === true && styles.italic]}>{children}</Text>;
}

/**
 * One answered question in a receipt: its number, the question (muted), and under it the plain
 * answer and whatever follows it.
 */
export function ReceiptRow({
  number,
  question,
  answer,
  below,
  first,
}: {
  number: number;
  question: string;
  answer: ReactNode;
  below?: ReactNode;
  first: boolean;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.receiptRow, !first && styles.receiptDivider]}>
      <Text style={styles.number}>{number}</Text>
      <View style={styles.receiptBody}>
        {question.length > 0 ? <Text style={styles.receiptQuestion}>{question}</Text> : null}
        <View style={styles.answerLine}>{answer}</View>
        {below}
      </View>
    </View>
  );
}

const useStyles = themedStyles((P) => ({
  card: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: P.inputBorder,
    backgroundColor: P.cardPanel,
    overflow: 'hidden',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  singleLineHead: {
    height: SINGLE_LINE_HEADER_HEIGHT,
    paddingHorizontal: SINGLE_LINE_CARD.paddingX,
    paddingVertical: 0,
  },
  tile: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titles: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: P.foreground,
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: '600',
  },
  detail: {
    color: P.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  body: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  singleLineBody: {
    paddingHorizontal: SINGLE_LINE_CARD.paddingX,
    paddingBottom: SINGLE_LINE_CARD.paddingX,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: P.light ? P.border : 'rgba(255,255,255,0.04)',
    backgroundColor: P.cardFooter,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 18,
    height: 4,
    borderRadius: 2,
  },
  keycap: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    marginTop: 1,
    borderWidth: 1,
    borderRadius: 5,
    borderColor: P.ink(0.12),
    backgroundColor: P.light ? P.background : 'rgba(14,14,14,0.5)',
    fontFamily: MONO_FONT,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '500',
    textAlign: 'center',
    overflow: 'hidden',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  mark: {
    width: 16,
    height: 16,
    marginTop: 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radio: {
    borderRadius: 8,
  },
  checkbox: {
    borderRadius: 4,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  optionBody: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  optionLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  optionLabel: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  optionDetail: {
    color: P.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  recommended: {
    paddingHorizontal: 6,
    borderWidth: 1,
    borderRadius: 999,
    overflow: 'hidden',
    borderColor: P.light ? P.controlPrimary : 'rgba(229,229,229,0.6)',
    color: P.controlPrimary,
    fontSize: 10.5,
    lineHeight: 16,
    fontWeight: '600',
  },
  dimmed: {
    opacity: 0.55,
  },
  primary: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: P.controlPrimary,
    backgroundColor: P.controlPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryPressed: {
    opacity: 0.85,
  },
  soft: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  softLabel: {
    color: P.foreground,
    fontSize: 13.5,
    fontWeight: '500',
  },
  primaryLabel: {
    color: P.background,
    fontSize: 13.5,
    fontWeight: '500',
  },
  disabled: {
    opacity: 0.5,
  },
  plainAnswer: {
    flexShrink: 1,
    color: P.foreground,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  aside: {
    flexShrink: 1,
    color: P.muted,
    fontSize: 12.5,
    lineHeight: 18,
  },
  italic: {
    fontStyle: 'italic',
  },
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
  },
  receiptDivider: {
    borderTopWidth: 1,
    borderTopColor: P.ink(0.05),
  },
  number: {
    width: 22,
    height: 22,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: P.ink(0.07),
    color: P.muted,
    fontSize: 11,
    lineHeight: 22,
    fontWeight: '600',
    textAlign: 'center',
  },
  receiptBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  receiptQuestion: {
    color: P.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  answerLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
}));
