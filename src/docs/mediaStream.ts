/**
 * Where the phone reads a file on the computer that it plays or shows itself (video, audio, a PDF,
 * an Excalidraw drawing): a file link from the computer's gxserver (`/open-file/<token>/…`,
 * answered with byte ranges, so a long video starts at once and seeks), loaded through the forward
 * the chat already holds to that gxserver. Copying the file over SSH first would cost the whole file
 * before a frame shows.
 *
 * A file in the session's project gets the project's folder link (`openLink`), the one the
 * desktop's Files view opens; a file anywhere else on the computer gets a link to that one file
 * (`openSessionFileLink`, CDXC:Docs 2026-10-16 in server/src/file_links/registry.rs).
 * SEE-ALSO: server/src/file_links/ (the links and their ranged answers),
 * server/src/project_docs/actions.rs (`openLink`, `openSessionFileLink`), src/webPreview/machineLinks.ts
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
      .inventoriesByMachineId[machineId]?.summary?.projects.find((project) => project.projectId === projectId)?.path ??
    '';
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

/**
 * The gxserver path (`/open-file/<token>/…`) that reads `remotePath`. Throws a message fit to show
 * when it cannot.
 */
export async function computerFileLinkPath(
  machine: MachineConnectionTarget,
  remotePath: string,
  project: ViewerProject | null,
): Promise<string> {
  // The link is asked for through the project's Files actions, so it needs the session's project.
  if (project === null) {
    throw new Error(`Open this file from the session's chat to view it on the phone: ${remotePath}`);
  }
  const relative = projectRelativePath(remotePath, project.projectPath);
  const answer = await sessionChatRpc(machine, 'runProjectDocsAction', {
    projectId: project.projectId,
    ...(relative !== null
      ? { action: 'openLink', path: relative, scope: 'project' }
      : { action: 'openSessionFileLink', filePath: normalizeRemotePath(remotePath) }),
    additionalDocsFolders: '',
    requestId: `mobile-file-${Date.now()}`,
  });
  const error = answer.error?.message ?? errorText((answer.result ?? {}) as Record<string, unknown>);
  if (error !== null) {
    // A computer from before one-file links answers that it has no such action.
    if (relative === null && /unsupported files action/iu.test(error)) {
      throw new Error(`Update Ghostex on the computer to open files outside the project on the phone: ${remotePath}`);
    }
    throw new Error(error);
  }
  const linkPath = ((answer.result ?? {}) as Record<string, unknown>).linkPath;
  if (typeof linkPath !== 'string' || !linkPath.startsWith('/')) {
    throw new Error('Update Ghostex on the computer to open its files on the phone.');
  }
  return linkPath;
}

function errorText(result: Record<string, unknown>): string | null {
  return typeof result.error === 'string' && result.error.length > 0 ? result.error : null;
}

/** The phone URL that reads `remotePath` (see {@link computerFileLinkPath}). */
export async function computerFileUrl(
  machine: MachineConnectionTarget,
  remotePath: string,
  project: ViewerProject | null,
): Promise<string> {
  const linkPath = await computerFileLinkPath(machine, remotePath, project);
  return `${await gxserverPhoneOrigin(machine)}${linkPath}`;
}
