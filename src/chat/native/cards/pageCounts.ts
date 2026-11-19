/**
 * Keeps the answered/total count of the page rows on screen current: asks each page's computer
 * how much of it is answered now and every few seconds while drawn (desktop
 * `refresh_page_counts`, gx-chat-core `loadPageQuestionCounts`), so a pick made in the page shows
 * as "1/3" on its row. A computer too old to know the action ignores it.
 */
import { useEffect } from 'react';
import type { UserAction } from '../../rust/actions';

/** How often a drawn page row asks for its counts (desktop `PAGE_COUNTS_EVERY`). */
const PAGE_COUNTS_EVERY_MS = 5000;

export function usePageCountRefresh(dispatch: (action: UserAction) => void, pageIds: string[]): void {
  const key = [...new Set(pageIds.filter((id) => id.length > 0))].sort().join('\n');
  useEffect(() => {
    if (key.length === 0) return undefined;
    const ids = key.split('\n');
    const ask = () => {
      for (const pageId of ids) {
        dispatch({ type: 'loadPageQuestionCounts', pageId } as unknown as UserAction);
      }
    };
    ask();
    const timer = setInterval(ask, PAGE_COUNTS_EVERY_MS);
    return () => clearInterval(timer);
    // The ids are the key; `dispatch` is the chat's own and stays the same.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
