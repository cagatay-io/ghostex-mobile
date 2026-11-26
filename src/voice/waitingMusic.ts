/**
 * Waiting music in a voice agent call on this phone: a quiet loop while the agent thinks or runs a tool, so silence
 * does not sound like a dropped call. This file keeps the setting (on or off, its own volume, the piece), saved on this
 * phone, hands it to the native call, and plays Settings › Voice's preview. When the music plays is decided natively
 * from the call's own `state` frames and reply audio (`GhostexWaitingMusicGate` in GhostexVoiceAudio.swift, which
 * holds the DECISION, and `WaitingMusicGate` in GhostexVoiceAudio.kt), so it works with the phone locked.
 *
 * CDXC:VoiceMode 2026-11-26 DECISION: The settings belong to this phone, one set per device, and the computer and its
 * desktop app are unchanged: a phone in a car holder can be set up differently from another one. They are on by
 * default at 30 % of the call's playback, with four CC0 pieces to choose from (music/PROVENANCE.md), each with a short
 * preview.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Asset } from 'expo-asset';
import { create } from 'zustand';

import { GhostexNative } from '../../modules/ghostex-native/src';
import { logAppEvent } from '../app/appLog';

export type WaitingMusicPieceId = 'ambientRelaxingLoop' | 'heavenlyLoop' | 'slowStride' | 'calmLoop';

export type WaitingMusicPiece = {
  readonly id: WaitingMusicPieceId;
  readonly title: string;
  readonly author: string;
  /** Metro's asset id of the bundled `.m4a`. */
  readonly asset: number;
};

/** The pieces, in Settings › Voice's order; the first is the default. */
export const WAITING_MUSIC_PIECES: readonly WaitingMusicPiece[] = [
  {
    id: 'ambientRelaxingLoop',
    title: 'Ambient Relaxing Loop',
    author: 'isaiah658',
    asset: require('./music/ambient-relaxing-loop.m4a') as number,
  },
  {
    id: 'heavenlyLoop',
    title: 'Heavenly Loop',
    author: 'isaiah658',
    asset: require('./music/heavenly-loop.m4a') as number,
  },
  { id: 'slowStride', title: 'Slow Stride', author: 'isaiah658', asset: require('./music/slow-stride.m4a') as number },
  { id: 'calmLoop', title: 'Calm Loop', author: 'wipics', asset: require('./music/calm-loop.m4a') as number },
];

export type WaitingMusicSettings = {
  enabled: boolean;
  /** Percent of the call's playback, the agent's voice playing at 100. */
  volumePercent: number;
  piece: WaitingMusicPieceId;
};

export const WAITING_MUSIC_VOLUME_MIN = 5;
export const WAITING_MUSIC_VOLUME_MAX = 100;
export const WAITING_MUSIC_VOLUME_STEP = 5;

export const WAITING_MUSIC_DEFAULTS: WaitingMusicSettings = {
  enabled: true,
  volumePercent: 30,
  piece: 'ambientRelaxingLoop',
};

/** How long Settings › Voice's preview of a piece plays before it fades out. */
export const WAITING_MUSIC_PREVIEW_SECONDS = 8;

const STORAGE_KEY = 'voice.waitingMusic';

/** A saved value as settings: anything missing or unreadable takes its default. */
export function sanitizeWaitingMusic(value: unknown): WaitingMusicSettings {
  const record = value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const volume = record.volumePercent;
  return {
    enabled: typeof record.enabled === 'boolean' ? record.enabled : WAITING_MUSIC_DEFAULTS.enabled,
    volumePercent:
      typeof volume === 'number' && Number.isFinite(volume)
        ? Math.min(
            WAITING_MUSIC_VOLUME_MAX,
            Math.max(
              WAITING_MUSIC_VOLUME_MIN,
              Math.round(volume / WAITING_MUSIC_VOLUME_STEP) * WAITING_MUSIC_VOLUME_STEP,
            ),
          )
        : WAITING_MUSIC_DEFAULTS.volumePercent,
    piece: WAITING_MUSIC_PIECES.some((piece) => piece.id === record.piece)
      ? (record.piece as WaitingMusicPieceId)
      : WAITING_MUSIC_DEFAULTS.piece,
  };
}

/** Whether this app build plays waiting music (builds from before it have no native side for it). */
export function waitingMusicSupported(): boolean {
  return typeof GhostexNative.voiceSetWaitingMusic === 'function';
}

type WaitingMusicState = {
  settings: WaitingMusicSettings;
  /** The saved settings were read (until then `settings` holds the defaults). */
  loaded: boolean;
  /** The piece Settings › Voice previews now. */
  previewing: WaitingMusicPieceId | null;
};

export const useWaitingMusicStore = create<WaitingMusicState>(() => ({
  settings: WAITING_MUSIC_DEFAULTS,
  loaded: false,
  previewing: null,
}));

let loading: Promise<WaitingMusicSettings> | null = null;

