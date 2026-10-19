/**
 * Voice mode: a spoken conversation with the manager voice agent that runs in the connected
 * computer's gxserver (docs/2026-10-20/voice-mode/voice-agent-client-contract.md).
 *
 * The phone only streams the microphone in and plays the agent out; gxserver owns the provider,
 * the API keys, the tools and the idle hang-up. The audio, the socket and its reattach ladder run in
 * Kotlin (`GhostexVoice.kt`) so the conversation keeps going with the screen locked. This file keeps
 * the state the voice screen draws (state, captions, tool rows, errors) and answers the native
 * side's `linkNeeded` by rebuilding the SSH forward to the computer.
 *
 * CDXC:VoiceMode 2026-10-20 DECISION: User: "the one in the chat box just pastes whatever i say into the chat box, while the one above is more general and for discussing". The phone's top bar has a global Voice button that starts and ends a conversation with the manager voice agent; it keeps going while you move between screens and with the phone locked ("Voice mode on" notification with Hang up). The composer's Dictate microphone is the other entry point (`src/chat/native/composer/useDictation.ts`).
 * CDXC:VoiceMode 2026-10-20 DECISION: The API keys live on the computer; the phone never stores one. When the computer has none, the phone says so and points to Ghostex Settings › Voice agent on that computer.
 */

import { PermissionsAndroid, Platform } from 'react-native';
import { create } from 'zustand';

import { GhostexNative, type VoiceEvent } from '../../modules/ghostex-native/src';
import { chatMachineLink } from '../chat/rust/machine-link';
import type { MachineConnectionTarget } from '../machines/credentials';

/** Where the conversation is: not running, opening, talking, reconnecting after a dropped link, over. */
export type VoicePhase = 'idle' | 'starting' | 'live' | 'reattaching' | 'ended';

/** gxserver's `state` frame values. */
export type VoiceAgentState = 'connecting' | 'listening' | 'userSpeaking' | 'thinking' | 'speaking' | 'toolRunning';

export type VoiceLine =
  | { kind: 'caption'; key: string; role: 'user' | 'agent'; text: string; final: boolean; cut: boolean }
  | { kind: 'tool'; key: string; label: string; finished: boolean; ok: boolean }
  | { kind: 'announcement'; key: string; text: string }
  | { kind: 'notice'; key: string; text: string };

export type VoiceProblem = { code: string; message: string };

type VoiceState = {
  phase: VoicePhase;
  machineId: string | null;
  machineName: string;
  agentState: VoiceAgentState;
  muted: boolean;
  /** Another app (a call, a navigation prompt) has the audio; the conversation waits for it. */
  paused: boolean;
  /** The tool running right now, for the state line. */
  toolLabel: string | null;
  lines: VoiceLine[];
  problem: VoiceProblem | null;
  /** Why it ended, in one sentence, once `phase` is `ended`. */
  endedMessage: string | null;
};

const INITIAL: VoiceState = {
  phase: 'idle',
  machineId: null,
  machineName: '',
  agentState: 'connecting',
  muted: false,
  paused: false,
  toolLabel: null,
  lines: [],
  problem: null,
  endedMessage: null,
};

/** Lines kept on screen; older ones scroll away for good. */
const MAX_LINES = 120;
const READ_TIMEOUT_MS = 15_000;

export const useVoiceStore = create<VoiceState>(() => INITIAL);

/** The native voice session this store follows, and the computer it talks to. */
let nativeSessionId: string | null = null;
let target: MachineConnectionTarget | null = null;
let relinking = false;
let noticeSeq = 0;
let installed = false;

/** Voice mode needs the Android voice engine; the iOS module has none yet. */
export const VOICE_SUPPORTED = Platform.OS === 'android';

/** One sentence per error code (the contract's section 3), in the phone's words. */
function problemMessage(code: string, serverMessage: string, provider: string | null): string {
  const providerName = provider === 'openai' ? 'OpenAI' : 'xAI';
  switch (code) {
    case 'noKey':
      return `Add your ${providerName} API key in Ghostex Settings › Voice agent on your computer.`;
    case 'badKey':
      return `${providerName} refused the API key saved on your computer. Check it in Ghostex Settings › Voice agent.`;
    case 'providerUnavailable':
      return `Couldn't reach the voice service from your computer. Check its internet connection and try again.`;
    case 'notFound':
      return 'That conversation already ended. Start a new one.';
    default:
      return serverMessage || 'The voice agent ran into a problem.';
  }
}

