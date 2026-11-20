/**
 * A coordinator's merged-worktrees banner, after its threads and above its older-threads row: "N merged worktrees"
 * with Clean up all and Keep, instead of a Clean up / Keep line on each thread, and a quiet line about the worktrees
 * its computer cleaned up by itself, with Undo. The phone's copy of the desktop's
 * apps/desktop/src/app/native_sidebar/cleanup_banner.rs; what it counts comes from coordinatorTree.ts
 * (`RowNesting.cleanupOffers`, `autoCleaned`). The phone has no hover, so the desktop's tooltips are the actions'
 * accessibility hints.
 */

import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { WorkCleanupThreadsAnswer } from '../../commands/ghostexCli';
import type { CleanupBannerModel } from '../../contract/grouping';
import { SessionCopy } from '../../copy';
import { SidebarPalette } from '../../theme/palette';
import { ds, inkStyleSheets, PassingThreadLines, useSidebarInk } from './rows';
import { ChipGlyph } from './WorkChips';
import type { WorkChipGlyph } from './workChipModel';

/** One line of the banner, and the space above and below its lines (cleanup_banner.rs). */
const LINE_HEIGHT = 18;
const PADDING_Y = 3;
const GLYPH_SIZE = 12;

/** Its height in dp: two lines for the offer, one for the cleaned-up line. */
function bannerHeight(banner: CleanupBannerModel): number {
  const lines =
    (banner.offers > 0 ? 2 : 0) + (banner.offers > 0 && banner.kept > 0 ? 1 : 0) + (banner.autoCleaned > 0 ? 1 : 0);
  return ds(lines * LINE_HEIGHT + 2 * PADDING_Y);
}

export default function CleanupBanner({
  banner,
  threadDepth,
  passingLines,
  onAnswer,
}: {
  banner: CleanupBannerModel;
  /** The tree level its text lines up with, as the older-threads row's (rows.tsx `SessionListToggleRow`). */
  threadDepth: number;
  /** The tree lines that run past it, toward the coordinator's next sibling or an ancestor's. */
  passingLines: number;
  onAnswer: (answer: WorkCleanupThreadsAnswer) => void;
}): ReactElement {
  const ink = useSidebarInk();
  const styles = bannerInkStyles(ink);
  const muted = ink.light ? ink.muted : SidebarPalette.MUTED;
  const action = (
    answer: WorkCleanupThreadsAnswer,
    glyph: WorkChipGlyph,
    color: string,
    label: string | null,
    hint: string,
  ): ReactElement => (
    <Pressable
      key={answer}
      accessibilityRole="button"
      accessibilityLabel={label ?? hint}
      accessibilityHint={label === null ? undefined : hint}
      hitSlop={{ top: ds(6), bottom: ds(6), left: ds(4), right: ds(4) }}
      onPress={() => onAnswer(answer)}
      style={styles.action}
    >
      {({ pressed }) => (
        <>
          <ChipGlyph glyph={glyph} color={color} size={ds(GLYPH_SIZE)} />
          {label !== null ? <Text style={[styles.text, pressed ? styles.textPressed : null]}>{label}</Text> : null}
        </>
      )}
    </Pressable>
  );
  return (
    <View style={[styles.banner, { paddingLeft: ds(26) + ds(threadDepth * 16) }]}>
      {/* Where the older-threads row places the lines passing it (rows.tsx `SessionListToggleRow`). */}
      <PassingThreadLines
        lines={passingLines}
        levelLeft={(level) => ds(5) + ds(level * 16) - ds(16) + ds(7)}
        height={bannerHeight(banner)}
      />
      {banner.offers > 0 ? (
        <>
          <View style={[styles.line, styles.titleLine]}>
            <ChipGlyph glyph="merged" color={SidebarPalette.WORK_MERGED} size={ds(GLYPH_SIZE)} />
            <Text style={styles.text} numberOfLines={1}>
              {SessionCopy.mergedWorktrees(banner.offers)}
            </Text>
          </View>
          {banner.kept > 0 ? (
            <View style={styles.line}>
              <Text style={styles.text} numberOfLines={1}>
                {SessionCopy.keptWorktrees(banner.kept, banner.keptReasons)}
              </Text>
            </View>
          ) : null}
          <View style={styles.line}>
            {action(
              'cleanUp',
              'cleanUp',
              SidebarPalette.WORK_MERGED,
              SessionCopy.cleanUpAll,
              SessionCopy.cleanUpAllHint(banner.offers),
            )}
            {action('keep', 'keep', muted, SessionCopy.keepWorktrees, SessionCopy.keepWorktreesHint)}
          </View>
        </>
      ) : null}
      {banner.autoCleaned > 0 ? (
        <View style={styles.line}>
          <Text style={[styles.text, styles.shrink]} numberOfLines={1}>
            {SessionCopy.cleanedUpWorktrees(banner.autoCleaned)}
          </Text>
          {banner.autoCleanedUndo > 0
            ? action('undo', 'undo', muted, SessionCopy.undoCleanup, SessionCopy.undoCleanupHint)
            : null}
          {action('dismiss', 'keep', muted, null, SessionCopy.dismissCleanupHint)}
        </View>
      ) : null}
    </View>
  );
}

const bannerInkStyles = inkStyleSheets((ink) =>
  StyleSheet.create({
    banner: {
      paddingVertical: ds(PADDING_Y),
      paddingRight: ds(6),
      opacity: 0.8,
    },
    line: {
      height: ds(LINE_HEIGHT),
      flexDirection: 'row',
      alignItems: 'center',
      gap: ds(10),
      minWidth: 0,
    },
    titleLine: {
      gap: ds(4),
    },
    action: {
      flexDirection: 'row',
      alignItems: 'center',
      flexShrink: 0,
      gap: ds(3),
    },
    text: {
      color: ink.light ? ink.muted : SidebarPalette.MUTED,
      fontSize: ds(11.5),
      lineHeight: ds(LINE_HEIGHT),
    },
    shrink: {
      flexShrink: 1,
    },
    textPressed: {
      color: ink.light ? ink.text : SidebarPalette.FOREGROUND,
      textDecorationLine: 'underline',
    },
  }),
);
