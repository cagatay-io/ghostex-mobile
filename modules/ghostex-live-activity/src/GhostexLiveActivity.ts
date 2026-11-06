import { NativeModule, requireOptionalNativeModule } from 'expo';

/**
 * The one Ghostex Live Activity (ActivityKit, iOS 16.2+): GhostexLiveActivityModule.swift, with the views in
 * the widget extension `ios/Extension` that `plugins/withLiveActivity.js` adds to the app.
 * Optional on purpose: it exists only on iOS (null on Android) and in builds made after it.
 *
 * `stateJson` is the content state `src/notifications/contentState.ts` builds. The module fits it into ActivityKit's
 * 4 KB (attributes plus state) by dropping rows from the end and raising `moreCount`. No call takes an alert: the
 * activity never sounds.
 */
declare class GhostexLiveActivityModule extends NativeModule {
  /** Whether a Ghostex activity is active or stale (not ended, not dismissed). */
  hasActivity(): boolean;
  /** Starts the activity, or updates it if one already runs. Rejects when iOS refuses it (Live Activities off). */
  start(stateJson: string, staleDateMs: number): Promise<void>;
  update(stateJson: string, staleDateMs: number): Promise<void>;
  /** Ends every Ghostex activity and removes it at once. */
  end(): Promise<void>;
}

export const GhostexLiveActivity = requireOptionalNativeModule<GhostexLiveActivityModule>('GhostexLiveActivity');
