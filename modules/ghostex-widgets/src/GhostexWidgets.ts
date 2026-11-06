import { NativeModule, requireOptionalNativeModule } from 'expo';

/**
 * The app's side of the Home Screen widgets (WidgetKit, iOS): GhostexWidgetsModule.swift writes the widget snapshot
 * into the App Group container and asks WidgetKit to reload the widgets; the widgets themselves are in
 * `ios/Extension`, compiled into the widget extension `plugins/withWidgets.js` adds to the app.
 * Optional on purpose: it exists only on iOS (null on Android) and in builds made after it.
 *
 * `json` is the versioned widget snapshot `src/notifications/widgetSnapshot.ts` builds.
 */
declare class GhostexWidgetsModule extends NativeModule {
  /** Replaces the snapshot file atomically. Rejects when the App Group container is not available. */
  writeSnapshot(json: string): Promise<void>;
  /** Deletes the snapshot file; nothing to delete is fine. */
  removeSnapshot(): Promise<void>;
  /** Asks WidgetKit to reload the Ghostex widgets' timelines. */
  reloadTimelines(): void;
}

export const GhostexWidgets = requireOptionalNativeModule<GhostexWidgetsModule>('GhostexWidgets');
