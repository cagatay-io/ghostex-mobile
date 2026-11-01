/**
 * The attention-list pane: the Notifications screen's list (`AttentionList`) in a pane, read again when it comes
 * into view as that screen is. `PaneContentView` loads this module when an attention pane is
 * first shown: the list's module brings the app's notification and link modules, which the terminal screen loads
 * without, as before.
 */

import { useEffect } from 'react';

import AttentionList, { type OpenSessionTarget } from '../notifications/AttentionList';
import { refreshAttentionFeeds } from '../notifications/feedStore';
import type { PaneBarInset } from './geometry';

export default function AttentionPane({
  controlInset,
  onOpenSession,
}: {
  controlInset: PaneBarInset;
  onOpenSession: (target: OpenSessionTarget) => void;
}) {
  useEffect(() => {
    void refreshAttentionFeeds();
  }, []);
  return <AttentionList pane={{ controlInset }} onOpenSession={onOpenSession} />;
}
