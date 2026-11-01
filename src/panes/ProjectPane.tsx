/**
 * A files or Git changes pane's frame: the project of the session it was opened from (`paneProject.ts`),
 * a spinner while the computer's session list is read, and a notice when that list no longer has the session and the
 * app has not seen its project this run (a pane stored before a restart whose session has ended since). The content
 * is the existing screen body for that project, keyed by it.
 */

import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { PanesCopy } from '../copy';
import { GhostexPalette } from '../theme/palette';
import { usePaneProject, type PaneProject } from './paneProject';

export type ProjectPaneProps = {
  /** The session the pane was opened from, `machineId:sessionId`. */
  origin: string;
  children: (project: PaneProject) => ReactNode;
};

export default function ProjectPane({ origin, children }: ProjectPaneProps) {
  const state = usePaneProject(origin);
  if (state.kind === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" color={GhostexPalette.MUTED} accessibilityLabel={PanesCopy.projectLoading} />
      </View>
    );
  }
  if (state.kind === 'unknown') {
    return (
      <View style={styles.center}>
        <Text style={styles.notice}>{PanesCopy.projectGone}</Text>
      </View>
    );
  }
  return children(state.project);
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: GhostexPalette.BACKGROUND,
  },
  notice: {
    color: GhostexPalette.MUTED,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
});