/** Reads the saved settings once per app run; the defaults when none were saved or they can't be read. */
export function loadWaitingMusic(): Promise<WaitingMusicSettings> {
  loading ??= AsyncStorage.getItem(STORAGE_KEY)
    .then((saved) => (saved === null ? WAITING_MUSIC_DEFAULTS : sanitizeWaitingMusic(JSON.parse(saved))))
    .catch(() => WAITING_MUSIC_DEFAULTS)
    .then((settings) => {
      useWaitingMusicStore.setState({ settings, loaded: true });
      return settings;
    });
  return loading;
}

/**
 * The piece's file on this phone (expo-asset's copy), or null when this build or update has none.
 *
 * CDXC:VoiceMode 2026-11-26 WHY: expo-asset leaves the URI empty when it finds no local copy, and `downloadAsync()`
 * then answers `file:///`, a folder (CDXC:SessionChat 2026-11-02 in ChatCoreWebView.tsx), so both are taken as no file.
 */
async function pieceFile(id: WaitingMusicPieceId): Promise<string | null> {
  const piece = WAITING_MUSIC_PIECES.find((candidate) => candidate.id === id) ?? WAITING_MUSIC_PIECES[0];
  try {
    const asset = Asset.fromModule(piece.asset);
    if (asset.localUri == null && asset.uri === '') return null;
    const downloaded = await asset.downloadAsync();
    const uri = downloaded.localUri ?? '';
    return uri === '' || uri.endsWith('/') ? null : uri;
  } catch (error) {
    logAppEvent(
      `Voice agent: the waiting music ${piece.title} could not be found (${error instanceof Error ? error.message : String(error)})`,
    );
    return null;
  }
}

/**
 * Hands `settings` to the native side, for the call running now and the next ones. An app build without waiting music:
 * nothing happens.
 */
export async function sendWaitingMusic(settings: WaitingMusicSettings): Promise<void> {
  if (!waitingMusicSupported()) return;
  const path = settings.enabled ? await pieceFile(settings.piece) : null;
  await GhostexNative.voiceSetWaitingMusic?.(settings.enabled && path !== null, settings.volumePercent / 100, path);
}

/** Before a call opens: this phone's settings reach the native side. Never throws; a failure leaves the call without music. */
export async function prepareWaitingMusicForCall(): Promise<void> {
  try {
    await sendWaitingMusic(await loadWaitingMusic());
  } catch (error) {
    logAppEvent(
      `Voice agent: the waiting music could not be set up (${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

/** Settings › Voice changed a setting: shown at once, saved on this phone, and handed to a call that is running. */
export async function changeWaitingMusic(patch: Partial<WaitingMusicSettings>): Promise<void> {
  await loadWaitingMusic();
  const settings = sanitizeWaitingMusic({ ...useWaitingMusicStore.getState().settings, ...patch });
  useWaitingMusicStore.setState({ settings });
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    logAppEvent(
      `Voice agent: the waiting music setting could not be saved (${error instanceof Error ? error.message : String(error)})`,
    );
  }
  try {
    await sendWaitingMusic(settings);
  } catch (error) {
    logAppEvent(
      `Voice agent: the waiting music setting could not reach the call (${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

let previewTimer: ReturnType<typeof setTimeout> | undefined;

function clearPreviewTimer(): void {
  clearTimeout(previewTimer);
  previewTimer = undefined;
}

/** Plays a few seconds of `id` at the volume set, replacing a preview that plays. */
export async function previewWaitingMusic(id: WaitingMusicPieceId): Promise<void> {
  if (typeof GhostexNative.voicePreviewWaitingMusic !== 'function') return;
  clearPreviewTimer();
  useWaitingMusicStore.setState({ previewing: id });
  const path = await pieceFile(id);
  // Stopped, or another piece started, while the file was looked up.
  if (useWaitingMusicStore.getState().previewing !== id) return;
  if (path === null) {
    useWaitingMusicStore.setState({ previewing: null });
    return;
  }
  try {
    await GhostexNative.voicePreviewWaitingMusic(
      path,
      useWaitingMusicStore.getState().settings.volumePercent / 100,
      WAITING_MUSIC_PREVIEW_SECONDS,
    );
  } catch (error) {
    if (useWaitingMusicStore.getState().previewing === id) useWaitingMusicStore.setState({ previewing: null });
    logAppEvent(
      `Voice agent: the waiting music preview could not play (${error instanceof Error ? error.message : String(error)})`,
    );
    return;
  }
  if (useWaitingMusicStore.getState().previewing !== id) return;
  previewTimer = setTimeout(() => {
    previewTimer = undefined;
    if (useWaitingMusicStore.getState().previewing === id) useWaitingMusicStore.setState({ previewing: null });
  }, WAITING_MUSIC_PREVIEW_SECONDS * 1000);
}

/** Stops the preview (Stop, leaving Settings › Voice, turning the music off). */
export function stopWaitingMusicPreview(): void {
  clearPreviewTimer();
  if (useWaitingMusicStore.getState().previewing === null) return;
  useWaitingMusicStore.setState({ previewing: null });
  void GhostexNative.voiceStopWaitingMusicPreview?.().catch(() => undefined);
}
