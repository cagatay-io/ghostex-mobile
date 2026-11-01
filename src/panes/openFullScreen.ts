/**
 * Folded, there are no pane slots: when the Duo folds while a pane other than a session is the active one, its content
 * opens full screen instead, as the screen of its own that the app has (the approved panes mockup: the active pane
 * stays full screen; "the same holds for files, agents, Git and usage"). The Web Preview opens at the pane's page, or
 * at its start; Files and Changes open for the pane's project; the attention list as the Notifications screen; the
 * usage as the Usage screen for the pane's computer. Going back leaves the session on screen; unfolded, the stored
 * layout is shown again. The agents' screen is the Sessions screen, the app's full-screen list of a computer's agent
 * sessions with their status, which the terminal screen's Back goes to; it is switched to the agents pane's computer
 * first (its computer choice, as a pick there), so it shows the computer whose sessions the pane listed (its workspace
 * filter stays its own). A session opened there brings the layout back.
 */

import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useMachinesStore } from '../machines/store';
import type { RootStackParamList } from '../navigation/types';
import { paneProjectNow } from './paneProject';
import { machineOfSessionKey, type PaneContent } from './resolve';
import { usePaneStore } from './store';

export function openPaneFullScreen(
  content: PaneContent,
  navigation: Pick<NativeStackNavigationProp<RootStackParamList>, 'navigate' | 'popTo'>,
  /** The computer of the session on screen: a browser pane's when it has not reported one, and the agents pane's. */
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
    case 'agents':
      useMachinesStore.getState().selectMachine(machineId);
      navigation.popTo('Sessions');
      return;
    case 'attention':
      navigation.navigate('AttentionList');
      return;
    case 'usage':
      navigation.navigate('Usage', { machineId: machineOfSessionKey(content.origin) });
      return;
    case 'session':
    case 'chooser':
      return;
  }
}
