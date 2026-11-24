/**
 * Boosts on the phone (gx-chat-core `extras/boosts.rs` has the user's decisions and the rules; desktop
 * `native_chat/boosts.rs`): the Boost pill at the right of the pill strip, its sheet of Boosts in Show,
 * Actions, Work and Custom tabs with every description in full, the prompt sheet a long press opens,
 * and the one-time callout above the pill. Everything is drawn from the core's
 * `boosts` key, which is null while the computer has no Boosts or they are switched off. `*` in the chat
 * box and Save as Boost come from the core (its suggestion list and its transcript menu rows).
 *
 * CDXC:Boosts 2026-11-20 DECISION:
 * User (Q4253): Boosts on the phone too, over the air. Then (Q4257 to Q4261 and the Settings page):
 * "the menu tabs, `*` in the phone chat box if it has the same triggers, custom Boosts listed; editing
 * on the phone can point to the computer's Settings". A tap on a row puts the Boost in the message or
 * takes it out; a long press shows its prompt, which Settings > Boosts on the computer edits. The
 * chat box's text field cannot take a press on a pill inside it, so the long press lives on the
 * sheet's rows.
 */

import { useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';

import type { UserAction } from '../../rust/actions';
import type { BoostRow, BoostsDocument } from '../../rust/document';
import { Glyph, type GlyphName } from '../composer/icons';
import { Sheet } from '../composer/Sheet';
import { themedStyles, useTranscriptTheme } from '../transcript/theme';

/** What opens the strip's Boost sheet, registered by the strip (`PillsStrip.tsx`), so the callout
 * above the chat box (drawn by the composer, outside the box that clips the strip) can open it. */
let boostSheetOpener: (() => void) | null = null;

export function registerBoostSheetOpener(open: (() => void) | null): void {
  boostSheetOpener = open;
}

export function openBoostSheet(): void {
  boostSheetOpener?.();
}

/** The Boosts' accent, the desktop's (`boosts.rs` `accent`): the main coordinator's gold on dark, a deeper gold on light. */
function accent(light: boolean): string {
  return light ? '#a16207' : '#fbbf24';
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
    case 'list-check':
    case 'list-details':
    case 'git-branch':
    case 'file-text':
    case 'user':
    case 'world':
    case 'photo':
    case 'wand':
    case 'bolt':
    case 'inbox':
    case 'bug':
    case 'clock':
    case 'git-pull-request':
    case 'message-circle':
    case 'circle-dot':
      return name;
    case 'device-desktop':
      return 'device-desktop';
    case 'users':
    case 'users-group':
      return 'user';
    case 'bell':
      return 'info-circle';
    default:
      return 'sparkles';
  }
}

/**
 * The pill in the strip: the sparkles and "Boost" in the neutral style of the other strip pills
 * (`ChatPills.tsx` `Pill`), with a subtle neutral fill while the message has a Boost or its sheet
 * is open.
 *
 * CDXC:Boosts 2026-11-24 DECISION:
 * User: "please color this like the other pills, pill shouldn't be yellow". Matches desktop
 * `native_chat/boosts.rs` `boost_strip_pill`.
 */
export function BoostPill({ boosts, open, onPress }: { boosts: BoostsDocument; open: boolean; onPress: () => void }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const active = boosts.pill.active || open;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={boosts.pill.ariaLabel}
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.pill, (active || pressed) && styles.pillPressed]}
    >
      <Glyph name="sparkles" size={14} color={P.cardMuted} />
      <Text style={styles.pillLabel} numberOfLines={1}>
        {boosts.pill.label}
      </Text>
    </Pressable>
  );
}

