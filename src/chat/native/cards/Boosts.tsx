/**
 * Boosts on the phone (gx-chat-core `extras/boosts.rs` has the user's decision and the rules; desktop
 * `native_chat/boosts.rs`): the Boost pill at the right of the pill strip and its sheet of Boosts, the
 * prompt sheet, "Try a Boost" on a new chat and the one-time hint inside the chat box. Everything is
 * drawn from the core's `boosts` key, which is null while the computer has no Boosts.
 *
 * CDXC:Boosts 2026-11-20 DECISION:
 * User (Q4253): build Boosts on the phone too, over the air: "the Boost pill/sheet with the five
 * Boosts, the Boost icon and colour on sent Boosts, long-press to read or edit a prompt (same
 * gxserver store), Try a Boost on new chats, the one-time hint". A tap on a row of the sheet puts
 * the Boost in the message or takes it out; a long press opens its prompt, saved through the same
 * `/api/boosts` store the computer's chats use. The chat box's text field cannot take a press on a
 * pill inside it, so the long press lives on the sheet's rows instead of the pill in the box.
 */

import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import type { UserAction } from '../../rust/actions';
import type { BoostRow, BoostsDocument } from '../../rust/document';
import { Glyph, type GlyphName } from '../composer/icons';
import { Sheet } from '../composer/Sheet';
import { themedStyles, useTranscriptTheme } from '../transcript/theme';

/** The Boosts' accent, the desktop's (`boosts.rs` `accent`). */
function accent(light: boolean): string {
  return light ? '#b75d2a' : '#e7a47a';
}

/** A Boost's glyph from the desktop icon path the core names (`titlebar/<name>.svg`). */
function boostGlyph(iconPath: string): GlyphName {
  const name = iconPath.replace(/^.*\//, '').replace(/\.svg$/, '');
  switch (name) {
    case 'browser':
    case 'chart-bar':
    case 'layout-columns':
    case 'sitemap':
    case 'checklist':
      return name;
    default:
      return 'sparkles';
  }
}

/** The pill in the strip: the sparkles and "Boost" in the accent, filled while the message has a Boost. */
export function BoostPill({ boosts, open, onPress }: { boosts: BoostsDocument; open: boolean; onPress: () => void }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const tone = accent(P.light);
  const active = boosts.pill.active || open;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={boosts.pill.ariaLabel}
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.pill,
        { borderColor: `${tone}${active ? '99' : '66'}` },
        (active || pressed) && { backgroundColor: `${tone}24` },
      ]}
    >
      <Glyph name="sparkles" size={13} color={tone} />
      <Text style={[styles.pillLabel, { color: tone }]} numberOfLines={1}>
        {boosts.pill.label}
      </Text>
    </Pressable>
  );
}

/**
 * The sheet the pill opens: one row per Boost with its line, ticked while it is in the message. A tap
 * puts it in or takes it out; a long press opens its prompt (after this sheet has gone on iOS, which
 * drops a sheet presented over a closing one).
 */
