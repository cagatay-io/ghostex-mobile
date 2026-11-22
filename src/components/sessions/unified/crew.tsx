/**
 * A Unified card's crew count and the dots a folded card shows for the threads nested under it. The count is
 * information, not a toggle: the hat's chevron at the card's start folds them (CoordinatorFold.tsx; CDXC:Sidebar
 * 2026-11-11 in packages/gx-core/src/unified_sidebar/tree.rs; the desktop draws both in
 * apps/desktop/src/app/native_sidebar/unified/threads.rs).
 */

import { StyleSheet, View } from 'react-native';

import type { GhostexSession } from '../../../contract/mobileSummary';
import type { UnifiedRow } from '../../../contract/unified/build';
import { CoordinatorBadgeView, FoldedStatusIndicator } from '../CoordinatorBadgeView';
import { QuotaCountdownBadge } from '../QuotaCountdownBadge';
import { ds } from '../rows';
import { quotaCountdownBadge } from '../sessionStatus';

/** The crew count of a row with threads under it: grey while none works or waits, with how many threads it has. `null` for a row with none. */
export function UnifiedCrewCount({ row }: { row: UnifiedRow<GhostexSession> }) {
  const crew = row.crew;
  if (crew === null) return null;
  const badge = crew.badge.tone === 'idle' ? { count: crew.total, tone: 'idle' as const } : crew.badge;
  return <CoordinatorBadgeView badge={badge} />;
}

/**
 * Whether a row draws its team's dots in its status's place: it has threads and something under it, or itself, has a
 * dot. Folded or not: CDXC:Coordinators 2026-11-15 DECISION (issue #618, Q3275), coloured status dots on each
 * coordinator, so an unfolded one (and one with sub-coordinators under it) still says its team works or needs you.
 */
export function showsFoldedStatus(row: UnifiedRow<GhostexSession>): boolean {
  const crew = row.crew;
  if (crew === null) return false;
  const status = crew.open ? crew.teamStatus : crew.foldedStatus;
  return status.working || status.attention || status.backgroundWork || status.question || status.approval;
}

/** The dots of everything under a card, with its own status ([`showsFoldedStatus`]). */
export function UnifiedFoldedStatus({
  row,
  ringColor,
  nowMs,
}: {
  row: UnifiedRow<GhostexSession>;
  ringColor: string;
  nowMs?: number;
}) {
  if (row.crew === null || !showsFoldedStatus(row)) return null;
  const session = row.session.source;
  const quotaBadge = session !== undefined ? quotaCountdownBadge(session, nowMs ?? Date.now()) : null;
  const indicator = (
    <FoldedStatusIndicator status={row.crew.open ? row.crew.teamStatus : row.crew.foldedStatus} ringColor={ringColor} />
  );
  if (quotaBadge === null) return indicator;
  return (
    <View style={styles.foldedRow}>
      <QuotaCountdownBadge badge={quotaBadge} />
      {indicator}
    </View>
  );
}

const styles = StyleSheet.create({
  foldedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ds(4),
    flexShrink: 0,
  },
});
