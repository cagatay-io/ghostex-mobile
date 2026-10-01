/**
 * The look editor of New dot and Setup (Open Dot's LookEditor): body, color, feet, eyes, eye color,
 * finish and extra, plus Shuffle. A palette body color brings its matching feet, as in Open Dot.
 */

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DOT_COLORS, DOT_EYE_COLORS, DOT_FEET_COLORS, DOT_LOOK_OPTIONS, feetFor, randomLook } from '../../dots/look';
import type { DotLook } from '../../dots/types';
import { useAppearance } from '../../theme/useAppearance';
import { Chip, ChipRow, DotsButton, useDotsStyles } from './kit';

function capitalize(value: string): string {
  return value.length === 0 ? value : `${value[0].toUpperCase()}${value.slice(1)}`;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  const styles = useDotsStyles();
  return (
    <View style={local.row}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function Swatches({
  value,
  palette,
  onChange,
}: {
  value: string;
  palette: readonly string[];
  onChange: (color: string) => void;
}) {
  const appearance = useAppearance();
  return (
    <View style={local.swatches}>
      {palette.map((color) => {
        const selected = color.toLowerCase() === value.toLowerCase();
        return (
          <Pressable
            key={color}
            accessibilityRole='radio'
            accessibilityLabel={color}
            accessibilityState={{ selected }}
            hitSlop={3}
            onPress={() => onChange(color)}
            style={[local.swatchRing, { borderColor: selected ? appearance.foreground : 'transparent' }]}
          >
            <View style={[local.swatch, { backgroundColor: color }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

function Options<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) {
  return (
    <ChipRow>
      {options.map((option) => (
        <Chip key={option} label={capitalize(option)} selected={option === value} onPress={() => onChange(option)} />
      ))}
    </ChipRow>
  );
}

export default function LookEditor({ look, onChange }: { look: DotLook; onChange: (look: DotLook) => void }) {
  const set =
    <K extends keyof DotLook>(key: K) =>
    (value: DotLook[K]) =>
      onChange({ ...look, [key]: value });
  return (
    <View style={local.editor}>
      <Row label='Body'>
        <Options value={look.shape} options={DOT_LOOK_OPTIONS.shapes} onChange={set('shape')} />
      </Row>
      <Row label='Color'>
        <Swatches
          value={look.color}
          palette={DOT_COLORS}
          onChange={(color) =>
            onChange({
              ...look,
              color,
              accent: (DOT_COLORS as readonly string[]).includes(color) ? feetFor(color) : look.accent,
            })
          }
        />
      </Row>
      <Row label='Feet'>
        <Swatches value={look.accent} palette={DOT_FEET_COLORS} onChange={set('accent')} />
      </Row>
      <Row label='Eyes'>
        <Options value={look.eyes} options={DOT_LOOK_OPTIONS.eyes} onChange={set('eyes')} />
      </Row>
      <Row label='Eye color'>
        <Swatches value={look.eyeColor} palette={DOT_EYE_COLORS} onChange={set('eyeColor')} />
      </Row>
      <Row label='Finish'>
        <Options value={look.material} options={DOT_LOOK_OPTIONS.materials} onChange={set('material')} />
      </Row>
      <Row label='Extra'>
        <Options value={look.accessory} options={DOT_LOOK_OPTIONS.accessories} onChange={set('accessory')} />
      </Row>
      <View style={{ flexDirection: 'row' }}>
        <DotsButton label='Shuffle look' variant='secondary' small onPress={() => onChange(randomLook())} />
      </View>
    </View>
  );
}

const local = StyleSheet.create({
  editor: { gap: 14 },
  row: { gap: 7 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  swatchRing: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' },
});
