/**
 * What a ghostex:// or pairing link does, with the app's stores and navigation passed in
 * (`DeepLinkDeps`, wired in `deepLinks.ts`), so the rules are testable under `bun test`.
 *
 * - `ghostex://voice` opens the voice screen (the "Voice mode on" notification).
 * - A pairing link (`https://ghostex.dev/pair#…`) opens the scanner with it.
 * - `ghostex://session?machineId=…&sessionId=…[&title=…][&view=question]` opens the session as a tap in
 *   the Sessions list does: in its Chat View when it opens there, else its terminal (attached first).
 *   The Android persistent notification's rows and the agent notifications (REQ-NOTIF-012) send it.
 *   `view=question` (a "has a question" notification, REQ-NOTIF-016) opens the Chat View, where the
 *   question card stands in place of the composer; a session without a Chat View opens its terminal.
 *   At a cold start the link waits until the stores that decide or overwrite the session's view are
 *   loaded (`storesReady`); the computer's session list may still be missing then: the session is
 *   attached, and once the list shows it (during the attach, or read anew right after it) a question link
 *   switches to its Chat View when it has one. An ordinary link forces no view: the Terminal screen picks it
 *   with the rule a tap in the Sessions list uses (`chatModeArmed`) as soon as the list is there.
 */

import { readPairingCode } from '../machines/pairingCodes';

const SESSION_LINK = 'ghostex://session';

export type SessionLinkView = 'question';

export type SessionLink = { machineId: string; sessionId: string; title: string; view: SessionLinkView | null };

/** The link that opens a session (and, for `view: 'question'`, its question card). */
export function sessionDeepLink(link: {
  machineId: string;
  sessionId: string;
  title?: string;
  view?: SessionLinkView;
}): string {
  const query = [
    `machineId=${encodeURIComponent(link.machineId)}`,
    `sessionId=${encodeURIComponent(link.sessionId)}`,
    ...(link.title !== undefined && link.title.length > 0 ? [`title=${encodeURIComponent(link.title)}`] : []),
    ...(link.view !== undefined ? [`view=${link.view}`] : []),
  ];
  return `${SESSION_LINK}?${query.join('&')}`;
}

function queryParam(url: string, name: string): string | null {
  const match = new RegExp(`[?&]${name}=([^&#]*)`).exec(url);
  if (match === null) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/** The session a `ghostex://session` link names, or null for any other link or one without both ids. */
export function parseSessionLink(url: string): SessionLink | null {
  if (!url.startsWith(SESSION_LINK)) return null;
  const machineId = queryParam(url, 'machineId') ?? '';
  const sessionId = queryParam(url, 'sessionId') ?? '';
  if (machineId.length === 0 || sessionId.length === 0) return null;
  return {
    machineId,
    sessionId,
    title: queryParam(url, 'title') ?? '',
    view: queryParam(url, 'view') === 'question' ? 'question' : null,
  };
}

/** A computer as the terminal store connects to it. */
export type DeepLinkMachine = {
  id: string;
  host: string;
  username: string;
  port: number;
  transport?: 'ssh' | 'tailcat';
};

/** The session as the computer's session list has it. */
export type DeepLinkSession = {
  projectId: string;
  /** Its freshest title ('' when it has none). */
  title: string;
  hasChatView: boolean;
  /** A tap in the Sessions list opens its Chat View (Default Agent View or this tab's last choice). */
  opensInChatView: boolean;
};

export type TerminalRoute = { sessionKey: string; machineId: string; title?: string };

export type DeepLinkDeps = {
  /**
   * False until the saved computers and the saved view choices are loaded (a cold start); the link waits for
   * them, so the loading does not overwrite the view the link chose.
   */
  storesReady(): boolean;
  machine(machineId: string): DeepLinkMachine | undefined;
  session(machineId: string, sessionId: string): DeepLinkSession | undefined;
  /** Reads the computer's session list anew (a read that starts now) and gives the session as it then lists it. */
  loadSession(machineId: string, sessionId: string): Promise<DeepLinkSession | undefined>;
  /** Back from the Terminal lands on the list of the workspace this session is in. */
  revealWorkspace(machineId: string, sessionId: string): void;
  /** Opens (or selects) the session's tab for its Chat View, without attaching its terminal. */
  openChatTab(machine: DeepLinkMachine, session: { sessionId: string; projectId?: string; title?: string }): string;
  /** Shows this tab's Chat View from now on, as the Terminal screen's own toggle does. */
  showChatView(sessionKey: string): void;
  attachSession(machine: DeepLinkMachine, session: { sessionId: string; title?: string }): Promise<string>;
  navigate(
    route: { name: 'Terminal'; params: TerminalRoute } | { name: 'Voice' } | { name: 'ScanCode'; url: string },
  ): void;
  /** Runs `retry` again shortly (stores hydrate within moments of launch). */
  later(retry: () => void): void;
};

function openSession(link: SessionLink, deps: DeepLinkDeps): void {
  if (!deps.storesReady()) {
    deps.later(() => openSession(link, deps));
    return;
  }
  const machine = deps.machine(link.machineId);
  if (machine === undefined) return;
  deps.revealWorkspace(link.machineId, link.sessionId);
  const session = deps.session(link.machineId, link.sessionId);
  const title =
    session !== undefined && session.title.length > 0 ? session.title : link.title.length > 0 ? link.title : undefined;
  const chat = session !== undefined && (link.view === 'question' ? session.hasChatView : session.opensInChatView);
  if (chat) {
    const sessionKey = deps.openChatTab(machine, {
      sessionId: link.sessionId,
      projectId: session.projectId.length > 0 ? session.projectId : undefined,
      title,
    });
    if (link.view === 'question') deps.showChatView(sessionKey);
    deps.navigate({ name: 'Terminal', params: { sessionKey, machineId: machine.id, title } });
    return;
  }
  void deps
    .attachSession(machine, { sessionId: link.sessionId, title })
    .then(async (sessionKey) => {
      // On a cold start the summary may only have arrived during the attach.
      deps.revealWorkspace(link.machineId, link.sessionId);
      const question = link.view === 'question' && session === undefined;
      const arrived = question ? deps.session(link.machineId, link.sessionId) : undefined;
      if (arrived?.hasChatView === true) deps.showChatView(sessionKey);
      deps.navigate({ name: 'Terminal', params: { sessionKey, machineId: machine.id, title } });
      if (!question || arrived !== undefined) return;
      // Not there yet: read it, then show the question card when the session has a Chat View.
      const loaded = await deps.loadSession(link.machineId, link.sessionId);
      if (loaded?.hasChatView === true) deps.showChatView(sessionKey);
    })
    .catch(() => {
      // Connection failures surface on the Sessions screen as usual.
    });
}

/** Handles one incoming link (cold start or while running); links the app does not own are ignored. */
export function handleDeepLink(url: string | null, deps: DeepLinkDeps): void {
  if (url === null) return;
  if (url.startsWith('ghostex://voice')) {
    deps.navigate({ name: 'Voice' });
    return;
  }
  const pairing = readPairingCode(url);
  if (pairing !== null && pairing.kind !== 'legacyAddress') {
    deps.navigate({ name: 'ScanCode', url });
    return;
  }
  const link = parseSessionLink(url);
  if (link !== null) openSession(link, deps);
}
