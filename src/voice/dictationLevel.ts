/**
 * How loud the microphone is while Dictate records, for the recording row's waveform
 * (`chat/native/composer/DictationWaveform.tsx`). The native recorder writes every captured chunk
 * straight into its WAV file (`GhostexVoiceRecorder.swift` / `.kt`, 24 kHz mono PCM16), so this
 * reads back what was written since its last look (`dictationReadPiece`) and turns the newest
 * 50 ms into a level from 0 to 1, mapped and smoothed the way the desktop's waveform is
 * (`apps/desktop/src/app/voice_agent/level_meter.rs`).
 *
 * CDXC:Dictate 2026-11-13 WHY: The user asked for a live waveform so they can tell their voice is
 * reaching the recording, on the phone and the desktop. The phones installed today send no level
 * events, and adding them is a native change that would block updates to them, so the level is
 * read in JavaScript from the file being written and ships over the air.
 * CDXC:Dictate 2026-11-13 DECISION: User (Q2920): "do both. We take out the JS one when native becomes live in the app." A native build that sends `level` voice events (branch `native-dictation-levels`) is used as soon as its first event arrives, and the file reader stops; removing the file reader later is deleting `readLevelsFromFile` and its call.
 * CDXC:Dictate 2026-11-18 DECISION: User: "the voice waveform doesn't react much to me speaking. Please make it react more to my voice please. Also same on pc please." The level was the window's RMS × 4, so ordinary speech (-35 to -20 dBFS) sat at 0.07 to 0.4 and mostly under the resting bar. It is now the window's loudness on a dB scale from [FLOOR_DBFS] (rest) to [CEILING_DBFS] (full), rising in 30 ms and falling in 120 ms so each word rises and the gaps between words fall back, the same on the desktop (`level_meter.rs`).
 */

import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { GhostexNative } from '../../modules/ghostex-native/src';

/** How often the level is read, as the desktop's meter: 20 times a second. */
export const LEVEL_EVERY_MS = 50;
const WAV_HEADER_BYTES = 44;
const SAMPLE_RATE = 24_000;
/** The newest 50 ms decide the level. */
const LEVEL_SAMPLES = SAMPLE_RATE / 20;
/** At most a second is read in one look, so a phone that fell behind catches up quickly. */
const MOST_BYTES = SAMPLE_RATE * 2;
/** Looks in a row that found no file before the reader gives up (a recorder with another folder). */
const MISSES_BEFORE_GIVING_UP = 40;
/** A window this quiet or quieter shows a resting bar (a room's hum sits around -55 to -45 dBFS). */
const FLOOR_DBFS = -50;
/** A window this loud or louder fills the bar (loud speech close to the microphone). */
const CEILING_DBFS = -10;
/** How fast the shown level rises to a louder window and falls back from it, in seconds. */
const RISE_SECONDS = 0.03;
const FALL_SECONDS = 0.12;
/**
 * The native recorders' own level events (`GhostexVoiceRecorder.swift` / `.kt`) are still the old
 * meter: each window's RMS × 4, smoothed rising in 75 ms and falling in 200 ms, one per 50 ms. The
 * window's RMS is recovered from two events in a row so the native level maps like the file's.
 */
const NATIVE_GAIN = 4;
const NATIVE_RISE_DECAY = Math.exp(-0.05 / 0.075);
const NATIVE_FALL_DECAY = Math.exp(-0.05 / 0.2);

/** How full a bar is for a window whose RMS is `rms` (full scale 1): its dBFS between the floor and ceiling. */
export function levelForLoudness(rms: number): number {
  if (!(rms > 0)) return 0;
  const dbfs = 20 * Math.log10(rms);
  return Math.min(1, Math.max(0, (dbfs - FLOOR_DBFS) / (CEILING_DBFS - FLOOR_DBFS)));
}

/**
 * Levels that rise in [RISE_SECONDS] and fall in [FALL_SECONDS], so a word reads without flicker.
 * Each target covers `seconds` of audio, or the time since the last one when not given.
 */
