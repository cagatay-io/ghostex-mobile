/**
 * Settings › Interface › Terminal palette in dark mode / in light mode: the palette the terminal draws with in that
 * appearance (`terminalGhosttyTheme` / `terminalGhosttyLightTheme`), from the Mac's list. A filter narrows the list;
 * a saved name the phone does not carry stays listed first, as on the Mac.
 */

import { useState } from 'react';
import { TextInput } from 'react-native';

import { useSettingsStore } from '../../settings/store';
import { terminalPaletteLabel, terminalPaletteNames } from '../../theme/terminalPalettes';
import { useAppearance } from '../../theme/useAppearance';
import { SettingsSection } from './SectionBoundary';
import { Caption, ChoiceRow, SettingsScreenLayout, useSettingsStyles } from './SettingsControls';

export default function TerminalPalettePage({ dark }: { dark: boolean }) {
  const key = dark ? 'terminalGhosttyTheme' : 'terminalGhosttyLightTheme';
  const current = useSettingsStore((state) => state.settings[key]);
  const setSetting = useSettingsStore((state) => state.setSetting);
  const styles = useSettingsStyles();
  const appearance = useAppearance();
  const [filter, setFilter] = useState('');

  const names = terminalPaletteNames();
  const offered = names.includes(current) ? names : [current, ...names];
  const query = filter.trim().toLowerCase();
  const shown =
    query === '' ? offered : offered.filter((name) => terminalPaletteLabel(name).toLowerCase().includes(query));

  return (
    <SettingsScreenLayout>
      <SettingsSection name={`settings:terminal-palette:${dark ? 'dark' : 'light'}`}>
        <Caption>{`The colours the terminal draws with in ${dark ? 'dark' : 'light'} mode.`}</Caption>
        <TextInput
          accessibilityLabel="Filter palettes"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          keyboardAppearance={appearance.light ? 'light' : 'dark'}
          placeholder="Filter"
          placeholderTextColor={appearance.muted}
          returnKeyType="search"
          spellCheck={false}
          style={styles.input}
          value={filter}
          onChangeText={setFilter}
        />
        {shown.length === 0 ? <Caption>No palette matches.</Caption> : null}
        {shown.map((name) => (
          <ChoiceRow
            key={name}
            label={terminalPaletteLabel(name)}
            selected={name === current}
            onPress={() => setSetting(key, name)}
          />
        ))}
      </SettingsSection>
    </SettingsScreenLayout>
  );
}
