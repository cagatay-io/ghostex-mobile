/**
 * Read aloud on the phone: the app's one speaker and the facts only the app knows, fed to every
 * open chat's Rust core (docs/2026-10-20/voice-mode/read-aloud-client-contract.md in the main repo).
 *
 * The core decides what is said and when; this file only keeps what spans chats: Auto-read for
 * this run of the app, which chat is on screen, whether a voice agent call is open or Dictate is
 * recording, whether the chat's computer has Read aloud switched on, and who owns the speaker. Each
 * chat host registers here (`src/chat/rust/host.ts`) and hands over the core's `speak`,
 * `stopSpeaking` and `setReadAloudAuto` effects; the speech itself is Kotlin (`GhostexSpeech.kt`).
 *
 * It also runs Voice mode while Auto-read reads the chat on screen: the foreground service's
 * "Voice mode on" notification, the headless task that keeps JavaScript timers firing with the
 * phone locked, and the background reconnects of that chat's computer.
 *
 * CDXC:VoiceMode 2026-10-21 DECISION: User (Q28): Auto-read never turns itself back on after the app was closed, on the phone and on the desktop. It is a value of this run (`autoRead` below), never saved; every chat starts with it and hears each change.
 * CDXC:VoiceMode 2026-10-22 WHY: utterances of different chats never overlap: a new `speak` takes the speaker from whatever chat had it, and that chat hears `speechEnded {interrupted: true}` at once, so its core drops what it had waiting instead of waiting on a reply that will never end.
 */

import { AppRegistry } from 'react-native';

import { GhostexNative, type SpeechEvent, type SpeechVoices } from '../../modules/ghostex-native/src';
import type { ChatReadAloudEvent, ChatSpeechSegment } from '../chat/rust/core-types';
import { chatMachineLink, keepChatLinkInBackground } from '../chat/rust/machine-link';
import { useInventoryStore } from '../inventory/store';
import type { MachineConnectionTarget } from '../machines/credentials';
import { useMachinesStore } from '../machines/store';
import { useSettingsStore } from '../settings/store';
import { useVoiceStore, voiceActive, VOICE_SUPPORTED } from './conversation';

/** The built-in feature id the computer lists in `builtInFeatures` while Read aloud is on. */
const READ_ALOUD_FEATURE = 'readAloud';
/** The headless task Voice mode holds (`startVoiceModeTask` in GhostexNativeModule.kt). */
const VOICE_MODE_TASK = 'GhostexVoiceMode';
/**
 * CDXC:VoiceMode 2026-10-21 DECISION: User (Q33): the phone's Voice mode turns itself off after the computer has been unreachable for 5 minutes, and says so in a notification.
 */
const UNREACHABLE_OFF_MS = 5 * 60_000;
/** A socket down this long shows "Reconnecting to …" (a quick reconnect stays quiet). */
const RECONNECTING_LINE_MS = 5_000;

/** One registered chat: its key (`JSON.stringify([machineId, projectId, sessionId])`) and its core's input. */
export type ReadAloudChat = {
  key: string;
  machine: MachineConnectionTarget;
  send(event: ChatReadAloudEvent): void;
  /** A short message in this chat (the host's toast). */
  toast(message: string): void;
};

/** The chat on screen as `TerminalScreen` knows it, for Voice mode's notification. */
export type ReadAloudScreenChat = { key: string; title: string; machineId: string; sessionId: string };

type Registered = ReadAloudChat & { available: boolean | null };

/** Voice mode while it runs: the chat it reads and the watch on that computer's link. */
type VoiceMode = {
  chatKey: string;
  machineId: string;
  title: string;
  sessionId: string;
  computer: string;
  reconnecting: boolean;
  unsubscribe: () => void;
  offTimer: ReturnType<typeof setTimeout> | null;
  lineTimer: ReturnType<typeof setTimeout> | null;
};

const chats = new Map<string, Registered>();
let autoRead = false;
let onScreen: ReadAloudScreenChat | null = null;
let dictating = false;
let voiceCall = false;
let engine: 'unknown' | 'starting' | 'ready' | 'missing' = 'unknown';
let installed = false;
let sequence = 0;
/** Who each live token belongs to; a token leaves once its owner has heard how it ended. */
const owners = new Map<string, { chatKey: string | null; id: string }>();
/** The token speaking now. */
let speaking: string | null = null;
let voiceMode: VoiceMode | null = null;
/** Settles the running headless task, which lets React Native pause timers again. */
let voiceModeTaskDone: (() => void) | null = null;
/** Computers already told this run that they are too old for Voice mode. */
const toldToUpdate = new Set<string>();

