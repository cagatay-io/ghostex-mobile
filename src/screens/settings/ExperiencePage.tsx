import {
  areaPatch,
  EXPERIENCE_AREAS,
  EXPERIENCE_PRESETS,
  experiencePatch,
  overallPreset,
  shownPreset,
  type ExperiencePreset,
} from '../../settings/experience';
import { useSettingsStore } from '../../settings/store';
import { SettingsSection } from './SectionBoundary';
import { Caption, SectionHeader, SegmentedRow, SettingsScreenLayout, ToggleRow } from './SettingsControls';

const OPTIONS = EXPERIENCE_PRESETS.map(({ value, label }) => ({ value, label }));

/** No segment selected: the row's settings match no preset (Custom). */
const NONE = '' as ExperiencePreset;

/**
 * Settings › Experience: Chill, Regular or Advanced for this phone, then one row per area. A row is selected while its
 * settings match a preset and says Custom when they match none; picking one writes that preset's settings
 * (src/settings/experience.ts, where the user's decisions are cited).
 *
 * CDXC:Experience 2026-11-15 DECISION: Q3284, "if i change settings below then it should not select any of the 3 main
 * preset selections and should say "Custom" next to them". The switches each preset sets are listed under it, so
 * every one can still be flipped alone.
 */
export default function ExperiencePage() {
  const settings = useSettingsStore((state) => state.settings);
  const patchSettings = useSettingsStore((state) => state.patchSettings);
  const setSetting = useSettingsStore((state) => state.setSetting);
  const overall = overallPreset(settings);
  const described = EXPERIENCE_PRESETS.find((preset) => preset.value === overall)?.description;

  return (
    <SettingsScreenLayout>
      <SettingsSection name="settings:experience:preset">
        <SectionHeader title="Experience" />
        <SegmentedRow
          label="Experience"
          options={OPTIONS}
          value={overall ?? NONE}
          onChange={(next) => patchSettings(experiencePatch(next))}
        />
        <Caption>
          {overall === null
            ? 'Custom: the areas below differ. Pick one to set them all.'
            : `${described ?? ''} Each area below follows it unless you pick one for it.`}
        </Caption>
      </SettingsSection>
      {EXPERIENCE_AREAS.map((area) => {
        const shown = shownPreset(area.id, settings);
        return (
          <SettingsSection key={area.id} name={`settings:experience:${area.id}`}>
            <SectionHeader title={area.label} />
            <SegmentedRow
              label={area.label}
              options={OPTIONS}
              value={shown ?? NONE}
              onChange={(next) => patchSettings(areaPatch(area.id, next))}
            />
            <Caption>{shown === null ? `Custom. ${area.description}` : area.description}</Caption>
          </SettingsSection>
        );
      })}
      <SettingsSection name="settings:experience:switches">
        <SectionHeader title="Switches" />
        <ToggleRow
          label="Mode in the chat box"
          detail="Off, the chat box shows no mode."
          value={settings.chatComposerModePicker}
          onValueChange={(next) => setSetting('chatComposerModePicker', next)}
        />
        <ToggleRow
          label="Terminal button in the chat box"
          detail="Off, Terminal View is in the ••• menu, and ••• turns red when the terminal has a problem."
          value={settings.chatComposerTerminalButton}
          onValueChange={(next) => setSetting('chatComposerTerminalButton', next)}
        />
        <ToggleRow
          label="Context ring in the chat box"
          detail="Off, it stays in ••• › More › Context window."
          value={settings.chatComposerContextRing}
          onValueChange={(next) => setSetting('chatComposerContextRing', next)}
        />
        <ToggleRow
          label="Calm Quiet View"
          detail="The running turn stays one line with its time, and lines name only reports."
          value={settings.chatQuietView?.calm === true}
          onValueChange={(next) =>
            setSetting('chatQuietView', {
              ...(settings.chatQuietView ?? { coordinators: true, chats: true, expandLast: true, calm: false }),
              calm: next,
            })
          }
        />
        <ToggleRow
          label="Project icons"
          value={settings.sessionsShowProjectIcons}
          onValueChange={(next) => setSetting('sessionsShowProjectIcons', next)}
        />
        <ToggleRow
          label="Agent icons"
          value={settings.sessionsShowAgentIcons}
          onValueChange={(next) => setSetting('sessionsShowAgentIcons', next)}
        />
        <ToggleRow
          label="Last active times"
          value={settings.sessionsShowLastActive}
          onValueChange={(next) => setSetting('sessionsShowLastActive', next)}
        />
      </SettingsSection>
    </SettingsScreenLayout>
  );
}