/**
 * The sheet the pill opens: the tabs, then one row per Boost of the open tab with its line in full,
 * ticked while it is in the message. A tap puts it in or takes it out; a long press shows its prompt
 * (after this sheet has gone on iOS, which drops a sheet presented over a closing one).
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
  const [prompt, setPrompt] = useState<BoostRow | null>(null);
  const promptAfter = useRef<BoostRow | null>(null);
  const showPrompt = (row: BoostRow) => {
    onClose();
    if (Platform.OS === 'ios') promptAfter.current = row;
    else setPrompt(row);
  };
  // CDXC:Boosts 2026-11-20 DECISION: User (Q4304 "B"): the menu is one list under section headers with
  // the section chips at the bottom left (desktop `boost_menu_body`); the sheet is the same list, its chips
  // scrolling to a section. A phone has no preview card, so each description stays whole here.
  const sections = (boosts?.tabs ?? [])
    .map((entry) => ({ ...entry, rows: (boosts?.list ?? []).filter((row) => row.category === entry.id) }))
    .filter((section) => section.rows.length > 0);
  const scroll = useRef<ScrollViewInstance>(null);
  const sectionTops = useRef<Record<string, number>>({});
  const [current, setCurrent] = useState(sections[0]?.id ?? 'show');
  const onScroll = (y: number) => {
    let at = sections[0]?.id ?? 'show';
    for (const section of sections) {
      if ((sectionTops.current[section.id] ?? Infinity) <= y + 8) at = section.id;
    }
    if (at !== current) setCurrent(at);
  };
  const rowView = (row: BoostRow) => (
    <Pressable
      key={row.id}
      accessibilityRole="button"
      accessibilityLabel={row.label}
      accessibilityHint={`${row.description} Press and hold to read its prompt.`}
      accessibilityState={{ selected: row.inDraft }}
      onPress={() => {
        onClose();
        dispatch({ type: 'toggleBoost', id: row.id });
      }}
      onLongPress={() => showPrompt(row)}
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
  );
  return (
    <>
      <Sheet
        visible={open && boosts !== null}
        onClose={onClose}
        onDismissed={() => {
          const row = promptAfter.current;
          promptAfter.current = null;
          if (row !== null) setPrompt(row);
        }}
        title="Boosts"
        subtitle="The agent answers with a page, a chart, a browser run and more"
      >
        <ScrollView
          ref={scroll}
          style={styles.scroll}
          contentContainerStyle={styles.rows}
          scrollEventThrottle={32}
          onScroll={(event) => onScroll(event.nativeEvent.contentOffset.y)}
        >
          {sections.map((section) => (
            <View
              key={section.id}
              onLayout={(event) => {
                sectionTops.current[section.id] = event.nativeEvent.layout.y;
              }}
            >
              <Text style={styles.section} accessibilityRole="header">
                {section.label.toUpperCase()}
              </Text>
              {section.rows.map(rowView)}
            </View>
          ))}
          <Text style={styles.footnote}>
            Press and hold a Boost to read what the agent is told. Settings › Boosts on your computer edits them and
            makes your own.
          </Text>
        </ScrollView>
        <View style={styles.chips} accessibilityRole="tablist">
          {sections.map((section) => {
            const on = section.id === current;
            return (
              <Pressable
                key={section.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`Go to ${section.label}`}
                onPress={() => {
                  setCurrent(section.id);
                  scroll.current?.scrollTo({ y: sectionTops.current[section.id] ?? 0, animated: true });
                }}
                style={[styles.chip, styles.sectionChip, on && styles.sectionChipOn]}
              >
                <Text style={[styles.tabLabel, on && styles.tabLabelOn]} numberOfLines={1}>
                  {section.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Sheet>
      <BoostPromptSheet row={prompt} onClose={() => setPrompt(null)} />
    </>
  );
}

/** A Boost's prompt, read only: the computer's Settings › Boosts edits it. */
function BoostPromptSheet({ row, onClose }: { row: BoostRow | null; onClose: () => void }) {
  const styles = useStyles();
  return (
    <Sheet
      visible={row !== null}
      onClose={onClose}
      title={row !== null ? `${row.label}${row.custom ? ' (your Boost)' : ' Boost'}` : ''}
      subtitle="What the agent is told when this Boost is in a message"
    >
      {row !== null ? (
        <View style={styles.editor}>
          <ScrollView style={styles.field}>
            <Text style={styles.prompt} selectable>
              {row.prompt}
            </Text>
          </ScrollView>
          <Text style={styles.footnote}>
            To change it{row.custom ? ', rename it or delete it' : ' or reset it'}, open Settings › Boosts on your
            computer: every chat and device that uses it gets the change.
          </Text>
        </View>
      ) : null}
    </Sheet>
  );
}

/**
 * The one-time Boost suggestion chip inside the chat box at its top-right corner (`NativeComposer.tsx`,
 * matching desktop `boosts.rs` `boost_hint_chip`): small gold pill with sparkles, label, and an x.
 * Tapping the chip opens Boosts and dismisses it; tapping x dismisses it.
 */
export function BoostHintChip({
  hint,
  dispatch,
}: {
  hint: { title: string; text: string } | null | undefined;
  dispatch: (action: UserAction) => void;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  if (hint == null || (!hint.title?.trim() && !hint.text?.trim())) return null;
  const tone = accent(P.light);
  const label = hint.title?.trim() || 'Try Boosts';
  const accessibilityLabel = hint.text?.trim() ? `${label}. ${hint.text}` : label;
  return (
    <View
      style={[
        styles.hintChip,
        {
          borderColor: `${tone}61`,
          backgroundColor: `${tone}1a`,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 2 }}
        onPress={() => {
          dispatch({ type: 'dismissBoostHint' });
          openBoostSheet();
        }}
        style={({ pressed }) => [styles.hintChipBody, pressed ? styles.hintChipPressed : null]}
      >
        <Glyph name="sparkles" size={13} color={tone} />
        <Text style={[styles.hintChipLabel, { color: tone }]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss Boosts hint"
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
        onPress={() => dispatch({ type: 'dismissBoostHint' })}
        style={({ pressed }) => [
          styles.hintChipDismiss,
          pressed ? { backgroundColor: `${tone}33` } : null,
        ]}
      >
        <Glyph name="x" size={11} color={tone} />
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
    height: 25,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: P.ink(0.1),
  },
  pillPressed: { backgroundColor: P.ink(0.08) },
  pillLabel: { color: P.cardMuted, fontSize: 13, lineHeight: 19 },
  tabLabel: { color: P.cardMuted, fontSize: 13 },
  tabLabelOn: { color: P.foreground },
  rows: { paddingHorizontal: 8, paddingBottom: 12 },
  scroll: { flexShrink: 1 },
  section: { color: P.muted, fontSize: 11, fontWeight: '600', letterSpacing: 0.8, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 4 },
  chips: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: P.ink(0.12),
  },
  sectionChip: { paddingHorizontal: 12, paddingVertical: 6 },
  sectionChipOn: { backgroundColor: P.ink(0.1), borderColor: 'transparent' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
  field: { maxHeight: 280, borderRadius: 10, backgroundColor: P.ink(0.05) },
  prompt: { color: P.foreground, fontSize: 14, lineHeight: 20, paddingHorizontal: 12, paddingVertical: 10 },
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
  hintChip: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    height: 24,
    borderRadius: 999,
    borderWidth: 1,
    paddingLeft: 8,
    paddingRight: 3,
    gap: 2,
  },
  hintChipBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingRight: 2,
  },
  hintChipPressed: { opacity: 0.72 },
  hintChipLabel: { fontSize: 12, fontWeight: '500' },
  hintChipDismiss: {
    width: 18,
    height: 18,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
