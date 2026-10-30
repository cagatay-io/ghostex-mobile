/**
 * The `ghostex://session?machineId=…&sessionId=…[&title=…]` link that opens one session: fired by the Android
 * persistent notification's rows and by a tap on a Live Activity row (REQ-LIVEACT-009, built by
 * `GhostexActivityTarget.deepLink` in modules/ghostex-live-activity). The ids are what finds the session; the
 * title is display copy only. Kept free of React Native so the parsing is testable under `bun test`.
 */

export type SessionLink = { machineId: string; sessionId: string; title: string };

function queryParam(url: string, name: string): string | null {
  const match = new RegExp(`[?&]${name}=([^&#]*)`).exec(url);
  if (match === null) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/** The session a `ghostex://session` link opens, or null for any other link or one without both ids. */
export function parseSessionLink(url: string): SessionLink | null {
  if (!url.startsWith('ghostex://session')) return null;
  const machineId = queryParam(url, 'machineId') ?? '';
  const sessionId = queryParam(url, 'sessionId') ?? '';
  if (machineId.length === 0 || sessionId.length === 0) return null;
  return { machineId, sessionId, title: queryParam(url, 'title') ?? '' };
}