/** The key a chat registers under, which `TerminalScreen` names as the chat on screen. */
export function readAloudChatKey(machineId: string, projectId: string, sessionId: string): string {
  return JSON.stringify([machineId, projectId, sessionId]);
}

/** Whether a computer has Read aloud switched on (its inventory lists the feature). */
export function readAloudOnFor(machineId: string): boolean {
  const summary = useInventoryStore.getState().inventoriesByMachineId[machineId]?.summary;
  return summary?.builtInFeatures.includes(READ_ALOUD_FEATURE) === true;
}

/** Whether any configured computer has Read aloud on: the phone's Voice and Speed rows show then. */
export function useReadAloudOnAnywhere(): boolean {
  return useInventoryStore((state) =>
    Object.values(state.inventoriesByMachineId).some(
      (inventory) => inventory?.summary?.builtInFeatures.includes(READ_ALOUD_FEATURE) === true,
    ),
  );
}

function install(): void {
  if (installed || !VOICE_SUPPORTED) return;
  installed = true;
  GhostexNative.addListener('onSpeechEvent', (event: SpeechEvent) => {
    if (event.kind === 'ended') ended(event.token, event.interrupted);
    else if (event.kind === 'voiceModeStop') turnAutoReadOff();
  });
  AppRegistry.registerHeadlessTask(
    VOICE_MODE_TASK,
    () => () =>
      new Promise<void>((resolve) => {
        if (voiceMode === null) {
          resolve();
          return;
        }
        voiceModeTaskDone?.();
        voiceModeTaskDone = resolve;
      }),
  );
  useInventoryStore.subscribe(() => refreshAvailability());
  useVoiceStore.subscribe((state) => {
    const open = voiceActive(state.phase);
    if (open === voiceCall) return;
    voiceCall = open;
    broadcast({ kind: 'setVoiceConversation', open });
  });
  voiceCall = voiceActive(useVoiceStore.getState().phase);
}

/** Starts the phone's engine the first time a chat of a computer with Read aloud on needs it. */
function ensureEngine(): void {
  if (engine !== 'unknown' || !VOICE_SUPPORTED) return;
  engine = 'starting';
  void GhostexNative.speechInit()
    .then((ok) => {
      engine = ok ? 'ready' : 'missing';
    })
    .catch(() => {
      engine = 'missing';
    })
    .finally(() => refreshAvailability());
}

function refreshAvailability(): void {
  let changed = false;
  for (const chat of chats.values()) {
    const featureOn = readAloudOnFor(chat.machine.id);
    if (featureOn) ensureEngine();
    const available = featureOn && engine === 'ready';
    if (chat.available === available) continue;
    chat.available = available;
    chat.send({ kind: 'setAvailable', on: available });
    changed = true;
  }
  if (changed) syncVoiceMode();
}

function broadcast(event: ChatReadAloudEvent, except: string | null = null): void {
  for (const chat of chats.values()) if (chat.key !== except) chat.send(event);
}

/** A chat host opened: it hears every app-wide value now. Returns the unregister. */
export function registerReadAloudChat(chat: ReadAloudChat): () => void {
  install();
  const entry: Registered = { ...chat, available: null };
  chats.set(chat.key, entry);
  chat.send({ kind: 'setAuto', on: autoRead });
  chat.send({ kind: 'setVoiceConversation', open: voiceCall });
  chat.send({ kind: 'setDictating', on: dictating });
  chat.send({ kind: 'setOnScreen', on: onScreen?.key === chat.key });
  refreshAvailability();
  return () => {
    if (chats.get(chat.key) !== entry) return;
    chats.delete(chat.key);
    // A closed chat's reply stops with it; nobody is left to hear how it ended.
    for (const [token, owner] of owners) {
      if (owner.chatKey !== chat.key) continue;
      owners.delete(token);
      if (speaking === token) {
        speaking = null;
        void GhostexNative.speechStop(token).catch(() => undefined);
      }
    }
    syncVoiceMode();
  };
}

