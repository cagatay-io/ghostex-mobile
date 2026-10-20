/**
 * The phone's Goal & Instructions and Memory editors for an orchestrator, opened from its row's
 * long-press menu. Same fields and copy as the desktop's native editors
 * (apps/desktop/src/app/window/coordinator_details_modal.rs): both edit a local copy and save it in
 * one `ghostex coordinator edit` (Memory sends the whole list), so Cancel leaves everything as it
 * was.
 *
 * SEE-ALSO: the user's decision on `coordinator_rows` in packages/gx-core/src/sidebar_menu/session.rs.
 */

import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import KeyboardAvoidingContainer from '../../components/common/keyboard/KeyboardAvoidingContainer';
import KeyboardAwareScrollView from '../../components/common/keyboard/KeyboardAwareScrollView';
import { XGlyph } from '../../components/sessions/icons';
import { GhostexPalette, GhostexStrokeWidth } from '../../theme/palette';

export type CoordinatorDetailsMode = 'goal' | 'memory';

export type CoordinatorDetails = { title: string; goal: string; instructions: string; notes: string[] };

export type CoordinatorDetailsEdit = { goal?: string; instructions?: string; notes?: string[] };

/** The `coordinator` object of `ghostex coordinator status --json`. */
export function parseCoordinatorDetails(json: unknown): CoordinatorDetails {
  const root = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {};
  const coordinator =
    typeof root.coordinator === 'object' && root.coordinator !== null
      ? (root.coordinator as Record<string, unknown>)
      : {};
  const text = (key: string): string => (typeof coordinator[key] === 'string' ? (coordinator[key] as string) : '');
  const memory = Array.isArray(coordinator.memory) ? coordinator.memory : [];
  return {
    title: text('title'),
    goal: text('goal'),
    instructions: text('instructions'),
    notes: memory.flatMap((note) => {
      const value = typeof note === 'object' && note !== null ? (note as Record<string, unknown>).text : undefined;
      return typeof value === 'string' ? [value] : [];
    }),
  };
}

/** One line, deduplicated case-insensitively against the notes already listed. */
function withNote(notes: string[], note: string): string[] {
  const text = note.split(/\s+/).filter(Boolean).join(' ');
  if (text.length === 0 || notes.some((existing) => existing.toLowerCase() === text.toLowerCase())) return notes;
  return [...notes, text];
}

export type CoordinatorDetailsSheetProps = {
  mode: CoordinatorDetailsMode;
  load: () => Promise<CoordinatorDetails>;
  /** Saves and resolves when the computer answered; a rejection keeps the sheet open with the error. */
  onSave: (edit: CoordinatorDetailsEdit) => Promise<void>;
  onCancel: () => void;
};

