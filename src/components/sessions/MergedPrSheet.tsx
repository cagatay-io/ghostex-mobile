/**
 * The sheet a session row's merged-PR badge opens (SessionRow.tsx): what the offer is about and its answers, Open PR,
 * Keep and Clean up. The phone's twin of the desktop's merged-PR popup.
 *
 * CDXC:WorkMode 2026-11-25 DECISION: the user picked option D for merged-PR rows: the row's Clean up / Keep line is
 * gone, its PR badge turns into a merge icon with the PR's number, and a tap on that badge opens this sheet. Keep and
 * Clean up answer the offer exactly as the old chips did (`WorkChipActions.answerCleanup`); Open PR opens the PR as the
 * PR chip did (`WorkChipActions.openLink`). The buttons stay neutral, never the accent colour.
 */

import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SessionCopy } from '../../copy';
import { SidebarPalette } from '../../theme/palette';
import { useAppearance, type Appearance } from '../../theme/useAppearance';
import BottomSheet from '../common/BottomSheet';
import { BranchGlyph } from './unified/glyphs';
import { ChipGlyph } from './WorkChips';

export type MergedPrSheetProps = {
  visible: boolean;
  /** The merged PR's number, or null when the computer did not send it. */
  prNumber: number | null;
  /** The PR's page; empty leaves Open PR out. */
  prUrl: string;
  /** The session's branch; empty leaves its line out. */
  branch: string;
  onOpenPr: () => void;
  onKeep: () => void;
  onCleanUp: () => void;
  onClose: () => void;
};

export default function MergedPrSheet({
  visible,
  prNumber,
  prUrl,
  branch,
  onOpenPr,
  onKeep,
  onCleanUp,
  onClose,
}: MergedPrSheetProps) {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  const button = (label: string, onPress: () => void, look: 'quiet' | 'neutral') => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.btn,
        look === 'quiet'
          ? pressed
            ? styles.btnQuietPressed
            : null
          : pressed
            ? styles.btnNeutralPressed
            : styles.btnNeutral,
      ]}
    >
      <Text style={look === 'quiet' ? styles.btnQuietLabel : styles.btnLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.wrap}>
        <View style={styles.headRow} accessible accessibilityRole="header">
          <ChipGlyph glyph="merged" color={SidebarPalette.WORK_MERGED} size={18} />
          <Text style={styles.title} numberOfLines={1}>
            {SessionCopy.mergedPrTitle(prNumber)}
          </Text>
        </View>
        {branch.length > 0 ? (
          <View style={styles.branchRow} accessible accessibilityLabel={SessionCopy.inWorktree(branch)}>
            <BranchGlyph size={14} color={appearance.muted} />
            <Text style={styles.branch} numberOfLines={1} ellipsizeMode="middle">
              {branch}
            </Text>
          </View>
        ) : null}
        <Text style={styles.body}>{SessionCopy.mergedPrBody}</Text>
        <View style={styles.actions}>
          {prUrl.length > 0 ? button(SessionCopy.mergedPrOpen, onOpenPr, 'quiet') : null}
          {button(SessionCopy.mergedPrKeep, onKeep, 'neutral')}
          {button(SessionCopy.mergedPrCleanUp, onCleanUp, 'neutral')}
        </View>
      </View>
    </BottomSheet>
  );
}

/** NativeModeAnnounceSheet's sheet layout and neutral buttons (Keep and Clean up share the desktop's neutral fill). */
const createStyles = (appearance: Appearance) =>
  StyleSheet.create({
    wrap: {
      gap: 12,
      paddingTop: 2,
    },
    headRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    title: {
      flexShrink: 1,
      fontSize: 16.5,
      fontWeight: '600',
      color: appearance.foreground,
    },
    branchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: -4,
    },
    branch: {
      flexShrink: 1,
      fontSize: 13,
      color: appearance.muted,
    },
    body: {
      fontSize: 13.5,
      lineHeight: 19.5,
      color: appearance.muted,
    },
    actions: {
      flexDirection: 'row',
      gap: 8,
      paddingTop: 4,
    },
    btn: {
      flex: 1,
      height: 40,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
    },
    btnQuietPressed: {
      backgroundColor: appearance.neutralFill,
    },
    btnNeutral: {
      backgroundColor: appearance.neutralFill,
    },
    btnNeutralPressed: {
      backgroundColor: appearance.neutralFillPressed,
    },
    btnLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: appearance.foreground,
    },
    btnQuietLabel: {
      fontSize: 14,
      fontWeight: '500',
      color: appearance.muted,
    },
  });
