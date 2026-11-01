/**
 * One session on the session wall (approved session wall mockup): its agent icon and title, its status badge (the
 * row's dot, or a folded coordinator's stack, plus a word, `badge.ts`) with the row's time label, and its live
 * thumbnail, the newest lines of its screen at a size that stays readable instead of the whole screen shrunk. A tap
 * opens the session and a long press opens its menu, through the same actions as its list row. When the badge changes
 * while the tile is on screen, a ring in the new status colour marks the tile for a moment.
 */

import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type ViewInstance } from 'react-native';

import { AGENT_ICONS } from '../../assets/agentIcons.generated';
import type { MenuAnchor } from '../../components/sessions/ContextMenu';
import { STATUS_DOT_SIZE } from '../../components/sessions/rows';
import { useRowLabelClock } from '../../components/sessions/SessionRow';
import { COMPLETION_FLASH_MS, rowTimeLabel, shownFoldedStatus } from '../../components/sessions/sessionStatus';
import { OverlappedDots } from '../../components/sessions/StatusDotStack';
import type { SessionItem } from '../../contract/grouping';
import { agentIconTint, resolveAgentIconId } from '../../contract/mobileSummary';
import { SessionCopy, WallCopy } from '../../copy';
import { GhostexPalette, GhostexRadii, SidebarPalette } from '../../theme/palette';
import type { SidebarAppearance } from '../../theme/sidebarAppearance';
import { statusBadge } from './badge';
import { THUMB_LINES, useWallPreviewStore } from './previews';

/** The thumbnail's line height; with `THUMB_LINES` lines it fixes the thumbnail's height (mockup: 11 / 15). */
const THUMB_LINE_HEIGHT = 15;
const THUMB_PADDING = 8;
const MONOSPACE = Platform.select({ ios: 'Menlo', default: 'monospace' });

export type SessionTileProps = {
  item: SessionItem;
  /** `machineId:sessionId`, under which the thumbnail is kept. */
  sessionKey: string;
  appearance: SidebarAppearance;
  onPress: () => void;
  onMenu: (anchor: MenuAnchor) => void;
};

export default function SessionTile({ item, sessionKey, appearance, onPress, onMenu }: SessionTileProps) {
  const { session } = item;
  const tileRef = useRef<ViewInstance | null>(null);
  const preview = useWallPreviewStore((state) => state.previews[sessionKey]);
  const nowMs = useRowLabelClock(session);
  // A coordinator whose threads are folded shows its row's stack in place of its own dot and time.
  const foldedStatus = shownFoldedStatus(session, item.nesting?.foldedStatus);
  const badge = statusBadge(session, foldedStatus);
  const timeLabel = foldedStatus !== undefined ? null : rowTimeLabel(session, nowMs);
  // The ring takes the colour of the badge's front dot (the status the session changed to).
  const ring = useChangeRing(badge?.kind ?? null, badge?.dots.at(-1) ?? null);
  const iconId = resolveAgentIconId(
    session.agentIcon,
    session.agentName.length > 0 ? session.agentName : session.agent,
  );
  const Icon = AGENT_ICONS[iconId] ?? AGENT_ICONS.terminal;
  const title = session.displayTitle.length > 0 ? session.displayTitle : SessionCopy.fallbackTitle;

  return (
    <Pressable
      ref={tileRef}
      accessibilityRole="button"
      accessibilityLabel={WallCopy.tile(title, badge?.label ?? timeLabel)}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: pressed ? appearance.cardActive : appearance.card, borderColor: appearance.border },
      ]}
      onPress={onPress}
      onLongPress={() => tileRef.current?.measureInWindow((x, y, width, height) => onMenu({ x, y, width, height }))}
    >
      <View style={styles.head}>
        <Icon size={18} color={agentIconTint(iconId)} />
        <View style={styles.name}>
          <Text style={[styles.title, { color: appearance.foreground }]} numberOfLines={1}>
            {title}
          </Text>
          {badge !== null || timeLabel !== null ? (
            <View style={styles.status}>
              {badge !== null ? (
                <View style={styles.badge}>
                  <OverlappedDots colors={badge.dots} size={STATUS_DOT_SIZE} ringColor={appearance.card} />
                  <Text style={[styles.badgeLabel, { color: appearance.foreground }]}>{badge.label}</Text>
                </View>
              ) : null}
              {timeLabel !== null ? <Text style={styles.time}>{timeLabel}</Text> : null}
            </View>
          ) : null}
        </View>
      </View>
      <View style={[styles.thumb, { borderTopColor: appearance.border }]}>
        {preview?.kind === 'unavailable' ? (
          <Text style={[styles.unavailable, { color: appearance.muted }]}>{WallCopy.previewUnavailable}</Text>
        ) : (
          preview?.lines.map((line, index) => (
            <Text
              key={index}
              style={[styles.line, { color: appearance.foreground }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {line.length > 0 ? line : ' '}
            </Text>
          ))
        )}
      </View>
      {ring !== null ? <View pointerEvents="none" style={[styles.ring, { borderColor: ring }]} /> : null}
    </Pressable>
  );
}

/**
 * The colour of the ring a tile carries for `COMPLETION_FLASH_MS` after its badge changed while it was shown (the
 * mockup's short ring in the new status colour); null at rest and on the first render.
 */
function useChangeRing(kind: string | null, color: string | null): string | null {
  const shown = useRef(kind);
  const [ring, setRing] = useState<string | null>(null);
  useEffect(() => {
    if (shown.current === kind) return undefined;
    shown.current = kind;
    if (color === null) {
      setRing(null);
      return undefined;
    }
    setRing(color);
    const timeout = setTimeout(() => setRing(null), COMPLETION_FLASH_MS);
    return () => clearTimeout(timeout);
  }, [kind, color]);
  return ring;
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: 0,
    borderRadius: GhostexRadii.section,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 8,
  },
  /** Title over the badge, so the whole title fits even three tiles across. */
  name: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  title: {
    fontSize: 15,
    fontWeight: '500',
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 24,
    paddingLeft: 6,
    paddingRight: 8,
    borderRadius: GhostexRadii.pill,
    backgroundColor: GhostexPalette.NEUTRAL_FILL,
  },
  badgeLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  time: {
    fontSize: 13,
    color: SidebarPalette.ROW_TIME,
  },
  thumb: {
    height: THUMB_LINES * THUMB_LINE_HEIGHT + 2 * THUMB_PADDING,
    paddingVertical: THUMB_PADDING,
    paddingHorizontal: 10,
    justifyContent: 'flex-end',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  line: {
    fontFamily: MONOSPACE,
    fontSize: 11,
    lineHeight: THUMB_LINE_HEIGHT,
  },
  unavailable: {
    alignSelf: 'center',
    marginVertical: 'auto',
    fontSize: 12,
  },
  ring: {
    ...StyleSheet.absoluteFill,
    borderRadius: GhostexRadii.section,
    borderWidth: 2,
  },
});
