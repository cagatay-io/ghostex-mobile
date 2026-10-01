/**
 * Files a dot made or shared, as paths on the computer. Markdown and HTML open in the phone's Docs
 * viewer (the same viewer a project's Docs use); other files are listed only.
 */

const DOC_FILE = /\.(md|markdown|mdx|html?)$/iu;

export function isDocFile(name: string): boolean {
  return DOC_FILE.test(name);
}

/** An absolute path as is, or a path relative to the dot's folder joined onto it. */
export function remoteFilePath(folder: string, path: string): string {
  if (path.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(path)) return path;
  const base = folder.replace(/[\\/]+$/u, '');
  return base.length === 0 ? path : `${base}/${path.replace(/^[\\/]+/u, '')}`;
}
