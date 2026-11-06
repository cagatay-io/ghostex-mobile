import type { GhostexAttentionKind } from '../contract/mobileSummary';

/** Settings › Notifications › Alert me for: every attention, or only the ones that wait on you. */
export type AttentionAlertsFor = 'all' | 'needsYou';

/**
 * Whether an attention alerts (the attention sound, and a Finished notification) under Alert me for, the rule the
 * desktop applies (`AttentionAlerts` in packages/gx-core/src/attention.rs).
 *
 * CDXC:Notifications 2026-11-07 DECISION:
 * User, approving PR #457 ("Needs you only"): "yes, phone too". Needs you only alerts for an attention that waits on
 * you: a question, approval or other wait (`needsInput`), or a finished turn whose handover has a Blocked or Needs
 * you section, unless the session is a coordinator's thread, which reports to its coordinator. An attention from a
 * computer that sends no kind alerts as before.
 */
export function attentionAlerts(
  alertsFor: AttentionAlertsFor,
  session: { attentionKind: GhostexAttentionKind; attentionHandoverNeedsYou: boolean; coordinatorSessionId: string },
): boolean {
  if (alertsFor === 'all' || session.attentionKind !== 'finished') return true;
  return session.attentionHandoverNeedsYou && session.coordinatorSessionId.trim().length === 0;
}
