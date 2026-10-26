/**
 * What Settings > Updates says about the over-the-air update state from expo-updates' useUpdates().
 *
 * The native state machine reports "no error" and "no progress" as `null` on iOS (an absent Swift
 * optional crosses the bridge as NSNull) although the TypeScript types say `undefined`, and an error
 * arrives as a plain `{ message }` object, not an `Error`. So every field is read as nullable.
 */

export type OtaStatusLine = { text: string; tone: 'muted' | 'accent' | 'error' };

export type OtaState = {
  ready: { version: string | null } | null;
  isChecking: boolean;
  isDownloading: boolean;
  downloadProgress?: number | null;
  checkError?: unknown;
  downloadError?: unknown;
};

export const OtaCopy = {
  automatic: 'Updates download on their own and apply the next time Ghostex starts.',
  checking: 'Checking for an update…',
  downloading: (percent: number | null) =>
    percent === null ? 'Downloading an update…' : `Downloading an update… ${percent}%`,
  ready: (version: string | null) => (version === null ? 'An update is ready.' : `Ghostex ${version} is ready.`),
  error: (message: string | null) =>
    message === null ? 'The last update check failed.' : `The last update check failed: ${message}`,
} as const;

/** The text of an error-like value, or null when there is no error or it carries no text. */
export function otaErrorMessage(error: unknown): string | null {
  if (error === null || error === undefined) return null;
  if (typeof error === 'string') return error.length > 0 ? error : null;
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && message.length > 0 ? message : null;
}

function hasError(error: unknown): boolean {
  return error !== null && error !== undefined && error !== false;
}

export function otaStatusLine(state: OtaState): OtaStatusLine {
  if (state.ready !== null) return { text: OtaCopy.ready(state.ready.version), tone: 'accent' };
  if (state.isDownloading) {
    const progress = state.downloadProgress;
    const percent = typeof progress === 'number' ? Math.round(progress * 100) : null;
    return { text: OtaCopy.downloading(percent), tone: 'muted' };
  }
  if (state.isChecking) return { text: OtaCopy.checking, tone: 'muted' };
  const error = hasError(state.downloadError) ? state.downloadError : state.checkError;
  if (hasError(error)) return { text: OtaCopy.error(otaErrorMessage(error)), tone: 'error' };
  return { text: OtaCopy.automatic, tone: 'muted' };
}
