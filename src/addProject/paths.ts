/** Remote path helpers retain POSIX semantics and recognize Windows drive/UNC roots. */
export const PATH_SEPARATOR = '/';

export function isWindowsRemotePath(value: string): boolean {
  return /^[a-z]:[/\\]/iu.test(value) || /^[/\\]{2}[^/\\]+[/\\][^/\\]+/u.test(value);
}

export function isAbsoluteRemotePath(value: string): boolean {
  return value.startsWith('/') || isWindowsRemotePath(value);
}

function normalize(value: string): string {
  return isWindowsRemotePath(value) ? value.replace(/\\/gu, '/') : value;
}

function rootLength(value: string): number {
  const unc = /^\/\/[^/]+\/[^/]+(?:\/|$)/u.exec(value);
  if (unc) return unc[0].length;
  if (/^[a-z]:\//iu.test(value)) return 3;
  if (value.startsWith('~/')) return 2;
  return value.startsWith('/') ? 1 : 0;
}

export function hasTrailingPathSeparator(value: string): boolean {
  return normalize(value).endsWith('/');
}

export function getBrowseDirectoryPath(value: string): string {
  const path = normalize(value);
  if (hasTrailingPathSeparator(path)) return path;
  const index = path.lastIndexOf('/');
  return index < 0 ? '' : path.slice(0, index + 1);
}

export function getBrowseLeafPathSegment(value: string): string {
  const path = normalize(value);
  return path.slice(path.lastIndexOf('/') + 1);
}

export function appendBrowsePathSegment(directory: string, segment: string): string {
  return `${getBrowseDirectoryPath(directory)}${segment}/`;
}

export function getBrowseParentPath(value: string): string | null {
  const path = normalize(value.trim());
  const root = rootLength(path);
  const withoutTrailing = path.replace(/\/+$/u, '');
  if (withoutTrailing.length <= root) return null;
  const index = withoutTrailing.lastIndexOf('/');
  if (index < 0) return null;
  return path.slice(0, Math.max(root, index + 1));
}

export function canNavigateUp(value: string): boolean {
  return hasTrailingPathSeparator(value) && getBrowseParentPath(value) !== null;
}

export function ensureBrowseDirectoryPath(value: string): string {
  const path = normalize(value.trim());
  if (!path) return '~/';
  return path.endsWith('/') ? path : `${path}/`;
}

export function stripTrailingSeparators(value: string): string {
  const path = normalize(value);
  const stripped = path.replace(/\/+$/u, '');
  return path.slice(0, Math.max(rootLength(path), stripped.length));
}

export function remotePathIdentity(value: string): string {
  const normalized = stripTrailingSeparators(value);
  return isWindowsRemotePath(value) ? normalized.toLowerCase() : normalized;
}

export function joinPathSegment(directory: string, segment: string): string {
  const path = stripTrailingSeparators(directory);
  return `${path}${path.endsWith('/') ? '' : '/'}${segment}`;
}

export function cloneFolderName(repositoryTitle: string, remoteUrl: string): string {
  const fromTitle = repositoryTitle.trim().split('/').pop() ?? '';
  const candidate = fromTitle.length > 0 ? fromTitle : remoteUrl.trim();
  return (
    candidate
      .replace(/[/:]+$/, '')
      .split(/[/:]/)
      .pop() ?? ''
  ).replace(/\.git$/i, '');
}

/** Last non-empty segment of a remote path for compact labels, or the path itself at root. */
export function pathFolderName(value: string): string {
  const stripped = stripTrailingSeparators(value.trim());
  if (stripped.length === 0) return '';
  const parts = stripped.split('/').filter((part) => part.length > 0);
  return parts[parts.length - 1] ?? stripped;
}

/** Replaces a leading `home` prefix with `~` for compact display on phone screens. */
export function tildifyRemotePath(value: string, home?: string | null): string {
  const trimmed = value.trim();
  const normalizedHome = home === undefined || home === null ? '' : stripTrailingSeparators(home.trim());
  if (trimmed.length === 0 || normalizedHome.length === 0) return trimmed;
  const normalizedValue = stripTrailingSeparators(trimmed);
  const same = remotePathIdentity(normalizedValue) === remotePathIdentity(normalizedHome);
  if (same) return '~';
  const prefix = normalizedHome.endsWith('/') ? normalizedHome : `${normalizedHome}/`;
  const valueForCompare = isWindowsRemotePath(trimmed) ? normalizedValue.toLowerCase() : normalizedValue;
  const prefixForCompare = isWindowsRemotePath(normalizedHome) ? prefix.toLowerCase() : prefix;
  if (valueForCompare.startsWith(prefixForCompare)) {
    return `~/${normalizedValue.slice(prefix.length)}`;
  }
  return trimmed;
}

/** Expands a leading `~` or `~/` using `home` when known, for path deduplication. */
export function expandHomePrefix(value: string, home?: string | null): string {
  const trimmed = value.trim();
  const normalizedHome = home === undefined || home === null ? '' : stripTrailingSeparators(home.trim());
  if (normalizedHome.length === 0) return trimmed;
  if (trimmed === '~') return normalizedHome;
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    const rest = trimmed.slice(2).replace(/^[/\\]+/u, '');
    return rest.length === 0 ? normalizedHome : joinPathSegment(normalizedHome, rest);
  }
  return trimmed;
}
