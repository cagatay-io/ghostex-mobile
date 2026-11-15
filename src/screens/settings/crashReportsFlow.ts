/**
 * What a tap on Settings › Connection › Crash reports does, apart from drawing it (CrashReportsPage.tsx): Delete All
 * Reports always asks first; the Keep crash reports switch asks first only when turning it off would delete kept
 * reports; an answer of Cancel changes nothing. Kept free of React Native so `bun test` drives the same steps.
 */

import { deleteAllListedCrashReports } from '../../app/crashReports';
import { useSettingsStore } from '../../settings/store';

export type CrashReportsDialog = 'deleteAll' | 'keepOff';
export type CrashReportsChange = 'keepOn' | 'keepOff' | 'deleteAll';
/** Ask in a dialog, run a change at once, or do nothing. */
export type CrashReportsStep = { ask: CrashReportsDialog } | { run: CrashReportsChange } | null;

/** The Keep crash reports switch moved to `next` while `kept` reports are listed. */
export function keepSwitchStep(next: boolean, kept: number): CrashReportsStep {
  if (next) return { run: 'keepOn' };
  return kept > 0 ? { ask: 'keepOff' } : { run: 'keepOff' };
}

/** Delete All Reports: always asks first. */
export const DELETE_ALL_STEP: CrashReportsStep = { ask: 'deleteAll' };

/** The answer to `dialog`: its change on confirm, nothing on Cancel. */
export function answerStep(dialog: CrashReportsDialog, confirmed: boolean): CrashReportsStep {
  return confirmed ? { run: dialog } : null;
}

/** Runs a change on the phone's crash reports; throws when it did not fully happen. */
export function runCrashReportsChange(change: CrashReportsChange): Promise<void> {
  switch (change) {
    case 'keepOn':
      return useSettingsStore.getState().setCrashReportsKept(true);
    case 'keepOff':
      return useSettingsStore.getState().setCrashReportsKept(false);
    case 'deleteAll':
      return deleteAllListedCrashReports();
  }
}
