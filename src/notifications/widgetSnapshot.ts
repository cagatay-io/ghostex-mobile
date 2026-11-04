/**
 * The Home Screen widgets' data (a versioned snapshot, format version 2): the app writes it into the App Group
 * container after each session refresh (`widgetWriter.ts`), the widget extension only reads it. Small: the counts of
 * working and waiting agents and the attention marker; medium and large: the agents as well, waiting first; large:
 * the account usage bars where the app has them. Every size shows the data time.
 *
 * The agents are the ones the Live Activity shows, classified by its rules (`candidateFor` in `contentState.ts`):
 * finished agents are neither counted nor listed, an agent whose state has no start time in the summary is counted but
 * gets no row, and a waiting agent with a question is just waiting here (the snapshot has no question field). An agent
 * carries its name, resolved artwork and tint, project, state and since when; no prompt, reply or title text.
 *
 * Kept free of React Native so the rules are testable under `bun test`.
 */

import type { AgentArtId } from '../contract/mobileSummary';
import type { UsageBar } from '../usage/usageMeters';
import { candidateFor, compareShown, type ActivitySource, type Shown } from './contentState';

/** The snapshot's format; the widget shows its empty state for any other version. */
export const WIDGET_SNAPSHOT_VERSION = 2;
/** The large widget lists up to about eight agents (schema `maxItems`); the medium one shows its first three. */
export const MAX_WIDGET_AGENTS = 8;

export type WidgetAgent = {
  agentName: string;
  /** Artwork and packed RGB tint already resolved by the shared Live Activity candidate. */
  agentIcon: AgentArtId;
  agentTint: number;
  project: string;
  state: 'working' | 'waiting';
  /** Working: since the stint began; waiting: since the agent waits. */
  sinceAt: string;
};

export type WidgetSnapshot = {
  schemaVersion: typeof WIDGET_SNAPSHOT_VERSION;
  /** The data time: when the oldest summary used was read from its computer. */
  writtenAt: string;
  counts: { working: number; waiting: number };
  /** True while any agent waits for the user. */
  attention: boolean;
  agents: WidgetAgent[];
  /** Only when the app has usage bars; absent otherwise, never empty bars. */
  usage?: { bars: UsageBar[] };
};

/**
 * The snapshot at `now` (epoch ms) over every given computer, with `usageBars` (the large widget's, possibly none).
 * The data time is the oldest summary read, which is the refresh time when every computer answered; `now` only
 * when no summary is given.
 */
export function buildSnapshot(
  sources: readonly ActivitySource[],
  now: number,
  usageBars: readonly UsageBar[] = [],
): WidgetSnapshot {
  const counts = { working: 0, waiting: 0 };
  const shown: Shown[] = [];
  let dataTime: number | null = null;
  for (const source of sources) {
    dataTime = dataTime === null ? source.loadedAt : Math.min(dataTime, source.loadedAt);
    for (const session of source.summary.sessions) {
      const candidate = candidateFor(source.machineId, session, source.summary.capabilities, now);
      if (candidate === null || candidate.state === 'finished') continue;
      counts[candidate.state] += 1;
      if (candidate.shown !== null) shown.push(candidate.shown);
    }
  }
  const agents = shown
    .sort(compareShown)
    .slice(0, MAX_WIDGET_AGENTS)
    .map(({ row }): WidgetAgent => ({
      agentName: row.agentName,
      agentIcon: row.agentIcon,
      agentTint: row.agentTint,
      project: row.project,
      state: row.state === 'waiting' ? 'waiting' : 'working',
      sinceAt: row.startedAt,
    }));
  return {
    schemaVersion: WIDGET_SNAPSHOT_VERSION,
    writtenAt: new Date(dataTime ?? now).toISOString(),
    counts,
    attention: counts.waiting > 0,
    agents,
    ...(usageBars.length > 0 ? { usage: { bars: [...usageBars] } } : {}),
  };
}