/** The core's `speak`: this chat takes the speaker. */
export function readAloudSpeak(chatKey: string | null, id: string, segments: readonly ChatSpeechSegment[]): void {
  if (!VOICE_SUPPORTED) return;
  takeSpeaker();
  sequence += 1;
  const token = `readAloud-${sequence}`;
  owners.set(token, { chatKey, id });
  speaking = token;
  const { readAloudVoice, readAloudRate } = useSettingsStore.getState().settings;
  void GhostexNative.speechSpeak(
    token,
    segments.map((segment) => segment.text),
    readAloudVoice,
    readAloudRate,
  ).catch(() => ended(token, true));
}

/** Whoever has the speaker loses it now and hears so at once. */
function takeSpeaker(): void {
  const token = speaking;
  if (token === null) return;
  speaking = null;
  ended(token, true);
}

/** The core's `stopSpeaking`: stop only if that utterance of that chat is still the one speaking. */
export function readAloudStopSpeaking(chatKey: string, id: string): void {
  const token = speaking;
  if (token === null) return;
  const owner = owners.get(token);
  if (owner?.chatKey !== chatKey || owner.id !== id) return;
  // Nothing answers a stop: the core has already forgotten the utterance.
  owners.delete(token);
  speaking = null;
  void GhostexNative.speechStop(token).catch(() => undefined);
}

/** The core's `setReadAloudAuto`: the reader switched Auto-read in `chatKey`'s ⋯ menu. */
export function readAloudSetAuto(chatKey: string, on: boolean): void {
  if (autoRead !== on) {
    autoRead = on;
    broadcast({ kind: 'setAuto', on }, chatKey);
  }
  syncVoiceMode();
}

/** The notification's Stop, Exit, or the 5-minute rule: Auto-read goes off in every chat. */
function turnAutoReadOff(): void {
  if (autoRead) {
    autoRead = false;
    broadcast({ kind: 'setAuto', on: false });
  }
  syncVoiceMode();
}

/** The chat on screen (`TerminalScreen`), or null when none is. */
export function setReadAloudOnScreen(chat: ReadAloudScreenChat | null): void {
  const previous = onScreen;
  onScreen = chat;
  if (previous?.key !== chat?.key) {
    if (previous !== null) chats.get(previous.key)?.send({ kind: 'setOnScreen', on: false });
    if (chat !== null) chats.get(chat.key)?.send({ kind: 'setOnScreen', on: true });
  }
  syncVoiceMode();
}

/** Dictate's microphone started or stopped recording (the Transcribing phase is not recording). */
export function setReadAloudDictating(on: boolean): void {
  if (on === dictating) return;
  dictating = on;
  broadcast({ kind: 'setDictating', on });
}

function ended(token: string, interrupted: boolean): void {
  if (speaking === token) speaking = null;
  const owner = owners.get(token);
  if (owner === undefined) return;
  owners.delete(token);
  if (owner.chatKey === null) return;
  chats.get(owner.chatKey)?.send({ kind: 'speechEnded', id: owner.id, interrupted });
}

// ---- Voice mode ----------------------------------------------------------------------------------

function computerName(machine: MachineConnectionTarget): string {
  const record = useMachinesStore.getState().machines.find((entry) => entry.id === machine.id);
  return record?.name !== undefined && record.name.length > 0 ? record.name : machine.username;
}

/** Voice mode runs exactly while Auto-read is on and reads a chat on screen that can be read. */
function syncVoiceMode(): void {
  if (!VOICE_SUPPORTED) return;
  const screen = onScreen;
  const chat = screen === null ? undefined : chats.get(screen.key);
  if (!autoRead || screen === null || chat === undefined || chat.available !== true) {
    endVoiceMode();
    return;
  }
  if (voiceMode !== null && voiceMode.chatKey === screen.key) {
    if (voiceMode.title !== screen.title) {
      voiceMode.title = screen.title;
      updateVoiceMode();
    }
    return;
  }
  const machine = chat.machine;
  void chatMachineLink(machine)
    .route()
    .then((route) => {
      // Still the chat to read once the route is known?
      if (!autoRead || onScreen?.key !== screen.key || chats.get(screen.key) !== chat) return;
      if (route === 'legacy') {
        endVoiceMode();
        /*
         * CDXC:VoiceMode 2026-10-21 DECISION: User (Q32): a computer too old for the live connection gets "update that computer" instead of a background poll. Auto-read still reads while Ghostex is open on the phone.
         */
        if (!toldToUpdate.has(machine.id)) {
          toldToUpdate.add(machine.id);
          chat.toast(
            `Auto-read stops while Ghostex is in the background or the phone is locked: update Ghostex on ${computerName(machine)} so it keeps reading.`,
          );
        }
        return;
      }
      beginVoiceMode(screen, chat);
    });
}

