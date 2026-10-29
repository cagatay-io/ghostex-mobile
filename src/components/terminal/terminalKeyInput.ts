/**
 * Key input of the Befehlspad and its Keys and Agent layers (REQ-KEY-004, -008, -010), the key bar's behaviour
 * unchanged (terminal-screen.md §2):
 * - Modifier latching: a tap arms Ctrl/Alt/Shift for the next key (one-shot), a long press locks it until it is
 *   tapped again; the next key keeps only the locked ones. The state is mirrored to the native view, which
 *   applies it to the software keyboard and reports when a key there used a one-shot modifier.
 * - Repeat on hold: a repeating key fires once on touch-down, then after 350 ms every 50 ms until touch-up, with
 *   the modifiers captured on the first press.
 * - Custom text actions send their text (and Enter); agent hotkey sequences send their steps 120 ms apart.
 * - A haptic tick on every press while the user's key haptics are on, a firmer one when a modifier locks.
 * Free of React and of the native module object, so the pad's logic runs under `bun test` with fakes.
 */

import type { KeyModifiers, TerminalKey } from '../../../modules/ghostex-native/src/GhostexNative.types';
import { AGENT_HOTKEY_SEQUENCE_DELAY_MS, type AgentHotkeyStep } from '../../settings/agentHotkeys';
import type { ExtraKeyModifier } from '../../settings/extraKeys';
import type { CommandPadKey } from './commandPadKeys';

export const REPEAT_DELAY_MS = 350;
export const REPEAT_INTERVAL_MS = 50;

export type ModifierMode = 'off' | 'oneShot' | 'locked';
export type ModifierState = Readonly<Record<ExtraKeyModifier, ModifierMode>>;

export const NO_MODIFIERS: ModifierState = { ctrl: 'off', alt: 'off', shift: 'off' };

/** What the native view is told about the armed modifiers. */
export function modifierPayload(state: ModifierState): KeyModifiers {
  return {
    ctrl: state.ctrl !== 'off',
    alt: state.alt !== 'off',
    shift: state.shift !== 'off',
    ctrlLocked: state.ctrl === 'locked',
    altLocked: state.alt === 'locked',
    shiftLocked: state.shift === 'locked',
  };
}

function retainLockedModifiers(state: ModifierState): ModifierState {
  return {
    ctrl: state.ctrl === 'locked' ? 'locked' : 'off',
    alt: state.alt === 'locked' ? 'locked' : 'off',
    shift: state.shift === 'locked' ? 'locked' : 'off',
  };
}

/** The native calls the input makes (`GhostexNative` in the app). */
export type TerminalKeyInputNative = {
  sendKey(sessionKey: string, key: TerminalKey, mods?: KeyModifiers): Promise<void>;
  sendText(sessionKey: string, text: string): Promise<void>;
  setKeyModifiers(sessionKey: string, mods: KeyModifiers): Promise<void>;
  pasteFromClipboard(sessionKey: string): Promise<void>;
};

export type TerminalKeyInputOptions = {
  sessionKey: string;
  native: TerminalKeyInputNative;
  /** `click` on every press, `lock` when a long press locks a modifier. */
  haptics: { click: () => void; lock: () => void };
  /** The user's key haptics setting, read at each press (`keyBarHapticsEnabled`). */
  hapticsEnabled: () => boolean;
};

/** The screen's upload as the pad's Upload key sees it (REQ-KEY-009). */
export type PadUpload = {
  /** An open session and no upload running. */
  available: boolean;
  start: () => void;
};

// A failed call means the terminal entry closed or failed; the terminal's state overlay shows that.
const ignoreClosedTerminal = (): void => undefined;

/**
 * Whether a press came from a finger's release (a touch event, which carries `changedTouches`) rather than an
 * activation without a touch: VoiceOver, Switch Control or a keyboard's activate, which React Native delivers as
 * the press alone (Pressability's non-pointer click). A key that sends on touch-down sends on such a press
 * instead, once; a cancelled touch leaves nothing behind, since the press itself says where it came from.
 */
export function pressFromTouch(event: { nativeEvent?: object } | undefined): boolean {
  return Array.isArray((event?.nativeEvent as { changedTouches?: unknown } | undefined)?.changedTouches);
}

