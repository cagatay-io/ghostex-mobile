/**
 * The pane types this build can show, in the order the pane type menu lists them. The stored layout names every type
 * the layout contract knows (`PANE_TYPES` in `layout.ts`); a type joins this list once its content exists, with its
 * body in `PaneContentView.tsx` and its slot content in `resolve.ts` (`PaneHost.tsx` is the same for every type).
 * This build shows session panes; a stored pane of another type leaves one pane.
 */

import type { ReactElement } from 'react';

import { TerminalWindowIcon } from '../components/terminal/icons';
import { PanesCopy } from '../copy';
import type { PaneType } from './layout';

export type PaneTypeDefinition = {
  readonly type: PaneType;
  readonly label: string;
  readonly icon: (size: number, color: string) => ReactElement;
};

export const AVAILABLE_PANE_TYPES: readonly PaneTypeDefinition[] = [
  {
    type: 'session',
    label: PanesCopy.sessionType,
    icon: (size, color) => <TerminalWindowIcon size={size} color={color} />,
  },
];
