/**
 * Settings › Short Replies (approved triage mockup): the replies the folded triage offers on a waiting session, in
 * their order on the cards. Every entry is a text field changed in place, × removes it, Add Reply adds an empty one.
 * Each change is stored at once (`shortReplies` in `settings.v1`), so the stored list is the list shown; an entry left
 * empty is not kept and leaves the page when its field loses focus.
 */

import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { PlusGlyph, XGlyph } from '../../components/sessions/icons';
import { ShortRepliesCopy } from '../../copy';
import { keptShortReplies, useSettingsStore } from '../../settings/store';
import { useAppearance } from '../../theme/useAppearance';
import { Caption, SettingsScreenLayout, useSettingsStyles } from './SettingsControls';

/** One field on the page: the stored entries, plus an empty one being written. */
type Row = { readonly id: number; readonly text: string };

export default function ShortRepliesPage() {
  const styles = useSettingsStyles();
  const appearance = useAppearance();
  const stored = useSettingsStore((state) => state.settings.shortReplies);
  const setSetting = useSettingsStore((state) => state.setSetting);
  const [rows, setRows] = useState<readonly Row[]>(() => stored.map((text, id) => ({ id, text })));
  const [nextId, setNextId] = useState(stored.length);
  const [focusId, setFocusId] = useState<number | null>(null);

  const change = (next: readonly Row[]): void => {
    setRows(next);
    setSetting('shortReplies', keptShortReplies(next.map((row) => row.text)));
  };

  return (
    <SettingsScreenLayout intro={ShortRepliesCopy.intro}>
      {rows.map((row, index) => (
        <View key={row.id} style={styles.row}>
          <TextInput
            accessibilityLabel={ShortRepliesCopy.entry(index + 1)}
            autoFocus={row.id === focusId}
            autoCorrect={false}
            returnKeyType="done"
            style={[styles.rowLabel, local.field]}
            placeholderTextColor={appearance.muted}
            value={row.text}
            onChangeText={(text) => change(rows.map((entry) => (entry.id === row.id ? { ...entry, text } : entry)))}
            onBlur={() => {
              // An empty entry is not kept: it leaves the page once it is no longer being written.
              if (row.text.trim().length === 0) setRows((current) => current.filter((entry) => entry.id !== row.id));
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={ShortRepliesCopy.remove(row.text)}
            hitSlop={8}
            style={local.remove}
            onPress={() => change(rows.filter((entry) => entry.id !== row.id))}
          >
            <XGlyph size={14} color={appearance.muted} />
          </Pressable>
        </View>
      ))}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={ShortRepliesCopy.add}
        style={({ pressed }) => [styles.row, local.add, pressed ? styles.rowPressed : null]}
        onPress={() => {
          setRows((current) => [...current, { id: nextId, text: '' }]);
          setFocusId(nextId);
          setNextId(nextId + 1);
        }}
      >
        <PlusGlyph size={18} color={appearance.foreground} />
        <Text style={styles.rowLabel}>{ShortRepliesCopy.add}</Text>
      </Pressable>
      <Caption>{ShortRepliesCopy.footer}</Caption>
    </SettingsScreenLayout>
  );
}

const local = StyleSheet.create({
  field: { minHeight: 32, paddingVertical: 4 },
  remove: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  add: { justifyContent: 'flex-start' },
});
