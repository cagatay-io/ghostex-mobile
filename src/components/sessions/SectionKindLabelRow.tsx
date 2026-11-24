/**
 * Collapsed section headings (`Pinned`, `Sessions`, `Drafts`, `Parked`, `Browser`, `GBots`) and
 * their overlapping status dot stack, matching `apps/desktop/src/app/native_sidebar/sections.rs`.
 *
 * CDXC:Sidebar 2026-11-24 DECISION:
 * User: multiple status dots always overlap like a coordinator row's stack (`StatusDotStack`),
 * never side by side with a gap; on section headers they sit at the far right in place of the
 * count while dots are showing (desktop swaps them for the count on hover; the phone has no hover,
 * so the count shows whenever no dots are showing and stays in the accessibility label).
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { SectionStatusCounts } from '../../contract/grouping';
import { ds, inkStyleSheets, inkWash, useSidebarInk } from './rows';
import StatusDotStack from './StatusDotStack';

/** Whether a collapsed section has any status dot to show in `StatusDotStack`. */
export function sectionHasStatusDots(status: SectionStatusCounts): boolean {
  return (
    status.workingCount > 0 ||
    status.attentionCount > 0 ||
    status.backgroundWorkCount > 0 ||
    status.questionCount > 0 ||
    status.approvalCount > 0
  );
}

/** The 9px hollow ring drawn beside a collapsed heading that holds the active session (`sections.rs`). */
export function SectionActiveRing() {
  const ring = ringInkStyles(useSidebarInk());
  return <View style={[styles.activeRing, ring.activeRing]} />;
}

/**
 * apps/desktop/src/app/native_sidebar/sections.rs: a collapsed section heading's overlapping
 * status dots in the session row's 19x16 status slot (`StatusDotStack`).
 */
export function SectionStatusDots({ status, ringColor }: { status: SectionStatusCounts; ringColor: string }) {
  if (!sectionHasStatusDots(status)) return null;
  return (
    <View style={styles.foldedSlot}>
      <StatusDotStack
        workingCount={status.workingCount}
        attentionCount={status.attentionCount}
        backgroundWorkCount={status.backgroundWorkCount}
        questionCount={status.questionCount}
        approvalCount={status.approvalCount}
        ringColor={ringColor}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// SESSION_KIND_LABEL (desktop native_sidebar/sections.rs): PINNED, SESSIONS,
// DRAFTS, PARKED or BROWSER in 12px light caps at #D8D8D8 34%, 20px tall (25pt
// here), as wide as a session card with its 5px/6px side padding. At rest a
// collapsed heading shows its overlapping status dots at the far right in place
// of the count (or the count when idle), plus a hollow ring beside the title
// when the open session is inside. A tap folds it; the Parked heading's long
// press opens its menu.
// ---------------------------------------------------------------------------

export function SessionKindLabelRow({
  label,
  collapsed,
  status,
  active,
  ringColor,
  onPress,
  onMenu,
}: {
  label: string;
  collapsed: boolean;
  /** sections.rs: the dots and the count show only while the section is collapsed. */
  status: SectionStatusCounts;
  /** The selected session is one of this section's. */
  active: boolean;
  /** The surface behind the row, which overlapping status dots' rings are drawn in. */
  ringColor: string;
  onPress: () => void;
  /** Long press: the heading's menu. Only the Parked heading has one. */
  onMenu?: () => void;
}) {
  const kindLabelStyles = kindLabelInkStyles(useSidebarInk());
  const statusDots = collapsed && sectionHasStatusDots(status);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: !collapsed }}
      accessibilityLabel={collapsed ? `${label} section, ${status.count}` : `${label} section`}
      hitSlop={{ top: ds(4), bottom: ds(4) }}
      style={({ pressed }) => [kindLabelStyles.row, pressed ? kindLabelStyles.rowPressed : null]}
      onPress={onPress}
      onLongPress={onMenu}
    >
      <Text style={kindLabelStyles.label} numberOfLines={1}>
        {label.toUpperCase()}
      </Text>
      {collapsed && active ? <SectionActiveRing /> : null}
      <View style={kindLabelStyles.spacer} />
      {collapsed ? (
        statusDots ? (
          <SectionStatusDots status={status} ringColor={ringColor} />
        ) : (
          <Text style={kindLabelStyles.label}>{status.count}</Text>
        )
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /* status.rs `folded_status_indicator`: 19x16 slot aligned with session rows' dots. */
  foldedSlot: {
    minWidth: ds(19),
    height: ds(16),
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* sections.rs: 9px hollow ring, 1.5px border (`ink.activeRing`). */
  activeRing: {
    width: ds(9),
    height: ds(9),
    borderRadius: 999,
    borderWidth: ds(1.5),
  },
});

const ringInkStyles = inkStyleSheets((ink) =>
  StyleSheet.create({
    activeRing: { borderColor: ink.activeRing },
  }),
);

const kindLabelInkStyles = inkStyleSheets((ink) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: ds(5),
      height: ds(20),
      paddingLeft: ds(5),
      paddingRight: ds(6),
      borderRadius: ds(5),
    },
    rowPressed: {
      backgroundColor: inkWash(ink, 0.06),
    },
    spacer: {
      flex: 1,
    },
    label: {
      color: ink.sectionLabel,
      fontSize: ds(12),
      fontWeight: '300',
      letterSpacing: ds(12) * 0.02,
      lineHeight: ds(16),
    },
  }),
);
