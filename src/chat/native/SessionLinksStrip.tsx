/**
 * The chat's links strip, under the session's header: its PRs, GitHub issues and Linear tickets as
 * chips (number, state and checks), then "+N" (or a list button) that opens the whole list in a
 * sheet. The phone's form of the desktop's work area header chips
 * (apps/desktop/src/app/render/workarea_header/session_links.rs) and their dropdown
 * (apps/desktop/src/app/window/session_links_panel.rs).
 *
 * CDXC:SessionLinks 2026-10-24 DECISION:
 * User: the phone gets the session links "in the same change" ("same-change"). A tap opens a link
 * (in the phone's browser view, or its default browser when the computer's Settings > Browser >
 * Open session links in says so), a long press copies it, and an entry's × removes it after a
 * second tap ("click on an x icon button (twice to confirm)"). The chat strip stands in for the
 * desktop's hover line too: the phone has no hover.
 */

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

import { addSessionLinkCommand, removeSessionLinkCommand } from '../../commands/ghostexCli';
import { ChipGlyph } from '../../components/sessions/WorkChips';
import type { GhostexSession, GhostexSessionLink } from '../../contract/mobileSummary';
import type { MachineRecord } from '../../machines/store';
import { useInventoryStore } from '../../inventory/store';
import { runSessionCommand } from '../../sessions/sessionCommands';
import { GhostexPalette, SidebarPalette } from '../../theme/palette';
import { Sheet } from './composer/Sheet';
import {
  sessionLinkChecksMark,
  sessionLinkDetailLine,
  sessionLinkLook,
  sessionLinkStateLabel,
  sessionLinkSummary,
} from './sessionLinks';
import { themedStyles, useTranscriptTheme } from './transcript/theme';

/** Chips the strip shows before its "+N", like the desktop header. */
const STRIP_CHIPS = 3;
/** How long a × waits for its confirming tap. */
const REMOVE_ARMED_FOR_MS = 3000;
/**
 * How often the open chat re-reads the computer's summary for its links: the Sessions list polls
 * only while it is on screen, and gxserver re-reads a link's state once a minute.
 */
const LINKS_REFRESH_MS = 60_000;

export type SessionLinksStripProps = {
  machine: MachineRecord | null;
  session: GhostexSession | null;
  openTarget: 'embedded' | 'external';
  /** Opens a page in the phone's own browser view (WebPreview). */
  openInApp: (url: string) => void;
};

function LinkChip({
  link,
  onPress,
  onLongPress,
}: {
  link: GhostexSessionLink;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const look = sessionLinkLook(link);
  const checks = sessionLinkChecksMark(link);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={sessionLinkSummary(link)}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [stripStyles.chip, pressed && stripStyles.pressed]}
    >
      <ChipGlyph glyph={look.glyph} color={look.color} size={13} />
      <Text style={stripStyles.chipLabel} numberOfLines={1}>
        {link.label}
      </Text>
      {checks !== null ? <ChipGlyph glyph={checks.glyph} color={checks.color} size={13} /> : null}
    </Pressable>
  );
}

