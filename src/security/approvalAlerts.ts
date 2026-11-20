/**
 * The live card for a computer's approval request (`ApprovalAlerts.tsx`): gxserver announces each
 * request made, approved, denied or expired as `approvalRequestsChanged` on the socket the phone
 * keeps open per computer for its notification feed (`notifications/feedStream.ts`).
 *
 * CDXC:Security 2026-11-20 FIX:
 * The user pasted M7-Desktop's computer code on m7-arch and no device showed an Approve: the phone
 * listed the waiting request only on Settings > M7-Desktop > Approvals, which nothing pointed at. The
 * user (11.12.0): "The phone shows a live card/notification when a connected computer's approval
 * request comes in (not only on the computer's Approvals page)." A request made on a computer this
 * phone keeps a feed socket with shows as a card naming the computer and the plain question, with
 * Open (that computer's Approvals, where the phone approves it as before) and Hide; it goes when the
 * request is answered anywhere or lapses. A gxserver from before 11.12.0 doesn't pass these on that
 * socket, so its requests stay on the Approvals page only.
 */
import { create } from 'zustand';

import type { ApprovalRequest } from './approvalPayload';

export type ApprovalAlert = { machineId: string; request: ApprovalRequest };

type AlertsState = { alerts: ApprovalAlert[] };

export const useApprovalAlerts = create<AlertsState>(() => ({ alerts: [] }));

function isRequest(value: unknown): value is ApprovalRequest {
  if (typeof value !== 'object' || value === null) return false;
  const request = value as Partial<ApprovalRequest>;
  return typeof request.id === 'string' && typeof request.action === 'string' && typeof request.summary === 'string';
}

/** At most this many cards are kept; the oldest go first. */
const MAX_ALERTS = 20;

function lapsed(alert: ApprovalAlert, now: number): boolean {
  return alert.request.expiresAtMs > 0 && alert.request.expiresAtMs <= now;
}

/** A frame from `machineId`'s feed socket: `approvalRequestsChanged` adds or drops its card. */
export function noteApprovalFrame(machineId: string, frame: { change?: unknown; request?: unknown }): void {
  if (!isRequest(frame.request)) return;
  const request = frame.request;
  const now = Date.now();
  useApprovalAlerts.setState((state) => {
    const others = state.alerts.filter(
      (alert) => !(alert.machineId === machineId && alert.request.id === request.id) && !lapsed(alert, now),
    );
    const next = frame.change === 'requested' ? [...others, { machineId, request }] : others;
    return { alerts: next.slice(-MAX_ALERTS) };
  });
}

/** Drops the cards whose request lapsed (one whose answer this phone missed, the socket away). */
export function pruneLapsedApprovalAlerts(now: number = Date.now()): void {
  const { alerts } = useApprovalAlerts.getState();
  if (alerts.some((alert) => lapsed(alert, now))) {
    useApprovalAlerts.setState({ alerts: alerts.filter((alert) => !lapsed(alert, now)) });
  }
}

/** Hide (or Open): the card goes; the request still waits on the computer's Approvals page. */
export function dismissApprovalAlert(machineId: string, requestId: string): void {
  useApprovalAlerts.setState((state) => ({
    alerts: state.alerts.filter((alert) => !(alert.machineId === machineId && alert.request.id === requestId)),
  }));
}
