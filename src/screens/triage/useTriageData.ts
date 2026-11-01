/**
 * What the folded triage reads beyond the computer's session list, only while it is on screen:
 *
 * - `useTriageChats`: the chat of each session whose approval or question the triage answers. It holds the session's
 *   chat host (`acquireRustChatHost`), the same chat core and warm link the session's Chat View uses (a Chat View
 *   opened meanwhile shares it), publishes only the card's part of the document (`prompt`, `questionCard`) and hands
 *   taps to that core. A session that stops needing it, and the whole triage when it leaves the screen, release it.
 * - `useTriageTails`: the last lines of a waiting session's screen for its short replies, read once per wait through
 *   the session wall's `readSessionTerminalTail` read; a refused read shows none.
 */

import { useEffect, useRef, useState } from 'react';

import type { UserAction } from '../../chat/rust/actions';
import { acquireRustChatHost } from '../../chat/rust/host';
import type { MachineConnectionTarget } from '../../machines/credentials';
import { readSessionTail } from '../wall/tailClient';
import type { TriageDocument } from './model';

export type TriageTarget = {
  /** `machineId:sessionId`, the terminal store's session key. */
  key: string;
  machine: MachineConnectionTarget;
  projectId: string;
  sessionId: string;
};

export type TriageChat = { document: TriageDocument | null; dispatch: (action: UserAction) => void };

/** The lines a short-reply card shows of its session's screen (approved mockup). */
const TAIL_LINES = 2;

export function useTriageChats(targets: readonly TriageTarget[]): Readonly<Record<string, TriageChat>> {
  const [chats, setChats] = useState<Readonly<Record<string, TriageChat>>>({});
  const held = useRef(new Map<string, () => void>());
  const latest = useRef(targets);
  latest.current = targets;
  const wanted = targets.map((target) => target.key).join('\n');

  useEffect(() => {
    const now = new Map(latest.current.map((target) => [target.key, target]));
    const dropped: string[] = [];
    for (const [key, drop] of held.current) {
      if (now.has(key)) continue;
      drop();
      held.current.delete(key);
      dropped.push(key);
    }
    for (const [key, target] of now) {
      if (held.current.has(key)) continue;
      const { host, release } = acquireRustChatHost({
        machine: target.machine,
        projectId: target.projectId,
        sessionId: target.sessionId,
      });
      const dispatch = (action: UserAction): void => host.dispatch(action);
      // A frame changes the transcript far more often than the card: only a new prompt or card draws the triage again.
      const publish = (): void => {
        const document = host.getState().document;
        setChats((current) => {
          const shown = current[key];
          if (
            shown !== undefined &&
            shown.document?.prompt === document?.prompt &&
            shown.document?.questionCard === document?.questionCard
          ) {
            return current;
          }
          const card = document === null ? null : { prompt: document.prompt, questionCard: document.questionCard };
          return { ...current, [key]: { document: card, dispatch } };
        });
      };
      const unsubscribe = host.subscribe(publish);
      held.current.set(key, () => {
        unsubscribe();
        release();
      });
      publish();
    }
    if (dropped.length > 0) {
      setChats((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !dropped.includes(key))));
    }
  }, [wanted]);

  useEffect(
    () => () => {
      for (const drop of held.current.values()) drop();
      held.current.clear();
    },
    [],
  );

  return chats;
}

/** `targets` with the wait each tail belongs to (`waitSignature`): a new wait reads the screen again. */
export function useTriageTails(
  targets: readonly (TriageTarget & { signature: string })[],
): Readonly<Record<string, readonly string[]>> {
  const [tails, setTails] = useState<Readonly<Record<string, { signature: string; lines: readonly string[] }>>>({});
  /** The waits read or being read (`key\nsignature`); a wait read once is not read again. */
  const read = useRef(new Set<string>());
  const mounted = useRef(true);
  const latest = useRef(targets);
  latest.current = targets;
  const wanted = targets.map((target) => `${target.key}\n${target.signature}`).join('\n');

  useEffect(() => {
    const waits = new Set(latest.current.map((target) => `${target.key}\n${target.signature}`));
    for (const target of latest.current) {
      const wait = `${target.key}\n${target.signature}`;
      if (read.current.has(wait)) continue;
      read.current.add(wait);
      void readSessionTail(target.machine, target.projectId, target.sessionId)
        .catch(() => ({ kind: 'unavailable' }) as const)
        .then((preview) => {
          if (!mounted.current) return;
          const lines =
            preview.kind === 'lines' ? preview.lines.filter((line) => line.trim().length > 0).slice(-TAIL_LINES) : [];
          setTails((current) => ({ ...current, [target.key]: { signature: target.signature, lines } }));
        });
    }
    // Waits that ended are forgotten, so the set stays as small as the triage.
    for (const wait of read.current) if (!waits.has(wait)) read.current.delete(wait);
  }, [wanted]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const shown: Record<string, readonly string[]> = {};
  for (const target of targets) {
    const tail = tails[target.key];
    if (tail !== undefined && tail.signature === target.signature) shown[target.key] = tail.lines;
  }
  return shown;
}
