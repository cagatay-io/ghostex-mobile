/**
 * A Cloud Box session row's long-press menu in the lists: Open chat, then the box's actions
 * (./menu.tsx). The computer's own session actions (rename, sleep, close, links…) would reach the
 * computer the row is listed under, not the box, so a box row offers only what reaches the box.
 * Returns nothing for any other row, so the list's own menu shows.
 */

import type { ContextMenuItem } from '../components/sessions/ContextMenu';
import type { SessionContext } from '../screens/sessions-screen/session-actions';
import { cloudBoxMenuItems } from './menu';
import { cloudBoxEntry } from './store';

export function cloudBoxRowMenu(
  ctx: SessionContext,
  open: () => void,
  report: (message: string) => void,
  close: () => void,
): { items: ContextMenuItem[]; subtitle?: string } | Record<string, never> {
  const box = ctx.item.session.cloudBox;
  if (box?.machineId === undefined) return {};
  const entry = cloudBoxEntry(box.boxId);
  if (entry === null) return {};
  // A box's terminals open on the computer (./open.ts), so its terminal rows offer no Open chat.
  const openChat: ContextMenuItem[] =
    ctx.item.session.kind === 'terminal' ? [] : [{ kind: 'item', key: 'cloudBox.open', label: 'Open chat', onPress: open }];
  return {
    subtitle: entry.box.name,
    items: [
      ...openChat,
      ...cloudBoxMenuItems(entry, ctx.item.session.sessionId, (outcome) => report(outcome.message), close),
    ],
  };
}
