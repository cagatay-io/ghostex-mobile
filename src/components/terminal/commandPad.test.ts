/**
 * Run with `bun test src`. The Befehlspad's key logic, real (`terminalKeyInput.ts`, `commandPadKeys.ts`) with a fake
 * `GhostexNative` and fake timers. The expected payloads are the key bar's (TerminalKeyBar.tsx at 7acb819): a key is
 * sent with `{ ctrl, alt, shift }`, each its own modifier or an armed one; modifier state goes to `setKeyModifiers`
 * with the locked flags; agent hotkey steps go 120 ms apart.
 */

import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test';

import { defaultAgentHotkeys } from '../../settings/agentHotkeys';
import { DEFAULT_COMMAND_PAD_KEYS } from '../../settings/commandPad';
import { extraKeyCatalog, resolveStoredItem, type ExtraKeysLayout } from '../../settings/extraKeys';
import { resolveCommandPadKey, resolveCommandPadKeys, type CommandPadKey } from './commandPadKeys';
import { agentKeyPage, EXTRA_KEYS_PAGE } from './keyBarPages';
import { pressFromTouch, TerminalKeyInput, type PadUpload } from './terminalKeyInput';

const SESSION = 's1';
const sources = {
  agentProfiles: defaultAgentHotkeys(),
  extraKeysLayout: [[], []] as ExtraKeysLayout,
  pasteSupported: true,
};

function setup(hapticsOn = true) {
  const calls: unknown[][] = [];
  const haptics = { clicks: 0, locks: 0 };
  const native = {
    sendKey: (sessionKey: string, key: string, mods?: object) => {
      calls.push(['sendKey', sessionKey, key, mods]);
      return Promise.resolve();
    },
    sendText: (sessionKey: string, text: string) => {
      calls.push(['sendText', sessionKey, text]);
      return Promise.resolve();
    },
    setKeyModifiers: (sessionKey: string, mods: object) => {
      calls.push(['setKeyModifiers', sessionKey, mods]);
      return Promise.resolve();
    },
    pasteFromClipboard: (sessionKey: string) => {
      calls.push(['paste', sessionKey]);
      return Promise.resolve();
    },
  };
  const settings = { haptics: hapticsOn };
  const input = new TerminalKeyInput({
    sessionKey: SESSION,
    native,
    haptics: { click: () => (haptics.clicks += 1), lock: () => (haptics.locks += 1) },
    hapticsEnabled: () => settings.haptics,
  });
  const sent = () => calls.filter((call) => call[0] === 'sendKey').map((call) => call.slice(1));
  return { calls, sent, haptics, settings, input };
}

const NO_UPLOAD: PadUpload = { available: false, start: () => undefined };

function tap(input: TerminalKeyInput, key: CommandPadKey, upload: PadUpload = NO_UPLOAD): void {
  input.padKeyDown(key);
  input.stopRepeat();
  input.padKeyTap(key, upload, true);
}

function key(id: string): CommandPadKey {
  const resolved = resolveCommandPadKey(id, sources);
  if (resolved === null) throw new Error(`${id} does not resolve`);
  return resolved;
}

