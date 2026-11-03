/**
 * The phone's project list (`draft_project_picker.rs` and the New thread picker's project list on
 * desktop): one row per repository, with no machine on it; the machine is picked afterwards (the
 * agent menu's machine chips, the tray's machine chip). Recent projects come first; a project with
 * no open session says so. The composer's tray and the Sessions list's agent menu both open it.
 */

import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';

import type { UnifiedProjectChoice } from '../../../contract/unified/choices';
import { projectPickerRows } from '../../../contract/unified/projectList';
import { themedStyles, useTranscriptTheme } from '../transcript/theme';
import { Sheet } from './Sheet';

export function ProjectPickerSheet({
  visible,
  choices,
  title = 'Move to project',
  onClose,
  onDismissed,
  onPick,
}: {
  visible: boolean;
  choices: UnifiedProjectChoice[];
  title?: string;
  onClose: () => void;
  /** iOS: the sheet finished going away (`Sheet`). */
  onDismissed?: () => void;
  /** The picked project; it starts on `choice.machines[choice.selected]`. */
  onPick: (choice: UnifiedProjectChoice) => void;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const [query, setQuery] = useState('');
  const rows = useMemo(() => projectPickerRows(choices, query), [choices, query]);
  return (
    <Sheet visible={visible} onClose={onClose} onDismissed={onDismissed} title={title} maxHeight="70%">
      <TextInput
        accessibilityLabel="Search projects"
        placeholder="Search projects"
        placeholderTextColor={P.muted}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        autoCapitalize="none"
        style={styles.search}
      />
      <FlatList
        data={rows}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(row) => row.key}
        ListEmptyComponent={<Text style={styles.empty}>No projects match</Text>}
        renderItem={({ item }) =>
          item.kind === 'heading' ? (
            <Text style={styles.heading}>{item.label}</Text>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.choice.label}
              onPress={() => onPick(item.choice)}
              style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
            >
              <View style={styles.tile}>
                <Text style={styles.tileText}>{item.choice.label.slice(0, 1).toUpperCase()}</Text>
              </View>
              <Text numberOfLines={1} style={styles.label}>
                {item.choice.label}
              </Text>
              {item.choice.hasSessions ? null : <Text style={styles.note}>No sessions</Text>}
            </Pressable>
          )
        }
      />
    </Sheet>
  );
}

const useStyles = themedStyles((P) => ({
  search: {
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 10,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: P.border,
    color: P.primary,
    fontSize: 14,
  },
  row: {
    minHeight: 44,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pressed: { backgroundColor: P.border },
  label: { flex: 1, minWidth: 0, color: P.primary, fontSize: 14 },
  tile: {
    width: 20,
    height: 20,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: P.border,
  },
  tileText: { color: P.muted, fontSize: 11, fontWeight: '600' },
  note: { color: P.muted, fontSize: 12 },
  heading: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
    color: P.muted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  empty: { paddingHorizontal: 12, paddingVertical: 14, color: P.muted, fontSize: 14 },
}));
