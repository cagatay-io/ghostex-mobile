/**
 * Images that reach the composer without the attach button: the keyboard's (Gboard's clipboard
 * and image suggestions), the long-press Paste, and a drop on the chat view
 * (`GhostexImageIntakeView.kt`, which copies each into the app's cache). They go to the host's
 * `attachFiles` like a picked photo, so they upload and become pills exactly as an attached one.
 */

import type { PickedFile } from './attachments';
import { arr, obj } from './json';

const MIME_EXTENSIONS: { [mimeType: string]: string } = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
  'image/tiff': 'tiff',
};

const IMAGE_NAME = /\.(avif|bmp|gif|heic|heif|ico|jpe?g|png|svg|tiff?|webp)$/iu;

/** The name an intake image uploads under: its own, with an image extension the host recognises. */
export function intakeImageName(name: string, mimeType: string, index: number): string {
  const trimmed = name.trim().replace(/^.*[\\/]/u, '');
  if (IMAGE_NAME.test(trimmed)) return trimmed;
  const extension = MIME_EXTENSIONS[mimeType.toLowerCase()] ?? 'png';
  const stem = trimmed.replace(/\.[^.]*$/u, '') || `pasted-image-${index + 1}`;
  return `${stem}.${extension}`;
}

export type ImageIntake = {
  /** Ready for `attachFiles`. */
  files: PickedFile[];
  /** Images the phone saw but could not read. */
  failed: number;
};

/** Decodes the intake view's `onImages` event: local image copies only, each once. */
export function imagesFromIntake(event: unknown): ImageIntake {
  const record = obj(event);
  const files: PickedFile[] = [];
  const seen = new Set<string>();
  for (const entry of arr(record?.files)) {
    const file = obj(entry);
    const uri = typeof file?.uri === 'string' ? file.uri : '';
    const mimeType = typeof file?.mimeType === 'string' ? file.mimeType : '';
    if (!uri.startsWith('file://') || seen.has(uri)) continue;
    if (mimeType !== '' && !mimeType.toLowerCase().startsWith('image/')) continue;
    seen.add(uri);
    files.push({ uri, name: intakeImageName(typeof file?.name === 'string' ? file.name : '', mimeType, files.length) });
  }
  const failed = typeof record?.failed === 'number' && record.failed > 0 ? Math.floor(record.failed) : 0;
  return { files, failed };
}

/** What the composer tells the user when none of the images could be read. */
export function intakeFailureMessage(intake: ImageIntake): string | null {
  if (intake.files.length > 0 || intake.failed === 0) return null;
  return intake.failed === 1 ? 'The image could not be read.' : 'The images could not be read.';
}

/** Hands an intake event's images to the chat, the attach button's path; `fail` says what was lost. */
export function attachIntakeImages(
  chat: { attachFiles(files: readonly PickedFile[]): Promise<void> },
  event: unknown,
  fail: (message: string) => void,
): void {
  const intake = imagesFromIntake(event);
  const failure = intakeFailureMessage(intake);
  if (failure !== null) fail(failure);
  if (intake.files.length > 0) void chat.attachFiles(intake.files);
}
