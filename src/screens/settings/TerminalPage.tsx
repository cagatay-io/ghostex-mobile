import { Pressable, Text } from 'react-native';

import {
  TERMINAL_BACKGROUND_STARTING_COLOR,
  TERMINAL_FONT_SIZE_MAX,
  TERMINAL_FONT_SIZE_MIN,
  useSettingsStore,
  type TerminalBackgroundMode,
} from '../../settings/store';
import { useTerminalStore } from '../../terminal/sessions';
import {
  Caption,
  ChoiceRow,
  HexColourField,
  SectionHeader,
  SettingsScreenLayout,
  SettingToggle,
  StepperRow,
  useSettingsStyles,
} from './SettingsControls';
import { SettingsSection } from './SectionBoundary';

function FontSizeSection() {
  const styles = useSettingsStyles();
  const fontSize = useSettingsStore((state) => state.settings.fontSize);
  const setSetting = useSettingsStore((state) => state.setSetting);
  const hasFontOverrides = useTerminalStore((state) => Object.keys(state.fontSizeBySessionKey).length > 0);

  const stepFontSize = (delta: number): void => {
    setSetting('fontSize', Math.min(TERMINAL_FONT_SIZE_MAX, Math.max(TERMINAL_FONT_SIZE_MIN, fontSize + delta)));
  };

  return (
    <>
      <SectionHeader title="Font size" />
      <StepperRow
        label="Font size"
        value={`${fontSize}`}
        canDecrease={fontSize > TERMINAL_FONT_SIZE_MIN}
        canIncrease={fontSize < TERMINAL_FONT_SIZE_MAX}
        onStep={stepFontSize}
      />
      <Caption>Applies immediately to terminals without a pinch-zoom size of their own.</Caption>
      {hasFontOverrides && (
        <Pressable
          accessibilityRole="button"
          style={styles.row}
          onPress={() => useTerminalStore.getState().clearFontSizeOverrides()}
        >
          <Text style={styles.rowLabel}>Reset pinch-zoom sizes to default</Text>
        </Pressable>
      )}
    </>
  );
}

function BehaviorSection() {
  return (
    <>
      <SectionHeader title="Behavior" />
      <SettingToggle settingKey="keepScreenOn" label="Keep screen on" />
      <Caption>Keeps the screen awake while a terminal is open.</Caption>
      <SettingToggle settingKey="confirmTabClose" label="Confirm before closing tabs" />
    </>
  );
}

/** The desktop's Terminal background choices (General › Terminal), in its order. */
const TERMINAL_BACKGROUND_ROWS: ReadonlyArray<{ value: TerminalBackgroundMode; label: string }> = [
  { value: 'pure', label: 'Black / white' },
  { value: 'theme', label: 'Follow theme' },
  { value: 'custom', label: 'Custom color' },
];

/**
 * Terminal background and, for Custom, its colour (`terminalBackgroundMode`, `workspaceBackgroundColor`). Choosing
 * Custom while no colour is set seeds #111111 in the same save, as the desktop does.
 */
function BackgroundSection() {
  const mode = useSettingsStore((state) => state.settings.terminalBackgroundMode);
  const colour = useSettingsStore((state) => state.settings.workspaceBackgroundColor);
  const patchSettings = useSettingsStore((state) => state.patchSettings);

  return (
    <>
      <SectionHeader title="Terminal background" />
      {TERMINAL_BACKGROUND_ROWS.map((row) => (
        <ChoiceRow
          key={row.value}
          label={row.label}
          selected={mode === row.value}
          onPress={() =>
            patchSettings(
              row.value === 'custom' && colour === ''
                ? { terminalBackgroundMode: row.value, workspaceBackgroundColor: TERMINAL_BACKGROUND_STARTING_COLOR }
                : { terminalBackgroundMode: row.value },
            )
          }
        />
      ))}
      <Caption>
        Only changes the terminal. Black / white is pure black in dark mode and pure white in light mode.
      </Caption>
      {mode === 'custom' ? (
        <>
          <HexColourField
            label="Terminal background color"
            value={colour}
            onChange={(hex) => patchSettings({ workspaceBackgroundColor: hex })}
          />
          <Caption>Painted behind terminal text in dark and light mode.</Caption>
        </>
      ) : null}
    </>
  );
}

export default function TerminalPage() {
  return (
    <SettingsScreenLayout>
      <SettingsSection name="settings:terminal:font-size">
        <FontSizeSection />
      </SettingsSection>
      <SettingsSection name="settings:terminal:background">
        <BackgroundSection />
      </SettingsSection>
      <SettingsSection name="settings:terminal:behavior">
        <BehaviorSection />
      </SettingsSection>
    </SettingsScreenLayout>
  );
}
