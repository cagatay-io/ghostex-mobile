/**
 * A Claude cloud session on the phone: the record the computer sends with its row
 * (`claudeCloud`, gx-protocol `PresentationClaudeCloud`) and what tapping the row opens.
 *
 * CDXC:ClaudeCloud 2026-10-23 DECISION:
 * User (Q411): the phone shows cloud sessions' rows too, after the computer. A cloud row carries
 * the desktop's plain cloud glyph, and tapping it opens Claude's page for the session while the
 * session runs on claude.ai, the same rule as the desktop's row click (gx-core
 * `session_claude_cloud_page`); in any other state the row opens like every row.
 *
 * CDXC:ClaudeCloud 2026-10-23 WHY:
 * The page opens through Android's own link handling (the Claude app when it takes claude.ai links,
 * else the browser the user is signed in to claude.ai with), not an in-app web view: a web view on
 * the phone has no claude.ai sign-in, and Google refuses to sign in inside embedded web views.
 *
 * SEE-ALSO: packages/gx-core/src/claude_cloud.rs (the desktop's rule),
 * server/src/ghostex_cli/sessions/mobile_summary.rs (forwards the record).
 */

export type GhostexClaudeCloud = {
  /** `draft`, `starting`, `running`, `failed` or `moved` (brought to the computer). */
  state: string;
  /** `https://claude.ai/code/session_…` once the session exists, else ''. */
  url: string;
  branch: string;
  statusText: string;
  /** `live` once the session's terminal shows the cloud session itself, else ''. */
  attach: string;
  accountName: string;
  limitNotice: string;
};

/** The record as the summary forwards it, or undefined for a session that is not a cloud one. */
export function parseClaudeCloud(value: unknown): GhostexClaudeCloud | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const text = (key: string): string => (typeof record[key] === 'string' ? (record[key] as string).trim() : '');
  const state = text('state');
  if (state.length === 0) return undefined;
  return {
    state,
    url: text('url'),
    branch: text('branch'),
    statusText: text('statusText'),
    attach: text('attach'),
    accountName: text('accountName'),
    limitNotice: text('limitNotice'),
  };
}

/** The claude.ai page a tap on the row opens, or null when the row opens like any other. */
export function claudeCloudPageUrl(cloud: GhostexClaudeCloud | undefined): string | null {
  if (cloud === undefined || cloud.state !== 'running' || cloud.attach === 'live') return null;
  return cloud.url.startsWith('https://claude.ai/code/') ? cloud.url : null;
}
