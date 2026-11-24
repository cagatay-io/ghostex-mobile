/**
 * Privacy & Analytics settings sync, local mobile telemetry gating, and live `/api/telemetryPreview`
 * inspection over the warm `gxserverLink` HTTP forward.
 *
 * Strictly JS-only (zero native module changes) and backwards-compatible with older `gxserver` builds.
 */

import { chatMachineLink } from '../chat/rust/machine-link';
import { isCloudBoxMachineId } from '../cloudBoxes/types';
import {
  ANALYTICS_DOCS_URL,
  ANALYTICS_PURPOSE_COPY,
  ANALYTICS_TOGGLE_TITLE,
  NEVER_SENT_ITEMS,
} from '../copy/privacy';
import { isDemoMachine } from '../demo/identity';
import type { MachineConnectionTarget } from '../machines/credentials';
import { machineNameById } from '../machines/store';
import { useSettingsStore } from '../settings/store';

export { ANALYTICS_DOCS_URL, ANALYTICS_PURPOSE_COPY, ANALYTICS_TOGGLE_TITLE, NEVER_SENT_ITEMS };

const CALL_TIMEOUT_MS = 10_000;
const PROTOCOL_VERSION = 1;

/** Per-computer `analyticsEnabled` cache learned from `readSharedSettings` or `/api/telemetryPreview`. */
const machineAnalyticsEnabled = new Map<string, boolean>();
const inFlightPreferenceSync = new Set<string>();

function isRealAnalyticsMachine(machine: { id: string; transport?: string } | null | undefined): boolean {
  return machine !== undefined && machine !== null && !isDemoMachine(machine) && !isCloudBoxMachineId(machine.id);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

/** Update the cached `analyticsEnabled` state for one paired computer. */
export function setMachineAnalyticsEnabled(machineId: string, enabled: boolean): void {
  machineAnalyticsEnabled.set(machineId, enabled);
}

/**
 * Whether this phone should emit local analytics pings (`surface.opened`, `onboarding.step`,
 * `client.connected`) for `machineId` (or globally when omitted).
 *
 * Returns `false` if the user turned `analyticsEnabled` off locally OR if the target computer
 * reported `analyticsEnabled: false`.
 */
export function isMobileAnalyticsAllowed(machineId?: string | null): boolean {
  if (useSettingsStore.getState().settings.analyticsEnabled === false) return false;
  if (machineId != null && machineId.length > 0 && machineAnalyticsEnabled.get(machineId) === false) {
    return false;
  }
  return true;
}

function extractAnalyticsEnabledFromSettings(rawResult: unknown): boolean | null {
  if (rawResult === null || typeof rawResult !== 'object') return null;
  const settings = (rawResult as { settings?: unknown }).settings;
  if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) return null;
  const value = (settings as Record<string, unknown>).analyticsEnabled;
  if (typeof value === 'boolean') return value;
  // Absent key in `native-sidebar-settings.json` means shipped default: ON.
  return true;
}

/**
 * Quietly reads `analyticsEnabled` from a computer that just completed its warm link handshake so
 * desktop opt-outs stop mobile pings locally too. Never throws and silently ignores older servers.
 */
export function syncMachineAnalyticsPreference(machine: MachineConnectionTarget): void {
  if (!isRealAnalyticsMachine(machine)) return;
  if (inFlightPreferenceSync.has(machine.id)) return;
  const link = chatMachineLink(machine);
  if (link.current() !== 'socket') return;

  inFlightPreferenceSync.add(machine.id);
  void link
    .rpc('readSharedSettings', {}, CALL_TIMEOUT_MS)
    .then((answer) => {
      if (answer.error !== null) return;
      const enabled = extractAnalyticsEnabledFromSettings(answer.result);
      if (enabled !== null) {
        machineAnalyticsEnabled.set(machine.id, enabled);
      }
    })
    .catch(() => undefined)
    .finally(() => {
      inFlightPreferenceSync.delete(machine.id);
    });
}

