/**
 * A picture or file still uploading, held in the chat box as its reference with a stand-in
 * destination: `[Image #2](ghostex-upload:7)`. The field shows it as the same one-piece chip a
 * landed picture is (`chipText.ts`), so the user types around it, moves it or deletes it while it
 * uploads; when the upload lands its destination becomes the computer's path in place
 * (`ComposerModel.landUpload`), and a failed one stays marked failed until Send retries it.
 *
 * CDXC:Clipboard 2026-11-15 DECISION:
 * User (Android): "pls make pasting an image paste a placeholder for it while it's uploading so I can manipulate it
 * when it's uploading or move it around or type around it. Right now it pops in in a random spot and messes with my
 * typing." The reference used to be written only once the upload landed, at wherever the caret was by then, with the
 * whole draft replaced under the user's typing. A paste, a keyboard image, a drop and a picked file now put their
 * reference at the caret the moment they arrive, and only its destination changes when the upload lands.
 *
 * CDXC:Clipboard 2026-11-15 WHY: The stand-in is the phone's own. The chat core skips a link whose destination has a
 * URI scheme it cannot open (`composer_references` in packages/gx-chat-core/src/composer/reference_pills.rs), so it
 * never reads one as a file, and its label still counts when the core numbers the next picture
 * (`next_image_reference_index`), so two pastes in a row are Image #2 and Image #3. A send strips the stand-ins and
 * the core writes the landed references where the first one stood (`caret` on the send, core `composer/attaching.rs`).
 */

const SCHEME = 'ghostex-upload:';

/** `[label](ghostex-upload:<token>)`, the label as `read_numbered_label` reads one. */
const TOKEN = /\[((?:\\.|[^\]\\\r\n])*)\]\(ghostex-upload:(\d+)\)/gu;

/** The core's `IMAGE_EXTENSIONS` (`ends_with_image_extension`). */
const IMAGE_PATH = /\.(avif|bmp|gif|heic|heif|ico|jpe?g|png|svg|tiff?|webp)$/iu;
const VIDEO_PATH = /\.(3gp|avi|flv|m2ts|m4v|mkv|mov|mp4|mpeg|mpg|mts|ogv|webm|wmv)$/iu;
const AUDIO_PATH = /\.(aac|aif|aiff|flac|m4a|mp3|oga|ogg|opus|wav|wma)$/iu;

export type UploadToken = {
  token: number;
  /** UTF-16 range of the whole `[label](ghostex-upload:N)`. */
  start: number;
  end: number;
  label: string;
};

/** Where an upload stands: on its way, or failed (Send uploads it again). */
export type UploadTokenState = 'uploading' | 'failed';

/** The stand-in destination of upload `token`. */
export function uploadPath(token: number): string {
  return `${SCHEME}${token}`;
}

export function isUploadPath(path: string): boolean {
  return path.startsWith(SCHEME);
}

/** The token a stand-in destination names, or null. */
export function uploadTokenOfPath(path: string): number | null {
  if (!isUploadPath(path)) return null;
  const token = Number(path.slice(SCHEME.length));
  return Number.isInteger(token) ? token : null;
}

export function findUploadTokens(text: string): UploadToken[] {
  const tokens: UploadToken[] = [];
  for (const match of text.matchAll(TOKEN)) {
    const start = match.index ?? 0;
    tokens.push({ token: Number(match[2]), start, end: start + match[0].length, label: match[1] ?? '' });
  }
  return tokens;
}

/** The noun the core names a reference to `path` with (`path_noun`); folders never upload. */
export function referenceNoun(path: string): string {
  const bare = path.replace(/:\d+(?:-\d+|:\d+)?$/u, '');
  if (VIDEO_PATH.test(bare)) return 'Video';
  if (AUDIO_PATH.test(bare)) return 'Audio';
  if (/\.pdf$/iu.test(bare)) return 'PDF';
  if (IMAGE_PATH.test(bare)) return 'Image';
  return 'File';
}

/**
 * The label the core would give the next reference named `noun` in `text` (`native_path_reference`):
 * one past the highest `[<noun> #N](` for pictures, audio, video and PDFs, one past the highest
 * numbered label of any kind for other files.
 */
export function nextReferenceLabel(text: string, noun: string): string {
  const pattern =
    noun === 'File' ? /\[(?:\\.|[^\]\\\r\n])* #(\d+)\]\(/gu : new RegExp(`\\[${noun} #(\\d+)\\u00b7?\\]\\(`, 'gu');
  let highest = 0;
  for (const match of text.matchAll(pattern)) highest = Math.max(highest, Number(match[1]));
  return `${noun} #${highest + 1}`;
}

/**
 * `text` with one stand-in per upload put over `[start, end)`, each after the last, with the spaces
 * the core's `insert_reference` adds: one before when the text there does not end in whitespace,
 * one after. Answers the text and the caret after the last one.
 */
export function insertUploadTokens(
  text: string,
  start: number,
  end: number,
  uploads: readonly { token: number; name: string }[],
): { text: string; caret: number } {
  let current = text;
  let from = Math.max(0, Math.min(start, end, text.length));
  let to = Math.min(Math.max(start, end), text.length);
  for (const upload of uploads) {
    const label = nextReferenceLabel(current, referenceNoun(upload.name));
    const lead = from > 0 && !/\s/u.test(current[from - 1] ?? '') ? ' ' : '';
    const inserted = `${lead}[${label}](${uploadPath(upload.token)}) `;
    current = current.slice(0, from) + inserted + current.slice(to);
    from += inserted.length;
    to = from;
  }
  return { text: current, caret: from };
}

/**
 * `text` with upload `token`'s stand-in turned into `replacement` (its landed references), or
 * removed with the space after it when `replacement` is empty. Null when the stand-in is gone (the
 * user deleted it). `shift` is how far text after it moved.
 */
export function replaceUploadToken(
  text: string,
  token: number,
  replacement: string,
): { text: string; start: number; end: number; shift: number } | null {
  const found = findUploadTokens(text).find((entry) => entry.token === token);
  if (found === undefined) return null;
  const end = replacement === '' && text[found.end] === ' ' ? found.end + 1 : found.end;
  return {
    text: text.slice(0, found.start) + replacement + text.slice(end),
    start: found.start,
    end,
    shift: replacement.length - (end - found.start),
  };
}

/**
 * The references an upload's `paths` become in place of its stand-in: the stand-in's own label
 * when it names the same kind (so "Image #2" stays "Image #2"), else the next label of the right
 * kind; several paths are written one after another.
 */
export function landedReferences(text: string, standIn: UploadToken, paths: readonly string[]): string {
  const others = text.slice(0, standIn.start) + text.slice(standIn.end);
  const references: string[] = [];
  for (const path of paths) {
    const noun = referenceNoun(path);
    const label =
      references.length === 0 && standIn.label.startsWith(`${noun} #`)
        ? standIn.label
        : nextReferenceLabel(`${others}${references.join(' ')}`, noun);
    references.push(`[${label}](${path})`);
  }
  return references.join(' ');
}

/** `text` without its stand-ins (a send), and where the first one stood. */
export function stripUploadTokens(text: string): { text: string; firstAt: number | null } {
  let firstAt: number | null = null;
  let out = '';
  let cursor = 0;
  for (const token of findUploadTokens(text)) {
    out += text.slice(cursor, token.start);
    if (firstAt === null) firstAt = out.length;
    cursor = text[token.end] === ' ' ? token.end + 1 : token.end;
  }
  out += text.slice(cursor);
  return { text: out, firstAt };
}
