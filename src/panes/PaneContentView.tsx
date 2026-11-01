/**
 * What a pane shows, by its content: a session's terminal, the chooser in a new pane, the computer's Web Preview, the
 * files or Git changes of the project the pane was opened from, the computer's agent sessions, the attention list or
 * the usage of the computer the pane was opened for. Each pane type of `paneTypes.tsx` has its body here; the browser,
 * files, Git changes and attention list bodies are the Web Preview, Files, Changes and Notifications screens' own, the
 * usage body the Usage screen's. Every body but a terminal keeps its controls off a book fold by `frame.controlInset`.
 */

import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { lazy, Suspense } from 'react';

import type { GhostexSession } from '../contract/mobileSummary';
import type { RootStackParamList } from '../navigation/types';
import type { OpenSessionTarget } from '../notifications/AttentionList';
import { ChangesView } from '../screens/ChangesScreen';
import { DocsBrowser } from '../screens/DocsScreen';
import UsageView from '../usage/UsageView';
import AgentsPane from './AgentsPane';
import type { PaneFrame } from './PaneHost';
import ProjectPane from './ProjectPane';
import { machineOfSessionKey, type PaneContent } from './resolve';
import SessionChooser from './SessionChooser';
import SessionPane from './SessionPane';
import type { SettablePaneType } from './usePaneHost';

/**
 * The Web Preview's module, with its WebView, loads when a browser pane is first shown: the terminal screen loads
 * without it, as it did before a pane could show the Web Preview.
 */
const BrowserPane = lazy(async () => require('./BrowserPane') as typeof import('./BrowserPane'));
/** The attention list's module, with the app's notification and link modules, loads with the first attention pane. */
const AttentionPane = lazy(async () => require('./AttentionPane') as typeof import('./AttentionPane'));

export type PaneContentViewProps = {
  content: PaneContent;
  frame: PaneFrame;
  /** The computer of the session on screen; the chooser and the agents pane list its sessions, a browser pane is its
   * Web Preview. */
  machineId: string;
  /** The session on screen beside the chooser. */
  besideSessionId: string | undefined;
  /** The session on screen has a project with a folder: the chooser offers Files and Git Changes. */
  projectOffered: boolean;
  /** A session picked in the chooser or the agents pane, on `machineId`. */
  onPickSession: (session: GhostexSession) => void;
  onPickType: (type: Exclude<SettablePaneType, 'session'>) => void;
  /** The chooser's Close row: as its pane's close button. */
  onCloseChooser: () => void;
  /** The chooser's new terminal in the project of the session beside it (`beside`), opened in the chooser's pane. */
  onNewTerminal: (beside: GhostexSession) => void;
  /** A row opened in the attention list pane. */
  onOpenAttention: (target: OpenSessionTarget) => void;
  /**
   * Opens a file from a files pane in the full-screen viewer (a Ghostex page in the Web preview), and the chooser's
   * Add Project flow.
   */
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
  onCloseChooser,
  onNewTerminal,
  onOpenAttention,
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
    case 'agents':
      return <AgentsPane machineId={machineId} controlInset={frame.controlInset} onPick={onPickSession} />;
    case 'attention':
      return (
        <Suspense fallback={null}>
          <AttentionPane controlInset={frame.controlInset} onOpenSession={onOpenAttention} />
        </Suspense>
      );
    case 'usage':
      return (
        <UsageView
          key={content.origin}
          machineId={machineOfSessionKey(content.origin)}
          placement={{ kind: 'pane', controlInset: frame.controlInset }}
        />
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
          onClose={onCloseChooser}
          onNewTerminal={onNewTerminal}
          onAddProject={() => navigation.push('AddProjectSource', { machineId })}
        />
      );
  }
}
