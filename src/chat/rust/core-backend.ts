/**
 * The chat core as the host drives it, whichever brain runs it: the built-in native core
 * (`modules/gx-chat-core`, synchronous JSI) or the same Rust core as WebAssembly in the hidden
 * WebView (`wasm-core/`). Every call answers through a promise, so `host.ts` has one code path; the
 * built-in brain's promises are already resolved.
 *
 * The brain is picked when a chat opens, from Settings › Chat › Chat brain (`sessionChatBrain`).
 * SEE-ALSO: wasm-core/bridge.ts (CDXC:SessionChat 2026-10-23 DECISION).
 */

import {
  ChatCoreError,
  createChatCore,
  isChatCoreAvailable,
  type ChatCoreEffect,
  type ChatCoreQuery,
} from '../../../modules/gx-chat-core/src';

import type { ChatFrame } from './document';
import { createWasmChatCore } from './wasm-core/wasmChatCore';

export type ChatBrain = 'builtIn' | 'browserView';

/** One event's effects, or why the core refused it. */
export type HandledEvent = { ok: true; effects: ChatCoreEffect[] } | { ok: false; error: ChatCoreError };

export interface ChatCoreBackend {
  readonly brain: ChatBrain;
  /** Applies events in order; one answer per event. */
  handleBatch(events: readonly { eventJson: string; contextJson: string }[]): Promise<HandledEvent[]>;
  /** Drains the frame envelope (see `ChatCoreHandle.frame`). */
  frame(lastRevision: number | null, nowMs: number): Promise<ChatFrame>;
  /** One of the core's pure helpers, parsed. */
  query(name: ChatCoreQuery, args: readonly unknown[]): Promise<unknown>;
  /**
   * The same helper answered in this turn, for paint-time callers; `undefined` when this brain
   * cannot answer synchronously (the WebView), which then answers through {@link query}.
   */
  querySync(name: ChatCoreQuery, args: readonly unknown[]): unknown;
  /** Every core in the WebView is gone (a crash, a reload, the brain switched): rebuild the chat. */
  onLost(listener: () => void): () => void;
  dispose(): void;
}

/** The built-in native core, behind promises. */
function createNativeBackend(): ChatCoreBackend {
  if (!isChatCoreAvailable()) throw new ChatCoreError('unavailable', 'This build does not include the chat core.');
  const core = createChatCore();
  return {
    brain: 'builtIn',
    handleBatch: (events) =>
      Promise.resolve(
        events.map((event): HandledEvent => {
          try {
            return {
              ok: true,
              effects: JSON.parse(core.handle(event.eventJson, event.contextJson)) as ChatCoreEffect[],
            };
          } catch (error) {
            return {
              ok: false,
              error: error instanceof ChatCoreError ? error : new ChatCoreError('unknown', 'The chat core failed.'),
            };
          }
        }),
      ),
    frame: (lastRevision, nowMs) => {
      try {
        return Promise.resolve(JSON.parse(core.frame(lastRevision, nowMs)) as ChatFrame);
      } catch (error) {
        return Promise.reject(error);
      }
    },
    query: (name, args) => {
      try {
        return Promise.resolve(JSON.parse(core.query(name, JSON.stringify(args))) as unknown);
      } catch (error) {
        return Promise.reject(error);
      }
    },
    querySync: (name, args) => JSON.parse(core.query(name, JSON.stringify(args))) as unknown,
    onLost: () => () => undefined,
    dispose: () => core.dispose(),
  };
}

/** A fresh core for one chat on `brain`. Throws {@link ChatCoreError} `unavailable` when it cannot run. */
export function createChatCoreBackend(brain: ChatBrain): ChatCoreBackend {
  return brain === 'browserView' ? createWasmChatCore() : createNativeBackend();
}
