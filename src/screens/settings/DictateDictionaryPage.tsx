/**
 * Settings › Voice › Dictionary: the words Dictate should get right on the computer picked in
 * Settings › Voice. Each word is a hint to the recognizer, and its "heard as" spellings are replaced
 * by it after transcription. The computer's project names can count as words too (drawn dashed).
 */

import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { GhostexRadii, GhostexStrokeWidth } from '../../theme/palette';
import { useAppearance } from '../../theme/useAppearance';
import { DICTIONARY_LIMITS, dictionaryProblem, parseAliases, type DictionaryWord } from '../../voice/dictateModel';
import { changeDictate, useDictateStore } from '../../voice/dictateSettings';
import { SettingsSection } from './SectionBoundary';
import { Caption, SectionHeader, SettingsScreenLayout, ToggleRow, useSettingsStyles } from './SettingsControls';
import { computerName, useVoiceComputer } from './voiceComputer';

/** Which word the editor has open: a new one, or the one at `index`. */
type Editing = { kind: 'new' } | { kind: 'word'; index: number } | null;

export default function DictateDictionaryPage() {
  const { machine } = useVoiceComputer();
  const overview = useDictateStore((state) => (machine !== null && state.loadedFor === machine.id ? state.overview : null));
  const problem = useDictateStore((state) => state.problem);
  const [editing, setEditing] = useState<Editing>(null);

  if (machine === null || overview === null) {
    return (
      <SettingsScreenLayout>
        <Caption>Open Settings › Voice first; it reads the dictionary from your computer.</Caption>
      </SettingsScreenLayout>
    );
  }
  const { dictionary, addProjectNames } = overview.settings;
  const name = computerName(machine);
  const save = (next: DictionaryWord[]) => {
    setEditing(null);
    void changeDictate(machine, { dictionary: next });
  };
  const full = dictionary.length >= DICTIONARY_LIMITS.words;

  return (
    <SettingsScreenLayout>
      <SettingsSection name="settings:dictateDictionary:words">
        <SectionHeader title={`Dictionary on ${name}`} />
        <Caption>
          Names and terms Dictate should spell your way. Add what it writes instead under "Heard as", and those
          spellings are replaced with your word.
        </Caption>
        {editing?.kind === 'new' ? (
          <WordEditor
            initial={{ word: '', aliases: [] }}
            others={dictionary}
            onCancel={() => setEditing(null)}
            onSave={(entry) => save([...dictionary, entry])}
          />
        ) : (
          <AddButton disabled={full} onPress={() => setEditing({ kind: 'new' })} />
        )}
        {full ? <Caption>{`The dictionary holds at most ${DICTIONARY_LIMITS.words} words.`}</Caption> : null}
        {dictionary.map((entry, index) =>
          editing?.kind === 'word' && editing.index === index ? (
            <WordEditor
              key={`${entry.word}-${index}`}
              initial={entry}
              others={dictionary.filter((_, at) => at !== index)}
              onCancel={() => setEditing(null)}
              onSave={(next) => save(dictionary.map((old, at) => (at === index ? next : old)))}
              onRemove={() => save(dictionary.filter((_, at) => at !== index))}
            />
          ) : (
            <WordRow key={`${entry.word}-${index}`} entry={entry} onPress={() => setEditing({ kind: 'word', index })} />
          ),
        )}
        {dictionary.length === 0 && editing === null ? <Caption>No words yet.</Caption> : null}
        {problem !== null ? <Caption>{problem}</Caption> : null}
      </SettingsSection>
      <SettingsSection name="settings:dictateDictionary:projects">
        <SectionHeader title="Project names" />
        <ToggleRow
          label="Add project names"
          detail={`The names of your projects on ${name} count as dictionary words.`}
          value={addProjectNames}
          onValueChange={(next) => void changeDictate(machine, { addProjectNames: next })}
        />
        {addProjectNames && overview.projectWords.length > 0 ? <ProjectWords words={overview.projectWords} /> : null}
      </SettingsSection>
    </SettingsScreenLayout>
  );
}

