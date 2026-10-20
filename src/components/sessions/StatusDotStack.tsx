/**
 * The overlapping status dots a machine tab or a Space shows, ported from
 * apps/desktop/src/app/native_sidebar/status.rs `status_dot_stack`: every dot
 * is STATUS_DOT_SIZE inside a 1dp ring in the surface color (the 2026-10-20
 * decision: "1px border around the dots"), and each overlaps the one before it
 * by half; blue sits rightmost and on top, orange in the middle, the grey
 * background-work dot (never shown together with orange) behind them.
 */

import { StyleSheet, View } from 'react-native';

import { SidebarPalette } from '../../theme/palette';
import { ds, STATUS_DOT_SIZE } from './rows';

const RING = ds(1);

function Dot({ size, color, first, ringColor }: { size: number; color: string; first: boolean; ringColor: string }) {
  const box = ds(size) + 2 * RING;
  return (
    <View
      style={[
        styles.dot,
        {
          width: box,
          height: box,
          borderColor: ringColor,
          backgroundColor: color,
          marginLeft: first ? 0 : -(ds(4) + 2 * RING),
        },
      ]}
    />
  );
}

export default function StatusDotStack({
  workingCount,
  attentionCount,
  backgroundWorkCount,
  ringColor,
}: {
  workingCount: number;
  attentionCount: number;
  backgroundWorkCount: number;
  /** The surface the stack sits on, so each covered edge stays readable. */
  ringColor: string;
}) {
  const background = workingCount === 0 && backgroundWorkCount > 0;
  if (workingCount === 0 && attentionCount === 0 && !background) return null;
  return (
    <View style={styles.stack}>
      {background ? (
        <Dot size={STATUS_DOT_SIZE} color={SidebarPalette.ROW_BACKGROUND_WORK} first ringColor={ringColor} />
      ) : null}
      {workingCount > 0 ? <Dot size={STATUS_DOT_SIZE} color={SidebarPalette.ROW_WORKING} first ringColor={ringColor} /> : null}
      {attentionCount > 0 ? (
        <Dot
          size={STATUS_DOT_SIZE}
          color={SidebarPalette.ROW_ATTENTION}
          first={!background && workingCount === 0}
          ringColor={ringColor}
        />
      ) : null}
    </View>
  );
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
    borderWidth: RING,
  },
});
