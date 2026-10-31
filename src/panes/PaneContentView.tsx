/**
 * What a pane shows, by its content: a session's terminal, or the chooser in a new second pane. Each pane type of
 * `paneTypes.tsx` has its body here.
 */

import type { GhostexSession } from '../contract/mobileSummary';
import type { PaneFrame } from './PaneHost';
import type { PaneContent } from './resolve';
import SessionChooser from './SessionChooser';
import SessionPane from './SessionPane';

export type PaneContentViewProps = {
  content: PaneContent;
  frame: PaneFrame;
  /** The computer of the session on screen; the chooser lists its sessions. */
  machineId: string;
  /** The session on screen beside the chooser. */
  besideSessionId: string | undefined;
  onPickSession: (session: GhostexSession) => void;
};

export default function PaneContentView({
  content,
  frame,
  machineId,
  besideSessionId,
  onPickSession,
}: PaneContentViewProps) {
  if (content.kind === 'session') {
    return (
      <SessionPane sessionKey={content.sessionKey} view={frame.view} covered={frame.covered} active={frame.active} />
    );
  }
  return <SessionChooser machineId={machineId} besideSessionId={besideSessionId} onPick={onPickSession} />;
}
