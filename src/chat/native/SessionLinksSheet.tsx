/**
 * A session's links sheet: every PR, GitHub issue and Linear ticket it is linked to, two lines
 * each, and the chat's suggestions. The chat strip's "+N" (SessionLinksStrip.tsx) and the session
 * list's long-press Links row both open it. The phone's form of the desktop's links list
 * (apps/desktop/src/app/native_sidebar/links_list.rs).
 *
 * CDXC:SessionLinks 2026-10-24 DECISION:
 * User: a tap opens a link (in the phone's browser view, or its default browser when the
 * computer's Settings > Browser > Open session links in says so), a long press copies it, and an
 * entry's × removes it after a second tap ("click on an x icon button (twice to confirm)").
 *
 * CDXC:SessionLinks 2026-10-24 DECISION:
 * User: "when a link is gone i see that i can't bring it back why not?", "i mean when i hit x button
 * twice on it". Right after the second tap the row reads "Removed · Undo" for a few seconds, and a
 * collapsed "Removed (N)" group at the bottom lists every removed link with Restore, as on the
 * desktop (apps/desktop/src/app/native_sidebar/links_list.rs).
 */

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

import { addSessionLinkCommand, removeSessionLinkCommand, restoreSessionLinkCommand } from '../../commands/ghostexCli';
import { ChipGlyph } from '../../components/sessions/WorkChips';
import type { GhostexSession, GhostexSessionLink } from '../../contract/mobileSummary';
import type { MachineRecord } from '../../machines/store';
import { runSessionCommand } from '../../sessions/sessionCommands';
import { SidebarPalette } from '../../theme/palette';
import { Sheet } from './composer/Sheet';
import { sessionLinkDetailLine, sessionLinkLook, sessionLinkStateLabel, sessionLinkSummary } from './sessionLinks';
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
  const [undo, setUndo] = useState<GhostexSessionLink | null>(null);
  const [removedOpen, setRemovedOpen] = useState(false);
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

  const section = (title: string, kind: GhostexSessionLink['kind']) => {
    const undone = undo !== null && undo.kind === kind ? undo : null;
    const items = links.items.filter((link) => link.kind === kind && link.key !== undone?.key);
    if (items.length === 0 && undone === null) return null;
    return (
      <View key={title}>
        <Text style={styles.section}>
          {title} {items.length}
        </Text>
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
        {items.map((link) => {
          const look = sessionLinkLook(link);
          const state = sessionLinkStateLabel(link);
          const isArmed = armed === link.key;
          return (
            <Pressable
              key={link.key}
              accessibilityRole="link"
              accessibilityLabel={sessionLinkSummary(link)}
              onPress={() => open(link.url)}
              onLongPress={() => copy(link.url)}
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
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {link.title}
                  </Text>
                  {state.length > 0 ? <Text style={[styles.rowState, { color: look.color }]}>{state}</Text> : null}
                </View>
                <Text
                  style={[styles.rowDetail, link.checks === 'failing' && { color: SidebarPalette.WORK_CLOSED }]}
                  numberOfLines={1}
                >
                  {sessionLinkDetailLine(link)}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isArmed ? 'Tap again to remove the link' : 'Remove from this session'}
                hitSlop={8}
                onPress={() => remove(link.key)}
                style={[styles.remove, isArmed && { backgroundColor: P.destructiveFill }]}
              >
                {isArmed ? (
                  <Text style={[styles.removeText, { color: P.error }]}>Remove?</Text>
                ) : (
                  <Text style={styles.removeGlyph}>×</Text>
                )}
              </Pressable>
            </Pressable>
          );
        })}
      </View>
    );
  };
  const removed = links.removed.filter((link) => link.key !== undo?.key);

  return (
    <Sheet visible={visible} onClose={onClose} title={`Links · ${summary}`}>
      <ScrollView contentContainerStyle={styles.sheetBody}>
        {section('Pull requests', 'pullRequest')}
        {section('GitHub issues', 'issue')}
        {section('Linear', 'linear')}
        {links.suggested.length > 0 ? (
          <View>
            <Text style={styles.section}>Suggested {links.suggested.length}</Text>
            {links.suggested.map((suggestion) => (
              <View key={suggestion.key} style={styles.suggested}>
                <ChipGlyph
                  glyph={suggestion.kind === 'issue' ? 'issueOpen' : 'pullRequest'}
                  color={SidebarPalette.WORK_DRAFT}
                  size={15}
                />
                <Text style={styles.rowLabel}>{suggestion.label}</Text>
                <Text style={styles.suggestedTitle} numberOfLines={1}>
                  {suggestion.title.length > 0
                    ? `${suggestion.title} · Mentioned in the chat`
                    : 'Mentioned in the chat'}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Link ${suggestion.label}`}
                  onPress={() => add(suggestion.url)}
                  style={({ pressed }) => [
                    styles.linkButton,
                    { backgroundColor: pressed ? P.neutralFillPressed : P.neutralFill },
                  ]}
                >
                  <Text style={styles.linkButtonText}>Link</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        {removed.length > 0 ? (
          <View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: removedOpen }}
              onPress={() => setRemovedOpen((open) => !open)}
            >
              <Text style={styles.section}>
                {removedOpen ? '▾' : '▸'} Removed ({removed.length})
              </Text>
            </Pressable>
            {removedOpen
              ? removed.map((link) => (
                  <View key={link.key} style={styles.removedRow}>
                    <Text style={styles.rowLabel}>{link.label}</Text>
                    <Text style={styles.suggestedTitle} numberOfLines={1}>
                      {link.title}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Restore ${link.label}`}
                      onPress={() => restore(link.key)}
                      style={({ pressed }) => [
                        styles.linkButton,
                        { backgroundColor: pressed ? P.neutralFillPressed : P.neutralFill },
                      ]}
                    >
                      <Text style={styles.linkButtonText}>Restore</Text>
                    </Pressable>
                  </View>
                ))
              : null}
          </View>
        ) : null}
        {status !== null ? <Text style={styles.status}>{status}</Text> : null}
      </ScrollView>
    </Sheet>
  );
}

const useStyles = themedStyles((P) => ({
  sheetBody: { paddingHorizontal: 12, paddingBottom: 8 },
  section: { color: P.muted, fontSize: 12, marginTop: 10, marginBottom: 4 },
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
  rowState: { fontSize: 12.5 },
  rowDetail: { color: P.muted, fontSize: 12.5 },
  remove: {
    minWidth: 28,
    height: 26,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  removeGlyph: { color: P.muted, fontSize: 18, lineHeight: 20 },
  removeText: { fontSize: 12.5 },
  suggested: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: P.border,
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
  removedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 8 },
}));
