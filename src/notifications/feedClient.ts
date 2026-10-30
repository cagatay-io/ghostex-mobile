/**
 * Reading and changing one computer's notification feed through gxserver's HTTP API over the warm link
 * (`POST /api/readNotificationFeed`, `POST /api/updateNotificationFeed`; spike `spike-host-data.md` §2).
 * Read state is the computer's, so the list and the desktop bell share it (D-020 item 3); `markRead`
 * also acknowledges the session's attention on every client. The request function is passed in
 * (`FeedRpc`), so the client is testable under `bun test` with a fake transport.
 */

import { parseFeedState, type FeedSnapshot } from './feedContract';

export const READ_FEED_METHOD = 'readNotificationFeed';
export const UPDATE_FEED_METHOD = 'updateNotificationFeed';

/** gxserver's answer in the chat link's terms (`RpcAnswer`). */
export type FeedRpcAnswer = { result: unknown; error: null } | { result?: undefined; error: { message: string } };

/** One request to gxserver. */
export type FeedRpc = (method: string, params: Record<string, unknown>) => Promise<FeedRpcAnswer>;

export type FeedUpdate =
  { action: 'markRead' | 'markUnread' | 'dismiss'; notificationId: string } | { action: 'markAllRead' | 'clearAll' };

/** Why a request gave no feed: the computer answered with an error, or with something the phone cannot read. */
export type FeedRequestFailure = 'refused' | 'unreadable';

/**
 * A failed request. It keeps only its category: the computer's own error text can carry paths or agent
 * output, and an error ends up in the app log, which can be exported (review s7-r1 K-2).
 */
export class FeedRequestError extends Error {
  constructor(readonly category: FeedRequestFailure) {
    super(`notification feed request ${category}`);
  }
}

function snapshotOf(answer: FeedRpcAnswer): FeedSnapshot {
  if (answer.error !== null) throw new FeedRequestError('refused');
  const snapshot = parseFeedState(answer.result);
  if (snapshot === null) throw new FeedRequestError('unreadable');
  return snapshot;
}

export async function readFeed(rpc: FeedRpc): Promise<FeedSnapshot> {
  return snapshotOf(await rpc(READ_FEED_METHOD, {}));
}

/** Sends one change; the computer answers with the whole feed after it. */
export async function updateFeed(rpc: FeedRpc, update: FeedUpdate): Promise<FeedSnapshot> {
  return snapshotOf(await rpc(UPDATE_FEED_METHOD, { ...update }));
}
