/**
 * The notification switches in `settings.v1` (`notifications`, schema `settings-additions`): one master
 * switch plus one each for finished, waiting and error (D-020 item 3). All four start off and stay off
 * until the one-time ask is answered (`askedAt`, REQ-NOTIF-014, D-023). The waiting switch also governs
 * "has a question" (REQ-NOTIF-015: D-032 changes only the wording). Kept free of React Native so the
 * rules are testable under `bun test`.
 */

export type NotificationSettings = {
  /** The master switch. */
  enabled: boolean;
  finished: boolean;
  /** Waiting for you, including approvals and "has a question". */
  waiting: boolean;
  error: boolean;
  /** When the first-launch ask was answered (ISO time); absent until then. */
  askedAt?: string;
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: false,
  finished: false,
  waiting: false,
  error: false,
};

/**
 * A stored value as the app may use it. Anything malformed falls back to "not asked, all off"; a switch
 * stored on without `askedAt` is off, because nothing may notify before the ask (the schema's
 * if/then rule, REQ-NOTIF-014 AC6).
 */
export function sanitizeNotificationSettings(value: unknown): NotificationSettings {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_NOTIFICATION_SETTINGS };
  // The cast holds: `value` is a non-null object; each field taken from it is checked (`askedAt`, `=== true`).
  const record = value as Record<string, unknown>;
  const askedAt =
    typeof record.askedAt === 'string' && !Number.isNaN(Date.parse(record.askedAt)) ? record.askedAt : undefined;
  if (askedAt === undefined) return { ...DEFAULT_NOTIFICATION_SETTINGS };
  const bool = (key: 'enabled' | 'finished' | 'waiting' | 'error'): boolean => record[key] === true;
  return {
    enabled: bool('enabled'),
    finished: bool('finished'),
    waiting: bool('waiting'),
    error: bool('error'),
    askedAt,
  };
}
