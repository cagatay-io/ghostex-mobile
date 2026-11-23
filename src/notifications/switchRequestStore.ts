/**
 * Active agent switch-request toast (`Q4705`-`Q4711`).
 *
 * When an agent session on a connected computer asks Ghostex to switch views (`switchRequest` on
 * `/api/events?stream=notifications`), the phone shows a clickable toast instead of navigating
 * automatically. Latest request wins in place and auto-dismisses after 8 seconds. Always shown
 * regardless of Do Not Disturb / Quiet mode.
 */
import { create } from 'zustand';

export const SWITCH_REQUEST_DURATION_MS = 8_000;

export type SwitchRequest = {
  id: string;
  action: string;
  title: string;
  subtitle?: string;
  primaryLabel: string;
  icon?: string;
  requesterTitle?: string;
  projectId?: string;
  sessionId?: string;
  externalUrl?: string;
  createdAt?: string;
};

export type ActiveSwitchRequest = {
  machineId: string;
  request: SwitchRequest;
  receivedAt: number;
};

type SwitchRequestState = {
  active: ActiveSwitchRequest | null;
};

export const useSwitchRequestStore = create<SwitchRequestState>(() => ({ active: null }));

let dismissTimer: ReturnType<typeof setTimeout> | null = null;

function clearDismissTimer(): void {
  if (dismissTimer !== null) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
}

function parseSwitchRequest(value: unknown): SwitchRequest | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === 'string' && raw.id.trim().length > 0 ? raw.id.trim() : null;
  const action =
    typeof raw.action === 'string' && raw.action.trim().length > 0 ? raw.action.trim() : null;
  const title =
    typeof raw.title === 'string' && raw.title.trim().length > 0 ? raw.title.trim() : null;
  if (id === null || action === null || title === null) return null;
  const optStr = (key: string): string | undefined => {
    const val = raw[key];
    return typeof val === 'string' && val.trim().length > 0 ? val.trim() : undefined;
  };
  return {
    id,
    action,
    title,
    subtitle: optStr('subtitle'),
    primaryLabel: optStr('primaryLabel') ?? 'Switch',
    icon: optStr('icon'),
    requesterTitle: optStr('requesterTitle'),
    projectId: optStr('projectId'),
    sessionId: optStr('sessionId'),
    externalUrl: optStr('externalUrl'),
    createdAt: optStr('createdAt'),
  };
}

/** Handles a `switchRequest` frame from `machineId`'s notification socket (latest wins). */
export function noteSwitchRequestFrame(machineId: string, frame: { request?: unknown }): void {
  const request = parseSwitchRequest(frame.request);
  if (request === null) return;
  clearDismissTimer();
  const receivedAt = Date.now();
  useSwitchRequestStore.setState({ active: { machineId, request, receivedAt } });
  dismissTimer = setTimeout(() => {
    const current = useSwitchRequestStore.getState().active;
    if (current?.request.id === request.id && current.receivedAt === receivedAt) {
      useSwitchRequestStore.setState({ active: null });
    }
    dismissTimer = null;
  }, SWITCH_REQUEST_DURATION_MS);
}

/** Dismisses the currently visible switch-request toast. */
export function dismissSwitchRequest(requestId?: string): void {
  const current = useSwitchRequestStore.getState().active;
  if (current === null) return;
  if (requestId !== undefined && current.request.id !== requestId) return;
  clearDismissTimer();
  useSwitchRequestStore.setState({ active: null });
}