export type ReadAnalyticsSettingResult =
  | { kind: 'value'; enabled: boolean; source: 'sharedSettings' | 'telemetryPreview' }
  | { kind: 'unsupported'; message: string }
  | { kind: 'offline'; message: string };

/**
 * Reads `analyticsEnabled` from the picked computer using the same `readSharedSettings` RPC used
 * by other computer-synced mobile settings pages, falling back cleanly to `/api/telemetryPreview`
 * or an offline/unsupported status without ever throwing.
 */
export async function readComputerAnalyticsSetting(
  machine: MachineConnectionTarget,
): Promise<ReadAnalyticsSettingResult> {
  const computer = machineNameById(machine.id);
  const link = chatMachineLink(machine);
  const route = await link.routeOrRepair();
  if (route === 'legacy') {
    return {
      kind: 'unsupported',
      message: `Update Ghostex on ${computer} to sync this switch directly with your computer.`,
    };
  }
  if (route !== 'socket') {
    return {
      kind: 'offline',
      message: `${computer} is offline right now. Changes on this phone still stop mobile pings locally.`,
    };
  }

  const answer = await link.rpc('readSharedSettings', {}, CALL_TIMEOUT_MS);
  if (answer.error === null) {
    const enabled = extractAnalyticsEnabledFromSettings(answer.result);
    if (enabled !== null) {
      machineAnalyticsEnabled.set(machine.id, enabled);
      return { kind: 'value', enabled, source: 'sharedSettings' };
    }
  }

  // Fallback to `/api/telemetryPreview` if `readSharedSettings` was unavailable.
  const preview = await fetchTelemetryPreview(machine);
  if (preview.kind === 'live' && preview.enabled !== null) {
    machineAnalyticsEnabled.set(machine.id, preview.enabled);
    return { kind: 'value', enabled: preview.enabled, source: 'telemetryPreview' };
  }

  if (answer.error?.code === 'notFound') {
    return {
      kind: 'unsupported',
      message: `Update Ghostex on ${computer} to sync this switch directly with your computer.`,
    };
  }
  return {
    kind: 'offline',
    message: answer.error?.message ?? `Couldn't reach Ghostex on ${computer}; try again in a moment.`,
  };
}

export type SaveAnalyticsSettingResult =
  | { kind: 'saved' }
  | { kind: 'unsupported'; message: string }
  | { kind: 'failed'; message: string };

/**
 * Writes `analyticsEnabled` to the picked computer via `updateSettingsPatch`, matching
 * `AgentSessionModeRows`, `ClaudeCompactionRows`, and `MemoryGuardRows`.
 */
export async function saveComputerAnalyticsSetting(
  machine: MachineConnectionTarget,
  enabled: boolean,
): Promise<SaveAnalyticsSettingResult> {
  const computer = machineNameById(machine.id);
  const link = chatMachineLink(machine);
  const route = await link.routeOrRepair();
  if (route === 'legacy') {
    return {
      kind: 'unsupported',
      message: `Update Ghostex on ${computer} (or change this in Desktop Settings > About) to sync it there.`,
    };
  }
  if (route !== 'socket') {
    return {
      kind: 'failed',
      message: `${computer} could not be reached. Your choice is saved on this phone; sync again when connected.`,
    };
  }

  const answer = await link.rpc(
    'dispatchRendererCommand',
    {
      action: 'updateSettingsPatch',
      payload: {
        patch: { analyticsEnabled: enabled },
        source: 'mobile:privacy',
      },
    },
    CALL_TIMEOUT_MS,
  );

  if (answer.error === null) {
    machineAnalyticsEnabled.set(machine.id, enabled);
    return { kind: 'saved' };
  }

  if (answer.error.code === 'notFound' || answer.error.code === 'forbidden') {
    return {
      kind: 'unsupported',
      message: `Your phone choice is active now, but ${computer} needs an updated Ghostex (or a change in Desktop Settings > About) to update the computer setting remotely.`,
    };
  }

  return {
    kind: 'failed',
    message: `Saved on this phone, but couldn't update ${computer}: ${answer.error.message}`,
  };
}

