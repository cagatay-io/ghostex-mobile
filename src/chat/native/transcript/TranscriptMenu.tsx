/**
 * The transcript's menu (desktop `transcript_menu.rs`, React's transcript `ContextMenu`): reference
 * rows for a link, then Copy and Add to Chat. The rows are the core's (`transcriptMenu`, the rules
 * in `packages/gx-chat-core/src/composer/transcript_menu.rs`); this file opens them in a sheet and
 * hands each row's command to the screen, which performs what only it can (`TranscriptMenuHost`).
 *
 * CDXC:SessionChat 2026-09-25 WHY:
 * Desktop opens this menu with a right press and reads the window's text selection. A phone has
 * neither, so a long press on a message opens it with that whole message as the selection, and a
 * long press on a link opens the link's rows alone, as a right press on a link with nothing
 * selected does on desktop. The prose those rows cover is not natively selectable: a selectable
 * text view claims the same long press for its own selection menu on both platforms, which
 * raced the sheet. The subagent viewer opens the same menu (user decision 2026-10-12), nested in
 * its own modal.
 */

import { useCallback, useEffect, useMemo } from 'react';

import type { ChatDocument } from '../../rust/document';
import type { RustChat } from '../../rust/useRustChat';
import { MenuSheet, type MenuRow } from '../composer/MenuSheet';
import { arr, obj, str } from './json';
import { closeTranscriptMenu, useTranscriptMenuStore } from './transcriptMenuStore';

/** What the screen answers for the menu's rows. */
export type TranscriptMenuHost = {
  /** Whether the phone can perform this command at all; rows it cannot are left out. */
  serves(command: MenuRow): boolean;
  /** Performs a command the core handed back untouched (`copyText`, `host` actions). */
  perform(command: MenuRow): void;
};

/** The composer hides behind a question card, which is when desktop disables Add to Chat. */
function questionActive(document: ChatDocument | null): boolean {
  return document?.questionCard?.visible === true && str(document.prompt, 'kind') === 'question';
}

/**
 * `enabled` is false for the copy the chat screen mounts while the subagent viewer is open: the
 * viewer's modal carries its own copy, since a modal presented from under another one does not show
 * on iOS.
 */
export function TranscriptMenuSheet({
  chat,
  host,
  enabled = true,
}: {
  chat: RustChat;
  host: TranscriptMenuHost;
  enabled?: boolean;
}) {
  const request = useTranscriptMenuStore((state) => state.request);
  const document = chat.state?.document ?? null;
  const active = questionActive(document);
  const { query } = chat;
  const rows = useMemo<MenuRow[] | null>(() => {
    if (request === null || !enabled) return null;
    const answer = arr(
      query('transcriptMenu', [{ href: request.href, selection: request.selection, questionActive: active }]),
    );
    const served = answer
      .map((row) => obj(row))
      .filter((row): row is MenuRow => {
        const command = obj(row?.command);
        return command !== null && (str(command, 'type') === 'appendToDraft' || host.serves(command));
      });
    // The message's own actions follow Copy and Add to Chat: the phone shows none of them until
    // the message is held (desktop shows them on hover).
    const own = request.actions.map((action, index) => ({
      label: action.label,
      iconPath: `titlebar/${action.icon}.svg`,
      command: { type: 'messageAction', index },
    }));
    const all = own.length > 0 ? [...served, ...(served.length > 0 ? [{ separator: true }] : []), ...own] : served;
    return all.length > 0 ? all : null;
  }, [active, enabled, host, query, request]);
  // The menu belongs to the chat on screen; leaving it drops a request still pending.
  useEffect(() => closeTranscriptMenu, []);
  const composerText = chat.state?.composer.text ?? '';
  const onCommand = useCallback(
    (command: MenuRow): boolean => {
      if (str(command, 'type') === 'messageAction') {
        const index = typeof command.index === 'number' ? command.index : -1;
        useTranscriptMenuStore.getState().request?.actions[index]?.run();
        return false;
      }
      if (str(command, 'type') === 'appendToDraft') {
        const text = str(command, 'text');
        if (text.length > 0) chat.dispatch({ type: 'appendToDraft', text, draft: composerText });
        return false;
      }
      host.perform(command);
      return false;
    },
    [chat, composerText, host],
  );
  return <MenuSheet rows={rows} onClose={closeTranscriptMenu} onCommand={onCommand} />;
}
