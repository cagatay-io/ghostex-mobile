/**
 * Crash capture on the JavaScript side, and the next-launch offer to send a report.
 *
 * `installCrashReporting` runs before the app renders (index.ts): it wraps React Native's global
 * error handler so a fatal JavaScript error is written to the phone synchronously (native
 * `recordJsCrash`) before the previous handler ends the app, and keeps the native side told which
 * screen is open and what the in-app log said last, for crashes JavaScript never sees.
 * SEE-ALSO: src/feedback/crashReports.ts (CDXC:Feedback 2026-10-21 DECISION), modules/ghostex-native GhostexCrashReports.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import GhostexCrashReports from '../../modules/ghostex-native/src/GhostexCrashReports';
import { deleteAllCrashReports, listCrashReports, type StoredCrashReport } from '../feedback/crashReports';
import { formatAppLog, useAppLogStore } from './appLog';

/** The reports the launch prompt already offered, so each crash is offered once. */
const OFFERED_KEY = 'crashReports.offered.v1';
const LOG_TAIL_ENTRIES = 60;
const CONTEXT_THROTTLE_MS = 1_000;

let installed = false;
let route = '';
let contextTimer: ReturnType<typeof setTimeout> | null = null;

function logTail(): string {
  return formatAppLog(useAppLogStore.getState().entries.slice(-LOG_TAIL_ENTRIES));
}

function pushContextNow(): void {
  contextTimer = null;
  GhostexCrashReports?.setContext(route, logTail());
}

function pushContextSoon(): void {
  if (contextTimer === null) contextTimer = setTimeout(pushContextNow, CONTEXT_THROTTLE_MS);
}

/** The screen that is open now (React Navigation's route name), named in the next crash report. */
export function noteCrashRoute(name: string | undefined): void {
  if (name === undefined || name === route) return;
  route = name;
  pushContextNow();
}

function errorParts(error: unknown): { message: string; stack: string } {
  if (error instanceof Error) {
    return { message: `${error.name}: ${error.message}`, stack: error.stack ?? '' };
  }
  return { message: String(error), stack: '' };
}

/** Install once, before the first render. */
export function installCrashReporting(): void {
  const native = GhostexCrashReports;
  if (installed || native === null) return;
  installed = true;
  const previous = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    // Development builds show the red error screen instead of closing; only real crashes are kept.
    if (isFatal && !__DEV__) {
      try {
        const { message, stack } = errorParts(error);
        // The native log tail may be up to a second old; this one is current.
        native.setContext(route, logTail());
        native.recordJsCrash(message, stack, true);
      } catch {
        // A failing report must never hide the crash itself.
      }
    }
    previous(error, isFatal);
  });
  useAppLogStore.subscribe(pushContextSoon);
  pushContextNow();
}

type CrashPromptState = {
  /** The newest report not offered yet, shown in the launch prompt until Send or Dismiss. */
  pending: StoredCrashReport | null;
};

export const useCrashPromptStore = create<CrashPromptState>()(() => ({ pending: null }));

/** Looks for a crash from an earlier run that was never offered, once per launch. */
export async function checkForCrashReport(): Promise<void> {
  const [reports, stored] = await Promise.all([
    listCrashReports(),
    AsyncStorage.getItem(OFFERED_KEY).catch(() => null),
  ]);
  const offered = new Set<string>(stored ? (JSON.parse(stored) as string[]) : []);
  const newest = reports[0];
  if (newest === undefined || offered.has(newest.id)) return;
  // Remembered as offered now: an ignored prompt does not come back on every start. The report
  // stays on the phone and Send Bug / Feedback can still attach it.
  const ids = [...reports.map((report) => report.id).filter((id) => offered.has(id)), newest.id];
  await AsyncStorage.setItem(OFFERED_KEY, JSON.stringify(ids)).catch(() => undefined);
  useCrashPromptStore.setState({ pending: newest });
}

/** Send report: hides the prompt; the report is deleted once the feedback screen sends it. */
export function takePendingCrashReport(): StoredCrashReport | null {
  const pending = useCrashPromptStore.getState().pending;
  useCrashPromptStore.setState({ pending: null });
  return pending;
}

/** Dismiss: hides the prompt and deletes every stored report. */
export async function dismissCrashReports(): Promise<void> {
  useCrashPromptStore.setState({ pending: null });
  await deleteAllCrashReports();
}
