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
import { Platform } from 'react-native';
import { create } from 'zustand';

import GhostexCrashReports from '../../modules/ghostex-native/src/GhostexCrashReports';
import {
  deleteAllCrashReports,
  deleteCrashReport,
  keepingCrashReports,
  listCrashReports,
  type StoredCrashReport,
} from '../feedback/crashReports';
import { formatAppLog, logAppEvent, useAppLogStore } from './appLog';

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
    // Development builds show the red error screen instead of closing; only real crashes are kept, and none while
    // keeping crash reports is off.
    if (isFatal && !__DEV__ && keepingCrashReports() !== false) {
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

/**
 * Looks for a crash from an earlier run that was never offered, once per launch, and offers the newest of those. On iOS
 * reports stay on the phone after the prompt, so the newest report may already have been offered while an older one
 * never was (two crashes before one launch, or a report that arrived after a newer one was offered); that one is
 * offered at a later launch. Android, whose Dismiss still deletes the reports, looks at the newest report only, as before.
 */
export async function checkForCrashReport(): Promise<void> {
  const [reports, stored] = await Promise.all([
    listCrashReports(),
    AsyncStorage.getItem(OFFERED_KEY).catch(() => null),
  ]);
  const offered = new Set<string>(stored ? (JSON.parse(stored) as string[]) : []);
  const candidates = Platform.OS === 'ios' ? reports : reports.slice(0, 1);
  const next = candidates.find((report) => !offered.has(report.id));
  if (next === undefined) return;
  // Remembered as offered now: an ignored prompt does not come back on every start. The report
  // stays on the phone and Send Bug / Feedback can still attach it.
  const ids = [...reports.map((report) => report.id).filter((id) => offered.has(id)), next.id];
  await AsyncStorage.setItem(OFFERED_KEY, JSON.stringify(ids)).catch(() => undefined);
  useCrashPromptStore.setState({ pending: next });
}

/** Send report: hides the prompt; the report is deleted once the feedback screen sends it. */
export function takePendingCrashReport(): StoredCrashReport | null {
  const pending = useCrashPromptStore.getState().pending;
  useCrashPromptStore.setState({ pending: null });
  return pending;
}

/**
 * Dismiss: hides the prompt. On iOS the report stays on the phone and is not offered again; Android deletes every stored
 * report, as before.
 */
export async function dismissCrashReports(): Promise<void> {
  useCrashPromptStore.setState({ pending: null });
  if (Platform.OS !== 'ios') await deleteAllCrashReports();
}

type CrashReportListState = {
  /** `failed`: the phone's reports could not be read, so the list says so instead of showing none. */
  status: 'loading' | 'ready' | 'failed';
  /** Newest first, as last read. */
  reports: readonly StoredCrashReport[];
};

/** The reports Settings › Connection › Crash reports and a report opened from it show. */
export const useCrashReportListStore = create<CrashReportListState>()(() => ({ status: 'loading', reports: [] }));

/** The latest read; an older read that answers after it is dropped. */
let listRead = 0;

/**
 * Reads the kept reports again into the Settings list, and hides the launch prompt when the report it offers is gone
 * (deleted here, or keeping turned off). Answers the reports read, or null when they could not be read: the list then
 * shows `failed` and the failure is in the app log, so callers have nothing more to report.
 */
export async function refreshCrashReportList(): Promise<readonly StoredCrashReport[] | null> {
  listRead += 1;
  const read = listRead;
  let reports: StoredCrashReport[];
  try {
    reports = await listCrashReports();
  } catch (error) {
    if (read === listRead) useCrashReportListStore.setState({ status: 'failed', reports: [] });
    logAppEvent(`Crash reports: reading the kept reports failed (${describeError(error)})`);
    return null;
  }
  if (read === listRead) useCrashReportListStore.setState({ status: 'ready', reports });
  const pending = useCrashPromptStore.getState().pending;
  if (pending !== null && !reports.some((report) => report.id === pending.id)) {
    useCrashPromptStore.setState({ pending: null });
  }
  return reports;
}

/** A failure's message for the app log lines of the crash reports in Settings. */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Delete on one report. The list is read again afterwards, also when the phone reported a failure; throws when the
 * report is still listed then, or the list could not be read.
 */
export async function deleteListedCrashReport(id: string): Promise<void> {
  const failure = await deleteCrashReport(id).then(
    () => null,
    (error: unknown) => error,
  );
  const reports = await refreshCrashReportList();
  if (reports === null || reports.some((report) => report.id === id)) {
    throw failure ?? new Error('The crash report is still listed.');
  }
}

/** Delete All Reports, read again as Delete on one report is; throws when a report is still listed. */
export async function deleteAllListedCrashReports(): Promise<void> {
  const failure = await deleteAllCrashReports().then(
    () => null,
    (error: unknown) => error,
  );
  const reports = await refreshCrashReportList();
  if (reports === null || reports.length > 0) throw failure ?? new Error('Crash reports are still listed.');
}
