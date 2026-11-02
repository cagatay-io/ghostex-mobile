/**
 * The Cloud Box part of the new chat's tray (desktop `box_picker.rs`): the chip beside the segments
 * that opens the box picker in the composer's menu sheet, and the boot progress card the first
 * message waits with. gx-chat-core builds both (`menus/cloud_box.rs`): the picker is a list of the
 * menu sheet's own rows and the card a list of steps, so this only lays them out.
 */

import { Pressable, Text, View } from 'react-native';

import type { CloudBoxCard, WorktreeTray } from '../../rust/document';
import { Glyph } from './icons';
import type { MenuRow } from './MenuSheet';
import { themedStyles, useTranscriptTheme } from '../transcript/theme';

const STAR = '#f5b301';
const DONE = '#22c55e';

export function CloudBoxChip({
  cloud,
  busy,
  openRows,
}: {
  cloud: NonNullable<WorktreeTray['cloudBox']>;
  busy: boolean;
  openRows: (title: string, rows: MenuRow[]) => void;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const label = cloud.chip.label ?? 'Cloud Box';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Cloud Box: ${label}`}
      disabled={busy}
      onPress={() => openRows('Cloud Box', cloud.menu as MenuRow[])}
      style={({ pressed }) => [styles.chip, pressed ? styles.pressed : null]}
    >
      {cloud.chip.star ? (
        <Glyph name="star" size={12} color={STAR} />
      ) : (
        <Glyph name="cloud" size={13} color={P.muted} />
      )}
      <Text style={styles.chipText} numberOfLines={1}>
        {label}
      </Text>
      <Glyph name="chevron-down" size={12} color={P.muted} />
    </Pressable>
  );
}

/** The boot card: the waiting message, then one line per step with its time (Q1009). */
export function CloudBoxCardView({ card }: { card: CloudBoxCard }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  return (
    <View style={styles.card}>
      {card.message ? (
        <Text style={styles.message} numberOfLines={2}>
          {card.message}
          <Text style={styles.muted}> · waiting for the box</Text>
        </Text>
      ) : null}
      {card.steps.map((step) => (
        <View key={step.label} style={styles.step}>
          {step.state === 'done' ? (
            <Glyph name="check" size={12} color={DONE} />
          ) : step.state === 'running' ? (
            <Glyph name="loader" size={12} color={P.muted} />
          ) : step.state === 'failed' ? (
            <Glyph name="alert-triangle" size={12} color={P.error} />
          ) : (
            <Glyph name="circle" size={12} color={P.muted} />
          )}
          <Text style={[styles.stepText, step.state === 'waiting' ? styles.muted : null]} numberOfLines={1}>
            {step.state === 'failed' && step.detail ? `${step.label} · ${step.detail}` : step.label}
          </Text>
          {step.state === 'done' && step.seconds !== null ? (
            <Text style={styles.muted}>{`${step.seconds.toFixed(1)} s`}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const useStyles = themedStyles((P) => ({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: P.composerBorder,
    maxWidth: 200,
  },
  pressed: { backgroundColor: P.border },
  chipText: { color: P.primary, fontSize: 12.5, flexShrink: 1 },
  card: { width: '100%', gap: 3, paddingTop: 2 },
  message: { color: P.primary, fontSize: 12.5 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  stepText: { color: P.primary, fontSize: 12.5, flexShrink: 1, flexGrow: 1 },
  muted: { color: P.muted, fontSize: 12.5 },
}));
