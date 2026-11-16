/**
 * The transcript menu's Reply on the phone (desktop `reply_popover.rs`; the user's words are on
 * `reply_item` in `packages/gx-chat-core/src/composer/transcript_menu.rs`, CDXC:SessionChat
 * 2026-10-29 DECISION): a sheet with the quoted words, a field for the reply, and the popover's two
 * actions, Add to prompt and Send reply. The draft they leave is the core's (`transcriptReply`).
 * A phone has no Enter or Cmd+Enter for them, so Return is a new line and the two are buttons.
 *
 * A question's Reply (`question` set) also takes voice and pictures, and its first action is Reply
 * in chat box: the microphone records and the computer transcribes, as the chat box's Dictate does,
 * and the words go into the field at the caret; the photo button picks pictures, and a picture
 * pasted into the field is taken too. Pictures show as tiles under the field and go with the words
 * as the chat box's `[Image #1](path)` references.
 *
 * CDXC:Coordinators 2026-11-16 DECISION:
 * User, on issue #627 ("the Reply box has no dictation and no pictures"), picked voice and pictures
 * right in the Reply, on the desktop and the phone, and a "Reply in chat box" that puts what you
 * answer in the chat box as a pill inside the text (gx-chat-core `questions/answer_pills.rs`). A
 * recording the computer could not transcribe stays on the phone, and the chat box's microphone
 * offers it again (`voice/dictation.ts`), so a dictation is never lost.
 */

import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, Text, TextInput, View } from 'react-native';

import GhostexImageIntakeView from '../../../../modules/ghostex-native/src/GhostexImageIntakeView';
import type { MachineConnectionTarget } from '../../../machines/credentials';
import { forgetRecording, saveAndTranscribe, startRecording, stopRecording } from '../../../voice/dictation';
import { pickAttachments, type PickedFile } from '../composer/attachments';
import { Glyph } from '../composer/icons';
import { imagesFromIntake } from '../composer/imageIntake';
import { Sheet } from '../composer/Sheet';
import { themedStyles, useTranscriptTheme } from './theme';

export type ReplyAction = 'add' | 'send';

/** What a question's Reply can use for voice and pictures; without it the sheet takes words only. */
export type ReplyExtras = {
  machine: MachineConnectionTarget | null;
  uploadFiles(files: readonly PickedFile[]): Promise<string[]>;
};

/** A picture in the field: its file on the phone when picked here (`uri`), its path on the computer once saved. */
type Picture = { uri: string | null; path: string | null };