export default function SessionLinksStrip({
  machine,
  session,
  openTarget,
  openInApp,
}: SessionLinksStripProps): ReactElement | null {
  const [sheetVisible, setSheetVisible] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const styles = useStyles();
  const P = useTranscriptTheme();
  useEffect(
    () => () => {
      if (armTimer.current !== null) clearTimeout(armTimer.current);
    },
    [],
  );
  const sessionId = session?.sessionId;
  useEffect(() => {
    if (machine === null || sessionId === undefined) return;
    const refresh = () => void useInventoryStore.getState().refreshMachineFresh(machine);
    refresh();
    const timer = setInterval(refresh, LINKS_REFRESH_MS);
    return () => clearInterval(timer);
  }, [machine, sessionId]);
  const links = session?.links;
  if (machine === null || session === null || links === undefined) return null;

  const open = (url: string) => {
    if (url.length === 0) return;
    if (openTarget === 'external') {
      void Linking.openURL(url).catch(() => setStatus(`Could not open ${url}`));
    } else {
      setSheetVisible(false);
      openInApp(url);
    }
  };
  const copy = (url: string) => {
    if (url.length === 0) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    void Clipboard.setStringAsync(url)
      .then(() => setStatus('Link copied'))
      .catch(() => setStatus('Could not copy the link'));
  };
  const remove = (key: string) => {
    if (armed === key) {
      setArmed(null);
      void runSessionCommand(machine, removeSessionLinkCommand(session.sessionId, session.projectId, key), {
        onError: (message: string) => setStatus(message),
      });
      return;
    }
    setArmed(key);
    if (armTimer.current !== null) clearTimeout(armTimer.current);
    armTimer.current = setTimeout(() => setArmed((current) => (current === key ? null : current)), REMOVE_ARMED_FOR_MS);
  };
  const add = (url: string) => {
    void runSessionCommand(machine, addSessionLinkCommand(session.sessionId, session.projectId, url), {
      onError: (message: string) => setStatus(message),
    });
  };

  const shown = links.items.slice(0, STRIP_CHIPS);
  const hidden = links.items.length - shown.length;
  const hiddenFailing = links.items.slice(STRIP_CHIPS).some((link) => link.checks === 'failing');
  const moreLabel =
    hidden > 0 ? `+${hidden}` : links.suggested.length > 0 ? `${links.suggested.length} suggested` : 'List';
  const openCount = links.items.filter((link) => !link.finished).length;
  const failingCount = links.items.filter((link) => link.checks === 'failing').length;
  const summary = [`${openCount} open`, failingCount > 0 ? `${failingCount} failing checks` : '']
    .filter((part) => part.length > 0)
    .join(' · ');

  const section = (title: string, items: GhostexSessionLink[]) =>
    items.length === 0 ? null : (
      <View key={title}>
        <Text style={styles.section}>
          {title} {items.length}
        </Text>
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

  return (
    <View style={stripStyles.strip}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={stripStyles.stripContent}>
        {shown.map((link) => (
          <LinkChip key={link.key} link={link} onPress={() => open(link.url)} onLongPress={() => copy(link.url)} />
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="All links of this session"
          onPress={() => setSheetVisible(true)}
          style={({ pressed }) => [stripStyles.chip, pressed && stripStyles.pressed]}
        >
          <Text style={hidden > 0 ? stripStyles.chipLabel : stripStyles.moreLabel}>{moreLabel}</Text>
          {hiddenFailing ? <View style={stripStyles.failingDot} /> : null}
        </Pressable>
      </ScrollView>
      <Sheet visible={sheetVisible} onClose={() => setSheetVisible(false)} title={`Links · ${summary}`}>
        <ScrollView contentContainerStyle={styles.sheetBody}>
          {section(
            'Pull requests',
            links.items.filter((link) => link.kind === 'pullRequest'),
          )}
          {section(
            'GitHub issues',
            links.items.filter((link) => link.kind === 'issue'),
          )}
          {section(
            'Linear',
            links.items.filter((link) => link.kind === 'linear'),
          )}
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
                    {suggestion.title.length > 0 ? suggestion.title : 'Mentioned in the chat'}
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
          {status !== null ? <Text style={styles.status}>{status}</Text> : null}
        </ScrollView>
      </Sheet>
    </View>
  );
}

const stripStyles = StyleSheet.create({
  strip: {
    height: 34,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GhostexPalette.BORDER,
    backgroundColor: GhostexPalette.TERMINAL_BACKGROUND,
  },
  stripContent: { alignItems: 'center', gap: 6, paddingHorizontal: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 24,
    paddingHorizontal: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GhostexPalette.BORDER,
  },
  pressed: { backgroundColor: GhostexPalette.CARD_ACTIVE },
  chipLabel: { color: GhostexPalette.FOREGROUND, fontSize: 12.5 },
  moreLabel: { color: GhostexPalette.MUTED, fontSize: 12.5 },
  failingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: SidebarPalette.WORK_CLOSED },
});

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
}));
