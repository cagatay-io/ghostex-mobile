/**
 * Posting a reviewed feedback issue straight from the phone to the Ghostex feedback relay
 * (`POST https://feedback.ghostex.dev/v1/feedback`), which stores the screenshots and files
 * the GitHub issue.
 *
 * CDXC:Feedback 2026-10-16 WHY:
 * Phone users often report that they cannot reach their computer, so Send Bug / Feedback on
 * the phone posts to the relay itself rather than through gxserver. The relay needs only its
 * public app key (it ships in every build and is not a secret), JSON, and a `client` of
 * `mobile` with the app's version and the phone's OS; it takes `desktop`, `web` or `mobile`,
 * so iOS and Android are told apart in `os`.
 * SEE-ALSO: server/src/feedback/relay.rs (the computer's post, its app key and the error
 * sentences mirrored here), the relay checkout's src/validate.ts (the limits).
 */

import * as Application from 'expo-application';
import { Platform } from 'react-native';

import type { FeedbackImage } from './feedbackImages';

/** `EXPO_PUBLIC_GHOSTEX_FEEDBACK_RELAY_URL` points a development build at a local mock relay,
 * as `GHOSTEX_FEEDBACK_RELAY_URL` does for gxserver. */
const FEEDBACK_RELAY_URL = (
  process.env.EXPO_PUBLIC_GHOSTEX_FEEDBACK_RELAY_URL || 'https://feedback.ghostex.dev'
).replace(/\/+$/, '');
const FEEDBACK_RELAY_APP_KEY = 'gxfb_300d19442e7005ed9fdda519';
/** Five screenshots of 5 MB on a slow mobile uplink need minutes. */
const FEEDBACK_RELAY_TIMEOUT_MS = 170_000;

export interface FeedbackClient {
  app: 'mobile';
  version: string;
  os: string;
}