const PICTURE_REFERENCE = /\[Image #\d+\]\(([^)\n]+)\)/gu;

/** A kept draft's words and its pictures (`withPictures` wrote them), so the sheet opens with both. */
function splitPictures(draft: string): { text: string; pictures: Picture[] } {
  const pictures: Picture[] = [];
  const text = draft.replace(PICTURE_REFERENCE, (_, path: string) => {
    pictures.push({ uri: null, path });
    return '';
  });
  return { text: text.replace(/[ \t]+$/gmu, '').replace(/\n+$/u, ''), pictures };
}

/** `text` with `words` over `[start, end)`, a space kept from the words on each side. */
function typedIn(text: string, start: number, end: number, words: string): { text: string; caret: number } {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const lead = before.length > 0 && !/\s$/u.test(before) ? ' ' : '';
  const trail = after.length > 0 && !/^\s/u.test(after) ? ' ' : '';
  const typed = `${lead}${words.trim()}${trail}`;
  return { text: `${before}${typed}${after}`, caret: before.length + typed.length };
}

/** The words with the pictures' references under them, as the chat box writes a picture. */
function withPictures(reply: string, pictures: readonly Picture[]): string {
  const references = pictures
    .map((picture) => picture.path)
    .filter((path): path is string => path !== null)
    .map((path, index) => `[Image #${index + 1}](${path})`);
  if (references.length === 0) return reply;
  return `${reply.trim()}${reply.trim().length > 0 ? '\n' : ''}${references.join(' ')}`;
}

export function ReplySheet({
  quote,
  question,
  onClose,
  onReply,
  initialText = '',
  onChangeText,
  extras,
}: {
  /** The Reply row's `quote` (Add to Chat's text); null closes the sheet. */
  quote: string | null;
  /**
   * Set when it answers a question, form, page or work item instead: what it is about, by its
   * title or the question's words (gx-chat-core `reply_name`), never its Q tags; empty when the
   * opener has no name for it.
   */
  question?: string;
  onClose: () => void;
  onReply: (quote: string, reply: string, action: ReplyAction) => void;
  /** The words it opens with: a work item Reply's kept draft (`replyDrafts.ts`). */
  initialText?: string;
  /** Every edit, so a work item Reply keeps its draft however the sheet closes. */
  onChangeText?: (text: string) => void;
  /** Voice and pictures, for a question's Reply. */
  extras?: ReplyExtras;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const [text, setText] = useState('');
  const [pictures, setPictures] = useState<Picture[]>([]);
  const [voice, setVoice] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const [placed, setPlaced] = useState<{ start: number; end: number } | null>(null);
  const selection = useRef({ start: 0, end: 0 });
  const textRef = useRef('');
  textRef.current = text;
  const open = useRef(false);
  open.current = quote !== null;
  /** Where the draft is kept, as it was while the sheet was open: words or a picture that arrive after it closed are kept there too. */
  const keep = useRef(onChangeText);
  if (quote !== null) keep.current = onChangeText;
  // Every Reply starts with the session's Reply draft, its pictures as tiles (`replyDrafts.ts`).
  useEffect(() => {
    if (quote !== null) {
      const kept = splitPictures(initialText);
      setText(kept.text);
      selection.current = { start: kept.text.length, end: kept.text.length };
      setPictures(kept.pictures);
      setStatus(null);
    }
    // Only a new opening resets the field; the draft follows the typing, not the other way round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote]);
  // The draft is kept on every change of its words or pictures, also one that arrives after the
  // sheet closed (a transcription, a picture saved).
  const loaded = useRef(false);
  useEffect(() => {
    if (!loaded.current) {
      loaded.current = true;
      return;
    }
    (open.current ? onChangeText : keep.current)?.(withPictures(text, pictures));
    // Only a change of the draft itself keeps it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, pictures]);
  // A placed caret is handed to the field once, then released to the reader.
  useEffect(() => {
    if (placed !== null) setPlaced(null);
  }, [placed]);
  const write = (next: string, caret: number) => {
    setText(next);
    selection.current = { start: caret, end: caret };
    setPlaced({ start: caret, end: caret });
  };
  // Closing while it records stops the microphone; the recording waits on the phone for the chat
  // box's Transcribe (it is never lost).
  useEffect(() => {
    if (quote === null && voice === 'recording') {
      void stopRecording(false);
      setVoice('idle');
    }
  }, [quote, voice]);

  const addPictures = (files: readonly PickedFile[]) => {
    if (extras === undefined || files.length === 0) return;
    const added: Picture[] = files.map((file) => ({ uri: file.uri, path: null }));
    setPictures((current) => [...current, ...added]);
    setStatus({ text: files.length > 1 ? 'Saving the pictures…' : 'Saving the picture…', error: false });
    extras
      .uploadFiles(files)
      .then((paths) => {
        setPictures((current) =>
          current.map((picture) => {
            const index = added.indexOf(picture);
            return index >= 0 ? { ...picture, path: paths[index] ?? null } : picture;
          }),
        );
        setStatus(null);
      })
      .catch((error: unknown) => {
        setPictures((current) => current.filter((picture) => !added.includes(picture)));
        setStatus({ text: error instanceof Error ? error.message : 'The picture could not be saved.', error: true });
      });
  };

  const pickPictures = () => {
    pickAttachments('library').then(addPictures, (error: unknown) =>
      setStatus({ text: error instanceof Error ? error.message : 'The pictures could not be opened.', error: true }),
    );
  };

  const toggleVoice = async () => {
    const machine = extras?.machine ?? null;
    if (machine === null || voice === 'transcribing') return;
    if (voice === 'idle') {
      const started = await startRecording((message) => {
        setVoice('idle');
        setStatus({ text: message, error: true });
      });
      if ('error' in started) {
        setStatus({ text: started.error, error: true });
        return;
      }
      setStatus(null);
      setVoice('recording');
      return;
    }
    setVoice('transcribing');
    const recording = await stopRecording(false);
    if (recording === null) {
      setVoice('idle');
      return;
    }
    const result = await saveAndTranscribe(machine, { kind: 'local', recording }, () => false, () => undefined);
    setVoice('idle');
    if (result?.kind === 'text' && result.text.trim().length > 0) {
      // Closed meanwhile: the words go at the end of the kept draft.
      const { start, end } = open.current ? selection.current : { start: textRef.current.length, end: textRef.current.length };
      const typed = typedIn(textRef.current, start, end, result.text);
      write(typed.text, typed.caret);
      await forgetRecording(recording.id);
      return;
    }
    if (result?.kind === 'nothing') setStatus({ text: 'Nothing was heard.', error: true });
    else if (result?.kind === 'failed') setStatus({ text: `${result.message} The chat box's microphone offers it again.`, error: true });
  };

  // The quoted words as the reader selected them, without the `> ` markers.
  const preview = (quote ?? '')
    .trim()
    .split('\n')
    .map((line) => line.replace(/^> ?/u, ''))
    .join('\n')
    .trim();
  const saving = pictures.some((picture) => picture.path === null);
  const button = (label: string, action: ReplyAction, primary: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={saving || voice !== 'idle'}
      onPress={() => {
        if (quote !== null) onReply(quote, withPictures(text, pictures), action);
      }}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.primary : null,
        pressed ? (primary ? styles.primaryPressed : styles.pressed) : null,
        saving || voice !== 'idle' ? styles.disabled : null,
      ]}
    >
      <Text style={[styles.buttonText, primary ? styles.primaryText : null]}>{label}</Text>
    </Pressable>
  );
  const iconButton = (label: string, glyph: 'microphone' | 'player-stop' | 'photo', onPress: () => void, live = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.icon, pressed ? styles.pressed : null]}
    >
      <Glyph name={glyph} size={19} color={live ? P.ring : P.foreground} />
    </Pressable>
  );
  const field = (
    <TextInput
      value={text}
      onChangeText={setText}
      onSelectionChange={(event) => {
        selection.current = event.nativeEvent.selection;
      }}
      selection={placed ?? undefined}
      multiline
      autoFocus
      placeholder={question !== undefined ? 'Your answer…' : 'Reply…'}
      placeholderTextColor={P.placeholder}
      accessibilityLabel={question === undefined ? 'Reply' : question.length > 0 ? `Your answer about ${question}` : 'Your answer'}
      style={styles.input}
    />
  );
  return (
    <Sheet visible={quote !== null} onClose={onClose} title={question === undefined ? 'Reply' : question.length > 0 ? question : 'Your answer'}>
      <View style={styles.body}>
        {preview.length > 0 ? (
          <Text style={styles.quote} numberOfLines={3}>
            {preview}
          </Text>
        ) : null}
        {extras !== undefined ? (
          <GhostexImageIntakeView
            onImages={(event: { nativeEvent: unknown }) => {
              const { files, failed } = imagesFromIntake(event.nativeEvent);
              if (files.length > 0) addPictures(files);
              else if (failed > 0) setStatus({ text: 'The pasted picture could not be read.', error: true });
            }}
          >
            {field}
          </GhostexImageIntakeView>
        ) : (
          field
        )}
        {pictures.length > 0 ? (
          <View style={styles.tiles}>
            {pictures.map((picture, index) => (
              <View key={`${picture.uri ?? picture.path}-${index}`} style={styles.tile}>
                {picture.uri !== null ? (
                  <Image source={{ uri: picture.uri }} style={styles.tileImage} />
                ) : (
                  <View style={[styles.tileImage, styles.tileKept]}>
                    <Glyph name="photo" size={18} color={P.muted} />
                  </View>
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove picture ${index + 1}`}
                  hitSlop={8}
                  onPress={() => setPictures((current) => current.filter((other) => other !== picture))}
                  style={styles.tileRemove}
                >
                  <Glyph name="x" size={11} color={P.foreground} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        {status !== null || voice !== 'idle' ? (
          <Text style={[styles.status, status?.error === true ? { color: P.error } : null]} numberOfLines={2}>
            {voice === 'recording' ? 'Listening…' : voice === 'transcribing' ? 'Transcribing…' : status?.text}
          </Text>
        ) : null}
        <View style={styles.footer}>
          {extras !== undefined ? (
            <View style={styles.tools}>
              {extras.machine !== null
                ? iconButton(
                    voice === 'idle' ? 'Dictate' : 'Stop dictating',
                    voice === 'idle' ? 'microphone' : 'player-stop',
                    () => void toggleVoice(),
                    voice !== 'idle',
                  )
                : null}
              {iconButton('Add pictures', 'photo', pickPictures)}
            </View>
          ) : null}
          <View style={styles.actions}>
            {question !== undefined
              ? extras !== undefined
                ? button('Reply in chat box', 'add', false)
                : null
              : button('Add to prompt', 'add', false)}
            {button(question !== undefined ? 'Send answer' : 'Send reply', 'send', true)}
          </View>
        </View>
      </View>
    </Sheet>
  );
}

const useStyles = themedStyles((P) => ({
  body: { gap: 10, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4 },
  quote: {
    color: P.muted,
    fontSize: 13,
    lineHeight: 18,
    borderLeftWidth: 2,
    borderLeftColor: P.border,
    paddingLeft: 10,
  },
  input: {
    color: P.foreground,
    fontSize: 15,
    lineHeight: 20,
    minHeight: 84,
    maxHeight: 160,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: P.inputBorder,
    backgroundColor: P.input,
    textAlignVertical: 'top' as const,
  },
  tiles: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  tile: { width: 56, height: 48 },
  tileImage: { width: 56, height: 48, borderRadius: 8, borderWidth: 1, borderColor: P.border },
  tileKept: { alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: P.neutralFill },
  tileRemove: {
    position: 'absolute' as const,
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: P.neutralFill,
    borderWidth: 1,
    borderColor: P.border,
  },
  status: { color: P.muted, fontSize: 13, lineHeight: 18 },
  footer: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    rowGap: 8,
  },
  tools: { flexDirection: 'row' as const, gap: 8 },
  actions: { flexDirection: 'row' as const, justifyContent: 'flex-end' as const, gap: 8, flexGrow: 1 },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: P.neutralFill,
  },
  button: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: P.neutralFill,
  },
  pressed: { backgroundColor: P.neutralFillPressed },
  disabled: { opacity: 0.5 },
  primary: { backgroundColor: P.foreground },
  primaryPressed: { opacity: 0.8 },
  buttonText: { color: P.foreground, fontSize: 14, fontWeight: '600' as const },
  primaryText: { color: P.background },
}));
