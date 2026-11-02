/**
 * The box pill's words: the phone's twin of the desktop header's box chip
 * (`apps/desktop/src/app/render/workarea_header/box_chip.rs`).
 *
 * CDXC:CloudBoxes 2026-11-02 DECISION:
 * User (Q1028 D2 "time and money", Q1017 "chip and settings"): the session header shows a pill
 * `● ☁ box-c31 · 42m · ≈$0.02` on every chat that runs on a cloud box; on the phone its actions
 * (Stop, Delete, Pull branch, Open PR) open on a long press, like a message's.
 */

import { isReachable, isStarting, type CloudBox, type CloudBoxState } from './types';

/** `42m`, `3h 05m`, from when the current run started. */
export function runningFor(startedAt: string | undefined, nowMs: number): string | null {
  if (startedAt === undefined) return null;
  const started = Date.parse(startedAt);
  if (!Number.isFinite(started)) return null;
  const minutes = Math.max(0, Math.floor((nowMs - started) / 60_000));
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

export function money(usd: number): string {
  return usd < 0.1 ? `$${usd.toFixed(3)}` : `$${usd.toFixed(2)}`;
}

/** The chip's dot (box_chip.rs `state_color`). */
export function chipDotColor(state: CloudBoxState): string {
  if (isStarting(state)) return '#3b82f6';
  if (state === 'running') return '#22c55e';
  if (state === 'idle') return '#f59e0b';
  if (state === 'failed') return '#ef4444';
  return '#8a8a8a';
}

function stateWords(box: CloudBox): string {
  if (isStarting(box.state)) return 'starting';
  if (box.state === 'idle') return box.stateDetail ?? 'idle';
  return box.state;
}

/** `box-c31 · 42m · ≈$0.020`, or the state in place of the time while it is not up. */
export function chipLabel(box: CloudBox, nowMs: number): string {
  const parts = [box.name.length > 0 ? box.name : 'Cloud box'];
  if (isReachable(box.state)) {
    const time = runningFor(box.startedAt, nowMs);
    if (time !== null) parts.push(time);
  } else {
    parts.push(stateWords(box));
  }
  if (box.costTotalUsd !== undefined) parts.push(`≈${money(box.costTotalUsd)}`);
  return parts.join(' · ');
}

/** What the pill's long press shows above its actions: provider, size, rate and spend. */
export function chipDetail(box: CloudBox): string {
  const lines: string[] = [box.provider === 'instabox' ? 'Instabox' : box.provider === 'boat' ? 'Boat' : box.provider === 'local' ? 'Local (Docker)' : box.provider];
  const size = /^(\d+)x(\d+)$/u.exec(box.size ?? '');
  if (size !== null) lines.push(`${size[1]} vCPU · ${size[2]} GB`);
  if (box.usdPerHour !== undefined) lines.push(`≈${money(box.usdPerHour)}/h`);
  if (box.costTotalUsd !== undefined) {
    lines.push(`${money(box.costTotalUsd)} so far${box.costEstimated === true ? ' (estimate)' : ''}`);
  }
  return lines.join(' · ');
}

/**
 * Open PR's address: GitHub's compare page for the box's branch. The project key of a GitHub
 * repository is `github.com/<owner>/<repo>`; other hosts have no such page.
 */
export function openPrUrl(box: CloudBox, branch: string | null): string | null {
  if (branch === null || branch.length === 0 || !box.projectKey.startsWith('github.com/')) return null;
  return `https://${box.projectKey}/compare/${encodeURIComponent(branch)}?expand=1`;
}

/** The branch a box session works on: the session's own, else the box's first. */
export function boxBranch(box: CloudBox, sessionId: string | null): string | null {
  const own = box.sessions.find((row) => row.sessionId === sessionId)?.branch;
  return own ?? box.sessions.find((row) => row.branch !== undefined)?.branch ?? null;
}