/** The phone as the relay's `client`: the app's version and `iOS 18.1` / `Android 15 (API 35)`. */
export function feedbackClient(): FeedbackClient {
  const version = (Application.nativeApplicationVersion ?? '')
    .replace(/[^0-9A-Za-z.+_-]/g, '')
    .slice(0, 64);
  const release =
    Platform.OS === 'android'
      ? `Android ${String((Platform.constants as { Release?: string }).Release ?? '')} (API ${Platform.Version})`
      : `${Platform.OS === 'ios' ? 'iOS' : Platform.OS} ${String(Platform.Version)}`;
  const os = release
    .replace(/[^0-9A-Za-z .,()/+_-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  return { app: 'mobile', version: version || 'unknown', os: os || Platform.OS };
}

/** The line the relay writes under the issue, so the Review step can show it. */
export function feedbackFooter(client: FeedbackClient): string {
  return `Sent from Ghostex feedback · Mobile ${client.version} · ${client.os}`;
}

export interface FeedbackRequest {
  title: string;
  body: string;
  images: { name: string; contentType: string; dataBase64: string }[];
  client: FeedbackClient;
  collectedByAgent: boolean;
  /**
   * The sender's GitHub username. The relay keeps the mention of a first line that is exactly
   * `Reported by @<reporter>` so GitHub notifies them, and neutralizes every other one (CDXC:Feedback
   * 2026-10-16 DECISION in server/src/feedback/relay.rs). An older relay ignores the field.
   */
  reporter: string;
}

/** The relay request for a reviewed issue sent by GitHub user `reporter`. */
export function feedbackRequest(
  title: string,
  body: string,
  images: FeedbackImage[],
  reporter: string,
): FeedbackRequest {
  return {
    title: title.trim(),
    body: body.trim(),
    images: images.map((image) => ({
      name: image.name,
      contentType: image.contentType,
      dataBase64: image.dataBase64,
    })),
    client: feedbackClient(),
    collectedByAgent: false,
    reporter,
  };
}

/** Posts the issue and answers its number and URL, or throws an Error the user can read. */
export async function sendFeedback(
  request: FeedbackRequest,
): Promise<{ issueNumber: number; issueUrl: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEEDBACK_RELAY_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${FEEDBACK_RELAY_URL}/v1/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Ghostex-App-Key': FEEDBACK_RELAY_APP_KEY,
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
  } catch (error) {
    throw new Error(
      `Could not reach the feedback service. Check your internet connection and try again. (${
        error instanceof Error ? error.message : String(error)
      })`,
    );
  } finally {
    clearTimeout(timer);
  }
  const answer: unknown = await response.json().catch(() => null);
  if (response.ok) {
    const record = (answer ?? {}) as { issueNumber?: unknown; issueUrl?: unknown };
    if (
      typeof record.issueNumber === 'number' &&
      typeof record.issueUrl === 'string' &&
      record.issueUrl.startsWith('https://')
    ) {
      return { issueNumber: record.issueNumber, issueUrl: record.issueUrl };
    }
    throw new Error('The feedback service did not say which issue it created.');
  }
  const retryAfter = Number.parseInt(response.headers.get('Retry-After') ?? '', 10);
  const error = ((answer ?? {}) as { error?: RelayError }).error ?? {};
  throw new Error(
    relayErrorMessage(response.status, error, Number.isFinite(retryAfter) ? retryAfter : undefined),
  );
}

interface RelayError {
  code?: string;
  message?: string;
  limit?: string;
  retryAfterSeconds?: number;
  githubStatus?: number;
  githubMessage?: string;
}

/** `relay_error_message` in server/src/feedback/relay.rs. */
function relayErrorMessage(status: number, error: RelayError, retryAfter?: number): string {
  const code = error.code ?? '';
  const relaySaid = (fallback: string) =>
    `The feedback service refused the issue: ${error.message ?? fallback}`;
  if (status === 429 || code === 'rate_limited') {
    return rateLimitMessage(error.limit, error.retryAfterSeconds ?? retryAfter);
  }
  if (status === 401 || code === 'unauthorized') {
    return 'This version of Ghostex can no longer send feedback. Update Ghostex and try again.';
  }
  if (status === 413 || code === 'payload_too_large') return relaySaid('an image is larger than 5 MB.');
  if (status === 415 || code === 'unsupported_media_type') {
    return relaySaid('only PNG, JPEG and WebP images can be attached.');
  }
  if (
    status === 400 ||
    code === 'invalid_json' ||
    code === 'invalid_request' ||
    code === 'invalid_image'
  ) {
    return relaySaid('the issue was not in the expected shape.');
  }
  if (status === 502 || code === 'github_error') return githubRefusalMessage(error);
  if (status === 503 || code === 'not_configured') {
    return 'The feedback service is not available yet. Please try again later.';
  }
  return `The feedback service had a problem (HTTP ${status}). Please try again.`;
}

/** `github_refusal_message` in server/src/feedback/relay.rs. */
function githubRefusalMessage(error: RelayError): string {
  const status = error.githubStatus;
  const said = error.githubMessage?.trim() || undefined;
  if (status !== undefined && said) return `GitHub did not accept the issue (HTTP ${status}): ${said}`;
  if (status !== undefined && status >= 500) {
    return `GitHub is having trouble right now (HTTP ${status}). Please try again in a few minutes.`;
  }
  if (status !== undefined) return `GitHub did not accept the issue (HTTP ${status}).`;
  return 'GitHub did not accept the issue just now. Please try again in a moment.';
}

/** `rate_limit_message` in server/src/feedback/relay.rs. */
function rateLimitMessage(limit?: string, retryAfter?: number): string {
  if (limit === 'daily_ip') {
    return "You've sent the daily maximum of feedback from this network. You can send more tomorrow.";
  }
  if (limit === 'daily_global') return "We've received a lot of feedback today. Please try again tomorrow.";
  if (retryAfter !== undefined) return `Too many feedback submissions. Try again in ${waitLabel(retryAfter)}.`;
  return 'Too many feedback submissions. Please try again in a minute.';
}

function waitLabel(seconds: number): string {
  if (seconds <= 120) return `${Math.max(seconds, 1)} s`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} min`;
  return `${Math.ceil(seconds / 3600)} h`;
}