export function BoostSheet({
  boosts,
  open,
  onClose,
  dispatch,
}: {
  boosts: BoostsDocument | null;
  open: boolean;
  onClose: () => void;
  dispatch: (action: UserAction) => void;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const tone = accent(P.light);
  const editAfter = useRef<string | null>(null);
  const edit = (id: string) => {
    onClose();
    if (Platform.OS === 'ios') editAfter.current = id;
    else dispatch({ type: 'openBoostEditor', id });
  };
  return (
    <Sheet
      visible={open && boosts !== null}
      onClose={onClose}
      onDismissed={() => {
        const id = editAfter.current;
        editAfter.current = null;
        if (id !== null) dispatch({ type: 'openBoostEditor', id });
      }}
      title="Boosts"
      subtitle="The agent answers with a page, a chart or a map"
    >
      <View style={styles.rows}>
        {(boosts?.list ?? []).map((row) => (
          <Pressable
            key={row.id}
            accessibilityRole="button"
            accessibilityLabel={row.label}
            accessibilityHint={`${row.description} Press and hold to read or edit its prompt.`}
            accessibilityState={{ selected: row.inDraft }}
            onPress={() => {
              onClose();
              dispatch({ type: 'toggleBoost', id: row.id });
            }}
            onLongPress={() => edit(row.id)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <Glyph name={boostGlyph(row.iconPath)} size={18} color={tone} />
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>
                {row.label}
                {row.edited ? <Text style={styles.rowEdited}> · edited prompt</Text> : null}
              </Text>
              <Text style={styles.rowDetail}>{row.description}</Text>
            </View>
            {row.inDraft ? <Glyph name="check" size={16} color={P.foreground} /> : null}
          </Pressable>
        ))}
        <Text style={styles.footnote}>Press and hold a Boost to read or edit what the agent is told.</Text>
      </View>
    </Sheet>
  );
}

/**
 * The prompt sheet, open while the core has an editor (`boosts.editor`): the Boost's prompt in a field,
 * Reset to default once it was edited, and Save. Closing it without Save keeps the prompt as it was.
 */
export function BoostEditorSheet({
  boosts,
  dispatch,
}: {
  boosts: BoostsDocument | null;
  dispatch: (action: UserAction) => void;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const editor = boosts?.editor ?? null;
  const [text, setText] = useState(editor?.value ?? '');
  // A new prompt opened: the field starts from it (typing stays local, so the caret never jumps).
  const editing = editor?.id ?? null;
  useEffect(() => {
    if (editor !== null) setText(editor.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);
  const close = () => dispatch({ type: 'closeBoostEditor' });
  return (
    <Sheet
      visible={editor !== null}
      onClose={close}
      title={editor !== null ? `${editor.label} Boost prompt${editor.edited ? ' (edited)' : ''}` : ''}
      subtitle="Saved on this computer for every chat"
    >
      {editor !== null ? (
        <View style={styles.editor}>
          <ScrollView style={styles.field} keyboardShouldPersistTaps="handled">
            <TextInput
              accessibilityLabel={`${editor.label} Boost prompt`}
              value={text}
              onChangeText={(next) => {
                setText(next);
                dispatch({ type: 'editBoostPrompt', text: next });
              }}
              multiline
              style={styles.input}
              placeholder="What the agent is told when this Boost is in a message"
              placeholderTextColor={P.placeholder}
            />
          </ScrollView>
          <View style={styles.actions}>
            {editor.edited ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => dispatch({ type: 'resetBoostPrompt' })}
                style={({ pressed }) => [styles.button, pressed && styles.quietPressed]}
              >
                <Text style={styles.quietText}>Reset to default</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                dispatch({ type: 'editBoostPrompt', text });
                dispatch({ type: 'saveBoostPrompt' });
              }}
              style={({ pressed }) => [styles.button, styles.primary, pressed && styles.primaryPressed]}
            >
              <Text style={styles.primaryText}>Save</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

/** "Try a Boost" under a new chat's headline: a chip per Boost; a tap puts it in the message. */
export function TryABoost({ boosts, dispatch }: { boosts: BoostsDocument; dispatch: (action: UserAction) => void }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const tone = accent(P.light);
  return (
    <View style={styles.try} accessibilityRole="none" accessibilityLabel="Try a Boost">
      <View style={styles.tryLead}>
        <Glyph name="sparkles" size={13} color={tone} />
        <Text style={styles.tryLabel}>Try a Boost</Text>
      </View>
      {boosts.list.map((row: BoostRow) => (
        <Pressable
          key={row.id}
          accessibilityRole="button"
          accessibilityLabel={row.label}
          accessibilityHint={row.description}
          accessibilityState={{ selected: row.inDraft }}
          onPress={() => dispatch({ type: 'toggleBoost', id: row.id })}
          style={({ pressed }) => [
            styles.chip,
            row.inDraft && { borderColor: `${tone}99`, backgroundColor: `${tone}24` },
            pressed && styles.rowPressed,
          ]}
        >
          <Glyph name={boostGlyph(row.iconPath)} size={14} color={tone} />
          <Text style={styles.chipLabel}>{row.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** The one-time hint, a quiet line inside the chat box with Got it (`BoxNotes.tsx`). */
export function BoostHint({ hint, dispatch }: { hint: string; dispatch: (action: UserAction) => void }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const tone = accent(P.light);
  return (
    <View style={styles.hint}>
      <View style={styles.hintIcon}>
        <Glyph name="sparkles" size={12} color={tone} />
      </View>
      <Text style={styles.hintText}>{hint}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Got it"
        hitSlop={8}
        onPress={() => dispatch({ type: 'dismissBoostHint' })}
      >
        <Text style={[styles.hintText, { color: tone }]}>Got it</Text>
      </Pressable>
    </View>
  );
}

const useStyles = themedStyles((P) => ({
  /** The panel pills' shape (`ChatPills.tsx` `pill`). */
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillLabel: { fontSize: 13, lineHeight: 19 },
  rows: { paddingHorizontal: 8, paddingBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 10,
  },
  rowPressed: { backgroundColor: P.ink(0.06) },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowLabel: { color: P.foreground, fontSize: 15, lineHeight: 20 },
  rowEdited: { color: P.cardMuted, fontSize: 12.5 },
  rowDetail: { color: P.cardMuted, fontSize: 12.5, lineHeight: 17 },
  footnote: { color: P.muted, fontSize: 12, lineHeight: 16, paddingHorizontal: 10, paddingTop: 6 },
  editor: { paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
  field: { maxHeight: 260, borderRadius: 10, backgroundColor: P.ink(0.05) },
  input: {
    color: P.foreground,
    fontSize: 14,
    lineHeight: 20,
    minHeight: 120,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  button: { height: 36, paddingHorizontal: 16, borderRadius: 10, justifyContent: 'center' },
  quietPressed: { backgroundColor: P.ink(0.06) },
  quietText: { color: P.cardMuted, fontSize: 14 },
  primary: { backgroundColor: P.controlPrimary },
  primaryPressed: { opacity: 0.85 },
  primaryText: { color: P.background, fontSize: 14, fontWeight: '600' },
  try: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  tryLead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tryLabel: { color: P.muted, fontSize: 13 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: P.ink(0.1),
  },
  chipLabel: { color: P.foreground, fontSize: 13 },
  hint: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  hintIcon: { paddingTop: 2 },
  hintText: { color: P.muted, fontSize: 12, lineHeight: 16, flexShrink: 1 },
}));
