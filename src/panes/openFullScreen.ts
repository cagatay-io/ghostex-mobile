/**
 * Folded, there are no pane slots: when the Duo folds while a browser, files or Git changes pane is the
 * active one, its content opens full screen instead, as the screen of its own that the app already has (the approved
 * panes mockup: the active pane stays full screen). The Web Preview opens at the pane's page, or at its start; Files
 * and Changes open for the pane's project. Going back leaves the session on screen; unfolded, the stored layout is
 * shown again.
 */

import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/types';
import { paneProjectNow } from './paneProject';
import type { PaneContent } from './resolve';
import { usePaneStore } from './store';

export function openPaneFullScreen(
  content: PaneContent,
  navigation: Pick<NativeStackNavigationProp<RootStackParamList>, 'navigate'>,
  /** The computer of the session on screen: a browser pane's when it has not reported one. */
  machineId: string,
): void {
  switch (content.kind) {
    case 'browser': {
      const browser = usePaneStore.getState().browserPage;
      if (browser !== null && browser.page !== null) navigation.navigate('WebPreview', browser.page);
      else navigation.navigate('WebPreviewPorts', { machineId: browser?.machineId ?? machineId });
      return;
    }
    case 'files':
    case 'git': {
      const project = paneProjectNow(content.origin);
      if (project === null) return;
      const { projectId, projectName, projectPath, session } = project;
      if (content.kind === 'git') {
        navigation.navigate('Changes', { machineId: project.machineId, projectId, projectName });
        return;
      }
      navigation.navigate('Docs', {
        machineId: project.machineId,
        projectId,
        projectName,
        projectPath,
        ...(session !== null ? { session } : {}),
      });
      return;
    }
    case 'session':
    case 'chooser':
      return;
  }
}