export default function CoordinatorDetailsSheet({ mode, load, onSave, onCancel }: CoordinatorDetailsSheetProps) {
  const [details, setDetails] = useState<CoordinatorDetails | null>(null);
  const [goal, setGoal] = useState('');
  const [instructions, setInstructions] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    load().then(
      (loaded) => {
        if (cancelled) return;
        setDetails(loaded);
        setGoal(loaded.goal);
        setInstructions(loaded.instructions);
        setNotes(loaded.notes);
      },
      (loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError));
      },
    );
    return () => {
      cancelled = true;
    };
    // Read once per opening of the sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addNote = (): void => {
    setNotes(withNote(notes, note));
    setNote('');
  };

  const save = (): void => {
    if (details === null || busy) return;
    setBusy(true);
    setError(null);
    // A note typed but not added yet is saved too, rather than dropped silently.
    const edit: CoordinatorDetailsEdit =
      mode === 'goal' ? { goal: goal.trim(), instructions: instructions.trim() } : { notes: withNote(notes, note) };
    onSave(edit).catch((saveError: unknown) => {
      setBusy(false);
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    });
  };

  const name = details !== null && details.title.length > 0 ? details.title : 'this orchestrator';
  const canSave = details !== null && !busy;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingContainer safeAreaTop style={styles.keyboardFill}>
        <Pressable style={styles.backdrop} onPress={onCancel}>
          <Pressable style={styles.card} onPress={(event) => event.stopPropagation()}>
            <KeyboardAwareScrollView contentContainerStyle={styles.cardContent}>
              <Text style={styles.title}>{mode === 'goal' ? 'Goal & Instructions' : 'Memory'}</Text>
              <Text style={styles.body}>
                {mode === 'goal'
                  ? `What ${name} works toward, and the rules its threads follow.`
                  : `Lasting preferences, decisions and pitfalls ${name} remembers.`}
              </Text>
              {details === null && error === null ? (
                <ActivityIndicator style={styles.loading} color={GhostexPalette.MUTED} />
              ) : null}
              {details !== null && mode === 'goal' ? (
                <>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Goal</Text>
                    <TextInput
                      accessibilityLabel="Goal"
                      style={styles.input}
                      value={goal}
                      onChangeText={setGoal}
                      placeholder="One line it works toward, e.g. Ship the new checkout by Friday"
                      placeholderTextColor={GhostexPalette.MUTED}
                    />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Standing instructions</Text>
                    <TextInput
                      accessibilityLabel="Standing instructions"
                      style={[styles.input, styles.multiline]}
                      value={instructions}
                      onChangeText={setInstructions}
                      multiline
                      placeholder="Rules every thread follows, e.g. Branch from main."
                      placeholderTextColor={GhostexPalette.MUTED}
                    />
                    <Text style={styles.hint}>
                      Every thread it starts from now on gets the goal and these instructions with its task.
                    </Text>
                  </View>
                </>
              ) : null}
              {details !== null && mode === 'memory' ? (
                <>
                  {notes.length === 0 ? (
                    <Text style={styles.empty}>
                      No notes yet. The orchestrator saves the lasting preferences you confirm, and you can add one
                      below.
                    </Text>
                  ) : null}
                  {notes.map((entry, index) => (
                    <View key={`${index}:${entry}`} style={styles.noteRow}>
                      <Text style={styles.noteNumber}>{`${index + 1}.`}</Text>
                      <Text style={styles.noteText}>{entry}</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove note ${index + 1}`}
                        hitSlop={8}
                        style={styles.noteRemove}
                        onPress={() => setNotes(notes.filter((_, position) => position !== index))}
                      >
                        <XGlyph size={14} color={GhostexPalette.MUTED} />
                      </Pressable>
                    </View>
                  ))}
                  <View style={styles.addRow}>
                    <TextInput
                      accessibilityLabel="New note"
                      style={[styles.input, styles.addInput]}
                      value={note}
                      onChangeText={setNote}
                      onSubmitEditing={addNote}
                      returnKeyType="done"
                      placeholder="A preference, decision or pitfall, in one line"
                      placeholderTextColor={GhostexPalette.MUTED}
                    />
                    <Pressable
                      accessibilityRole="button"
                      disabled={note.trim().length === 0}
                      style={({ pressed }) => [
                        styles.addButton,
                        pressed && styles.cancelButtonPressed,
                        note.trim().length === 0 ? styles.buttonDisabled : null,
                      ]}
                      onPress={addNote}
                    >
                      <Text style={styles.cancelLabel}>Add</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.hint}>Every thread it starts gets these notes with its task.</Text>
                </>
              ) : null}
              {error !== null ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.buttonRow}>
                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.cancelButton, pressed && styles.cancelButtonPressed]}
                  onPress={onCancel}
                >
                  <Text style={styles.cancelLabel}>Cancel</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={!canSave}
                  style={[styles.primaryButton, !canSave ? styles.buttonDisabled : null]}
                  onPress={save}
                >
                  {busy ? (
                    <ActivityIndicator color={GhostexPalette.ACCENT_FOREGROUND} />
                  ) : (
                    <Text style={styles.primaryLabel}>Save</Text>
                  )}
                </Pressable>
              </View>
            </KeyboardAwareScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingContainer>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // The same card as the New Orchestrator sheet (NewCoordinatorSheet.tsx).
  keyboardFill: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: GhostexPalette.BACKGROUND,
    borderRadius: 12,
    borderWidth: GhostexStrokeWidth,
    borderColor: GhostexPalette.BORDER,
    maxHeight: '100%',
    overflow: 'hidden',
  },
  cardContent: {
    padding: 16,
  },
  title: {
    color: GhostexPalette.FOREGROUND,
    fontSize: 17,
    fontWeight: 'bold',
  },
  body: {
    color: GhostexPalette.MUTED,
    fontSize: 12,
    marginTop: 8,
    lineHeight: 17,
  },
  field: {
    marginTop: 14,
  },
  fieldLabel: {
    color: GhostexPalette.MUTED,
    fontSize: 12,
    marginBottom: 4,
  },
  hint: {
    color: GhostexPalette.MUTED,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  input: {
    borderRadius: 8,
    borderWidth: GhostexStrokeWidth,
    borderColor: GhostexPalette.BORDER,
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: GhostexPalette.FOREGROUND,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
  },
  multiline: {
    minHeight: 120,
    maxHeight: 260,
    textAlignVertical: 'top',
  },
  loading: {
    marginTop: 16,
  },
  empty: {
    color: GhostexPalette.MUTED,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 14,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: GhostexPalette.CARD,
  },
  noteNumber: {
    color: GhostexPalette.MUTED,
    fontSize: 13,
    width: 20,
  },
  noteText: {
    flex: 1,
    color: GhostexPalette.FOREGROUND,
    fontSize: 14,
  },
  noteRemove: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  addInput: {
    flex: 1,
  },
  addButton: {
    borderRadius: 8,
    borderWidth: GhostexStrokeWidth,
    borderColor: 'transparent',
    backgroundColor: GhostexPalette.NEUTRAL_FILL,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  error: {
    color: GhostexPalette.MUTED,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 14,
  },
  buttonRow: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 8,
  },
  primaryButton: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: GhostexPalette.ACCENT,
    alignItems: 'center',
    paddingVertical: 10,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  primaryLabel: {
    color: GhostexPalette.ACCENT_FOREGROUND,
    fontSize: 14,
    fontWeight: '600',
  },
  cancelButton: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: GhostexPalette.NEUTRAL_FILL,
    alignItems: 'center',
    paddingVertical: 10,
  },
  cancelButtonPressed: {
    backgroundColor: GhostexPalette.NEUTRAL_FILL_PRESSED,
  },
  cancelLabel: {
    color: GhostexPalette.FOREGROUND,
    fontSize: 14,
  },
});
