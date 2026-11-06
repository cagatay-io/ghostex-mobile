/**
 * One component of Settings › Licences: its name and version, what the app uses it for, its licence and source,
 * and its licence files in full. The words stay exactly as in the notices file; only the hard line breaks inside
 * a paragraph are joined (`licenceParagraphs`), so the text reads on a narrow screen.
 */

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';

import { MONO_FONT } from '../chat/native/transcript/theme';
import { LicencesCopy } from '../copy';
import { useBundledNotices } from '../licences/bundledNotices';
import { entryHeading, licenceParagraphs, type NoticeEntry } from '../licences/notices';
import type { RootStackParamList } from '../navigation/types';
import { GhostexRadii, GhostexStrokeWidth } from '../theme/palette';
import { useAppearance } from '../theme/useAppearance';
import { NoticesStatus } from './settings/LicencesPage';
import { SettingsColumnsFrame } from './settings/SettingsColumns';
import { Caption, SettingsScreenLayout } from './settings/SettingsControls';

function NoticeBody({ entry }: { entry: NoticeEntry }) {
  const appearance = useAppearance();
  return (
    <>
      <Text style={[styles.head, { color: appearance.foreground }]} accessibilityRole="header">
        {`${entry.name} · ${entry.version}`}
      </Text>
      <Caption>{entry.about}</Caption>
      <View style={styles.meta}>
        {entry.licence === undefined ? null : (
          <View style={[styles.chip, { borderColor: appearance.border, backgroundColor: appearance.card }]}>
            <Text style={[styles.chipText, { color: appearance.foreground }]}>{entry.licence}</Text>
          </View>
        )}
        <Text style={[styles.url, { color: appearance.accent }]} selectable>
          {entry.url}
        </Text>
      </View>
      {entry.texts.map(({ file, text }) => (
        <View key={file} style={styles.file}>
          <Caption>{file}</Caption>
          <View style={[styles.textBox, { backgroundColor: appearance.input, borderColor: appearance.border }]}>
            <Text style={[styles.text, { color: appearance.foreground }]} selectable>
              {licenceParagraphs(text).join('\n\n')}
            </Text>
          </View>
        </View>
      ))}
    </>
  );
}

export default function LicenceNoticeScreen({ route }: NativeStackScreenProps<RootStackParamList, 'LicenceNotice'>) {
  const heading = entryHeading(route.params);
  const { state, retry } = useBundledNotices();
  const entry =
    state.status === 'ready' ? state.notices.entries.find((item) => entryHeading(item) === heading) : undefined;
  return (
    <SettingsColumnsFrame title={route.params.name}>
      <SettingsScreenLayout>
        {state.status !== 'ready' ? (
          <NoticesStatus state={state} retry={retry} />
        ) : entry === undefined ? (
          <Caption>{LicencesCopy.missingEntry}</Caption>
        ) : (
          <NoticeBody entry={entry} />
        )}
      </SettingsScreenLayout>
    </SettingsColumnsFrame>
  );
}

const styles = StyleSheet.create({
  head: {
    fontSize: 17,
    fontWeight: '600',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginVertical: 4,
    paddingHorizontal: 4,
  },
  chip: {
    borderWidth: GhostexStrokeWidth,
    borderRadius: GhostexRadii.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  chipText: {
    fontSize: 12,
  },
  url: {
    flexShrink: 1,
    fontSize: 12,
  },
  file: {
    gap: 4,
  },
  textBox: {
    padding: 12,
    borderRadius: GhostexRadii.row,
    borderWidth: GhostexStrokeWidth,
  },
  text: {
    fontFamily: MONO_FONT,
    fontSize: 11,
    lineHeight: 17,
  },
});
