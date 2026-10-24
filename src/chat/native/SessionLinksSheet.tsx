/**
 * A session's links sheet: every PR, GitHub issue and Linear ticket it is linked to, two lines
 * each, and the chat's suggestions. The chat strip's "+N" (SessionLinksStrip.tsx) and the session
 * list's long-press Links row both open it. The phone's form of the desktop's links list
 * (apps/desktop/src/app/native_sidebar/links_list.rs).
 *
 * CDXC:SessionLinks 2026-10-24 DECISION:
 * User: a tap opens a link (in the phone's browser view, or its default browser when the
 * computer's Settings > Browser > Open session links in says so), and removing one takes a second
 * tap ("click on an x icon button (twice to confirm)"). Per the phone's long-press rule, holding a
 * linked entry opens its actions under it: Copy link, Pin or Unpin, and Remove (which asks
 * "Remove?" first); the row shows no pin or × of its own, except a pinned row's filled pin. This
 * supersedes the same day's long press that copied and the always-visible pin and ×. A suggestion
 * or a removed link keeps its Link or Restore button, and a long press on it copies.
 *
 * CDXC:SessionLinks 2026-10-24 DECISION:
 * User: "when a link is gone i see that i can't bring it back why not?", "i mean when i hit x button
 * twice on it". Right after the second tap the row reads "Removed · Undo" for a few seconds, and a
 * collapsed "Removed (N)" group at the bottom lists every removed link with Restore, as on the
 * desktop (apps/desktop/src/app/native_sidebar/links_list.rs).
 *
 * CDXC:SessionLinks 2026-10-24 DECISION:
 * User: "can u pls make all the sections in these cards colapsible with chevron? please add this for
 * pr and github issues etc (the headers there". Every group header has the same chevron, folds on
 * a tap and keeps its count; which groups are folded is one choice per group for every session,
 * kept across restarts (`sessionLinksFoldedGroups`), as on the desktop.
 *
 * CDXC:SessionLinks 2026-10-24 DECISION:
 * User picked "B. Open work first, finished work folded" for the links list: it leads with an
 * "Open N" group of the links that still need something, merged and closed links sit in one
 * "Merged / Closed N" group folded until opened, then Suggested and Removed (folded), replacing
 * the Pull requests / GitHub issues / Linear sections here as on the desktop's card and "+N"
 * dropdown.
 *
 * CDXC:SessionLinks 2026-10-24 DECISION:
 * User: "make suggested and removed also have the same look as other ones (2 rows)". Suggested and
 * Removed entries use the same two-line row as linked ones (number, title and state, then "Mentioned
 * in the chat" or where a removed link came from), with Link or Restore where the × sits and no
 * dashed box.
 */

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

import {
  addSessionLinkCommand,
  pinSessionLinkCommand,
  removeSessionLinkCommand,
  restoreSessionLinkCommand,
} from '../../commands/ghostexCli';
import { ChipGlyph } from '../../components/sessions/WorkChips';
import type { GhostexSession, GhostexSessionLink } from '../../contract/mobileSummary';
import type { MachineRecord } from '../../machines/store';
import { runSessionCommand } from '../../sessions/sessionCommands';
import { useSettingsStore } from '../../settings/store';
import { SidebarPalette } from '../../theme/palette';
import { Glyph } from './composer/icons';
import { Sheet } from './composer/Sheet';
import { sessionLinkDetailLine, sessionLinkLook, sessionLinkSummary } from './sessionLinks';
import { themedStyles, useTranscriptTheme } from './transcript/theme';

/** How long a × waits for its confirming tap. */
const REMOVE_ARMED_FOR_MS = 3000;
/** How long a removed row offers Undo. */
const UNDO_FOR_MS = 6000;

/** Opens a link where the computer's setting says: the phone's browser view, or its default browser. */
export function openSessionLink(
  url: string,
  openTarget: 'embedded' | 'external',
  openInApp: (url: string) => void,
  onError: (message: string) => void,
): void {
  if (url.length === 0) return;
  if (openTarget === 'external') {
    void Linking.openURL(url).catch(() => onError(`Could not open ${url}`));
  } else {
    openInApp(url);
  }
}