async function flush(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('pad keys use the terminal key input path', () => {
  test('Up tapped sends up once for the open session', () => {
    const { input, sent } = setup();
    const up = resolveCommandPadKeys(DEFAULT_COMMAND_PAD_KEYS, sources)[1];
    tap(input, up);
    expect(sent()).toEqual([[SESSION, 'up', { ctrl: false, alt: false, shift: false }]]);
  });

  test('Ctrl+C is c with Ctrl; Paste goes to the native paste', () => {
    const { input, sent, calls } = setup();
    tap(input, resolveCommandPadKeys(DEFAULT_COMMAND_PAD_KEYS, sources)[2]);
    tap(input, key('paste'));
    expect(sent()).toEqual([[SESSION, 'c', { ctrl: true, alt: false, shift: false }]]);
    expect(calls.filter((call) => call[0] === 'paste')).toEqual([['paste', SESSION]]);
  });

  test('the default nine keys in the approved order', () => {
    expect(resolveCommandPadKeys(DEFAULT_COMMAND_PAD_KEYS, sources).map((entry) => entry.label)).toEqual([
      'Esc',
      'Up',
      'Ctrl+C',
      'Left',
      'Enter',
      'Right',
      'Tab',
      'Down',
      'Upload',
    ]);
  });
});

describe('every pad key is changeable', () => {
  test('Up position set to Home sends home once', () => {
    const { input, sent } = setup();
    const ids = [...DEFAULT_COMMAND_PAD_KEYS];
    ids[1] = 'key:home';
    const home = resolveCommandPadKeys(ids, sources)[1];
    expect(home.label).toBe('Home');
    tap(input, home);
    expect(sent()).toEqual([[SESSION, 'home', { ctrl: false, alt: false, shift: false }]]);
  });

  test('a custom action on a pad position follows later edits of that action', () => {
    const layout = (text: string): ExtraKeysLayout => [
      [{ type: 'text', id: 'custom-1', label: 'GS', text, sendEnter: true }],
      [{ type: 'builtin', id: 'esc' }],
    ];
    const ids = [...DEFAULT_COMMAND_PAD_KEYS];
    ids[0] = 'custom:custom-1';
    const before = resolveCommandPadKeys(ids, { ...sources, extraKeysLayout: layout('git status') })[0];
    const after = resolveCommandPadKeys(ids, { ...sources, extraKeysLayout: layout('git diff') })[0];
    expect(before.label).toBe('GS');
    expect(after.action).toEqual({ kind: 'text', text: 'git diff', sendEnter: true });
  });

  test('a deleted custom action or agent hotkey leaves its position "Not available", sending nothing', () => {
    const { input, calls, haptics } = setup();
    const ids = [...DEFAULT_COMMAND_PAD_KEYS];
    ids[0] = 'custom:custom-gone';
    ids[4] = 'agent:claude:gone';
    const keys = resolveCommandPadKeys(ids, sources);
    for (const position of [0, 4]) {
      expect(keys[position].label).toBe('Not available');
      expect(TerminalKeyInput.isPadKeyEnabled(keys[position], { available: true, start: () => undefined })).toBe(false);
      tap(input, keys[position]);
      input.padKeyTap(keys[position], NO_UPLOAD, false);
    }
    expect(calls).toEqual([]);
    expect(haptics.clicks).toBe(0);
  });

  test('a malformed id shows the default key of its position; Paste without its native path too', () => {
    const ids = ['foo:bar', 'key:nope', 'agent:unknown:x', 'custom:', ...DEFAULT_COMMAND_PAD_KEYS.slice(4, 8), 'paste'];
    const keys = resolveCommandPadKeys(ids, { ...sources, pasteSupported: false });
    expect(keys.map((entry) => entry.label)).toEqual([
      'Esc',
      'Up',
      'Ctrl+C',
      'Left',
      'Enter',
      'Right',
      'Tab',
      'Down',
      'Upload',
    ]);
  });
});

describe('held keys repeat', () => {
  test('Up held for one second sends more than one up; release stops it', () => {
    const { input, sent } = setup();
    input.padKeyDown(key('key:up'));
    jest.advanceTimersByTime(1000);
    const held = sent().length;
    expect(held).toBeGreaterThan(1);
    input.stopRepeat();
    jest.advanceTimersByTime(1000);
    expect(sent().length).toBe(held);
  });
});

describe('Upload from the pad', () => {
  test('Upload tapped once starts the upload exactly once', () => {
    const { input } = setup();
    let starts = 0;
    tap(input, key('upload'), { available: true, start: () => (starts += 1) });
    expect(starts).toBe(1);
  });

  test('no open session: Upload disabled and starts nothing', () => {
    const { input } = setup();
    let starts = 0;
    const upload = { available: false, start: () => (starts += 1) };
    expect(TerminalKeyInput.isPadKeyEnabled(key('upload'), upload)).toBe(false);
    tap(input, key('upload'), upload);
    expect(starts).toBe(0);
  });
});

describe('every function of the key bar stays reachable', () => {
  test('every built-in key and every KEYS page item sends the key bar payload', () => {
    const builtins = extraKeyCatalog().filter((entry) => !entry.isModifier);
    for (const entry of builtins) {
      const { input, sent } = setup();
      const item = resolveStoredItem({ type: 'builtin', id: entry.id }, entry.id);
      if (item === null || item.kind !== 'key') throw new Error(entry.id);
      tap(input, key(`key:${entry.id}`));
      expect(sent()).toEqual([
        [
          SESSION,
          item.key,
          { ctrl: item.mods?.ctrl === true, alt: item.mods?.alt === true, shift: item.mods?.shift === true },
        ],
      ]);
    }
    for (const item of EXTRA_KEYS_PAGE.flat()) {
      if (item.kind !== 'key') throw new Error(item.id);
      const { input, sent } = setup();
      tap(input, key(`page:${item.id}`));
      expect(sent()).toEqual([
        [
          SESSION,
          item.key,
          { ctrl: item.mods?.ctrl === true, alt: item.mods?.alt === true, shift: item.mods?.shift === true },
        ],
      ]);
    }
  });

  test('every modifier and every agent page item is accepted', async () => {
    for (const entry of extraKeyCatalog().filter((candidate) => candidate.isModifier)) {
      const { input, calls } = setup();
      tap(input, key(`key:${entry.id}`));
      expect(calls.at(-1)?.[2]).toMatchObject({ [entry.id]: true });
    }
    for (const agentId of ['codex', 'claude', 'pi']) {
      for (const item of (agentKeyPage(agentId, sources.agentProfiles) ?? []).flat()) {
        if (item.kind !== 'sequence') throw new Error(item.id);
        const { input, sent } = setup();
        tap(input, key(`agent:${agentId}:${item.id.slice(`agent-${agentId}-`.length)}`));
        await flush();
        jest.advanceTimersByTime(120 * item.steps.length);
        await flush();
        jest.advanceTimersByTime(120 * item.steps.length);
        await flush();
        expect(sent()).toEqual(item.steps.map((step) => [SESSION, step.key, step.mods]));
      }
    }
  });

  test('Ctrl one-shot then keys, Ctrl locked then keys: the key bar modifier payloads', () => {
    const { input, sent, calls } = setup();
    const ctrl = key('key:ctrl');
    const up = key('key:up');
    tap(input, ctrl);
    expect(calls.at(-1)).toEqual([
      'setKeyModifiers',
      SESSION,
      { ctrl: true, alt: false, shift: false, ctrlLocked: false, altLocked: false, shiftLocked: false },
    ]);
    tap(input, up);
    tap(input, up);
    expect(sent()).toEqual([
      [SESSION, 'up', { ctrl: true, alt: false, shift: false }],
      [SESSION, 'up', { ctrl: false, alt: false, shift: false }],
    ]);

    const locked = setup();
    locked.input.padKeyLongPress(ctrl);
    expect(locked.calls.at(-1)).toEqual([
      'setKeyModifiers',
      SESSION,
      { ctrl: true, alt: false, shift: false, ctrlLocked: true, altLocked: false, shiftLocked: false },
    ]);
    tap(locked.input, up);
    // A software-keyboard letter used the modifiers: a lock stays.
    locked.input.modifiersConsumed();
    tap(locked.input, up);
    expect(locked.sent()).toEqual([
      [SESSION, 'up', { ctrl: true, alt: false, shift: false }],
      [SESSION, 'up', { ctrl: true, alt: false, shift: false }],
    ]);
    expect(locked.input.getModifiers().ctrl).toBe('locked');
  });

  test('an agent hotkey of two steps sends them in order, 120 ms apart', async () => {
    const { input, sent } = setup();
    tap(input, key('agent:claude:claude-exit'));
    await flush();
    expect(sent()).toEqual([[SESSION, 'c', { ctrl: true }]]);
    jest.advanceTimersByTime(119);
    await flush();
    expect(sent()).toHaveLength(1);
    jest.advanceTimersByTime(1);
    await flush();
    expect(sent()).toEqual([
      [SESSION, 'c', { ctrl: true }],
      [SESSION, 'c', { ctrl: true }],
    ]);
  });

  test('haptics fire only while the key haptics setting is on', () => {
    const off = setup(false);
    tap(off.input, key('key:up'));
    expect(off.haptics.clicks).toBe(0);
    const on = setup(true);
    tap(on.input, key('key:up'));
    expect(on.haptics.clicks).toBe(1);
  });
});

describe('fixed regressions', () => {
  test('an activation without a touch-down (VoiceOver) sends the key once; a touch then its press, once', () => {
    const { input, sent } = setup();
    const up = key('key:up');
    input.padKeyTap(up, NO_UPLOAD, false);
    tap(input, up);
    expect(sent()).toEqual([
      [SESSION, 'up', { ctrl: false, alt: false, shift: false }],
      [SESSION, 'up', { ctrl: false, alt: false, shift: false }],
    ]);
  });

  test('the activation path does not break hold-repeat', () => {
    const { input, sent } = setup();
    input.padKeyDown(key('key:up'));
    jest.advanceTimersByTime(1000);
    input.stopRepeat();
    const held = sent().length;
    input.padKeyTap(key('key:up'), NO_UPLOAD, true);
    expect(held).toBeGreaterThan(1);
    expect(sent().length).toBe(held);
  });

  test('a cancelled touch leaves nothing behind: a later VoiceOver activation still sends once', () => {
    const { input, sent } = setup();
    const up = key('key:up');
    input.padKeyDown(up);
    input.stopRepeat();
    input.padKeyTap(up, NO_UPLOAD, false);
    expect(sent()).toHaveLength(2);
  });

  test('a touch release carries changedTouches, an accessibility activation does not', () => {
    expect(pressFromTouch({ nativeEvent: { changedTouches: [], touches: [] } })).toBe(true);
    expect(pressFromTouch({ nativeEvent: { target: 12 } })).toBe(false);
    expect(pressFromTouch(undefined)).toBe(false);
  });

  test('the layer-selection tick follows the key haptics setting', () => {
    const on = setup(true);
    on.input.selectionFeedback();
    const off = setup(false);
    off.input.selectionFeedback();
    expect([on.haptics.clicks, off.haptics.clicks]).toEqual([1, 0]);
  });
});

describe('the empty hotkey id is malformed, not deleted', () => {
  test('agent:claude: (no hotkey id) shows the default key of its position', () => {
    const ids = [...DEFAULT_COMMAND_PAD_KEYS];
    ids[4] = 'agent:claude:';
    expect(resolveCommandPadKeys(ids, sources)[4].label).toBe('Enter');
  });
});
