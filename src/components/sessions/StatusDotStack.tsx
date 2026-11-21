/**
 * The overlapping status dots of a folded coordinator or a question pair, ported from
 * apps/desktop/src/app/native_sidebar/status.rs `stack_colors`: every dot
 * is STATUS_DOT_SIZE inside a 1dp ring in the surface color (the 2026-10-20
 * decision: "1px border around the dots"), and each overlaps the one before it
 * by half, the most urgent rightmost and on top (sessionStatus.ts
 * `statusStackColors`). A Space or computer tile draws one dot (`TileStatusDot`).
 */

import { StyleSheet, View } from 'react-native';

import type { TileStatusCounts } from '../../contract/grouping';
import { SidebarPalette } from '../../theme/palette';
import { ds, STATUS_DOT_SIZE } from './rows';
import { statusStackColors } from './sessionStatus';

/** A Space or computer tile's one dot: the colour of its most urgent state (desktop status.rs `TileCounts`). */
export function tileStatusColor(counts: TileStatusCounts): string | null {
  if (counts.approvalCount + counts.failedCount > 0) return SidebarPalette.ROW_FAILED;
  if (counts.questionCount > 0) return SidebarPalette.ROW_QUESTION;
  if (counts.attentionCount > 0) return SidebarPalette.ROW_ATTENTION;
  if (counts.workingCount > 0) return SidebarPalette.ROW_WORKING;
  if (counts.backgroundWorkCount > 0) return SidebarPalette.ROW_BACKGROUND_WORK;
  return null;
}

/** The tile's one dot in its 1dp ring (`ringColor`, the surface it sits on); nothing while it has no state. */
export function TileStatusDot({
  counts,
  ringColor,
  size = STATUS_DOT_SIZE,
}: {
  counts: TileStatusCounts;
  ringColor: string;
  size?: number;
}) {
  const color = tileStatusColor(counts);
  return color === null ? null : <OverlappedDots colors={[color]} size={size} ringColor={ringColor} />;
}

/**
 * CDXC:Spaces 2026-11-21 DECISION:
 * User picked A at the size of C on the Spaces dot page (Q4353): a tile's one status dot is a 4pt
 * dot inside its top-right corner, 3pt in from the top and right edges, instead of the 8pt dot hung
 * over its lower edge (desktop status.rs `tile_status_dot`). The phone's Space tiles and computer
 * tabs draw it the same way, at the same size (`ds`), through `TileCornerDot`.
 */
export const TILE_DOT_SIZE = 4;
const TILE_DOT_INSET = 3;

/** A tile's one dot in its top-right corner (`TILE_DOT_SIZE`, `TILE_DOT_INSET`); the tile draws `border` wide edges. */
export function TileCornerDot({
  counts,
  ringColor,
  border,
}: {
  counts: TileStatusCounts;
  ringColor: string;
  border: number;
}) {
  const color = tileStatusColor(counts);
  return color === null ? null : <CornerDot color={color} ringColor={ringColor} border={border} />;
}

/**
 * CDXC:AgentProviders 2026-11-21 DECISION:
 * User: "change how we indicate that an account has issues: instead of the text name of the account
 * becoming yellow, add a small dot top right of the account's icon (like the one we have on top right
 * of space icon now)". An account's icon draws the Space tile's dot, `color` in the same 4 size, inset
 * and ring (desktop status.rs `corner_dot`). The icon's box must be `position: 'relative'`; `unit` turns
 * design pixels into this surface's (the drawer's `ds` by default, `(value) => value` outside it).
 */
export function CornerDot({
  color,
  ringColor,
  border,
  unit = ds,
}: {
  color: string;
  ringColor: string;
  border: number;
  unit?: (value: number) => number;
}) {
  // Absolute insets count from inside the box's edge, and the ring adds 1 round the dot.
  const offset = Math.max(0, unit(TILE_DOT_INSET) - border - unit(1));
  return (
    <View pointerEvents="none" style={[styles.corner, { top: offset, right: offset }]}>
      <OverlappedDots colors={[color]} size={TILE_DOT_SIZE} ringColor={ringColor} unit={unit} />
    </View>
  );
}

/**
 * The overlapping dots themselves (desktop status.rs `sized_overlapped_dots`): `colors` back to
 * front, each `size` across inside a 1px ring in `ringColor`, overlapping the one before it by
 * half. `unit` turns design pixels into this surface's (the drawer's `ds`, or as-is in the chat),
 * so the chat's pill corner (ChatPills.tsx) draws the very same stack.
 */
export function OverlappedDots({
  colors,
  size,
  ringColor,
  unit = ds,
}: {
  colors: string[];
  size: number;
  ringColor: string;
  unit?: (value: number) => number;
}) {
  if (colors.length === 0) return null;
  const ring = unit(1);
  const box = unit(size) + 2 * ring;
  return (
    <View style={styles.stack}>
      {colors.map((color, index) => (
        <View
          key={`${index}-${color}`}
          style={[
            styles.dot,
            {
              width: box,
              height: box,
              borderWidth: ring,
              borderColor: ringColor,
              backgroundColor: color,
              marginLeft: index === 0 ? 0 : -(unit(size / 2) + 2 * ring),
            },
          ]}
        />
      ))}
    </View>
  );
}

export default function StatusDotStack({
  workingCount,
  attentionCount,
  backgroundWorkCount,
  questionCount,
  approvalCount = 0,
  ringColor,
}: {
  workingCount: number;
  /** In attention with no question pending (a question is the pink dot). */
  attentionCount: number;
  backgroundWorkCount: number;
  questionCount: number;
  /** Sessions waiting for approval: the red dot, rightmost and on top (status.rs `stack_colors`). */
  approvalCount?: number;
  /** The surface the stack sits on, so each covered edge stays readable. */
  ringColor: string;
}) {
  const colors = statusStackColors({
    question: questionCount > 0,
    backgroundWork: backgroundWorkCount > 0,
    working: workingCount > 0,
    attention: attentionCount > 0,
    approval: approvalCount > 0,
  });
  return <OverlappedDots colors={colors} size={STATUS_DOT_SIZE} ringColor={ringColor} />;
}

const styles = StyleSheet.create({
  corner: { position: 'absolute' },
  stack: {
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 0,
    flexShrink: 0,
  },
  dot: {
    borderRadius: 999,
  },
});
