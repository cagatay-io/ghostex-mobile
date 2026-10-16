/**
 * Where the phone plays a video or audio file that is on the computer: the file link the computer's
 * gxserver gives the desktop's Files view (`/open-file/<token>/…`, answered with byte ranges, so a
 * long video starts at once and seeks), loaded through the forward the chat already holds to that
 * gxserver. Copying the file over SSH first would cost the whole file before a frame shows.
 *
 * A link is minted for a folder gxserver knows (the session's project), so a file outside the
 * project cannot be played this way; the viewer says so with the file's path.
 * SEE-ALSO: server/src/file_links/ (the link and its ranged answers),
 * server/src/project_docs/actions.rs (`openLink`), src/webPreview/machineLinks.ts
 */

import { sessionChatRpc } from '../chat/rust/transport';
import { useInventoryStore } from '../inventory/store';
import type { MachineConnectionTarget } from '../machines/credentials';
import { gxserverPhoneOrigin } from '../webPreview/machineLinks';
import { normalizeRemotePath } from './paths';

/** The project a viewer was opened from. */
export type ViewerProject = { projectId: string; projectPath: string };

/** The project folder for `projectId` on the machine, from the live inventory. */
export function viewerProject(machineId: string, projectId: string | undefined): ViewerProject | null {
  if (projectId === undefined || projectId.length === 0) return null;
  const projectPath =
    useInventoryStore
      .getState()
      .inventoriesByMachineId[machineId]?.summary?.projects.find((project) => project.projectId === projectId)?.path ?? '';
  return projectPath.length > 0 ? { projectId, projectPath } : null;
}

/** `remotePath` relative to the project folder, or null when it is not inside it. */
function projectRelativePath(remotePath: string, projectPath: string): string | null {
  const file = normalizeRemotePath(remotePath);
  const root = normalizeRemotePath(projectPath).replace(/\/+$/u, '');
  // Windows paths compare without regard to case, as the file system does.
  const windows = /^[a-z]:\//iu.test(root);
  const fold = (value: string): string => (windows ? value.toLowerCase() : value);
  if (!fold(file).startsWith(`${fold(root)}/`)) return null;
  const relative = file.slice(root.length + 1);
  return relative.length > 0 ? relative : null;
}

/** The phone URL that streams `remotePath`. Throws a message fit to show when it cannot. */
export async function mediaStreamUrl(
  machine: MachineConnectionTarget,
  remotePath: string,
  project: ViewerProject | null
): Promise<string> {
  if (project === null) {
    throw new Error(`Videos and audio play on the phone from a session's project folder. Open this file from the session's chat: ${remotePath}`);
  }
  const relative = projectRelativePath(remotePath, project.projectPath);
  if (relative === null) {
    throw new Error(`This file is outside the session's project folder, so the phone can't play it: ${remotePath}`);
  }
  const answer = await sessionChatRpc(machine, 'runProjectDocsAction', {
    projectId: project.projectId,
    action: 'openLink',
    path: relative,
    scope: 'project',
    additionalDocsFolders: '',
    requestId: `mobile-media-${Date.now()}`,
  });
  if (answer.error !== null) throw new Error(answer.error.message);
  const result = (answer.result ?? {}) as Record<string, unknown>;
  if (typeof result.error === 'string' && result.error.length > 0) throw new Error(result.error);
  const linkPath = typeof result.linkPath === 'string' ? result.linkPath : '';
  if (!linkPath.startsWith('/')) throw new Error('Update Ghostex on the computer to play its videos and audio on the phone.');
  return `${await gxserverPhoneOrigin(machine)}${linkPath}`;
}
