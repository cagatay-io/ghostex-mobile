/**
 * Mobile onboarding / pairing funnel telemetry (`onboarding.step`).
 *
 * Every Ghostex analytics event is delivered to the user's own `gxserver` via
 * `POST /api/recordClientEvent` (over the warm `gxserverLink` HTTP forward), never
 * directly from the phone to an analytics service. The computer's own analytics
 * opt-out setting and closed taxonomy (`server/src/telemetry/taxonomy.rs`) decide
 * what is sent.
 *
 * Because the phone has no connected `gxserver` during Welcome / Connect / Scan,
 * pre-pairing milestones (`started`, `skipped`, `completed`) are buffered in memory
 * and AsyncStorage using closed enum step names only (zero PII, zero identifiers,
 * zero timestamps) with a one-time-per-install guard, and flushed sequentially in
 * funnel order as soon as the first real computer pairs and connects.
 *
 * Pre-existing installs that already had a real (non-demo) computer saved when
 * this telemetry first runs are marked `preExisting` and never emit retroactive
 * onboarding milestones.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { onChatLinkHandshake } from '../chat/rust/machine-link';
import { isCloudBoxMachineId } from '../cloudBoxes/types';
import { isDemoMachine } from '../demo/identity';
import type { MachineConnectionTarget } from '../machines/credentials';
import { useMachinesStore, type MachineRecord } from '../machines/store';
import { lastHelloMachineId, onFirstHelloMachine } from './clientHello';
import { isMobileAnalyticsAllowed } from './privacy';
import { lookupMachineTarget, sendMobileClientEvent, type ClientEventBody } from './recordEvent';

/** Closed allowlist mirroring `ONBOARDING_STEPS` in `server/src/telemetry/taxonomy.rs`. */
export const ONBOARDING_STEPS = [
  'cli_detected',
  'completed',
  'first_prompt',
  'first_session',
  'project_added',
  'project_opened',
  'skipped',
  'started',
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

const ONBOARDING_STEP_SET: ReadonlySet<string> = new Set(ONBOARDING_STEPS);

const STORAGE_KEY = 'analytics.onboardingSteps.v1';
const ONBOARDING_TIMEOUT_MS = 10_000;
/** Back off after a transient transport failure so offline/legacy servers are never spammed. */
const FLUSH_FAILURE_COOLDOWN_MS = 60 * 1000;

type MobilePlatform = 'ios' | 'android';

type OnboardingState = {
  /** Steps already recorded for this install (one-time-per-install guard). */
  recorded: Set<OnboardingStep>;
  /** Steps waiting for a reachable gxserver, preserved in FIFO funnel order. */
  pending: OnboardingStep[];
  /** True when the install already had a real computer before this telemetry shipped. */
  preExisting: boolean;
};

type PersistedOnboardingState = {
  recorded: OnboardingStep[];
  pending: OnboardingStep[];
  preExisting?: boolean;
};

let installed = false;
let state: OnboardingState | null = null;
let loadPromise: Promise<OnboardingState> | null = null;
let persistChain: Promise<void> = Promise.resolve();
let initialHydrationPromise: Promise<boolean> | null = null;
let hydrationObserved = false;
let lastObservedHadRealMachine = false;

let flushInFlight = false;
let flushRequestedAgain = false;
let queuedFlushMachine: MachineConnectionTarget | null = null;

/** Machines whose gxserver answered 404 (predates `/api/recordClientEvent`): never retry in this run. */
const unsupportedMachineIds = new Set<string>();
/** Next timestamp at which a flush may retry after a transient failure on a given machine. */
const nextRetryAtByMachineId = new Map<string, number>();

export function isOnboardingStep(value: unknown): value is OnboardingStep {
  return typeof value === 'string' && ONBOARDING_STEP_SET.has(value);
}

function isRealAnalyticsMachine(machine: { id: string; transport?: string } | null | undefined): boolean {
  return machine !== undefined && machine !== null && !isDemoMachine(machine) && !isCloudBoxMachineId(machine.id);
}

function hasRealMachine(machines: readonly MachineRecord[]): boolean {
  return machines.some((machine) => isRealAnalyticsMachine(machine));
}

function currentMobilePlatform(): MobilePlatform | null {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return null;
}

function onboardingEventBody(step: OnboardingStep): ClientEventBody {
  const platform = currentMobilePlatform();
  const properties: Record<string, string> = {
    step,
    client: 'mobile',
  };
  if (platform !== null) {
    properties.client_os = platform;
    properties.platform = platform;
  }
  return { event: 'onboarding.step', properties };
}

function sanitizeStepList(raw: unknown): OnboardingStep[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<OnboardingStep>();
  const out: OnboardingStep[] = [];
  for (const item of raw) {
    if (isOnboardingStep(item) && !seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

/**
 * Resolves once `useMachinesStore` completes hydration with whether the install
 * already had a real computer saved before any screen mounted.
 */
function waitForInitialMachineHydration(): Promise<boolean> {
  if (initialHydrationPromise !== null) return initialHydrationPromise;
  const current = useMachinesStore.getState();
  if (current.hydrated) {
    const hadReal = hasRealMachine(current.machines);
    lastObservedHadRealMachine = hadReal;
    initialHydrationPromise = Promise.resolve(hadReal);
    return initialHydrationPromise;
  }
  initialHydrationPromise = new Promise<boolean>((resolve) => {
    const unsubscribe = useMachinesStore.subscribe((next) => {
      if (!next.hydrated) return;
      unsubscribe();
      const hadReal = hasRealMachine(next.machines);
      lastObservedHadRealMachine = hadReal;
      resolve(hadReal);
    });
  });
  return initialHydrationPromise;
}

function persistState(current: OnboardingState): void {
  const payload: PersistedOnboardingState = {
    recorded: [...current.recorded],
    pending: [...current.pending],
    ...(current.preExisting ? { preExisting: true } : {}),
  };
  persistChain = persistChain
    .then(() => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload)))
    .catch(() => undefined);
}

async function loadState(): Promise<OnboardingState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        const record = parsed as Record<string, unknown>;
        const recordedList = sanitizeStepList(record.recorded);
        const pendingList = sanitizeStepList(record.pending);
        const recorded = new Set<OnboardingStep>(recordedList);
        // Any pending step is also considered recorded so it can never be queued twice.
        for (const step of pendingList) recorded.add(step);
        const loaded: OnboardingState = {
          recorded,
          pending: pendingList,
          preExisting: record.preExisting === true,
        };
        state = loaded;
        return loaded;
      }
    }
  } catch {
    // Fall through to clean state initialization; never throw from telemetry.
  }

  const hadRealOnBoot = await waitForInitialMachineHydration();
  const initial: OnboardingState = {
    recorded: new Set<OnboardingStep>(),
    pending: [],
    preExisting: hadRealOnBoot,
  };
  state = initial;
  if (hadRealOnBoot) {
    persistState(initial);
  }
  return initial;
}

