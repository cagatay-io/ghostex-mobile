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
export function TileStatusDot({ counts, ringColor }: { counts: TileStatusCounts; ringColor: string }) {
  const color = tileStatusColor(counts);
  return color === null ? null : <OverlappedDots colors={[color]} size={STATUS_DOT_SIZE} ringColor={ringColor} />;
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
