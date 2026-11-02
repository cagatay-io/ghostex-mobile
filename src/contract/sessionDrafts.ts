type DraftSession = {
  createdAt?: string;
  isDraft?: boolean;
  isPinned?: boolean;
  hasComposerDraft?: boolean;
};

/**
 * CDXC:Drafts 2026-11-02 SEE-ALSO:
 * packages/gx-core/src/sidebar_view/ordering.rs owns Drafts membership (every never-sent session that is not pinned, empty or not, from the moment it is created) and the 10-minute lead a new sent session keeps at the top of Sessions; keep this standalone mobile contract aligned.
 */
export const NEW_SESSION_PRIORITY_MS = 10 * 60 * 1_000;

export function newSessionPriorityExpiresAt(session: DraftSession | undefined): number {
  return Date.parse(session?.createdAt ?? '') + NEW_SESSION_PRIORITY_MS;
}

export function isNewSidebarSession(session: DraftSession | undefined, nowMs: number = Date.now()): boolean {
  return newSessionPriorityExpiresAt(session) > nowMs;
}

export function isSidebarDraftSectionSession(session: DraftSession | undefined, _nowMs: number = Date.now()): boolean {
  return session?.isDraft === true && session.isPinned !== true;
}
