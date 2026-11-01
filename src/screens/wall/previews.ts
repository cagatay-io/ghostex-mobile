/**
 * The session wall's live thumbnails: what each tile shows and when it is read again.
 *
 * Source: gxserver's `readSessionTerminalTail` (`tailClient.ts`), the screen's last lines with their colour codes
 * removed, which the computer already answers for the chat's not-ready card; the phone needs no new host data, and a
 * phone-side render would need a live terminal per tile.
 *
 * Refresh only while visible, for battery and bandwidth: while the tiles view is shown (the caller decides: the
 * switch offered, tiles chosen, the Sessions screen in front, the app in the foreground) every tile is read once,
 * again at once when its session's status changes, and every `WALL_REFRESH_MS` while its session is working or has
 * background work; at most `WALL_MAX_READS` reads at a time, since they share the computer's SSH connection with the
 * terminals, and never two for one session. Hidden, nothing is read; shown again, every tile is read once.
 *
 * Free of React Native, so the rule is testable under `bun test`; `useWallPreviews.ts` wires it to the screen.
 */

import { create } from 'zustand';

import { projectFoldSections } from '../../components/sessions/projectFold';
import { hasBackgroundWork } from '../../components/sessions/sessionStatus';
import type { DrawerBlock, ProjectCardBlock } from '../../components/sessions/drawerModel';
import type { DrawerItem, SessionItem } from '../../contract/grouping';
import type { IntervalTimers } from '../../inventory/summaryRefresh';
import { statusBadge } from './badge';

/** The summary poll's interval: a working session's tile moves on as often as its badge can. */
export const WALL_REFRESH_MS = 5_000;
/** Reads on their way at once; the rest wait their turn. */
export const WALL_MAX_READS = 4;
/** The lines a thumbnail shows: the newest, at a size that stays readable (approved mockup). */
export const THUMB_LINES = 9;

export type Preview = { kind: 'lines'; lines: readonly string[] } | { kind: 'unavailable' };

const UNAVAILABLE: Preview = { kind: 'unavailable' };

/** One tile to read: its session, whether it changes on its own, and its status as last seen. */
export type PreviewTarget = {
  /** `machineId:sessionId`, the terminal store's session key. */
  key: string;
  machineId: string;
  projectId: string;
  sessionId: string;
  /** Working or running background work: read again every interval. */
  live: boolean;
  /** Changes with the session's status, which reads the tile again at once. */
  signature: string;
};

/** The thumbnails by session key, for each tile to pick its own (only that tile draws again). */
export const useWallPreviewStore = create<{ previews: Readonly<Record<string, Preview>> }>(() => ({ previews: {} }));

/**
 * The computer's answer (`{captured, lines, …}`) as a thumbnail. Anything else, or a screen that could not be
 * captured, is unavailable: the tile says so rather than showing an empty screen.
 */
export function previewFromTail(result: unknown): Preview {
  if (typeof result !== 'object' || result === null) return UNAVAILABLE;
  const { captured, lines } = result as { captured?: unknown; lines?: unknown };
  if (captured !== true || !Array.isArray(lines)) return UNAVAILABLE;
  const text = lines.filter((line): line is string => typeof line === 'string');
  return { kind: 'lines', lines: text.slice(-THUMB_LINES) };
}

function sessionTargets(machineId: string, items: readonly DrawerItem[]): PreviewTarget[] {
  return items
    .filter((item): item is SessionItem => item.type === 'SESSION')
    .map(({ session }) => ({
      key: `${machineId}:${session.sessionId}`,
      machineId,
      projectId: session.projectId,
      sessionId: session.sessionId,
      live: session.activity === 'working' || hasBackgroundWork(session),
      signature: `${statusBadge(session)?.kind ?? 'none'}|${session.activity}|${session.lastInteractionAt}`,
    }));
}

function cardTargets(machineId: string, card: ProjectCardBlock): PreviewTarget[] {
  if (card.header.collapsed) return [];
  const { own, groups } = projectFoldSections(card.children);
  return [
    ...sessionTargets(machineId, own),
    ...groups.flatMap((group) => (group.header.collapsed ? [] : sessionTargets(machineId, group.rows))),
  ];
}

/** The tiles the list's blocks show: what is folded away in the list shows no tile either. */
export function wallTargets(blocks: readonly DrawerBlock[]): PreviewTarget[] {
  return blocks.flatMap((block) => {
    switch (block.kind) {
      case 'project':
        return cardTargets(block.machineId, block.card);
      case 'collection':
        return block.header.collapsed ? [] : block.projects.flatMap((card) => cardTargets(block.machineId, card));
      default:
        return sessionTargets(block.machineId, [block.item]);
    }
  });
}

export type PreviewSchedulerDeps<Handle> = {
  read: (target: PreviewTarget) => Promise<Preview>;
  publish: (key: string, preview: Preview) => void;
  timers: IntervalTimers<Handle>;
};

export type PreviewScheduler = {
  /** The tiles on screen, and whether the tiles view is visible. */
  update: (visible: boolean, targets: readonly PreviewTarget[]) => void;
  /** Ends every refresh; reads still on their way publish nothing. */
  stop: () => void;
};

export function createPreviewScheduler<Handle>(deps: PreviewSchedulerDeps<Handle>): PreviewScheduler {
  let visible = false;
  let stopped = false;
  let targets = new Map<string, PreviewTarget>();
  /** The signature each tile was last read for while visible. */
  const readFor = new Map<string, string>();
  /** Reads on their way, with the signature each was asked for. */
  const inFlight = new Map<string, string>();
  const queue: string[] = [];
  let handle: Handle | null = null;

  const enqueue = (key: string): void => {
    if (!inFlight.has(key) && !queue.includes(key)) queue.push(key);
  };

  const pump = (): void => {
    while (visible && !stopped && inFlight.size < WALL_MAX_READS && queue.length > 0) {
      const key = queue.shift() as string;
      const target = targets.get(key);
      if (target === undefined) continue;
      inFlight.set(key, target.signature);
      void deps
        .read(target)
        .catch(() => UNAVAILABLE)
        .then((preview) => {
          const asked = inFlight.get(key);
          inFlight.delete(key);
          if (stopped) return;
          deps.publish(key, preview);
          // The status changed while this read was on its way: what it brought may be from before.
          const current = targets.get(key);
          if (visible && current !== undefined && current.signature !== asked) enqueue(key);
          pump();
        });
    }
  };

  const tick = (): void => {
    for (const target of targets.values()) if (target.live) enqueue(target.key);
    pump();
  };

  const stopInterval = (): void => {
    if (handle === null) return;
    deps.timers.clearInterval(handle);
    handle = null;
  };

  return {
    update: (nextVisible, list) => {
      if (stopped) return;
      targets = new Map(list.map((target) => [target.key, target]));
      for (let index = queue.length - 1; index >= 0; index -= 1) {
        if (!targets.has(queue[index])) queue.splice(index, 1);
      }
      if (!nextVisible) {
        visible = false;
        queue.length = 0;
        readFor.clear();
        stopInterval();
        return;
      }
      visible = true;
      for (const target of list) {
        if (readFor.get(target.key) === target.signature) continue;
        readFor.set(target.key, target.signature);
        enqueue(target.key);
      }
      if (handle === null) handle = deps.timers.setInterval(tick, WALL_REFRESH_MS);
      pump();
    },
    stop: () => {
      stopped = true;
      visible = false;
      queue.length = 0;
      stopInterval();
    },
  };
}