/** Why a conversation ended (`ended.reason`), in one sentence. */
function endedMessage(reason: string, serverMessage: string): string {
  switch (reason) {
    case 'user':
      return 'You hung up.';
    case 'idle':
      return 'Hung up after 5 minutes with nobody talking.';
    case 'providerClosed':
      return 'The voice service ended the conversation.';
    case 'detachedTooLong':
    case 'lost':
      return 'The phone lost the computer for too long, so the conversation ended.';
    case 'replaced':
      return 'The conversation moved to another device.';
    case 'serverShutdown':
      return 'Ghostex on the computer restarted, so the conversation ended.';
    default:
      return serverMessage || 'The conversation ended.';
  }
}

function set(partial: Partial<VoiceState>): void {
  useVoiceStore.setState(partial);
}

function pushLine(line: VoiceLine): void {
  const lines = useVoiceStore.getState().lines;
  const index = lines.findIndex((entry) => entry.key === line.key);
  const next = index >= 0 ? lines.map((entry, at) => (at === index ? line : entry)) : [...lines, line];
  set({ lines: next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next });
}

function notice(text: string): void {
  noticeSeq += 1;
  pushLine({ kind: 'notice', key: `notice-${noticeSeq}`, text });
}

function finish(message: string, problem?: VoiceProblem): void {
  nativeSessionId = null;
  set({ phase: 'ended', endedMessage: message, toolLabel: null, paused: false, ...(problem ? { problem } : {}) });
}

let currentProvider: string | null = null;

function onFrame(json: string): void {
  let frame: Record<string, unknown>;
  try {
    frame = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return;
  }
  const text = (key: string): string => (typeof frame[key] === 'string' ? (frame[key] as string) : '');
  switch (frame.type) {
    case 'ready':
      currentProvider = text('provider') || currentProvider;
      set({ phase: 'live', problem: null });
      return;
    case 'state':
      set({
        agentState: (text('state') || 'listening') as VoiceAgentState,
        ...(text('state') === 'toolRunning' ? {} : { toolLabel: null }),
      });
      return;
    case 'caption': {
      // An interrupted reply ends with one `cut` caption holding only the words that were played;
      // it replaces the reply's caption by `itemId` even when that one was already final.
      const role = frame.role === 'user' ? 'user' : 'agent';
      pushLine({
        kind: 'caption',
        key: `caption-${text('itemId')}`,
        role,
        text: text('text'),
        final: frame.final === true,
        cut: frame.cut === true,
      });
      return;
    }
    case 'tool': {
      const finished = frame.phase === 'finished';
      const label = text('label') || text('name');
      pushLine({ kind: 'tool', key: `tool-${text('callId')}`, label, finished, ok: frame.ok !== false });
      set({ toolLabel: finished ? null : label });
      return;
    }
    case 'announcement':
      noticeSeq += 1;
      pushLine({ kind: 'announcement', key: `announcement-${noticeSeq}`, text: text('text') });
      return;
    case 'error': {
      const code = text('code');
      const message = problemMessage(code, text('message'), currentProvider);
      if (frame.fatal === true) set({ problem: { code, message } });
      else notice(message);
      return;
    }
    case 'ended': {
      const reason = text('reason');
      const problem = useVoiceStore.getState().problem;
      finish(reason === 'error' && problem !== null ? problem.message : endedMessage(reason, text('message')));
      return;
    }
  }
}

/** The native link dropped: rebuild the SSH forward (and token) and hand it back. */
async function relink(): Promise<void> {
  if (relinking || target === null) return;
  relinking = true;
  try {
    const link = await chatMachineLink(target).gxserverLink({ repair: true });
    if (link !== null && nativeSessionId !== null) {
      await GhostexNative.voiceUpdateLink('conversation', link.localPort, link.authToken);
    }
  } catch {
    // The native ladder asks again on its next attempt.
  } finally {
    relinking = false;
  }
}

function onStatus(event: Extract<VoiceEvent, { kind: 'status' }>): void {
  switch (event.status) {
    case 'reattaching':
      if (useVoiceStore.getState().phase !== 'ended') set({ phase: 'reattaching' });
      return;
    case 'linkNeeded':
      void relink();
      return;
    case 'open':
      return;
    case 'focusPaused':
      set({ paused: true });
      return;
    case 'focusResumed':
      set({ paused: false });
      return;
    case 'muted':
      set({ muted: true });
      return;
    case 'unmuted':
      set({ muted: false });
      return;
    case 'micError':
      notice(event.message ?? 'The microphone stopped.');
      return;
    case 'failed':
      finish(`Couldn't reach Ghostex on ${useVoiceStore.getState().machineName}.`, {
        code: 'unreachable',
        message: `Couldn't reach Ghostex on ${useVoiceStore.getState().machineName}. Check that it is running and try again.`,
      });
      return;
    case 'lost':
      finish(endedMessage('lost', ''));
      return;
    case 'closed':
      if (useVoiceStore.getState().phase !== 'ended') {
        finish(useVoiceStore.getState().problem?.message ?? 'The conversation ended.');
      }
      nativeSessionId = null;
      return;
  }
}

