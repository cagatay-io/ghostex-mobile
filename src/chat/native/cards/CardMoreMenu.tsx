/**
 * The ⋯ button of a Ghostex form card, a page card and the page sheet's bar, and the menu it opens
 * (`MenuSheet`): Snooze first (User: "put snooze as top option here"), with its lengths (the dock's 1 hour, 6 hours and 24 hours, gx-chat-core
 * `questions/later.rs` `snooze`) and, for a page, Export page and Import answers (`pageExport.ts`),
 * as the desktop page window's ⋯ menu holds them.
 *
 * CDXC:SessionChat 2026-11-16 DECISION:
 * The user picked the ⋯ menus for starring a page on the phone (Q3546 on the star-resources page):
 * a page card's and the page sheet's ⋯ get Star (Unstar once starred) after Snooze, which stays
 * first, and a starred page's row in Chat Resources shows a yellow star. The rest of the decision
 * is on gx-chat-core questions/later.rs `starred_page_ids`.
 *
 * CDXC:SessionChat 2026-11-25 DECISION:
 * The desktop page window's ⋯ menu took the user's pick "A (but bit darker bg in darkmode pls) + D + G"
 * (apps/desktop/src/app/window/visual_page_modal/more_menu_panel.rs). Asked whether the phone gets D's
 * section headings too, the user answered yes: a page's ⋯ sheet groups its rows under "This page" (Snooze,
 * Star) and "Share" (Share link, Export page, Import answers), with the sheet's own headings
 * (`pageMenuRows`). No title row (the page sheet's bar already shows the title) and no glass.
 *
 * CDXC:SessionChat 2026-11-13 DECISION:
 * User, asked whether the phone gets Snooze for forms and pages (Q2940): "on phone just a clock icon under the 3 dots". So no Snooze button on the card: a ⋯ on the form card, the page card and the page sheet's bar holds Snooze (a clock), which opens the three lengths; the page sheet closes once the page is snoozed. Export page and Import answers moved into the page's ⋯ too, as on the desktop (apps/desktop/src/app/window/visual_page_modal/more_menu.rs). A snoozed form or page leaves the dock and the unanswered counts until it comes back, and the agent is told nothing.
 */

import { useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { Platform, Pressable, StyleSheet } from 'react-native';

import type { UserAction } from '../../rust/actions';
import { MenuSheet, type MenuRow } from '../composer/MenuSheet';
import { Glyph } from '../composer/icons';
import { pageIdOfUrl, pageLink } from '../referenceLabel';
import { pickExportedAnswers } from './pageExport';

/** The menu's Snooze row: a clock that opens the dock's three lengths. */
export function snoozeRow(id: string): MenuRow {
  return {
    label: 'Snooze',
    iconPath: 'titlebar/moon.svg',
    children: [
      { label: '1 hour', hours: 1 },
      { label: '6 hours', hours: 6 },
      { label: '24 hours', hours: 24 },
    ].map(({ label, hours }) => ({ label, command: { type: 'snoozeQuestion', id, hours } })),
  };
}

/** A page's Star row, Unstar once it is starred (gx-chat-core `pageStar`). */
export function starRow(pageId: string, starred: boolean): MenuRow {
  return {
    label: starred ? 'Unstar' : 'Star',
    iconPath: starred ? 'titlebar/star-filled.svg' : 'titlebar/star.svg',
    command: { type: 'pageStar', id: pageId, starred: !starred },
  };
}

/** A page's Share link row (shown only when the connected computer advertises `shareLinks`). */
export function shareLinkRow(shared = false): MenuRow {
  return {
    label: shared ? 'Shared · Manage link…' : 'Share link…',
    iconPath: shared ? 'titlebar/world.svg' : 'titlebar/link.svg',
    command: { local: 'shareLink' },
  };
}

/** A page's Export page and Import answers rows. */
export function pageRows(pageId: string): MenuRow[] {
  return [
    { label: 'Export page', iconPath: 'titlebar/file-down.svg', command: { type: 'exportPage', pageId } },
    { label: 'Import answers', iconPath: 'titlebar/file-up.svg', command: { local: 'importAnswers' } },
  ];
}

/**
 * Copy reference (copies `copied`) and Reference in chat (puts `pill` at the end of the chat box, as
 * a message's row does in `MessageActions.tsx`), the pair every question, work item, Live page and
 * message offers (gx-chat-core `transcript/item_references.rs`, CDXC:SessionChat 2026-11-25 there).
 */
export function referenceRows(copied: string, pill: string): MenuRow[] {
  return [
    { label: 'Copy reference', iconPath: 'titlebar/hash.svg', command: { local: 'copyText', text: copied } },
    { label: 'Reference in chat', iconPath: 'titlebar/quote.svg', command: { local: 'appendToDraft', text: pill } },
  ];
}

/**
 * A page's ⋯ rows under their headings: "This page" (Snooze while the page waits, Star, then Copy
 * reference and Reference in chat, `[<label of its title>](page:<id>)` for both) and "Share" (Share
 * link when the computer offers links, Export page, Import answers). `shared` is whether the page
 * already has a link, `null` when Share link is not offered. The reference names the page by the
 * 32-hex id of its address (`/visual/<id>`): `pageId` when it is one, else the one in `url`; the
 * reference rows are left out without one.
 */
export function pageMenuRows(
  pageId: string,
  {
    snooze,
    starred,
    shared,
    title = '',
    url = '',
  }: { snooze: boolean; starred: boolean; shared: boolean | null; title?: string; url?: string },
): MenuRow[] {
  const id = /^[0-9a-f]{32}$/iu.test(pageId) ? pageId : pageIdOfUrl(url);
  const link = id.length > 0 ? pageLink(title, id) : '';
  return [
    { heading: true, label: 'This page' },
    ...(snooze ? [snoozeRow(pageId)] : []),
    starRow(pageId, starred),
    ...(link.length > 0 ? referenceRows(link, link) : []),
    { heading: true, label: 'Share' },
    ...(shared !== null ? [shareLinkRow(shared)] : []),
    ...pageRows(pageId),
  ];
}

/**
 * `rows` are the menu's; a row's core action goes to `dispatch`, and `onSnoozed` runs after a
 * Snooze (the page sheet closes), `onReferenced` after Reference in chat (`referenceRows`).
 */
export function CardMoreMenu({
  rows,
  dispatch,
  color,
  onSnoozed,
  onShare,
  onReferenced,
  size = 18,
}: {
  rows: MenuRow[];
  dispatch: (action: UserAction) => void;
  color: string;
  onSnoozed?: () => void;
  onShare?: () => void;
  onReferenced?: () => void;
  size?: number;
}) {
  const [open, setOpen] = useState(false);
  // The answers picker waits for the menu to finish going away: iOS presents it from the top view
  // controller, which the closing sheet still is (CDXC in screens/terminal-screen/use-agent-actions.ts).
  const pending = useRef<(() => void) | null>(null);
  const importAnswers = () => {
    void pickExportedAnswers().then(
      (text) => {
        if (text !== null) dispatch({ type: 'importPageAnswers', text });
      },
      () => undefined,
    );
  };
  if (rows.length === 0) return null;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="More"
        onPress={() => setOpen(true)}
        hitSlop={6}
        style={({ pressed }) => [styles.button, pressed && { opacity: 0.6 }]}
      >
        <Glyph name="dots" size={size} color={color} />
      </Pressable>
      <MenuSheet
        rows={open ? rows : null}
        onClose={() => setOpen(false)}
        onDismissed={() => {
          const run = pending.current;
          pending.current = null;
          run?.();
        }}
        onCommand={(command) => {
          if (command.local === 'shareLink') {
            if (onShare) {
              if (Platform.OS === 'ios') pending.current = onShare;
              else onShare();
            }
            return;
          }
          if (command.local === 'copyText') {
            if (typeof command.text === 'string') void Clipboard.setStringAsync(command.text);
            return;
          }
          if (command.local === 'appendToDraft') {
            if (typeof command.text === 'string') dispatch({ type: 'appendToDraft', text: command.text, inline: true });
            onReferenced?.();
            return;
          }
          if (command.local === 'importAnswers') {
            if (Platform.OS === 'ios') pending.current = importAnswers;
            else importAnswers();
            return;
          }
          dispatch(command as UserAction);
          if (command.type === 'snoozeQuestion') onSnoozed?.();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  button: { width: 30, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
});
