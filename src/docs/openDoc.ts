/**
 * Placing a file on the computer that a chat file link or a terminal `file://` hyperlink names;
 * `openComputerFile.ts` opens it.
 */

import { isAbsoluteRemotePath } from '../addProject/paths';
import { joinRemotePath, normalizeRemotePath } from './paths';

/**
 * The computer-side path a `file://` URL names, whatever the file is. The host part is ignored: a
 * terminal on the computer writes its own hostname there.
 */
export function remotePathFromFileUrl(url: string): { path: string; fragment?: string } | null {
  const match = /^file:\/\/[^/]*(\/[^?#]*)(?:\?[^#]*)?(?:#(.*))?$/iu.exec(url.trim());
  if (match === null) return null;
  let path: string;
  try {
    path = decodeURIComponent(match[1] ?? '');
  } catch {
    return null;
  }
  // `file:///C:/Users/…` names a Windows drive.
  if (/^\/[a-z]:\//iu.test(path)) path = path.slice(1);
  const fragment = match[2];
  return fragment !== undefined && fragment.length > 0 ? { path, fragment } : { path };
}

/**
 * A chat file reference as an absolute path on the computer (forward slashes on Windows too):
 * absolute as written, or relative to the session's project folder. Null when it cannot be placed
 * (a `~` path, or a relative one without a project folder).
 */
export function remotePathForChatFile(path: string, projectPath: string): string | null {
  let trimmed = path.trim();
  // The core reads `file:///C:/Users/…` as `/C:/Users/…`.
  if (/^\/[a-z]:[\\/]/iu.test(trimmed)) trimmed = trimmed.slice(1);
  if (trimmed.length === 0) return null;
  if (isAbsoluteRemotePath(trimmed)) return normalizeRemotePath(trimmed);
  if (trimmed.startsWith('~') || projectPath.length === 0) return null;
  return normalizeRemotePath(joinRemotePath(projectPath, trimmed.replace(/^\.[\\/]/u, '')));
}
