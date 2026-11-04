/**
 * Settings › Interface › Terminal palette in dark mode / in light mode: the palette the terminal draws with in that
 * appearance (`terminalGhosttyTheme` / `terminalGhosttyLightTheme`), from the Mac's bundled list plus this phone's
 * private imports. A filter narrows the list; a saved name the phone does not carry stays listed first, as on the Mac.
 * The list holds a couple of hundred palettes, so it is one virtualised list with the caption and filter as its
 * header: only the rows near the screen are built. Like every Settings page it keeps the focused filter above the
 * keyboard, a readable column clear of the side bar, and half folded like a laptop a list that ends above the fold.
 */

import { useCallback, useContext, useMemo, useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FoldListFrame } from '../../components/common/foldGap';
import KeyboardAwareScrollView from '../../components/common/keyboard/KeyboardAwareScrollView';
import { useLaptopFold } from '../../components/common/verticalBar/laptopFold';
import { useHeaderPlacement, useScrollToBarEdges } from '../../components/common/verticalBar/VerticalBarArea';
import { useSettingsStore } from '../../settings/store';
import { terminalPaletteLabel, terminalPaletteNames } from '../../theme/terminalPalettes';
import { useAppearance } from '../../theme/useAppearance';
import { SettingsSection } from './SectionBoundary';
import { Caption, ChoiceRow, READABLE_COLUMN, SettingsPageEdgesContext, useSettingsStyles } from './SettingsControls';
import { useAppearanceHeader } from './useAppearanceHeader';

export default function TerminalPalettePage({ dark }: { dark: boolean }) {
  useAppearanceHeader();
  const key = dark ? 'terminalGhosttyTheme' : 'terminalGhosttyLightTheme';
  const current = useSettingsStore((state) => state.settings[key]);
  const imported = useSettingsStore((state) => state.settings.importedTerminalPalettes);
  const setSetting = useSettingsStore((state) => state.setSetting);
  const styles = useSettingsStyles();
  const appearance = useAppearance();
  const [filter, setFilter] = useState('');

  const shown = useMemo(() => {
    const names = terminalPaletteNames(undefined, imported);
    const offered = names.includes(current) ? names : [current, ...names];
    const query = filter.trim().toLowerCase();
    return query === '' ? offered : offered.filter((name) => terminalPaletteLabel(name).toLowerCase().includes(query));
  }, [current, filter, imported]);

  // As every Settings page: a readable column where the Duo's chrome gives a wide window, and scroll content kept
  // clear of the side bar.
  const readable = useHeaderPlacement().kind !== 'top';
  const contentStyle = useMemo(() => [styles.list, readable ? READABLE_COLUMN : null], [styles, readable]);
  const edges = useScrollToBarEdges(contentStyle, useContext(SettingsPageEdgesContext));
  const fold = useLaptopFold();

  // A stable row renderer, new only when the selection changes (React Compiler is off).
  const renderItem = useCallback(
    ({ item }: { item: string }) => (
      <ChoiceRow label={terminalPaletteLabel(item)} selected={item === current} onPress={() => setSetting(key, item)} />
    ),
    [current, key, setSetting],
  );

  const header = (
    <View style={local.header}>
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
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <SettingsSection name={`settings:terminal-palette:${dark ? 'dark' : 'light'}`}>
        <FoldListFrame fold={fold}>
          <FlatList
            data={shown}
            keyExtractor={(name) => name}
            renderItem={renderItem}
            ListHeaderComponent={header}
            ListEmptyComponent={<Caption>No palette matches.</Caption>}
            renderScrollComponent={(props) => <KeyboardAwareScrollView {...props} />}
            keyboardShouldPersistTaps="handled"
            style={edges.scroll}
            contentContainerStyle={[contentStyle, edges.content]}
          />
        </FoldListFrame>
      </SettingsSection>
    </SafeAreaView>
  );
}

// The header's caption and filter stand apart as the list's rows do (`styles.list` gap).
const local = StyleSheet.create({
  header: { gap: 8 },
});
