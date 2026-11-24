/**
 * Untouched new-session drafts: a draft created by the one-click New session flow that has no
 * text typed and no setup changes yet is closed automatically when the user opens another session,
 * matching desktop's untouched-draft cleanup.
 */

import type { MachineConnectionTarget } from '../../machines/credentials';
import { sessionChatRpc } from '../rust/transport';

export type UntouchedDraft = {
  machine: MachineConnectionTarget;
  projectId: string;
  sessionId: string;
};

const untouchedDrafts = new Map<string, UntouchedDraft>();

export function trackUntouchedDraft(sessionKey: string, draft: UntouchedDraft): void {
  untouchedDrafts.set(sessionKey, draft);
}

export function markDraftTouched(sessionKey: string): void {
  untouchedDrafts.delete(sessionKey);
}

export function dismissUntouchedDraft(sessionKey: string, closeTab: (key: string) => Promise<void>): void {
  const draft = untouchedDrafts.get(sessionKey);
  if (draft === undefined) return;
  untouchedDrafts.delete(sessionKey);
  // gxserver only closes the session when it is still an empty draft.
  void sessionChatRpc(draft.machine, 'draftWorktree', {
    projectId: draft.projectId,
    sessionId: draft.sessionId,
    finish: true,
    moved: true,
  }).catch(() => undefined);
  void closeTab(sessionKey).catch(() => undefined);
}
