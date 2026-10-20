/**
 * Opening a file on the computer from anywhere on the phone (a chat file link or card, the
 * transcript menu, a terminal `file://` link, a link inside the file viewer). What the phone's file
 * viewer shows opens there (`previewKindForPath`); a PDF opens in the phone's own PDF app on
 * Android (downloaded through the computer's gxserver) and in the Web preview on iOS, whose WebKit
 * view draws PDFs itself; an Excalidraw drawing opens the computer's drawing page (the one the
 * desktop's Open Externally shows, which saves back) in the Web preview. Anything else copies its
 * path, which is all the phone can offer for it.
 *
 * CDXC:RemoteMachines 2026-10-16 DECISION:
 * User picked: PDFs on the phone "download through the computer's gxserver and open in the phone's own PDF viewer (Android intent; iOS share/QuickLook if the phone app supports iOS)", and Excalidraw drawings "open the computer's drawing page in the phone's web preview through the gxserver connection", instead of copying the path. On iOS the PDF opens in the Web preview because WebKit renders PDFs natively, which needs no new native module (a share sheet or QuickLook would).
 * SEE-ALSO: src/docs/mediaStream.ts (the file link), server/src/file_links/ (what it serves).
 */

import * as Clipboard from 'expo-clipboard';
import { Directory, File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Platform } from 'react-native';

import { DocsCopy } from '../copy';
import { useMachinesStore } from '../machines/store';
import type { RootStackParamList } from '../navigation/types';
import { gxserverComputerPort } from '../webPreview/machineLinks';
import { computerFileLinkPath, computerFileUrl, viewerProject } from './mediaStream';
import { baseName, extensionOf, normalizeRemotePath, previewKindForPath } from './paths';

/** `Intent.FLAG_GRANT_READ_URI_PERMISSION`: lets the PDF app read the content URI. */
const FLAG_GRANT_READ_URI_PERMISSION = 0x00000001;

/** What opens a file the phone's viewer does not show. */
type Opener = 'pdf' | 'drawing';

function openerForPath(path: string): Opener | null {
  const extension = extensionOf(path);
  if (extension === 'pdf') return 'pdf';
  if (extension === 'excalidraw') return 'drawing';
  return null;
}

/** Whether the phone opens `path` at all, rather than only copying it. */
export function phoneOpensFile(path: string): boolean {
  return previewKindForPath(path) !== null || openerForPath(path) !== null;
}

type FileNavigation = Pick<NativeStackNavigationProp<RootStackParamList>, 'push' | 'navigate'>;

export type OpenComputerFileOptions = {
  /** The session's project: its file link reads the file (`mediaStream.ts`). */
  projectId?: string;
  /** An anchor the viewer scrolls to. */
  fragment?: string;
  /** Shows a short message: progress, a copied path, or a failure (`error`). */
  notify: (message: string, error: boolean, title?: string) => void;
};

/** Opens `path` (absolute on the computer) as the header comment describes. */
export function openComputerFile(
  navigation: FileNavigation,
  machineId: string,
  path: string,
  options: OpenComputerFileOptions,
): void {
  const target = normalizeRemotePath(path);
  const projectId = options.projectId !== undefined && options.projectId.length > 0 ? options.projectId : undefined;
  if (previewKindForPath(target) !== null) {
    navigation.push('DocViewer', {
      machineId,
      path: target,
      ...(options.fragment !== undefined ? { fragment: options.fragment } : {}),
      ...(projectId !== undefined ? { projectId } : {}),
    });
    return;
  }
  const opener = openerForPath(target);
  const machine = useMachinesStore.getState().machines.find((candidate) => candidate.id === machineId);
  if (opener === null || machine === undefined) {
    void Clipboard.setStringAsync(target);
    options.notify(DocsCopy.pathCopiedNote(target), false, DocsCopy.cantPreview);
    return;
  }
  const project = viewerProject(machineId, projectId);
  const opened =
    opener === 'pdf' && Platform.OS === 'android'
      ? (async () => {
          options.notify(DocsCopy.openingPdf, false);
          await openPdfInPhoneApp(await computerFileUrl(machine, target, project), target);
        })()
      : (async () => {
          const [linkPath, remotePort] = await Promise.all([
            computerFileLinkPath(machine, target, project),
            gxserverComputerPort(machine),
          ]);
          // gxserver binds `127.0.0.1`, so the preview shares the chat's forward to it.
          navigation.navigate('WebPreview', {
            machineId,
            scheme: 'http',
            remotePort,
            host: '127.0.0.1',
            path: linkPath,
          });
        })();
  opened.catch((error: unknown) => {
    options.notify(error instanceof Error ? error.message : String(error), true, DocsCopy.openFailed);
  });
}

/** Downloads the PDF at `url` into the cache and hands it to the phone's PDF app. */
async function openPdfInPhoneApp(url: string, remotePath: string): Promise<void> {
  const folder = new Directory(Paths.cache, 'computer-files');
  if (!folder.exists) folder.create({ intermediates: true });
  const destination = new File(folder, baseName(remotePath));
  if (destination.exists) destination.delete();
  const file = await File.downloadFileAsync(url, destination, { idempotent: true });
  try {
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: file.contentUri,
      flags: FLAG_GRANT_READ_URI_PERMISSION,
      type: 'application/pdf',
    });
  } catch {
    throw new Error(DocsCopy.noPdfApp(remotePath));
  }
}