/** Installs the native event listener once; also adopts a conversation that outlived a JS reload. */
export function initVoice(): void {
  if (installed || !VOICE_SUPPORTED) return;
  installed = true;
  GhostexNative.addListener('onVoiceEvent', (event) => {
    if (event.mode !== 'conversation' || event.sessionId !== nativeSessionId) return;
    if (event.kind === 'frame') onFrame(event.json);
    else onStatus(event);
  });
  void GhostexNative.voiceStatus()
    .then((status) => {
      if (status === null || nativeSessionId !== null) return;
      nativeSessionId = status.id;
      set({ ...INITIAL, phase: status.reattaching ? 'reattaching' : 'live', machineName: status.title, muted: status.muted });
    })
    .catch(() => undefined);
}

/** True while a conversation is open or opening (the button shows it, the screen controls it). */
export function voiceActive(phase: VoicePhase): boolean {
  return phase === 'starting' || phase === 'live' || phase === 'reattaching';
}

async function microphoneAllowed(): Promise<boolean> {
  const permission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
  if (await PermissionsAndroid.check(permission)) return true;
  return (await PermissionsAndroid.request(permission)) === PermissionsAndroid.RESULTS.GRANTED;
}

/**
 * Starts a conversation with the voice agent on `machine`. Never throws: every failure lands in
 * the store as a problem the voice screen shows.
 */
export async function startVoice(machine: MachineConnectionTarget, machineName: string): Promise<void> {
  if (!VOICE_SUPPORTED || voiceActive(useVoiceStore.getState().phase)) return;
  target = machine;
  currentProvider = null;
  set({ ...INITIAL, phase: 'starting', machineId: machine.id, machineName });
  const fail = (code: string, message: string) => finish(message, { code, message });
  try {
    if (!(await microphoneAllowed())) {
      fail('microphone', 'Ghostex needs microphone access to talk with the voice agent. Allow it in Android Settings › Apps › Ghostex › Permissions.');
      return;
    }
    const link = chatMachineLink(machine);
    const forward = await link.gxserverLink();
    if (forward === null) {
      fail('unreachable', `Couldn't reach Ghostex on ${machineName}. Check that it is running and try again.`);
      return;
    }
    if (!forward.capabilities.includes('voiceAgent')) {
      fail('unsupported', `Ghostex on ${machineName} has no voice agent yet. Update Ghostex on that computer.`);
      return;
    }
    const info = await link.rpc('readVoiceAgent', {}, READ_TIMEOUT_MS);
    if (info.error !== null) {
      fail('unreachable', info.error.message);
      return;
    }
    const result = (info.result ?? {}) as { provider?: string; keys?: Record<string, { configured?: boolean }> };
    const provider = result.provider === 'openai' ? 'openai' : 'xai';
    currentProvider = provider;
    if (result.keys?.[provider]?.configured !== true) {
      fail('noKey', problemMessage('noKey', '', provider));
      return;
    }
    if (useVoiceStore.getState().phase !== 'starting') return;
    nativeSessionId = await GhostexNative.voiceStart({
      mode: 'conversation',
      localPort: forward.localPort,
      authToken: forward.authToken,
      title: machineName,
    });
  } catch (error) {
    fail('unreachable', `Couldn't reach Ghostex on ${machineName}. ${error instanceof Error ? error.message : ''}`.trim());
  }
}

/** Hangs up (or abandons a conversation still opening). */
export function hangUpVoice(): void {
  const phase = useVoiceStore.getState().phase;
  if (nativeSessionId !== null) void GhostexNative.voiceEnd('conversation').catch(() => undefined);
  if (phase === 'starting' && nativeSessionId === null) finish('You hung up.');
}

export function setVoiceMuted(muted: boolean): void {
  set({ muted });
  void GhostexNative.voiceSetMuted(muted).catch(() => undefined);
}

/** "Stop talking": cuts the agent's reply. */
export function interruptVoice(): void {
  void GhostexNative.voiceInterrupt().catch(() => undefined);
}

/** Back to idle once the ended conversation is dismissed. */
export function dismissVoice(): void {
  if (useVoiceStore.getState().phase === 'ended') set(INITIAL);
}
