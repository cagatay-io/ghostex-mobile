/**
 * Settings › Licences: the third-party notices bundled with the app (THIRD_PARTY_NOTICES.md) as a searchable list
 * of components with their version and licence; a row opens the component's licence texts (LicenceNoticeScreen).
 * The file holds a couple of hundred entries, so one long page of licence texts would be hard to search.
 * Half folded like a laptop the list ends above the fold, as the Settings pages do (`components/common/foldGap.tsx`).
 */

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useContext, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FoldListFrame } from '../../components/common/foldGap';
import { useLaptopFold } from '../../components/common/verticalBar/laptopFold';
import { SearchGlyph, XGlyph } from '../../components/sessions/icons';
import { useHeaderPlacement, useScrollToBarEdges } from '../../components/common/verticalBar/VerticalBarArea';
import { LicencesCopy } from '../../copy';
import { useBundledNotices, type BundledNotices } from '../../licences/bundledNotices';
import { entryHeading, filterEntries, type NoticeEntry } from '../../licences/notices';
import type { RootStackParamList } from '../../navigation/types';
import { GhostexRadii, GhostexStrokeWidth } from '../../theme/palette';
import { useAppearance } from '../../theme/useAppearance';
import {
  Caption,
  LinkRow,
  READABLE_COLUMN,
  SettingsPageEdgesContext,
  SettingsScreenLayout,
  useSettingsStyles,
} from './SettingsControls';
import { useAppearanceHeader } from './useAppearanceHeader';

const NO_ENTRIES: readonly NoticeEntry[] = [];

/** The notices still loading, or why they could not be read with a way to try again; shared with the entry page. */
export function NoticesStatus({
  state,
  retry,
}: {
  state: Exclude<BundledNotices, { status: 'ready' }>;
  retry: () => void;
}) {
  const appearance = useAppearance();
  const settingsStyles = useSettingsStyles();
  if (state.status === 'loading') {
    return (
      <View style={styles.status} accessibilityLiveRegion="polite">
        <ActivityIndicator color={appearance.mutedGlyph} />
        <Caption>{LicencesCopy.loading}</Caption>
      </View>
    );
  }
  return (
    <View style={settingsStyles.card} accessibilityRole="alert">
      <Text style={settingsStyles.linkTitle}>{LicencesCopy.loadFailed}</Text>
      <Text style={settingsStyles.linkDescription} selectable>
        {state.message}
      </Text>
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [settingsStyles.row, pressed && settingsStyles.rowPressed]}
        onPress={retry}
      >
        <Text style={settingsStyles.cardLabel}>{LicencesCopy.retry}</Text>
      </Pressable>
    </View>
  );
}

export default function LicencesPage() {
  useAppearanceHeader();
  const appearance = useAppearance();
  const settingsStyles = useSettingsStyles();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { state, retry } = useBundledNotices();
  const [query, setQuery] = useState('');

  // As every Settings page: a readable column where the Duo's chrome gives a wide window, and scroll content kept
  // clear of the side bar.
  const readable = useHeaderPlacement().kind !== 'top';
  const contentStyle = useMemo(
    () => [settingsStyles.list, readable ? READABLE_COLUMN : null],
    [settingsStyles, readable],
  );
  const edges = useScrollToBarEdges(contentStyle, useContext(SettingsPageEdgesContext));

  const entries = state.status === 'ready' ? state.notices.entries : NO_ENTRIES;
  const shown = useMemo(() => filterEntries(entries, query), [entries, query]);
  const fold = useLaptopFold();

  // A stable row renderer so the list re-renders rows only when the shown entries change (React Compiler is off).
  const renderItem = useCallback(
    ({ item }: { item: NoticeEntry }) => (
      <LinkRow
        title={item.name}
        description={LicencesCopy.entryLine(item.version, item.licence)}
        onPress={() => navigation.navigate('LicenceNotice', { name: item.name, version: item.version })}
      />
    ),
    [navigation],
  );

  if (state.status !== 'ready') {
    return (
      <SettingsScreenLayout>
        <NoticesStatus state={state} retry={retry} />
      </SettingsScreenLayout>
    );
  }

  const header = (
    <View style={styles.header}>
      <Text style={[styles.intro, { color: appearance.muted }]}>{state.notices.intro}</Text>
      <View style={[styles.search, { backgroundColor: appearance.input, borderColor: appearance.border }]}>
        <SearchGlyph size={16} color={appearance.mutedGlyph} />
        <TextInput
          keyboardAppearance={appearance.light ? 'light' : 'dark'}
          style={[styles.searchInput, { color: appearance.foreground }]}
          value={query}
          onChangeText={setQuery}
          placeholder={LicencesCopy.searchPlaceholder}
          placeholderTextColor={appearance.muted}
          accessibilityLabel={LicencesCopy.searchPlaceholder}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          clearButtonMode="never"
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={LicencesCopy.clearSearch}
            style={styles.clear}
            onPress={() => setQuery('')}
          >
            <XGlyph size={14} color={appearance.mutedGlyph} />
          </Pressable>
        ) : null}
      </View>
      <Text style={settingsStyles.sectionHeader} accessibilityRole="header">
        {LicencesCopy.componentCount(shown.length)}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={settingsStyles.container} edges={['bottom']}>
      <FoldListFrame fold={fold}>
        <FlatList
          data={shown}
          keyExtractor={entryHeading}
          renderItem={renderItem}
          ListHeaderComponent={header}
          ListEmptyComponent={<Caption>{LicencesCopy.noMatches}</Caption>}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          style={edges.scroll}
          contentContainerStyle={[contentStyle, edges.content]}
        />
      </FoldListFrame>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  status: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 24,
  },
  header: {
    gap: 8,
  },
  intro: {
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 4,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingLeft: 12,
    borderRadius: GhostexRadii.row,
    borderWidth: GhostexStrokeWidth,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 8,
  },
  clear: {
    width: 44,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
