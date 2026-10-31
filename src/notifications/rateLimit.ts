/**
 * The notification rate of the desktop: at most one notification per session every 20 seconds and at most 8
 * per 60 seconds overall. It counts what the person gets from every route that announces an agent event (a
 * notification, the Sessions list's attention sound, a push handled while the app runs, a push iOS showed); the
 * record of announced events (`eventIdentity.ts`) owns the app's one limiter, asks it for a grant before each
 * announcement (a row's notification within 20 s after the attention sound of the same event, which the
 * computer links by naming the row, counts as part of that sound) and keeps its grants across launches, so a
 * restart does not start the count anew. A push iOS showed itself was not the app's to grant: once the app learns
 * of it, it is counted against its session and the overall limit like any notification (`count`), also past the
 * limit, so the app's own announcements hold back as they would after one of its own. What the limit holds back
 * still shows in the attention list. The clock is the caller's (`now`), so the rule is testable with an injected
 * clock; a clock set back is the record's to notice (`moveBack`).
 */

export const PER_SESSION_INTERVAL_MS = 20_000;
export const OVERALL_WINDOW_MS = 60_000;
export const OVERALL_MAX = 8;

/** One counted announcement: the session (`machineId\nsessionId`) and when (ms). */
export type RateGrant = { session: string; at: number };

export class NotificationRateLimiter {
  /** The grants of the last `OVERALL_WINDOW_MS`, oldest first. */
  private grants: RateGrant[] = [];

  /** Whether an announcement for `session` may go out at `now`; a granted one is counted. */
  tryAcquire(session: string, now: number): boolean {
    this.forgetBefore(now);
    if (this.grants.length >= OVERALL_MAX) return false;
    if (this.grants.some((grant) => grant.session === session && now - grant.at < PER_SESSION_INTERVAL_MS)) {
      return false;
    }
    this.grants.push({ session, at: now });
    return true;
  }

  /** Counts an announcement the app did not grant (a push iOS showed) for `session`, past the limit too. */
  count(session: string, now: number): void {
    this.forgetBefore(now);
    this.grants.push({ session, at: now });
  }

  /** The grants that still count at `now`, to be kept across launches. */
  saved(now: number): readonly RateGrant[] {
    this.forgetBefore(now);
    return this.grants;
  }

  /** Adds grants an earlier launch kept (`saved`). */
  restore(grants: readonly RateGrant[]): void {
    this.grants = [...this.grants, ...grants].sort((left, right) => left.at - right.at);
  }

  /** The time of the latest grant (-Infinity without one). */
  latest(): number {
    return this.grants.at(-1)?.at ?? -Infinity;
  }

  /** The phone's clock was set back: every grant moves back by `lead` ms, keeping their spacing. */
  moveBack(lead: number): void {
    this.grants = this.grants.map((grant) => ({ ...grant, at: grant.at - lead }));
  }

  private forgetBefore(now: number): void {
    this.grants = this.grants.filter((grant) => now - grant.at < OVERALL_WINDOW_MS);
  }
}
