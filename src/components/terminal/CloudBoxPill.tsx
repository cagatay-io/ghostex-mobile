/**
 * The session header's box pill on a chat that runs on a Cloud Box: `● ☁ box-c31 · 42m · ≈$0.02`.
 * A long press opens the box's actions (Stop, Pull branch, Open PR, Delete); a tap says what the
 * box is (provider, size, rate, spend). The phone's twin of the desktop header's box chip
 * (CDXC:CloudBoxes 2026-11-02 DECISION in src/cloudBoxes/chip.ts).
 */

import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewInstance } from 'react-native';

import { chipDetail, chipDotColor, chipLabel } from '../../cloudBoxes/chip';
import { cloudBoxMenuItems } from '../../cloudBoxes/menu';
import type { CloudBoxEntry } from '../../cloudBoxes/store';
import { cloudBoxStateLabel } from '../../cloudBoxes/types';
import { GhostexPalette } from '../../theme/palette';
import ContextMenu, { type MenuAnchor } from '../sessions/ContextMenu';
import { CloudGlyph } from '../sessions/icons';

/** The running time is a minute count, so the pill redraws about twice a minute (box_chip.rs `TICK`). */
const TICK_MS = 30_000;
const STATUS_MS = 5_000;

export default function CloudBoxPill({ entry, sessionId }: { entry: CloudBoxEntry; sessionId: string | null }) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const ref = useRef<ViewInstance | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (status === null) return;
    const timer = setTimeout(() => setStatus(null), STATUS_MS);
    return () => clearTimeout(timer);
  }, [status]);
  const label = chipLabel(entry.box, nowMs);
  const openMenu = (): void => {
    ref.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }));
  };
  return (
    <View style={styles.row}>
      <Pressable
        ref={ref}
        accessibilityRole="button"
        accessibilityLabel={`Cloud box ${label}`}
        accessibilityHint="Long press for the box's actions"
        onPress={() => setStatus(`${cloudBoxStateLabel(entry.box.state)} · ${chipDetail(entry.box)}`)}
        onLongPress={openMenu}
        style={({ pressed }) => [styles.pill, pressed ? styles.pillPressed : null]}
      >
        <View style={[styles.dot, { backgroundColor: chipDotColor(entry.box.state) }]} />
        <CloudGlyph size={12} color={GhostexPalette.FOREGROUND} />
        <Text numberOfLines={1} style={styles.label}>
          {label}
        </Text>
      </Pressable>
      {status !== null ? (
        <Text numberOfLines={2} style={styles.status}>
          {status}
        </Text>
      ) : null}
      <ContextMenu
        visible={anchor !== null}
        title={entry.box.name}
        items={cloudBoxMenuItems(entry, sessionId, (outcome) => setStatus(outcome.message), () => setAnchor(null))}
        anchor={anchor ?? undefined}
        onClose={() => setAnchor(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    height: 24,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    maxWidth: '70%',
  },
  pillPressed: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  label: {
    color: GhostexPalette.FOREGROUND,
    fontSize: 12,
    flexShrink: 1,
  },
  status: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11.5,
    flexShrink: 1,
  },
});
