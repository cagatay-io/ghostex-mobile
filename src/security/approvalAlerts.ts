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

/** A frame from `machineId`'s feed socket: `approvalRequestsChanged` adds or drops its card. */
export function noteApprovalFrame(machineId: string, frame: { change?: unknown; request?: unknown }): void {
  if (!isRequest(frame.request)) return;
  const request = frame.request;
  useApprovalAlerts.setState((state) => {
    const others = state.alerts.filter((alert) => !(alert.machineId === machineId && alert.request.id === request.id));
    return { alerts: frame.change === 'requested' ? [...others, { machineId, request }] : others };
  });
}

/** Hide (or Open): the card goes; the request still waits on the computer's Approvals page. */
export function dismissApprovalAlert(machineId: string, requestId: string): void {
  useApprovalAlerts.setState((state) => ({
    alerts: state.alerts.filter((alert) => !(alert.machineId === machineId && alert.request.id === requestId)),
  }));
}
