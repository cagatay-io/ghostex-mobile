import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useSettingsStore } from '../../settings/store';
import { GhostexPalette, GhostexRadii } from '../../theme/palette';
import {
  colourfulnessPatch,
  DEFAULT_THEME_DEPTH,
  DEFAULT_THEME_TINT,
  MAX_THEME_DEPTH,
  MIN_DARK_THEME_DEPTH,
  normalizeHexColor,
  resolveThemeAreas,
  roundThemeContrastPoints,
  SIDEBAR_BACKGROUND_TINT_OPTIONS,
  THEME_CONTRAST_VIVID_POINTS,
  themeChromeControls,
} from '../../theme/sidebarAppearance';
import { useAppearance } from '../../theme/useAppearance';
import { SettingsSection } from './SectionBoundary';
import { Caption, SettingsScreenLayout, SettingsSlider, useSettingsStyles } from './SettingsControls';

function TintControl({
  value,
  resolvedBackground,
  onChange,
}: {
  value: string;
  resolvedBackground: string;
  onChange: (value: string) => void;
}) {
  const settingsStyles = useSettingsStyles();
  const appearance = useAppearance();
  const [draft, setDraft] = useState(value.toUpperCase());

  useEffect(() => {
    setDraft(value.toUpperCase());
  }, [value]);

  const commitDraft = (): void => {
    if (/^#[0-9a-f]{6}$/iu.test(draft.trim())) {
      onChange(normalizeHexColor(draft, DEFAULT_THEME_TINT));
    } else {
      setDraft(value.toUpperCase());
    }
  };

  return (
    <View style={settingsStyles.card}>
      <View style={styles.tintHeader}>
        <Text style={settingsStyles.rowLabel}>Background Tint</Text>
        <View
          style={[
            styles.resolvedBackgroundPreview,
            { backgroundColor: resolvedBackground, borderColor: appearance.border },
          ]}
        />
      </View>
      <View style={styles.tintSwatches}>
        {SIDEBAR_BACKGROUND_TINT_OPTIONS.map((option) => {
          const selected = option.value.toLowerCase() === value.toLowerCase();
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={`${option.label} background tint`}
              accessibilityState={{ selected }}
              hitSlop={3}
              style={[
                styles.tintSwatch,
                { backgroundColor: option.value, borderColor: appearance.border },
                selected ? styles.tintSwatchSelected : null,
              ]}
              onPress={() => onChange(option.value.toLowerCase())}
            />
          );
        })}
      </View>
      <TextInput
        accessibilityLabel="Background tint hex color"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={7}
        placeholder="#808080"
        placeholderTextColor={appearance.muted}
        returnKeyType="done"
        spellCheck={false}
        style={[settingsStyles.input, styles.tintInput]}
        value={draft}
        onBlur={commitDraft}
        onChangeText={(next) => {
          setDraft(next);
          if (/^#[0-9a-f]{6}$/iu.test(next.trim())) {
            onChange(normalizeHexColor(next, DEFAULT_THEME_TINT));
          }
        }}
        onSubmitEditing={commitDraft}
      />
    </View>
  );
}

/**
 * CDXC:Theming 2026-11-01 WHY: Until the Theme page gets the desktop's controls, its two earlier controls write the
 * desktop's keys. Background Contrast keeps its 85-100 scale and saves the Colourfulness position with the same depth
 * (`2 * (100 - value)`: 96 is Soft, 85 is two positions short of Vivid), so it moves a colour square and a custom
 * colour alike.
 */
function ContrastSection() {
  const points = useSettingsStore((state) => state.settings.themeSidebarContrast);
  const patchSettings = useSettingsStore((state) => state.patchSettings);
  const value = Math.max(
    MIN_DARK_THEME_DEPTH,
    DEFAULT_THEME_DEPTH + Math.max(THEME_CONTRAST_VIVID_POINTS, roundThemeContrastPoints(points)),
  );

  return (
    <>
      <SettingsSlider
        label="Background Contrast"
        maximumValue={MAX_THEME_DEPTH}
        minimumValue={MIN_DARK_THEME_DEPTH}
        step={1}
        value={value}
        valueLabel={`${value}`}
        onValueChange={(next) => patchSettings(colourfulnessPatch(2 * (MAX_THEME_DEPTH - next)))}
      />
      <Caption>85 is softer gray; 100 is black. Drawer and Settings surfaces adjust automatically.</Caption>
    </>
  );
}

/** The earlier Background Tint control, writing the dark appearance's custom colour. */
function TintSection() {
  const settings = useSettingsStore((state) => state.settings);
  const patchSettings = useSettingsStore((state) => state.patchSettings);

  return (
    <>
      <TintControl
        value={themeChromeControls(settings, false).tint}
        resolvedBackground={resolveThemeAreas(settings, false).sidebar}
        onChange={(value) => patchSettings({ darkThemePreset: 'custom', customSidebarTitlebarBackgroundTintColor: value })}
      />
      <Caption>Uses the same tint colors as the desktop sidebar.</Caption>
    </>
  );
}

export default function ThemePage() {
  return (
    <SettingsScreenLayout>
      <SettingsSection name="settings:theme:contrast">
        <ContrastSection />
      </SettingsSection>
      <SettingsSection name="settings:theme:tint">
        <TintSection />
      </SettingsSection>
    </SettingsScreenLayout>
  );
}

const styles = StyleSheet.create({
  tintHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  resolvedBackgroundPreview: {
    width: 28,
    height: 28,
    borderRadius: GhostexRadii.pill,
    borderWidth: 1,
  },
  tintSwatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tintSwatch: {
    width: 28,
    height: 28,
    borderRadius: 5,
    borderWidth: 1,
  },
  tintSwatchSelected: {
    borderWidth: 3,
    borderColor: GhostexPalette.ACCENT,
  },
  tintInput: {
    fontFamily: 'monospace',
  },
});
