/**
 * How a dot's state reads on the phone: the words of Open Dot's `lib/status.ts` and the status-dot
 * colors of packages/gx-core/src/open_dots.rs (`DotFaceStatus`), plus the status a Dots-list row
 * derives from the session inventory when no OpenDots snapshot is loaded.
 */

import { countSessions } from '../contract/grouping';
import type { GhostexSession } from '../contract/mobileSummary';
import type { Dot, DotStatus } from './types';

/** gx-core `DotFaceStatus::color_rgb`: working blue, waiting amber, paused grey, idle green. */
export const DOT_STATUS_COLORS: Readonly<Record<DotStatus, string>> = {
  idle: '#4ade80',
  working: '#60a5fa',
  waiting: '#f59e0b',
  paused: '#64748b',
};

/** Short status word (Open Dot's `statusLabel`). */
export function dotStatusLabel(status: DotStatus): string {
  switch (status) {
    case 'working':
      return 'Working';
    case 'waiting':
      return 'Needs you';
    case 'paused':
      return 'Paused';
    default:
      return 'Ready';
  }
}

/** One line under a dot's name (Open Dot's `statusLine`). */
export function dotStatusLine(dot: Pick<Dot, 'status' | 'activity' | 'purpose'>): string {
  if (dot.status === 'paused') return 'Paused';
  if (dot.status === 'waiting') return 'Waiting for you';
  if (dot.status === 'working') return dot.activity ?? 'Working';
  return dot.purpose.length > 0 ? dot.purpose : 'Ready';
}

/**
 * The status gxserver derives (paused > waiting > working > idle), read off the inventory row:
 * `dotPaused`, `dotNeedsYou` (pending approvals) and the dot's own sessions.
 */
export function inventoryDotStatus(paused: boolean, needsYou: number, sessions: readonly GhostexSession[]): DotStatus {
  if (paused) return 'paused';
  if (needsYou > 0 || sessions.some((session) => session.pendingQuestionCount > 0)) return 'waiting';
  if (countSessions(sessions).workingCount > 0) return 'working';
  return 'idle';
}

/** Open Dot's `timeAgo`. */
export function timeAgo(timestamp: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** "Mon 8:00 AM" for routine next/last run times. */
export function shortWhen(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

export function formatBytes(size: number): string {
  if (size > 1_048_576) return `${(size / 1_048_576).toFixed(1)} MB`;
  if (size > 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}
