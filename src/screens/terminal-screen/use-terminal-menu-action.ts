/**
 * The terminal menu's rows that open another screen or the chat's Session Note (Docs, Beads, Changes, Session Note),
 * before the Agent Actions handle the rest (`handleMenuAction`, use-agent-actions.ts). Moved verbatim from
 * src/screens/TerminalScreen.tsx so that file stays under the size limit; its one useCallback runs where it ran.
 */

import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { beadsOnFor } from '../../beads/featureSwitch';
import type { TerminalMenuActionId } from '../../components/terminal/TerminalMenu';
import type { GhostexProject, GhostexSession } from '../../contract/mobileSummary';
import { SessionCopy } from '../../copy';
import { contextSessionFor } from '../../files/sessionContext';
import type { RootStackParamList } from '../../navigation/types';
import type { TerminalTab } from '../../terminal/sessions';

type TerminalNavigation = NativeStackScreenProps<RootStackParamList, 'Terminal'>['navigation'];

export type TerminalMenuActionDeps = {
  activeAgentId: string;
  activeProject: GhostexProject | null;
  activeSession: GhostexSession | null;
  activeTab: TerminalTab | null;
  chatCapable: boolean;
  chatModeActive: boolean;
  handleMenuAction: (id: TerminalMenuActionId) => void;
  navigation: TerminalNavigation;
  setMenuVisible: (visible: boolean) => void;
  showsPanes: boolean;
  toggleChatView: () => void;
  setNoteWhenChatShows: Dispatch<SetStateAction<string | null>>;
  setChatSessionNoteRequestId: Dispatch<SetStateAction<number>>;
};

export function useTerminalMenuAction({
  activeAgentId,
  activeProject,
  activeSession,
  activeTab,
  chatCapable,
  chatModeActive,
  handleMenuAction,
  navigation,
  setMenuVisible,
  showsPanes,
  toggleChatView,
  setNoteWhenChatShows,
  setChatSessionNoteRequestId,
}: TerminalMenuActionDeps): (id: TerminalMenuActionId) => void {
  return useCallback(
    (id: TerminalMenuActionId): void => {
      if (id === 'docs') {
        setMenuVisible(false);
        if (activeTab !== null && activeProject !== null && (activeProject.path ?? '').length > 0) {
          // The agent session Files was opened from takes Add to Session Context.
          const session = contextSessionFor(
            activeTab,
            activeAgentId,
            activeSession === null || activeSession.displayTitle.length === 0
              ? SessionCopy.fallbackTitle
              : activeSession.displayTitle,
            chatCapable,
          );
          navigation.navigate('Docs', {
            machineId: activeTab.machineId,
            projectId: activeProject.projectId,
            projectName: activeProject.name ?? '',
            projectPath: activeProject.path ?? '',
            ...(session !== null ? { session } : {}),
          });
        }
        return;
      }
      if (id === 'beads') {
        setMenuVisible(false);
        if (
          activeTab !== null &&
          beadsOnFor(activeTab.machineId) &&
          activeProject !== null &&
          activeProject.projectId.length > 0
        ) {
          navigation.navigate('Beads', {
            machineId: activeTab.machineId,
            projectId: activeProject.projectId,
            projectName: activeProject.name ?? '',
            projectPath: activeProject.path ?? '',
          });
        }
        return;
      }
      if (id === 'changes') {
        setMenuVisible(false);
        if (activeTab !== null && activeProject !== null && activeProject.projectId.length > 0) {
          navigation.navigate('Changes', {
            machineId: activeTab.machineId,
            projectId: activeProject.projectId,
            projectName: activeProject.name ?? '',
          });
        }
        return;
      }
      if (id === 'sessionNote') {
        setMenuVisible(false);
        if (!chatModeActive) {
          toggleChatView();
          if (showsPanes && activeTab !== null) {
            setNoteWhenChatShows(activeTab.sessionKey);
            return;
          }
        }
        setChatSessionNoteRequestId((current) => current + 1);
        return;
      }
      handleMenuAction(id);
    },
    [
      activeAgentId,
      activeProject,
      activeSession,
      activeTab,
      chatCapable,
      chatModeActive,
      handleMenuAction,
      navigation,
      setMenuVisible,
      showsPanes,
      toggleChatView,
    ],
  );
}