export type TelemetryPreviewResult =
  | {
      kind: 'live';
      payload: Record<string, unknown>;
      formattedJson: string;
      enabled: boolean | null;
      statusReason: string | null;
      endpoint: string | null;
    }
  | { kind: 'unsupported'; message: string }
  | { kind: 'offline'; message: string };

function unwrapPreviewPayload(parsed: unknown): Record<string, unknown> | null {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  if (record.ok === true && record.result !== null && typeof record.result === 'object' && !Array.isArray(record.result)) {
    return record.result as Record<string, unknown>;
  }
  if (record.ok === false) return null;
  return record;
}

/**
 * Fetches the live read-only telemetry payload preview from `POST /api/telemetryPreview` over the
 * warm `gxserverLink` HTTP forward. Gracefully reports `'unsupported'` on older `gxserver` builds
 * (HTTP 404 or legacy route) and `'offline'` when unreachable. Never throws.
 */
export async function fetchTelemetryPreview(
  machine: MachineConnectionTarget,
  timeoutMs = CALL_TIMEOUT_MS,
): Promise<TelemetryPreviewResult> {
  const computer = machineNameById(machine.id);
  const link = chatMachineLink(machine);
  const route = await link.routeOrRepair();
  if (route === 'legacy') {
    return {
      kind: 'unsupported',
      message: `${computer} is running an older Ghostex that does not have live payload preview yet.`,
    };
  }
  if (route !== 'socket') {
    return {
      kind: 'offline',
      message: `${computer} is offline right now, so live payload preview is unavailable.`,
    };
  }

  const startedAt = Date.now();
  let gxserver: Awaited<ReturnType<typeof link.gxserverLink>>;
  try {
    gxserver = await withTimeout(link.gxserverLink(), timeoutMs);
  } catch {
    return {
      kind: 'offline',
      message: `Couldn't connect to ${computer} to load a live preview.`,
    };
  }
  if (gxserver === null) {
    return {
      kind: 'offline',
      message: `${computer} is offline right now, so live payload preview is unavailable.`,
    };
  }

  const remainingMs = Math.max(1_500, timeoutMs - (Date.now() - startedAt));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), remainingMs);
  try {
    const response = await fetch(`http://127.0.0.1:${gxserver.localPort}/api/telemetryPreview`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${gxserver.authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ protocolVersion: PROTOCOL_VERSION, params: {} }),
      signal: controller.signal,
    });

    if (response.status === 404) {
      return {
        kind: 'unsupported',
        message: `${computer} is running an older Ghostex that does not have live payload preview yet.`,
      };
    }
    if (response.status === 401) {
      link.forgetEndpoint();
      return {
        kind: 'offline',
        message: `Reconnect to ${computer} and tap Refresh to load the live preview.`,
      };
    }

    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      const errCode =
        parsed !== null && typeof parsed === 'object' ? (parsed as { error?: unknown }).error : undefined;
      if (errCode === 'notFound') {
        return {
          kind: 'unsupported',
          message: `${computer} is running an older Ghostex that does not have live payload preview yet.`,
        };
      }
      return {
        kind: 'offline',
        message: `Couldn't load the live preview from ${computer} right now.`,
      };
    }

    const payload = unwrapPreviewPayload(parsed);
    if (payload === null) {
      return {
        kind: 'unsupported',
        message: `${computer} answered in a format this preview could not read.`,
      };
    }

    const enabled = typeof payload.enabled === 'boolean' ? payload.enabled : null;
    const statusReason = typeof payload.reason === 'string' ? payload.reason : null;
    const endpoint = typeof payload.endpoint === 'string' ? payload.endpoint : null;
    return {
      kind: 'live',
      payload,
      formattedJson: JSON.stringify(payload, null, 2),
      enabled,
      statusReason,
      endpoint,
    };
  } catch {
    return {
      kind: 'offline',
      message: `Couldn't reach ${computer} to load a live preview.`,
    };
  } finally {
    clearTimeout(timer);
  }
}
