import { useCallback } from 'react';
import { Alert, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { DocsCopy } from '../copy';
import { previewKindForPath } from '../docs/paths';
import type { RootStackParamList } from '../navigation/types';
import { useSettingsStore } from '../settings/store';
import { classifyMachineLink, withPageTheme } from './machineLinks';

export type OpenMachineLinkOptions = {
  /** The session's project, whose file link plays a video or audio file the link names. */
  projectId?: string;
  /** Shown instead of the default alert when the link names a file the phone has no viewer for. */
  onUnviewableFile?: (path: string) => void;
};

/**
 * CDXC:Browser 2026-09-12 DECISION:
 * User: localhost links on Android and iOS open in the embedded browser, where the computer's port is reachable.
 * Chat and both native terminal link events share this routing.
 *
 * What a link names is decided once, in `machineLinks.ts`: an address on the computer's loopback
 * opens in the Web preview through a forward (a page the computer's gxserver published shares the
 * chat's forward and follows the chat's theme), a `file://` link opens the computer's file in the
 * file viewer, and only an internet address goes to the phone's browser.
 */
export function useOpenMachineLink() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return useCallback((machineId: string, url: string, options: OpenMachineLinkOptions = {}): void => {
    const link = classifyMachineLink(url);
    if (link.kind === 'file') {
      if (previewKindForPath(link.path) !== null) {
        navigation.push('DocViewer', {
          machineId,
          path: link.path,
          ...(link.fragment !== undefined ? { fragment: link.fragment } : {}),
          ...(options.projectId !== undefined && options.projectId.length > 0 ? { projectId: options.projectId } : {}),
        });
        return;
      }
      // The file is on the computer, where the phone has nothing to open it with; its path is what it can offer.
      void Clipboard.setStringAsync(link.path);
      if (options.onUnviewableFile !== undefined) options.onUnviewableFile(link.path);
      else Alert.alert(DocsCopy.cantPreview, DocsCopy.pathCopiedNote(link.path));
      return;
    }
    if (link.kind === 'computer') {
      const { scheme, remotePort, host, path } = link.address;
      const theme = useSettingsStore.getState().settings.sessionChatTheme;
      navigation.navigate('WebPreview', { machineId, scheme, remotePort, host, path: withPageTheme(path, theme) });
      return;
    }
    void Linking.openURL(link.url).catch(() => undefined);
  }, [navigation]);
}
