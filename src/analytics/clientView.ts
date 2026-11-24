/**
 * Mobile screen-opened ping (`surface.opened`).
 *
 * Like the hello, this never talks to an analytics service: it posts
 * `{"event": "surface.opened", "properties": {"surface": "<mobile_*>", "client": "mobile"}}`
 * to one computer's `gxserver` (`POST /api/recordClientEvent` over the warm forward, falling
 * back to `ghostex client-view` over SSH when forwarding is unavailable). The computer's own
 * usage-analytics setting decides whether anything is recorded.
 *
 * The computer is the one the screen belongs to (its `machineId` parameter), else the last
 * computer that got a hello; phone-wide screens without a `machineId` parameter are throttled
 * globally so a phone paired with two computers reports each screen once per hour, not twice.
 * Matching desktop (`apps/desktop/src/app/helpers/telemetry.rs`) and gxserver
 * (`SURFACE_OPENED_THROTTLE`), each surface is throttled to at most one accepted ping per hour,
 * with a short cooldown on transient failures so offline/busy links never get spammed.
 */

import { AppState, type AppStateStatus } from 'react-native';

import { onChatLinkHandshake } from '../chat/rust/machine-link';
import { isCloudBoxMachineId } from '../cloudBoxes/types';
import { isDemoMachineId } from '../demo/identity';
import { lastHelloMachineId, onFirstHelloMachine, reportClientHello } from './clientHello';
import {
  clientViewCommand,
  machineIdForRoute,
  mobileViewForPaneKind,
  mobileViewForRoute,
  type MobileView,
} from './mobileViews';
import { lookupMachineTarget, sendMobileClientEvent } from './recordEvent';

const VIEW_INTERVAL_MS = 60 * 60 * 1000;
const VIEW_FAILURE_COOLDOWN_MS = 60 * 1000;
const VIEW_TIMEOUT_MS = 10_000;

/** Next timestamp at which a view ping may go out for a given throttle key. */
const nextViewAt = new Map<string, number>();
const inFlightViews = new Set<string>();

let installed = false;
let currentRoute: { name: string; params?: unknown } | undefined;

function reportSurface(
  targetMachineId: string | null,
  view: MobileView,
  scope: 'machine' | 'global',
): void {
  const resolvedMachineId =
    targetMachineId !== null && !isCloudBoxMachineId(targetMachineId) ? targetMachineId : lastHelloMachineId();
  if (resolvedMachineId === null || isDemoMachineId(resolvedMachineId)) return;

  const target = lookupMachineTarget(resolvedMachineId);
  if (target === null) return;

  const throttleKey = scope === 'global' ? `global\u0000${view}` : `${target.id}\u0000${view}`;
  const now = Date.now();
  const nextAllowedAt = nextViewAt.get(throttleKey);
  if (nextAllowedAt !== undefined && now < nextAllowedAt) return;
  if (inFlightViews.has(throttleKey)) return;

  inFlightViews.add(throttleKey);
  void sendMobileClientEvent(
    target,
    { event: 'surface.opened', properties: { surface: view, client: 'mobile' } },
    clientViewCommand(view),
    VIEW_TIMEOUT_MS,
  )
    .then((outcome) => {
      const waitMs = outcome === 'failed' ? VIEW_FAILURE_COOLDOWN_MS : VIEW_INTERVAL_MS;
      nextViewAt.set(throttleKey, Date.now() + waitMs);
    })
    .catch(() => {
      nextViewAt.set(throttleKey, Date.now() + VIEW_FAILURE_COOLDOWN_MS);
    })
    .finally(() => {
      inFlightViews.delete(throttleKey);
    });
}

/** Report the current navigation route as a phone screen, if it is one. Never throws. */
export function reportMobileView(route: { name: string; params?: unknown } | undefined): void {
  currentRoute = route;
  const view = mobileViewForRoute(route?.name);
  if (view === null) return;
  const routeMachineId = machineIdForRoute(route?.params);
  const scope = routeMachineId !== null && !isCloudBoxMachineId(routeMachineId) ? 'machine' : 'global';
  reportSurface(routeMachineId, view, scope);
}

/** Report a split-pane content surface (tablet/Duo) for `machineId`, if it maps to a known view. */
export function reportMobilePaneView(machineId: string | null | undefined, paneKind: string): void {
  const view = mobileViewForPaneKind(paneKind);
  if (view === null) return;
  const resolved = typeof machineId === 'string' && machineId.length > 0 ? machineId : null;
  const scope = resolved !== null && !isCloudBoxMachineId(resolved) ? 'machine' : 'global';
  reportSurface(resolved, view, scope);
}

/**
 * Install once at app startup:
 * - Reports the initial active screen (e.g. `Sessions`) as soon as the first computer connects.
 * - Reports `client.connected` (with `client_os`) whenever any computer finishes its warm link handshake.
 * - Re-checks the active screen when returning from background (throttled to 1/hr) so long-lived
 *   sessions without route transitions still record active hours.
 */
export function initMobileAnalytics(): void {
  if (installed) return;
  installed = true;

  onFirstHelloMachine(() => {
    if (currentRoute !== undefined) reportMobileView(currentRoute);
  });

  onChatLinkHandshake((machine) => {
    reportClientHello(machine);
  });

  let lastState: AppStateStatus = AppState.currentState as AppStateStatus;
  AppState.addEventListener('change', (next) => {
    const cameFromBackground = lastState === 'background' || lastState === 'inactive';
    lastState = next;
    if (next === 'active' && cameFromBackground && currentRoute !== undefined) {
      reportMobileView(currentRoute);
    }
  });
}