function AddButton({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
  const styles = useSettingsStyles();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed, disabled && styles.rowDisabled]}
    >
      <Text style={styles.rowLabel}>Add a word</Text>
      <Text style={styles.chevron}>+</Text>
    </Pressable>
  );
}

function WordRow({ entry, onPress }: { entry: DictionaryWord; onPress: () => void }) {
  const styles = useSettingsStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Edits the word"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.linkText}>
        <Text style={styles.cardLabel}>{entry.word}</Text>
        {entry.aliases.length > 0 ? (
          <Text style={styles.linkDescription}>{`Heard as: ${entry.aliases.join(', ')}`}</Text>
        ) : null}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function WordEditor({
  initial,
  others,
  onSave,
  onCancel,
  onRemove,
}: {
  initial: DictionaryWord;
  others: readonly DictionaryWord[];
  onSave: (entry: DictionaryWord) => void;
  onCancel: () => void;
  onRemove?: () => void;
}) {
  const styles = useSettingsStyles();
  const appearance = useAppearance();
  const [word, setWord] = useState(initial.word);
  const [aliases, setAliases] = useState(initial.aliases.join(', '));
  const [tried, setTried] = useState(false);
  const entry = { word: word.trim(), aliases: parseAliases(aliases) };
  const problem = dictionaryProblem(entry, others);

  const button = (label: string, onPress: () => void, tone: 'plain' | 'accent' | 'remove' = 'plain') => (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        local.button,
        { backgroundColor: pressed ? appearance.neutralFillPressed : appearance.neutralFill },
      ]}
    >
      <Text
        style={[
          local.buttonText,
          { color: tone === 'remove' ? '#ef9999' : appearance.foreground },
          tone === 'accent' ? local.buttonStrong : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>Word</Text>
      <TextInput
        accessibilityLabel="Word"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={initial.word.length === 0}
        maxLength={DICTIONARY_LIMITS.wordLength}
        placeholder="gxserver"
        placeholderTextColor={appearance.muted}
        spellCheck={false}
        style={styles.input}
        value={word}
        onChangeText={setWord}
      />
      <Text style={styles.cardLabel}>Heard as</Text>
      <TextInput
        accessibilityLabel="Heard as, separated by commas"
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="GX server, g x server"
        placeholderTextColor={appearance.muted}
        spellCheck={false}
        style={styles.input}
        value={aliases}
        onChangeText={setAliases}
      />
      <Text style={styles.linkDescription}>
        {`Separate spellings with commas, up to ${DICTIONARY_LIMITS.aliases}. Leave it empty to only hint the word.`}
      </Text>
      {tried && problem !== null ? <Text style={[styles.linkDescription, local.problem]}>{problem}</Text> : null}
      <View style={local.buttons}>
        {onRemove !== undefined ? button('Remove', onRemove, 'remove') : null}
        <View style={local.spacer} />
        {button('Cancel', onCancel)}
        {button(
          'Save',
          () => {
            setTried(true);
            if (problem === null) onSave(entry);
          },
          'accent',
        )}
      </View>
    </View>
  );
}

/** The computer's project names, drawn dashed: they are added on their own, not typed. */
function ProjectWords({ words }: { words: readonly string[] }) {
  const appearance = useAppearance();
  return (
    <View style={local.chips}>
      {words.map((word) => (
        <View key={word} style={[local.chip, { borderColor: appearance.muted }]}>
          <Text style={[local.chipText, { color: appearance.muted }]}>{word}</Text>
        </View>
      ))}
    </View>
  );
}

const local = StyleSheet.create({
  buttons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  spacer: { flex: 1 },
  button: { paddingHorizontal: 12, height: 32, justifyContent: 'center', borderRadius: GhostexRadii.row },
  buttonText: { fontSize: 14 },
  buttonStrong: { fontWeight: '600' },
  problem: { color: '#ef9999' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 4 },
  chip: {
    borderWidth: GhostexStrokeWidth,
    borderStyle: 'dashed',
    borderRadius: GhostexRadii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: { fontSize: 12 },
});
