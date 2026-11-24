/**
 * The pictures on published pages' chat cards, keyed by `(pageId, answered, theme)`, as the core's
 * `pageThumbnail` host action delivers them (`packages/gx-chat-core/src/transcript/page_thumbnails.rs`).
 * The host writes them here (`rust/host.ts`); `VisualBlock`'s page card reads them and asks again
 * (`loadPageThumbnail`) after `retryInMs` while the picture is still on its way. Desktop keeps the
 * same map on its view (`native_chat/page_card.rs`). Page ids are unguessable 128-bit ids, so one
 * map serves every chat.
 */

import { create } from 'zustand';

export type PageThumbnailTheme = 'dark' | 'light';

export type PageThumbnail = {
  /** Base64 PNG, or null while there is none yet. */
  png: string | null;
  /** Theme the picture was captured for, or null for an unthemed opaque fallback. */
  theme: PageThumbnailTheme | null;
  /** True when the stored PNG has a transparent background composited onto the card's backdrop. */
  transparent: boolean;
  /** This is the page's current picture (or there will be none); nothing more to ask. */
  settled: boolean;
  /** How long to wait before asking again, when not settled. */
  retryInMs: number | null;
  /** Bumped on every answer, so a card waiting on the same page wakes for each one. */
  revision: number;
};

type PageThumbnailState = { pages: { [key: string]: PageThumbnail } };

export const usePageThumbnailStore = create<PageThumbnailState>(() => ({ pages: {} }));

/** Cache key for one `(pageId, answered, theme)` thumbnail slot. */
export function pageThumbnailKey(pageId: string, answered: boolean, theme: PageThumbnailTheme): string {
  return `${pageId.toLowerCase()}:${answered ? '1' : '0'}:${theme}`;
}

/** The host's arm for `pageThumbnail` (`{pageId, png, settled, retryInMs, theme?, transparent?}`). */
export function receivePageThumbnail(fields: Record<string, unknown>): void {
  const pageId = typeof fields.pageId === 'string' ? fields.pageId.toLowerCase() : '';
  if (pageId.length === 0) return;
  const responseTheme: PageThumbnailTheme | null =
    fields.theme === 'light' || fields.theme === 'dark' ? fields.theme : null;
  const png = typeof fields.png === 'string' && fields.png.length > 0 ? fields.png : null;
  const transparent = fields.transparent === true;
  const settled = fields.settled !== false;
  const retryInMs = typeof fields.retryInMs === 'number' ? fields.retryInMs : null;

  usePageThumbnailStore.setState((state) => {
    const targetThemes: readonly PageThumbnailTheme[] = responseTheme !== null ? [responseTheme] : ['dark', 'light'];
    const targets: string[] = [];
    for (const theme of targetThemes) {
      const unansweredKey = pageThumbnailKey(pageId, false, theme);
      const answeredKey = pageThumbnailKey(pageId, true, theme);
      if (asked.has(unansweredKey) || state.pages[unansweredKey] !== undefined) targets.push(unansweredKey);
      if (asked.has(answeredKey) || state.pages[answeredKey] !== undefined) targets.push(answeredKey);
    }
    if (targets.length === 0) {
      for (const theme of targetThemes) targets.push(pageThumbnailKey(pageId, false, theme));
    }
    const nextPages = { ...state.pages };
    for (const key of targets) {
      const previous = state.pages[key];
      nextPages[key] = {
        // A stale picture stays up until its replacement arrives.
        png: png ?? previous?.png ?? null,
        theme: responseTheme ?? previous?.theme ?? null,
        transparent: png !== null ? transparent : (previous?.transparent ?? false),
        settled,
        retryInMs,
        revision: (previous?.revision ?? 0) + 1,
      };
    }
    return { pages: nextPages };
  });
}

/** The `(pageId, answered, theme)` keys already asked for (cards remount as the list scrolls). */
const asked = new Set<string>();

/** Whether a card should ask for `pageId`'s picture now: never asked for this `(answered, theme)`. */
export function askedPageThumbnail(pageId: string, answered: boolean, theme: PageThumbnailTheme): boolean {
  const key = pageThumbnailKey(pageId, answered, theme);
  if (asked.has(key)) return false;
  asked.add(key);
  return true;
}