function ensureLoaded(): Promise<OnboardingState> {
  if (state !== null) return Promise.resolve(state);
  loadPromise ??= loadState();
  return loadPromise;
}

function resolveFlushMachine(preferred?: MachineConnectionTarget | null): MachineConnectionTarget | null {
  if (preferred !== undefined && preferred !== null && isRealAnalyticsMachine(preferred)) {
    return preferred;
  }
  const fallback = lookupMachineTarget(lastHelloMachineId());
  if (fallback !== null && isRealAnalyticsMachine(fallback)) {
    return fallback;
  }
  return null;
}

/**
 * Flush any buffered `onboarding.step` milestones sequentially in FIFO order over
 * `POST /api/recordClientEvent` (`sendMobileClientEvent` warm HTTP forward).
 * Never throws, never blocks pairing, and silently no-ops on older servers.
 */
export async function flushOnboardingSteps(preferredMachine?: MachineConnectionTarget | null): Promise<void> {
  if (!isMobileAnalyticsAllowed(preferredMachine?.id)) return;
  const current = await ensureLoaded();
  if (current.preExisting || current.pending.length === 0) return;

  const machine = resolveFlushMachine(preferredMachine);
  if (machine === null) return;
  if (!isMobileAnalyticsAllowed(machine.id)) return;
  if (unsupportedMachineIds.has(machine.id)) return;

  const nextAllowedAt = nextRetryAtByMachineId.get(machine.id);
  if (nextAllowedAt !== undefined && Date.now() < nextAllowedAt) return;

  if (flushInFlight) {
    flushRequestedAgain = true;
    queuedFlushMachine = machine;
    return;
  }

  flushInFlight = true;
  try {
    while (current.pending.length > 0) {
      const step = current.pending[0];
      if (!isOnboardingStep(step)) {
        current.pending.shift();
        persistState(current);
        continue;
      }
      const outcome = await sendMobileClientEvent(
        machine,
        onboardingEventBody(step),
        null,
        ONBOARDING_TIMEOUT_MS,
      );
      if (outcome === 'sent') {
        if (current.pending[0] === step) {
          current.pending.shift();
          persistState(current);
        }
        nextRetryAtByMachineId.delete(machine.id);
        continue;
      }
      if (outcome === 'unsupported') {
        unsupportedMachineIds.add(machine.id);
        break;
      }
      // Transient failure or legacy SSH-only machine: keep remaining steps buffered and back off.
      nextRetryAtByMachineId.set(machine.id, Date.now() + FLUSH_FAILURE_COOLDOWN_MS);
      break;
    }
  } catch {
    nextRetryAtByMachineId.set(machine.id, Date.now() + FLUSH_FAILURE_COOLDOWN_MS);
  } finally {
    flushInFlight = false;
    if (flushRequestedAgain) {
      const nextMachine = queuedFlushMachine;
      flushRequestedAgain = false;
      queuedFlushMachine = null;
      if (current.pending.length > 0) {
        void flushOnboardingSteps(nextMachine);
      }
    }
  }
}

