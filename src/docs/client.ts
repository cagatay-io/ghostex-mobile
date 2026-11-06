/**
 * The project's Docs list on the phone: the same folders and files the desktop Docs view lists,
 * asked of gxserver through `ghostex session-chat-rpc runProjectDocsAction` so the scan roots, the
 * configured Docs directory, the ignored folders and the size caps stay gxserver's.
 *
 * CDXC:Docs 2026-09-24 WHY:
 * gxserver owns Docs discovery (`server/src/project_docs.rs`) and the phone reaches it only by SSH
 * exec; `runProjectDocsAction` is already on the `session-chat-rpc` allowlist, so the phone reuses
 * that verb instead of scanning folders itself. `additionalDocsFolders` is a client setting the
 * desktop passes with every Docs request, so the phone reads the saved value and passes it too.
 * SEE-ALSO: server/src/ghostex_cli/session_chat_rpc.rs, apps/desktop/src/app/helpers/manage_docs.rs
 */

import { sessionChatRpc } from '../chat/rust/transport';
import { runGhostexCli } from '../components/sessions/cli';
import type { MachineConnectionTarget } from '../machines/credentials';
import { DOCS_MOUNT_SEGMENT, isRecord, parseDocsEntries, type DocsEntry } from './entries';
import { joinRemotePath } from './paths';

const LIST_TIMEOUT_MS = 60_000;

async function additionalDocsFolders(machine: MachineConnectionTarget): Promise<string> {
  try {
    const result = await runGhostexCli(machine, 'ghostex settings get manageAdditionalDocsFolders --json');
    const current = result.json?.current;
    return typeof current === 'string' ? current : '';
  } catch {
    // An older Ghostex without `settings get` still lists the built-in Docs folders.
    return '';
  }
}

export async function listProjectDocs(machine: MachineConnectionTarget, projectId: string): Promise<DocsEntry[]> {
  const folders = await additionalDocsFolders(machine);
  const answer = await sessionChatRpc(
    machine,
    'runProjectDocsAction',
    { projectId, action: 'list', additionalDocsFolders: folders, requestId: `mobile-docs-${Date.now()}` },
    LIST_TIMEOUT_MS,
  );
  if (answer.error !== null) throw new Error(answer.error.message);
  const result: Record<string, unknown> = isRecord(answer.result) ? answer.result : {};
  if (typeof result.error === 'string' && result.error.length > 0) throw new Error(result.error);
  return parseDocsEntries(result.entries);
}

/**
 * The absolute path on the computer for a Docs entry. Project entries are relative to the project
 * folder; an entry of the mounted Docs directory lives wherever that directory is, which only
 * gxserver knows, so its full path is asked for (`copyFullPath`).
 */
export async function resolveDocsEntryPath(
  machine: MachineConnectionTarget,
  projectId: string,
  projectPath: string,
  entryPath: string,
): Promise<string> {
  if (entryPath !== DOCS_MOUNT_SEGMENT && !entryPath.startsWith(`${DOCS_MOUNT_SEGMENT}/`)) {
    return joinRemotePath(projectPath, entryPath);
  }
  const answer = await sessionChatRpc(machine, 'runProjectDocsAction', {
    projectId,
    action: 'copyFullPath',
    path: entryPath,
    additionalDocsFolders: '',
  });
  if (answer.error !== null) throw new Error(answer.error.message);
  const result: Record<string, unknown> = isRecord(answer.result) ? answer.result : {};
  if (typeof result.fullPath === 'string' && result.fullPath.length > 0) return result.fullPath;
  throw new Error(typeof result.error === 'string' ? result.error : 'The Docs file is unavailable.');
}
