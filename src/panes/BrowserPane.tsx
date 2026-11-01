/**
 * A browser pane: the computer's Web Preview in a slot, as Sessions › Web opens it: its start (an
 * address, or one of the computer's listening ports), then the page, with a compact toolbar. Back at the page's first
 * entry returns to the start. The page is not stored (the pane layout has no field for it): after a restart the pane
 * shows the start, the port opened last filled in. What it shows is kept in the pane store while the app runs, for the
 * pane's title and for the full-screen Web Preview it opens when the Duo is folded with this pane active.
 */

import { useCallback, useEffect, useState } from 'react';

import { WebPreviewPortsView } from '../screens/WebPreviewPortsScreen';
import { WebPreviewView } from '../screens/WebPreviewScreen';
import type { PaneBarInset } from './geometry';
import { usePaneStore, type BrowserPage } from './store';

export type BrowserPaneProps = {
  /** The computer whose Web Preview this is: the selected session's. */
  machineId: string;
  /** Where the start's and the page's controls keep off a book fold (`PaneFrame.controlInset`). */
  controlInset: PaneBarInset;
};

export default function BrowserPane({ machineId, controlInset }: BrowserPaneProps) {
  const [page, setPage] = useState<BrowserPage | null>(null);
  const setBrowserPage = usePaneStore((state) => state.setBrowserPage);
  useEffect(() => setBrowserPage({ machineId, page: null }), [machineId, setBrowserPage]);
  const shown = useCallback(
    (current: BrowserPage) => setBrowserPage({ machineId, page: current }),
    [machineId, setBrowserPage],
  );
  const toStart = useCallback(() => {
    setPage(null);
    setBrowserPage({ machineId, page: null });
  }, [machineId, setBrowserPage]);

  if (page === null) {
    return <WebPreviewPortsView machineId={machineId} inPane controlInset={controlInset} onOpen={setPage} />;
  }
  return <WebPreviewView page={page} placement="pane" controlInset={controlInset} onClose={toStart} onPage={shown} />;
}