export class TerminalKeyInput {
  private modifiers: ModifierState = NO_MODIFIERS;
  private readonly listeners = new Set<() => void>();
  private repeatDelay: ReturnType<typeof setTimeout> | null = null;
  private repeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly options: TerminalKeyInputOptions) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getModifiers = (): ModifierState => this.modifiers;

  /** Touch-down on a key: sends it once with the armed modifiers; a repeating key repeats until `stopRepeat`. */
  pressKey(key: TerminalKey, mods: KeyModifiers | undefined, repeats: boolean): void {
    this.stopRepeat();
    this.tick();
    const sent: KeyModifiers = {
      ctrl: mods?.ctrl === true || this.modifiers.ctrl !== 'off',
      alt: mods?.alt === true || this.modifiers.alt !== 'off',
      shift: mods?.shift === true || this.modifiers.shift !== 'off',
    };
    this.setModifiers(retainLockedModifiers(this.modifiers));
    this.send(key, sent);
    if (!repeats) return;
    this.repeatDelay = setTimeout(() => {
      this.repeatDelay = null;
      this.repeatInterval = setInterval(() => this.send(key, sent), REPEAT_INTERVAL_MS);
    }, REPEAT_DELAY_MS);
  }

  /** Touch-up or cancel of a held key. */
  stopRepeat(): void {
    if (this.repeatDelay !== null) {
      clearTimeout(this.repeatDelay);
      this.repeatDelay = null;
    }
    if (this.repeatInterval !== null) {
      clearInterval(this.repeatInterval);
      this.repeatInterval = null;
    }
  }

  /** A custom text action: its text, then Enter when it asks for it. */
  insertText(text: string, sendEnter: boolean): void {
    this.beginAction();
    const { native, sessionKey } = this.options;
    void native
      .sendText(sessionKey, text)
      .then(() => {
        if (sendEnter) void native.sendKey(sessionKey, 'enter', {}).catch(ignoreClosedTerminal);
      })
      .catch(ignoreClosedTerminal);
  }

  /** An agent hotkey: its steps in order, `AGENT_HOTKEY_SEQUENCE_DELAY_MS` apart. */
  sendSequence(steps: readonly AgentHotkeyStep[]): void {
    this.beginAction();
    const { native, sessionKey } = this.options;
    void (async () => {
      for (const [index, step] of steps.entries()) {
        if (index > 0) {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, AGENT_HOTKEY_SEQUENCE_DELAY_MS);
          });
        }
        await native.sendKey(sessionKey, step.key, step.mods);
      }
    })().catch(ignoreClosedTerminal);
  }

  /** The clipboard through the terminal's own Paste (iOS). */
  paste(): void {
    this.beginAction();
    void this.options.native.pasteFromClipboard(this.options.sessionKey).catch(ignoreClosedTerminal);
  }

  /** Tap: off to one-shot, otherwise off. Long press: locks, or unlocks a locked one. */
  toggleModifier(modifier: ExtraKeyModifier, longPress: boolean): void {
    const current = this.modifiers[modifier];
    if (longPress && current !== 'locked') this.tick('lock');
    else this.tick();
    const nextMode: ModifierMode = longPress
      ? current === 'locked'
        ? 'off'
        : 'locked'
      : current === 'off'
        ? 'oneShot'
        : 'off';
    const next = { ...this.modifiers, [modifier]: nextMode };
    this.setModifiers(next);
    void this.options.native
      .setKeyModifiers(this.options.sessionKey, modifierPayload(next))
      .catch(ignoreClosedTerminal);
  }

  /** The native view used the one-shot modifiers for a software-keyboard key. */
  modifiersConsumed(): void {
    this.setModifiers(retainLockedModifiers(this.modifiers));
  }

  clearModifiers(): void {
    this.setModifiers(NO_MODIFIERS);
    void this.options.native
      .setKeyModifiers(this.options.sessionKey, modifierPayload(NO_MODIFIERS))
      .catch(ignoreClosedTerminal);
  }

  /** The input is no longer shown: no repeat keeps running and the native view holds no armed modifier. */
  dispose(): void {
    this.stopRepeat();
    this.clearModifiers();
  }

  /** Whether a pad position can act now: Upload only with an open session and no upload running (REQ-KEY-009). */
  static isPadKeyEnabled(key: CommandPadKey, upload: PadUpload): boolean {
    if (key.action.kind === 'unavailable') return false;
    return key.action.kind !== 'upload' || upload.available;
  }

  /** Touch-down on a pad position: a key sends at once and, when it repeats, keeps sending while held. */
  padKeyDown(key: CommandPadKey): void {
    if (key.action.kind === 'key') this.pressKey(key.action.key, key.action.mods, key.repeats);
  }

  /**
   * A completed press on a pad position (`fromTouch`: `pressFromTouch` of its event). Everything that is not a
   * plain key acts here; a plain key sent on its touch-down already, and sends here only for an activation
   * without a touch, once.
   */
  padKeyTap(key: CommandPadKey, upload: PadUpload, fromTouch: boolean): void {
    const { action } = key;
    switch (action.kind) {
      case 'key':
        if (!fromTouch) this.pressKey(action.key, action.mods, false);
        return;
      case 'unavailable':
        return;
      case 'modifier':
        this.toggleModifier(action.modifier, false);
        return;
      case 'text':
        this.insertText(action.text, action.sendEnter);
        return;
      case 'sequence':
        this.sendSequence(action.steps);
        return;
      case 'paste':
        this.paste();
        return;
      case 'upload':
        if (!upload.available) return;
        this.tick();
        upload.start();
        return;
    }
  }

  /** A long press on a pad position: a modifier locks (or unlocks); other keys have no long press. */
  padKeyLongPress(key: CommandPadKey): void {
    if (key.action.kind === 'modifier') this.toggleModifier(key.action.modifier, true);
  }

  /** Text, sequences and paste: no repeat running, one-shot modifiers spent, locked ones kept. */
  private beginAction(): void {
    this.stopRepeat();
    this.tick();
    this.setModifiers(retainLockedModifiers(this.modifiers));
  }

  private send(key: TerminalKey, mods: KeyModifiers): void {
    void this.options.native.sendKey(this.options.sessionKey, key, mods).catch(ignoreClosedTerminal);
  }

  /** The tick of a press that sends nothing itself, such as switching a layer (`keyBarHapticsEnabled`). */
  selectionFeedback(): void {
    this.tick();
  }

  private tick(kind: 'click' | 'lock' = 'click'): void {
    if (this.options.hapticsEnabled()) this.options.haptics[kind]();
  }

  private setModifiers(next: ModifierState): void {
    const current = this.modifiers;
    if (next.ctrl === current.ctrl && next.alt === current.alt && next.shift === current.shift) return;
    this.modifiers = next;
    for (const listener of this.listeners) listener();
  }
}
