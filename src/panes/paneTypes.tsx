/**
 * The pane types this build can show, in the order the pane type menu and the chooser list them (the approved panes
 * mockup's order). The stored layout names every type the layout contract knows (`PANE_TYPES` in `layout.ts`); a type
 * joins this list once its content exists, with its body in `PaneContentView.tsx` and its slot content in `resolve.ts`
 * (`PaneHost.tsx` is the same for every type). The agents, attention and usage panes are not shown yet: a stored one
 * leaves one pane.
 */

import type { ReactElement } from 'react';

import { COMMAND_ICONS } from '../assets/tablerIcons.generated';
import { FolderGlyph, WorldGlyph } from '../components/sessions/icons';
import { TerminalWindowIcon } from '../components/terminal/icons';
import { PanesCopy } from '../copy';
import type { SettablePaneType } from './usePaneHost';

export type PaneTypeDefinition = {
  readonly type: SettablePaneType;
  readonly label: string;
  /** What the chooser says the type shows. */
  readonly description: string;
  /** Shows a project: offered only for a session with a project folder (as the ⋯ menu's Files and Changes rows). */
  readonly needsProject: boolean;
  readonly icon: (size: number, color: string) => ReactElement;
};

export const AVAILABLE_PANE_TYPES: readonly PaneTypeDefinition[] = [
  {
    type: 'session',
    label: PanesCopy.sessionType,
    description: PanesCopy.sessionTypeDescription,
    needsProject: false,
    icon: (size, color) => <TerminalWindowIcon size={size} color={color} />,
  },
  {
    type: 'browser',
    label: PanesCopy.browserType,
    description: PanesCopy.browserTypeDescription,
    needsProject: false,
    icon: (size, color) => <WorldGlyph size={size} color={color} />,
  },
  {
    type: 'files',
    label: PanesCopy.filesType,
    description: PanesCopy.filesTypeDescription,
    needsProject: true,
    icon: (size, color) => <FolderGlyph size={size} color={color} />,
  },
  {
    type: 'git',
    label: PanesCopy.gitType,
    description: PanesCopy.gitTypeDescription,
    needsProject: true,
    icon: (size, color) => <COMMAND_ICONS.fileDiff size={size} color={color} />,
  },
];