/**
 * Record one zero-PII `onboarding.step` milestone (at most once per install).
 * Pre-pairing steps buffer durably until the first real computer connects;
 * post-pairing steps flush immediately over the warm link. Never throws.
 */
export function recordOnboardingStep(
  step: OnboardingStep,
  targetMachine?: MachineConnectionTarget | null,
): void {
  if (!isOnboardingStep(step)) return;
  if (!isMobileAnalyticsAllowed(targetMachine?.id)) return;
  if (targetMachine !== undefined && targetMachine !== null && !isRealAnalyticsMachine(targetMachine)) return;

  void ensureLoaded()
    .then((current) => {
      if (current.preExisting) return;
      if (current.recorded.has(step)) return;
      current.recorded.add(step);
      current.pending.push(step);
      persistState(current);
      return flushOnboardingSteps(targetMachine);
    })
    .catch(() => undefined);
}

/**
 * Drop any buffered pre-pairing onboarding steps when the user turns analytics off so nothing
 * queued earlier flushes later. Never throws.
 */
export function clearPendingOnboardingSteps(): void {
  void ensureLoaded()
    .then((current) => {
      if (current.pending.length === 0) return;
      current.pending = [];
      persistState(current);
    })
    .catch(() => undefined);
}

/**
 * Record `started` only when no real (non-demo) computer has been paired yet.
 * Covers deep-link entry into pairing screens or leaving demo mode to pair.
 */
export function recordOnboardingStartedIfUnpaired(): void {
  const { hydrated, machines } = useMachinesStore.getState();
  if (hydrated && hasRealMachine(machines)) return;
  recordOnboardingStep('started');
}

/**
 * Install once at app startup (called by `initMobileAnalytics`):
 * - Captures whether this install already had a real computer on boot (pre-existing user).
 * - Watches for the first real computer being saved (`0 -> 1+`) to record `completed` across
 *   every pairing path (Easy Connect QR/paste, Tailscale QR/paste, manual Tailscale/SSH form).
 * - Flushes buffered onboarding milestones as soon as the first computer connects.
 */
export function initOnboardingTelemetry(): void {
  if (installed) return;
  installed = true;

  void waitForInitialMachineHydration();
  void ensureLoaded();

  const snapshot = useMachinesStore.getState();
  if (snapshot.hydrated) {
    hydrationObserved = true;
    lastObservedHadRealMachine = hasRealMachine(snapshot.machines);
  }

  useMachinesStore.subscribe((next) => {
    if (!next.hydrated) return;
    const nowHasReal = hasRealMachine(next.machines);
    if (!hydrationObserved) {
      hydrationObserved = true;
      lastObservedHadRealMachine = nowHasReal;
      return;
    }
    const firstRealAdded = !lastObservedHadRealMachine && nowHasReal;
    lastObservedHadRealMachine = nowHasReal;
    if (firstRealAdded) {
      recordOnboardingStep('completed');
    }
  });

  onChatLinkHandshake((machine) => {
    void flushOnboardingSteps(machine);
  });

  onFirstHelloMachine((machineId) => {
    void flushOnboardingSteps(lookupMachineTarget(machineId));
  });
}
