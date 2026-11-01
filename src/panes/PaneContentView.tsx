/**
 * What a pane shows, by its content: a session's terminal, the chooser in a new pane, the computer's Web Preview, or
 * the files or Git changes of the project the pane was opened from. Each pane type of `paneTypes.tsx`
 * has its body here; the browser, files and Git changes bodies are the Web Preview, Files and Changes screens' own.
 * Every body but a terminal keeps its controls off a book fold by `frame.controlInset`.
 */

import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { lazy, Suspense } from 'react';

import type { GhostexSession } from '../contract/mobileSummary';
import type { RootStackParamList } from '../navigation/types';
import { ChangesView } from '../screens/ChangesScreen';
import { DocsBrowser } from '../screens/DocsScreen';
import type { PaneFrame } from './PaneHost';
import ProjectPane from './ProjectPane';
import type { PaneContent } from './resolve';
import SessionChooser from './SessionChooser';
import SessionPane from './SessionPane';
import type { SettablePaneType } from './usePaneHost';

/**
 * The Web Preview's module, with its WebView, loads when a browser pane is first shown: the terminal screen loads
 * without it, as it did before a pane could show the Web Preview.
 */
const BrowserPane = lazy(async () => require('./BrowserPane') as typeof import('./BrowserPane'));

export type PaneContentViewProps = {
  content: PaneContent;
  frame: PaneFrame;
  /** The computer of the session on screen; the chooser lists its sessions, a browser pane is its Web Preview. */
  machineId: string;
  /** The session on screen beside the chooser. */
  besideSessionId: string | undefined;
  /** The session on screen has a project with a folder: the chooser offers Files and Git Changes. */
  projectOffered: boolean;
  onPickSession: (session: GhostexSession) => void;
  onPickType: (type: Exclude<SettablePaneType, 'session'>) => void;
  /** Opens a file from a files pane in the full-screen viewer, and a Ghostex page in the Web preview. */
  navigation: Pick<NativeStackNavigationProp<RootStackParamList>, 'push' | 'navigate'>;
};

export default function PaneContentView({
  content,
  frame,
  machineId,
  besideSessionId,
  projectOffered,
  onPickSession,
  onPickType,
  navigation,
}: PaneContentViewProps) {
  switch (content.kind) {
    case 'session':
      return (
        <SessionPane sessionKey={content.sessionKey} view={frame.view} covered={frame.covered} active={frame.active} />
      );
    case 'browser':
      return (
        <Suspense fallback={null}>
          <BrowserPane key={machineId} machineId={machineId} controlInset={frame.controlInset} />
        </Suspense>
      );
    case 'files':
      return (
        <ProjectPane origin={content.origin}>
          {({ machineId: projectMachineId, projectId, projectName, projectPath, session }) => (
            <DocsBrowser
              key={`${projectMachineId}:${projectId}`}
              machineId={projectMachineId}
              projectId={projectId}
              projectName={projectName}
              projectPath={projectPath}
              {...(session !== null ? { session } : {})}
              placement={{ kind: 'pane', navigation, controlInset: frame.controlInset }}
            />
          )}
        </ProjectPane>
      );
    case 'git':
      return (
        <ProjectPane origin={content.origin}>
          {({ machineId: projectMachineId, projectId, projectName }) => (
            <ChangesView
              key={`${projectMachineId}:${projectId}`}
              machineId={projectMachineId}
              projectId={projectId}
              projectName={projectName}
              controlInset={frame.controlInset}
            />
          )}
        </ProjectPane>
      );
    case 'chooser':
      return (
        <SessionChooser
          machineId={machineId}
          besideSessionId={besideSessionId}
          projectOffered={projectOffered}
          controlInset={frame.controlInset}
          onPick={onPickSession}
          onPickType={onPickType}
        />
      );
  }
}