function beginVoiceMode(screen: ReadAloudScreenChat, chat: Registered): void {
  const switching = voiceMode !== null;
  if (voiceMode !== null) releaseLink(voiceMode);
  const link = chatMachineLink(chat.machine);
  const mode: VoiceMode = {
    chatKey: screen.key,
    machineId: chat.machine.id,
    title: screen.title,
    sessionId: screen.sessionId,
    computer: computerName(chat.machine),
    reconnecting: false,
    unsubscribe: () => undefined,
    offTimer: null,
    lineTimer: null,
  };
  voiceMode = mode;
  keepChatLinkInBackground(mode.machineId);
  mode.unsubscribe = link.onSocketChange((open) => linkChanged(mode, open));
  if (switching) {
    updateVoiceMode();
  } else {
    void GhostexNative.readAloudModeStart(nativeMode(mode))
      .then((notificationsShown) => {
        if (!notificationsShown && voiceMode === mode) {
          chat.toast("Ghostex can't show notifications on this phone, so Stop reading is only in this chat's ⋯ menu.");
        }
      })
      .catch(() => undefined);
  }
  if (!link.socketUp()) linkChanged(mode, false);
}

function nativeMode(mode: VoiceMode) {
  return {
    title: mode.title,
    machineId: mode.machineId,
    sessionId: mode.sessionId,
    reconnecting: mode.reconnecting ? mode.computer : null,
  };
}

function updateVoiceMode(): void {
  if (voiceMode === null) return;
  void GhostexNative.readAloudModeUpdate(nativeMode(voiceMode)).catch(() => undefined);
}

/** The read chat's computer dropped or came back: the notification line and the 5-minute rule. */
function linkChanged(mode: VoiceMode, open: boolean): void {
  if (voiceMode !== mode) return;
  if (open) {
    clearLinkTimers(mode);
    if (mode.reconnecting) {
      mode.reconnecting = false;
      updateVoiceMode();
    }
    return;
  }
  mode.lineTimer ??= setTimeout(() => {
    mode.lineTimer = null;
    if (voiceMode !== mode) return;
    mode.reconnecting = true;
    updateVoiceMode();
  }, RECONNECTING_LINE_MS);
  mode.offTimer ??= setTimeout(() => {
    mode.offTimer = null;
    if (voiceMode !== mode) return;
    turnAutoReadOff();
    void GhostexNative.readAloudModeEnded(
      'Voice mode turned off',
      `Ghostex couldn't reach ${mode.computer} for 5 minutes, so Auto-read is off. Turn it on again in the chat's ⋯ menu.`,
    ).catch(() => undefined);
  }, UNREACHABLE_OFF_MS);
}

function clearLinkTimers(mode: VoiceMode): void {
  if (mode.lineTimer !== null) clearTimeout(mode.lineTimer);
  if (mode.offTimer !== null) clearTimeout(mode.offTimer);
  mode.lineTimer = null;
  mode.offTimer = null;
}

function releaseLink(mode: VoiceMode): void {
  mode.unsubscribe();
  clearLinkTimers(mode);
}

function endVoiceMode(): void {
  const mode = voiceMode;
  if (mode === null) return;
  voiceMode = null;
  releaseLink(mode);
  keepChatLinkInBackground(null);
  void GhostexNative.readAloudModeStop().catch(() => undefined);
  voiceModeTaskDone?.();
  voiceModeTaskDone = null;
}

// ---- the Voice picker ----------------------------------------------------------------------------

/** The phone's voices for the Voice picker; starts the engine when it has not started yet. */
export async function readAloudVoices(): Promise<SpeechVoices | null> {
  if (!VOICE_SUPPORTED) return null;
  install();
  ensureEngine();
  const ok = await GhostexNative.speechInit().catch(() => false);
  if (!ok) return null;
  return GhostexNative.speechVoices();
}

/** Says one sentence with the chosen Voice and Speed (the Voice picker's preview). */
export function previewReadAloudVoice(): void {
  readAloudSpeak(null, 'preview', [{ text: 'This is how Ghostex reads replies aloud.', kind: 'prose' }]);
}
