/**
 * What the project file browser does with a file it opens (REQ-FILES-002, REQ-FILES-006), and how it names a
 * file's kind and size. Markdown and HTML open rendered in the Docs viewer, as from Files before; other text up
 * to the host's preview limit opens as source; pictures, files that are not text and files over the limit show
 * their name and size only, with Copy Full Path.
 *
 * CDXC:Docs 2026-10-29 SEE-ALSO: the kinds follow the desktop files list's (`DocsFileKind`, `DocsMediaKind` in
 * apps/desktop/src/app/native_docs/state.rs); the limit is gxserver's `FILE_PREVIEW_MAX_BYTES`
 * (server/src/project_docs/limits.rs).
 */

import { DocsCopy } from '../copy';
import { isRecord } from '../docs/entries';
import { docKindForPath, extensionOf, previewKindForPath } from '../docs/paths';
import { projectScopeAction, type DocsRpc } from './request';

/** The host's preview limit, 2 MB (REQ-FILES-002 scope, REQ-FILES-006). */
export const PREVIEW_MAX_BYTES = 2_000_000;

/** Pictures, as the desktop's files list counts them (its own, its embed page's and the system app's). */
export const IMAGE_EXTENSIONS: readonly string[] = [
  'png',
  'jpg',
  'jpeg',
  'jfif',
  'jpe',
  'gif',
  'webp',
  'svg',
  'bmp',
  'ico',
  'tif',
  'tiff',
  'avif',
  'heic',
  'heif',
  'apng',
  'jp2',
  'jxl',
];
export const VIDEO_EXTENSIONS: readonly string[] = [
  'webm',
  'ogv',
  'mp4',
  'm4v',
  'mov',
  'avi',
  'mkv',
  'wmv',
  'flv',
  '3gp',
  '3g2',
  'mpeg',
  'mpg',
  'm2ts',
  'mts',
  'vob',
  'asf',
  'ogm',
];
const AUDIO_EXTENSIONS: readonly string[] = [
  'mp3',
  'ogg',
  'oga',
  'opus',
  'wav',
  'flac',
  'm4a',
  'aac',
  'aif',
  'aiff',
  'wma',
];
/**
 * Formats that are never text, so the browser shows their name and size without reading them: the desktop's
 * fonts, PDF and SQLite kinds, plus archives, compiled code and office documents. A file of any other kind is
 * read, and shows as source unless it turns out not to be text.
 */
const BINARY_EXTENSIONS: readonly string[] = [
  'ttf',
  'otf',
  'woff',
  'woff2',
  'pdf',
  'db',
  'sqlite',
  'sqlite3',
  'zip',
  'gz',
  'tgz',
  'bz2',
  'xz',
  'zst',
  '7z',
  'rar',
  'tar',
  'dmg',
  'iso',
  'jar',
  'class',
  'wasm',
  'exe',
  'dll',
  'so',
  'dylib',
  'a',
  'o',
  'bin',
  'docx',
  'xlsx',
  'pptx',
  'key',
  'pages',
  'numbers',
];

/**
 * A file's kind, by its name: Markdown and HTML (the Docs viewer renders them), pictures, video, audio, other
 * formats that are not text, text the phone knows (source, data, logs), and anything else.
 */
export type FileKind = 'markdown' | 'html' | 'image' | 'video' | 'audio' | 'binary' | 'source' | 'other';

export function fileKind(name: string): FileKind {
  const document = docKindForPath(name);
  if (document !== null) return document;
  const extension = extensionOf(name);
  if (IMAGE_EXTENSIONS.includes(extension)) return 'image';
  if (VIDEO_EXTENSIONS.includes(extension)) return 'video';
  if (AUDIO_EXTENSIONS.includes(extension)) return 'audio';
  if (BINARY_EXTENSIONS.includes(extension)) return 'binary';
  return previewKindForPath(name) === 'text' ? 'source' : 'other';
}

/** Why a file shows only its name and size (REQ-FILES-006). */
export type InfoReason = 'image' | 'binary' | 'large';

export type FilePreview = { kind: 'document' } | { kind: 'source' } | { kind: 'info'; reason: InfoReason };

/**
 * How the browser opens a file of this name and size (null: not known): rendered in the Docs viewer (Markdown,
 * HTML), as source (other text, read and checked first), or its name and size only.
 */
export function filePreview(name: string, size: number | null): FilePreview {
  if (size !== null && size > PREVIEW_MAX_BYTES) return { kind: 'info', reason: 'large' };
  switch (fileKind(name)) {
    case 'markdown':
    case 'html':
      return { kind: 'document' };
    case 'image':
      return { kind: 'info', reason: 'image' };
    case 'video':
    case 'audio':
    case 'binary':
      return { kind: 'info', reason: 'binary' };
    case 'source':
    case 'other':
      return { kind: 'source' };
  }
}

/**
 * Whether a file read as base64 is text the browser shows as source: it holds no NUL byte and is valid UTF-8, the
 * two tests gxserver's own preview makes before it shows a file ("Binary files are not previewed.", "This file is
 * not valid UTF-8 text.", `project_file_preview_with_baseline` in server/src/project_docs/file_ops.rs). The bytes
 * are checked before they are decoded, because the decoder replaces invalid sequences with U+FFFD.
 */
export function isTextFile(base64: string): boolean {
  const bytes = atob(base64);
  let index = 0;
  while (index < bytes.length) {
    const lead = bytes.charCodeAt(index);
    if (lead === 0) return false;
    if (lead < 0x80) {
      index += 1;
      continue;
    }
    // The well-formed sequences of Unicode's Table 3-7: no overlong forms, no surrogates, nothing past U+10FFFF.
    let length: number;
    let low = 0x80;
    let high = 0xbf;
    if (lead >= 0xc2 && lead <= 0xdf) {
      length = 2;
    } else if (lead >= 0xe0 && lead <= 0xef) {
      length = 3;
      if (lead === 0xe0) low = 0xa0;
      if (lead === 0xed) high = 0x9f;
    } else if (lead >= 0xf0 && lead <= 0xf4) {
      length = 4;
      if (lead === 0xf0) low = 0x90;
      if (lead === 0xf4) high = 0x8f;
    } else {
      return false;
    }
    if (index + length > bytes.length) return false;
    for (let offset = 1; offset < length; offset += 1) {
      const next = bytes.charCodeAt(index + offset);
      if (next < (offset === 1 ? low : 0x80) || next > (offset === 1 ? high : 0xbf)) return false;
    }
    index += length;
  }
  return true;
}

/**
 * A size as the browser shows it, in the decimal units of the 2 MB limit and of the iPhone's Files app:
 * `512 B`, `340 KB`, `2.3 MB`.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  const kilobytes = Math.round(bytes / 1000);
  if (kilobytes < 1000) return `${kilobytes} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/**
 * A file's size from gxserver (`scope: "project"`, `action: "stat"`), for files listed without one (search
 * results), so a file over the limit is known before it is opened; throws when the file is gone. gxserver answers
 * the file's metadata under `file`, and `{ missing, path }` there for a file that is not there
 * (server/src/project_docs/actions.rs `response`, file_ops.rs `project_file_metadata`); an answer without it comes
 * from a Ghostex that predates the request.
 */
export async function statProjectFile(rpc: DocsRpc, projectId: string, path: string): Promise<number | null> {
  const { file } = await projectScopeAction(rpc, projectId, 'stat', { path });
  if (!isRecord(file)) throw new Error(DocsCopy.oldCli);
  if (file.missing === true) throw new Error(DocsCopy.fileMissing);
  return typeof file.size === 'number' ? file.size : null;
}