function smoother(): (target: number, seconds?: number) => number {
  let level = 0;
  let last = Date.now();
  return (target, covered) => {
    const now = Date.now();
    const seconds = covered ?? Math.max(0, now - last) / 1000;
    last = now;
    const timeConstant = target > level ? RISE_SECONDS : FALL_SECONDS;
    level = target + (level - target) * Math.exp(-seconds / timeConstant);
    return level;
  };
}

/** The window RMS behind native level event `level`, given the event before it was `previous`. */
function nativeLoudness(level: number, previous: number): number {
  if (level === previous) return level / NATIVE_GAIN;
  const decay = level > previous ? NATIVE_RISE_DECAY : NATIVE_FALL_DECAY;
  return Math.max(0, (level - decay * previous) / (1 - decay)) / NATIVE_GAIN;
}

/** The file recording `id` is written to: the recorders' `dictation-recordings` folder. */
export function recordingPath(id: string): string | null {
  try {
    const folder =
      Platform.OS === 'ios'
        ? new Directory(Paths.document.parentDirectory, 'Library', 'Application Support', 'dictation-recordings')
        : new Directory(Paths.document, 'dictation-recordings');
    return decodeURIComponent(new File(folder, `${id}.wav`).uri.replace(/^file:\/\//, ''));
  } catch {
    return null;
  }
}

/** RMS of the newest [LEVEL_SAMPLES] of little-endian PCM16 `bytes` (a binary string), full scale 1. */
function loudness(bytes: string): number {
  const count = Math.floor(bytes.length / 2);
  const from = Math.max(0, count - LEVEL_SAMPLES);
  let energy = 0;
  for (let index = from; index < count; index++) {
    let sample = bytes.charCodeAt(index * 2) | (bytes.charCodeAt(index * 2 + 1) << 8);
    if (sample >= 0x8000) sample -= 0x10000;
    const value = sample / 32768;
    energy += value * value;
  }
  return count > from ? Math.sqrt(energy / (count - from)) : 0;
}

/**
 * Calls `onLevel` about every [LEVEL_EVERY_MS] with recording `id`'s level until the returned stop
 * is called: the native recorder's own level events when this app's build sends them, else the
 * level read from the recording's file. Quiet stretches read as 0.
 */
export function watchDictationLevel(id: string, onLevel: (level: number) => void): () => void {
  let fileReader: (() => void) | null = readLevelsFromFile(id, onLevel);
  const smooth = smoother();
  let previous = 0;
  const native = GhostexNative.addListener('onVoiceEvent', (event) => {
    if (event.kind !== 'level' || event.mode !== 'dictation' || event.sessionId !== id) return;
    if (fileReader !== null) {
      fileReader();
      fileReader = null;
    }
    const rms = nativeLoudness(event.level, previous);
    previous = event.level;
    // One event per 50 ms of audio, though a chunk can bring two at once.
    onLevel(smooth(levelForLoudness(rms), LEVEL_EVERY_MS / 1000));
  });
  return () => {
    fileReader?.();
    native.remove();
  };
}

/** The level of recording `id` read back from its file (phones whose build sends no level events). */
function readLevelsFromFile(id: string, onLevel: (level: number) => void): () => void {
  const path = recordingPath(id);
  if (path === null) return () => undefined;
  let offset = WAV_HEADER_BYTES;
  const smooth = smoother();
  let misses = 0;
  let busy = false;
  let live = true;
  const look = async () => {
    if (busy || !live) return;
    busy = true;
    let target = 0;
    try {
      const chunk = await GhostexNative.dictationReadPiece(path, offset, MOST_BYTES);
      misses = 0;
      if (chunk.length > 0) {
        const bytes = atob(chunk);
        // Whole samples only: a write the recorder is in the middle of is read next time.
        offset += bytes.length - (bytes.length % 2);
        target = levelForLoudness(loudness(bytes));
      }
    } catch {
      misses += 1;
    } finally {
      busy = false;
    }
    if (!live) return;
    if (misses >= MISSES_BEFORE_GIVING_UP) {
      stop();
      return;
    }
    onLevel(smooth(target));
  };
  const timer = setInterval(() => void look(), LEVEL_EVERY_MS);
  const stop = () => {
    live = false;
    clearInterval(timer);
  };
  return stop;
}
