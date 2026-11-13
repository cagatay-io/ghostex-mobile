import { NativeModule, requireOptionalNativeModule } from 'expo';

/**
 * The phone's stored crash reports (GhostexCrashReports.kt / GhostexCrashReports.swift).
 * Optional on purpose: crash reporting must never be the thing that stops the app from starting,
 * e.g. in a development client built before this module existed.
 */
declare class GhostexCrashReportsModule extends NativeModule {
  /** The current screen and the tail of the in-app log, written into the next native crash report. */
  setContext(route: string, log: string): void;
  /** Writes a JavaScript crash report synchronously, before React Native ends the app; nothing while keeping is off. */
  recordJsCrash(error: string, stack: string, fatal: boolean): void;
  /** Every stored report as JSON (`StoredCrashReport`), newest first. */
  listReports(): Promise<string[]>;
  deleteReport(id: string): Promise<void>;
  /**
   * iOS builds from the one that added MetricKit capture: whether reports are kept (on until turned off). Absent on
   * Android and older builds, which keep every report and cannot stop.
   */
  isKeepingReports?(): boolean;
  /**
   * Same builds: turns keeping reports on or off. Off deletes every stored report before it resolves, and no writer
   * (JavaScript, exception handler, MetricKit) stores one while it stays off; rejects when a report could not be deleted.
   */
  setKeepingReports?(keep: boolean): Promise<void>;
}

export default requireOptionalNativeModule<GhostexCrashReportsModule>('GhostexCrashReports');