/** Copies a link, the long press on a chip or an entry. */
export function copySessionLink(url: string, onStatus: (message: string) => void): void {
  if (url.length === 0) return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  void Clipboard.setStringAsync(url)
    .then(() => onStatus('Link copied'))
    .catch(() => onStatus('Could not copy the link'));
}

export type SessionLinksSheetProps = {
  visible: boolean;
  onClose: () => void;
  machine: MachineRecord;
  session: GhostexSession;
  openTarget: 'embedded' | 'external';
  /** Opens a page in the phone's own browser view (WebPreview). */
  openInApp: (url: string) => void;
};

export default function SessionLinksSheet({
  visible,
  onClose,
  machine,
  session,
  openTarget,
  openInApp,
}: SessionLinksSheetProps): ReactElement | null {
  const [armed, setArmed] = useState<string | null>(null);
  /** The linked entry whose actions a long press opened under it. */
  const [held, setHeld] = useState<string | null>(null);
  const [undo, setUndo] = useState<GhostexSessionLink | null>(null);
  const folded = useSettingsStore((store) => store.settings.sessionLinksFoldedGroups);
  const setSetting = useSettingsStore((store) => store.setSetting);
  const [status, setStatus] = useState<string | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const styles = useStyles();
  const P = useTranscriptTheme();
  useEffect(
    () => () => {
      if (armTimer.current !== null) clearTimeout(armTimer.current);
      if (undoTimer.current !== null) clearTimeout(undoTimer.current);
    },
    [],
  );
  const links = session.links;
  if (links === undefined) return null;

  const open = (url: string) => {
    if (openTarget !== 'external') onClose();
    openSessionLink(url, openTarget, openInApp, setStatus);
  };
  const copy = (url: string) => copySessionLink(url, setStatus);
  const remove = (key: string) => {
    if (armed === key) {
      setArmed(null);
      setUndo(links.items.find((link) => link.key === key) ?? null);
      if (undoTimer.current !== null) clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => setUndo((current) => (current?.key === key ? null : current)), UNDO_FOR_MS);
      void runSessionCommand(machine, removeSessionLinkCommand(session.sessionId, session.projectId, key), {
        onError: (message: string) => setStatus(message),
      });
      return;
    }
    setArmed(key);
    if (armTimer.current !== null) clearTimeout(armTimer.current);
    armTimer.current = setTimeout(() => setArmed((current) => (current === key ? null : current)), REMOVE_ARMED_FOR_MS);
  };
  const restore = (key: string) => {
    setUndo((current) => (current?.key === key ? null : current));
    void runSessionCommand(machine, restoreSessionLinkCommand(session.sessionId, session.projectId, key), {
      onError: (message: string) => setStatus(message),
    });
  };
  const add = (url: string) => {
    void runSessionCommand(machine, addSessionLinkCommand(session.sessionId, session.projectId, url), {
      onError: (message: string) => setStatus(message),
    });
  };
  // Only links read as open count: one not read yet is neither open nor finished.
  const openCount = links.items.filter((link) => !link.finished && link.state.length > 0).length;
  const failingCount = links.items.filter((link) => link.checks === 'failing').length;
  const summary = [`${openCount} open`, failingCount > 0 ? `${failingCount} failing checks` : '']
    .filter((part) => part.length > 0)
    .join(' · ');

  const isFolded = (id: string) => folded.includes(id);
  const toggleSection = (id: string) =>
    setSetting('sessionLinksFoldedGroups', isFolded(id) ? folded.filter((section) => section !== id) : [...folded, id]);
  const sectionHeader = (id: string, title: string, count: number) => {
    const open = !isFolded(id);
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title} ${count}`}
        accessibilityState={{ expanded: open }}
        hitSlop={4}
        onPress={() => toggleSection(id)}
        style={styles.sectionHeader}
      >
        <Glyph name={open ? 'chevron-down' : 'chevron-right'} size={13} color={P.muted} />
        <Text style={styles.section}>
          {title} {count}
        </Text>
      </Pressable>
    );
  };

  /** Every entry's two lines (a linked link, a suggestion, a removed link) with its own action on the right. */
  const entryRow = (link: GhostexSessionLink, action: ReactElement | null, holdMenu = false) => {
    const look = sessionLinkLook(link);
    /*
     * CDXC:SessionLinks 2026-10-24 DECISION:
     * User: "no need for the word merged and closed i should be able to hover their icon to get that
     * word instead in tooltip". No state word on the row: the icon's colour says it, and the row's
     * accessibility label (`sessionLinkSummary`) still names it; the phone has no hover.
     */
    const detail = sessionLinkDetailLine(link);
    const row = (
      <Pressable
        key={link.key}
        accessibilityRole="link"
        accessibilityLabel={sessionLinkSummary(link)}
        accessibilityHint={holdMenu ? 'Touch and hold for Copy link, Pin and Remove' : undefined}
        onPress={() => open(link.url)}
        onLongPress={() => {
          if (!holdMenu) {
            copy(link.url);
            return;
          }
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          setHeld((current) => (current === link.key ? null : link.key));
        }}
        style={({ pressed }) => [
          styles.row,
          link.finished && styles.finished,
          pressed && { backgroundColor: P.pressedFill },
        ]}
      >
        <View style={styles.rowGlyph}>
          <ChipGlyph glyph={look.glyph} color={look.color} size={15} />
        </View>
        <View style={styles.rowText}>
          <View style={styles.rowLine}>
            <Text style={styles.rowLabel}>{link.label}</Text>
            <Text
              style={[styles.rowTitle, link.loading && link.title.length === 0 && { color: P.muted }]}
              numberOfLines={1}
            >
              {link.loading && link.title.length === 0 ? 'Loading…' : link.title}
            </Text>
          </View>
          {detail.length > 0 ? (
            <Text
              style={[styles.rowDetail, link.checks === 'failing' && { color: SidebarPalette.WORK_CLOSED }]}
              numberOfLines={1}
            >
              {detail}
            </Text>
          ) : null}
        </View>
        {action}
      </Pressable>
    );
    if (held !== link.key) return row;
    const isArmed = armed === link.key;
    return (
      <View key={link.key}>
        {row}
        <View style={styles.heldMenu}>
          {menuButton('Copy link', () => {
            setHeld(null);
            copy(link.url);
          })}
          {menuButton(link.pinned ? 'Unpin' : 'Pin', () => {
            setHeld(null);
            pin(link);
          })}
          {/* User: "please don't show x to remove link that's pinned": unpin it first. */}
          {link.pinned
            ? null
            : menuButton(
                isArmed ? 'Remove?' : 'Remove',
                () => {
                  if (isArmed) setHeld(null);
                  remove(link.key);
                },
                isArmed,
              )}
        </View>
      </View>
    );
  };
  /** One action of a held entry's menu. */
  const menuButton = (label: string, onPress: () => void, destructive = false) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={label === 'Remove?' ? 'Tap again to remove the link' : label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.linkButton,
        {
          backgroundColor: destructive ? P.destructiveFill : pressed ? P.neutralFillPressed : P.neutralFill,
        },
      ]}
    >
      <Text style={[styles.linkButtonText, destructive && { color: P.error }]}>{label}</Text>
    </Pressable>
  );
  /**
   * A suggestion's Link or a removed link's Restore: a small icon button where a linked entry's ×
   * sits.
   *
   * CDXC:SessionLinks 2026-10-24 DECISION:
   * User: "for suggested i want the row to look just like the regular rows we have there".
   * Suggested and Removed rows are drawn like linked ones; only their action differs, an icon
   * button (link, arrow-back) instead of a bordered text button.
   */
  const iconButton = (glyph: 'link' | 'restore', accessibilityLabel: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.remove, pressed && { backgroundColor: P.neutralFillPressed }]}
    >
      <ChipGlyph glyph={glyph} color={P.muted} size={16} />
    </Pressable>
  );

  const pin = (link: GhostexSessionLink) =>
    void runSessionCommand(
      machine,
      pinSessionLinkCommand(session.sessionId, session.projectId, link.key, !link.pinned),
      {
        onError: (message: string) => setStatus(message),
      },
    );
  /** A linked entry's pin and ×. */
  /** A pinned entry's filled pin; its actions are in the long-press menu. */
  const linkedActions = (link: GhostexSessionLink) =>
    link.pinned ? (
      <View style={styles.remove} accessible accessibilityLabel="Pinned">
        <ChipGlyph glyph="pinFilled" color={P.muted} size={14} />
      </View>
    ) : null;
  /**
   * Pinned leads, then Open and Merged / Closed hold the rest.
   *
   * CDXC:SessionLinks 2026-10-24 DECISION:
   * User: "for the linked issues/prs/linear i want to be able to pin a few so they appear on top
   * under "pinned" and they always appear in the sidebar". The long-press menu's Pin or Unpin
   * (`ghostex link pin|unpin`) pins an entry, and a Pinned group leads the sheet, as on the desktop.
   */
  const inGroup = (link: GhostexSessionLink, id: string) =>
    id === 'pinned'
      ? link.pinned
      : id === 'loading'
        ? !link.pinned && link.loading
        : id === 'open'
          ? !link.pinned && !link.loading && !link.finished
          : !link.pinned && !link.loading && link.finished;
  const section = (id: string, title: string) => {
    const undone = undo !== null && inGroup(undo, id) ? undo : null;
    const items = links.items.filter((link) => inGroup(link, id) && link.key !== undone?.key);
    if (items.length === 0 && undone === null) return null;
    return (
      <View key={id}>
        {sectionHeader(id, title, items.length)}
        {undone !== null ? (
          <View style={styles.undoRow}>
            <Text style={styles.undoLabel}>Removed ·</Text>
            <Text style={styles.suggestedTitle} numberOfLines={1}>
              {undone.title.length > 0 ? `${undone.label} ${undone.title}` : undone.label}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Undo removing ${undone.label}`}
              onPress={() => restore(undone.key)}
              style={({ pressed }) => [
                styles.linkButton,
                { backgroundColor: pressed ? P.neutralFillPressed : P.neutralFill },
              ]}
            >
              <Text style={styles.linkButtonText}>Undo</Text>
            </Pressable>
          </View>
        ) : null}
        {(isFolded(id) ? [] : items).map((link) => entryRow(link, linkedActions(link), true))}
      </View>
    );
  };
  const removed = links.removed.filter((link) => link.key !== undo?.key);

  return (
    <Sheet visible={visible} onClose={onClose} title={`Links · ${summary}`}>
      <ScrollView contentContainerStyle={styles.sheetBody}>
        {section('pinned', 'Pinned')}
        {section('open', 'Open')}
        {section('loading', 'Loading')}
        {section('finished', 'Merged / Closed')}
        {links.suggested.length > 0 ? (
          <View>
            {sectionHeader('suggested', 'Suggested', links.suggested.length)}
            {(isFolded('suggested') ? [] : links.suggested).map((suggestion) =>
              entryRow(
                suggestion,
                iconButton('link', `Link ${suggestion.label}`, () => add(suggestion.url)),
              ),
            )}
          </View>
        ) : null}
        {removed.length > 0 ? (
          <View>
            {sectionHeader('removed', 'Removed', removed.length)}
            {(isFolded('removed') ? [] : removed).map((link) =>
              entryRow(
                link,
                iconButton('restore', `Restore ${link.label}`, () => restore(link.key)),
              ),
            )}
          </View>
        ) : null}
        {status !== null ? <Text style={styles.status}>{status}</Text> : null}
      </ScrollView>
    </Sheet>
  );
}

const useStyles = themedStyles((P) => ({
  heldMenu: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 6, paddingBottom: 8 },
  sheetBody: { paddingHorizontal: 12, paddingBottom: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, marginBottom: 4 },
  // A tight line without Android's font padding, so the chevron centres on the letters rather than
  // on a box whose padding sits above them.
  section: { color: P.muted, fontSize: 12, lineHeight: 16, includeFontPadding: false, textAlignVertical: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  finished: { opacity: 0.62 },
  rowGlyph: { paddingTop: 2 },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowLabel: { color: P.foreground, fontSize: 14 },
  rowTitle: { color: P.foreground, fontSize: 14, flex: 1, minWidth: 0, opacity: 0.86 },
  rowDetail: { color: P.muted, fontSize: 12.5 },
  remove: {
    minWidth: 28,
    height: 26,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  suggestedTitle: { color: P.muted, fontSize: 13, flex: 1, minWidth: 0 },
  linkButton: { paddingHorizontal: 12, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  linkButtonText: { color: P.foreground, fontSize: 13 },
  status: { color: P.muted, fontSize: 12.5, marginTop: 10 },
  undoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: P.cardRow,
  },
  undoLabel: { color: P.muted, fontSize: 13 },
}));
