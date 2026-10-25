/**
 * What a page in the page sheet had typed but not yet saved on its computer when it had to go: the
 * sheet closed, or the page moved to a new phone port, while the link to the computer was down. The
 * phone keeps it for this app run and posts it to the page's `/visual/<id>/draft` route as soon as it
 * can (right away, when the link comes back, or when that page opens again, before it loads), so the
 * page opens with it.
 *
 * CDXC:SessionChat 2026-10-26 WHY:
 * The user typed answers to every question of a page on the phone over Tailscale while the link
 * reconnected; the page's drafts could not land, Send said "Failed to fetch", and closing the page
 * lost the text. The page keeps retrying its drafts and send itself (server/src/visual_pages/theme.rs)
 * and the forward keeps its phone port (GhostexPortForward.kt), but a page that is closed while the
 * link is down takes its unsaved text with it, since its WebView goes and a page has no storage of its
 * own; this map is where that text waits.
 */

import { GhostexNative } from '../../../../modules/ghostex-native/src';
import type { MachineConnectionTarget } from '../../../machines/credentials';
import { openComputerForward, type ComputerAddress } from '../../../webPreview/machineLinks';
import { localPreviewUrl } from '../../../webPreview/urls';

type UnsavedDraft = {
  machine: MachineConnectionTarget;
  page: ComputerAddress;
  pageId: string;
  draft: Record<string, unknown>;
};

const unsavedDrafts = new Map<string, UnsavedDraft>();

const draftKey = (machineId: string, pageId: string): string => `${machineId}\u0000${pageId}`;

/** Keeps the draft a page could not save, replacing an older one for the same page. */
export function keepUnsavedDraft(
  machine: MachineConnectionTarget,
  page: ComputerAddress,
  pageId: string,
  draft: Record<string, unknown>,
): void {
  unsavedDrafts.set(draftKey(machine.id, pageId), { machine, page, pageId, draft });
}

/**
 * Posts the kept draft of one page, if there is one. It is let go once gxserver answers anything but
 * a 5xx (stored, or refused because the page was answered or is gone); a link that is still down
 * keeps it for the next try.
 */
export async function sendUnsavedDraft(machineId: string, pageId: string): Promise<void> {
  const key = draftKey(machineId, pageId);
  const entry = unsavedDrafts.get(key);
  if (entry === undefined) return;
  try {
    const { localPort } = await openComputerForward(entry.machine, entry.page);
    const response = await fetch(localPreviewUrl(entry.page.scheme, localPort, `/visual/${entry.pageId}/draft`), {
      method: 'POST',
      body: JSON.stringify({ draft: entry.draft }),
    });
    if (response.status >= 500) return;
    if (unsavedDrafts.get(key) === entry) unsavedDrafts.delete(key);
  } catch {
    // The link is still down: the next connection, or opening the page again, sends it.
  }
}

GhostexNative.addListener('onConnectionState', (event) => {
  if (event.state !== 'connected') return;
  for (const entry of [...unsavedDrafts.values()]) {
    if (entry.machine.id === event.machineId) void sendUnsavedDraft(entry.machine.id, entry.pageId);
  }
});
