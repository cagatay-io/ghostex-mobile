/**
 * The overlapping status dots a machine tab or a Space shows, ported from
 * apps/desktop/src/app/native_sidebar/status.rs `status_dot_stack`: every dot
 * is STATUS_DOT_SIZE inside a 1dp ring in the surface color (the 2026-10-20
 * decision: "1px border around the dots"), and each overlaps the one before it
 * by half; blue sits rightmost and on top, orange in the middle, the grey
 * background-work dot (never shown together with orange) behind them, and the
 * pink question dot furthest left, covered by the others.
 */

import { StyleSheet, View } from 'react-native';

import { SidebarPalette } from '../../theme/palette';
import { ds, STATUS_DOT_SIZE } from './rows';

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
  const background = workingCount === 0 && backgroundWorkCount > 0;
  /* status.rs `status_dot_stack`: pink furthest left and underneath, then grey, orange, and blue on top. */
  const dots: { key: string; color: string }[] = [];
  if (questionCount > 0) dots.push({ key: 'question', color: SidebarPalette.ROW_QUESTION });
  if (background) dots.push({ key: 'background', color: SidebarPalette.ROW_BACKGROUND_WORK });
  if (workingCount > 0) dots.push({ key: 'working', color: SidebarPalette.ROW_WORKING });
  if (attentionCount > 0) dots.push({ key: 'attention', color: SidebarPalette.ROW_ATTENTION });
  if (approvalCount > 0) dots.push({ key: 'approval', color: SidebarPalette.ROW_APPROVAL });
  return <OverlappedDots colors={dots.map((dot) => dot.color)} size={STATUS_DOT_SIZE} ringColor={ringColor} />;
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
