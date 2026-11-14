/**
 * The one-time card on top of Sessions once the first computer is paired: "How much should Ghostex show?" with Chill,
 * Regular and Advanced, Regular picked. Continue writes the picked preset (src/settings/experience.ts); the × keeps
 * Regular. Settings › Experience changes it any time.
 *
 * CDXC:Experience 2026-11-15 DECISION:
 * Q3286 A: ask new users on first run with Regular preselected, on the phone right after pairing. Of the words under
 * each preset: Regular does show the mode picker, and hides the terminal button for attach; Advanced is for people who
 * use terminals more. Q3287: an install that saved settings before this card existed is never asked
 * (`experienceAsked`). The computer asks on its welcome's Workspace step (apps/desktop/src/app/window/onboarding/
 * workspace.rs).
 */

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { XGlyph } from '../../components/sessions/icons';
import {
  EXPERIENCE_PRESETS,
  experiencePatch,
  FIRST_RUN_PRESET,
  type ExperiencePreset,
} from '../../settings/experience';
import { useSettingsStore } from '../../settings/store';
import type { SidebarAppearance } from '../../theme/sidebarAppearance';

export default function ExperienceCard({ appearance }: { appearance: SidebarAppearance }) {
  const shown = useSettingsStore((state) => state.hydrated && !state.settings.experienceAsked);
  const [pick, setPick] = useState<ExperiencePreset>(FIRST_RUN_PRESET);
  if (!shown) return null;
  const keep = (preset: ExperiencePreset) =>
    useSettingsStore.getState().patchSettings({ ...experiencePatch(preset), experienceAsked: true });
  return (
    <View style={[styles.card, { backgroundColor: appearance.card, borderColor: appearance.border }]}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={[styles.title, { color: appearance.foreground }]}>How much should Ghostex show?</Text>
          <Text style={[styles.detail, { color: appearance.muted }]}>You can change this any time in Settings.</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Keep Regular"
          hitSlop={10}
          onPress={() => keep(FIRST_RUN_PRESET)}
        >
          <XGlyph size={14} color={appearance.muted} />
        </Pressable>
      </View>
      <View accessibilityRole="radiogroup" style={styles.choices}>
        {EXPERIENCE_PRESETS.map((preset) => {
          const on = preset.value === pick;
          return (
            <Pressable
              key={preset.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${preset.label}. ${preset.description}`}
              onPress={() => setPick(preset.value)}
              style={[
                styles.choice,
                { borderColor: on ? appearance.foreground : appearance.border },
                on ? { backgroundColor: appearance.border } : null,
              ]}
            >
              <Text style={[styles.choiceTitle, { color: appearance.foreground }]}>{preset.label}</Text>
              <Text style={[styles.detail, { color: appearance.muted }]}>{preset.description}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => keep(pick)}
        style={[styles.continue, { backgroundColor: appearance.foreground }]}
      >
        <Text style={[styles.continueText, { color: appearance.card }]}>Continue</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  headText: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '500' },
  detail: { fontSize: 13, lineHeight: 18 },
  choices: { gap: 8 },
  choice: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, gap: 2 },
  choiceTitle: { fontSize: 15, fontWeight: '500' },
  continue: { borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  continueText: { fontSize: 15, fontWeight: '500' },
});
