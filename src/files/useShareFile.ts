/**
 * Share… on a screen of the project file browser: a progress notice while the file is fetched from
 * the computer (approved mockup, `fetchingToast`), then the share sheet, or gxserver's message when it refuses the
 * file. One share at a time for the whole app: the list, the file view and the Docs viewer each run this hook, and
 * while any of them shares, `sharing` is true on all of them and a tap starts nothing.
 */

import { useCallback, useSyncExternalStore } from 'react';

import { DocsCopy } from '../copy';
import { formatFileSize } from './preview';
import type { DocsRpc } from './request';
import { isSharing, shareProjectFile, subscribeSharing } from './share';
import { appShareSheet } from './shareSheet';

/** A screen's notices: `show(message, error, title, lasting)`, and `clear()` for a lasting one. */
export type ShareNotices = {
  show: (message: string, error: boolean, title: string, lasting: boolean) => void;
  clear: () => void;
};

const appSharing = () => isSharing(appShareSheet);

export function useShareFile(
  rpc: DocsRpc,
  projectId: string,
  notices: ShareNotices,
): { share: (file: { path: string; name: string; size: number | null }) => void; sharing: boolean } {
  const sharing = useSyncExternalStore(subscribeSharing, appSharing, appSharing);
  const { show, clear } = notices;
  const share = useCallback(
    (file: { path: string; name: string; size: number | null }) => {
      // Read when the tap comes, so a second tap anywhere before the next render starts nothing either.
      if (isSharing(appShareSheet)) return;
      show(
        DocsCopy.shareFetchingDetail(file.size === null ? null : formatFileSize(file.size)),
        false,
        DocsCopy.shareFetching(file.name),
        true,
      );
      void shareProjectFile(rpc, projectId, file, appShareSheet, clear).then((outcome) => {
        if (!outcome.shared && 'message' in outcome)
          show(outcome.message, true, DocsCopy.shareFailed(file.name), false);
      });
    },
    [clear, projectId, rpc, show],
  );
  return { share, sharing };
}
