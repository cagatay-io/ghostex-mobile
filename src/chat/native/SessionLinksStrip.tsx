/**
 * The chat's links strip, under the session's header: its PRs, GitHub issues and Linear tickets as
 * chips (number, state and checks), then "+N" (or a list button) that opens the whole list in a
 * sheet. The phone's form of the desktop's work area header chips
 * (apps/desktop/src/app/render/workarea_header/session_links.rs); the sheet is
 * SessionLinksSheet.tsx.
 *
 * CDXC:SessionLinks 2026-10-24 DECISION:
 * User: the phone gets the session links "in the same change" ("same-change"). A chip opens its
 * link on a tap and copies it on a long press; "+N" opens the sheet.
 */

import { useEffect, useState, type ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ChipGlyph } from '../../components/sessions/WorkChips';
import type { GhostexSession, GhostexSessionLink } from '../../contract/mobileSummary';
import type { MachineRecord } from '../../machines/store';
import { useInventoryStore } from '../../inventory/store';
import { GhostexPalette, SidebarPalette } from '../../theme/palette';
import SessionLinksSheet, { copySessionLink, openSessionLink } from './SessionLinksSheet';
import { sessionLinkChecksMark, sessionLinkLook, sessionLinkSummary } from './sessionLinks';

/** Chips the strip shows before its "+N", like the desktop header. */
const STRIP_CHIPS = 3;
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
  const ignore = () => {};
  const shown = links.items.slice(0, STRIP_CHIPS);
  const hidden = links.items.length - shown.length;
  const hiddenFailing = links.items.slice(STRIP_CHIPS).some((link) => link.checks === 'failing');
  const moreLabel =
    hidden > 0 ? `+${hidden}` : links.suggested.length > 0 ? `${links.suggested.length} suggested` : 'List';

  return (
    <View style={stripStyles.strip}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={stripStyles.stripContent}>
        {shown.map((link) => (
          <LinkChip
            key={link.key}
            link={link}
            onPress={() => openSessionLink(link.url, openTarget, openInApp, ignore)}
            onLongPress={() => copySessionLink(link.url, ignore)}
          />
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
      <SessionLinksSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        machine={machine}
        session={session}
        openTarget={openTarget}
        openInApp={openInApp}
      />
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
