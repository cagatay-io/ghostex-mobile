/**
 * The file viewer's pages for files that are not documents: plain text and source code as wrapped
 * monospace, and a picture fitted to the screen (pinch to zoom). Both are written beside the
 * mirrored file like the Markdown page, so the picture loads by its own relative name.
 */

import { GhostexPalette } from '../theme/palette';

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/gu, (character) => `&#${character.charCodeAt(0)};`);
}

function shell(title: string, styles: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=8, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<title>${escapeHtml(title)}</title>
<style>${BASE_STYLES}${styles}</style>
</head>
<body>
${body}
</body>
</html>`;
}

/** Text the viewer shows as written, long lines wrapped so the phone never scrolls sideways. */
export function renderTextDocument(text: string, title: string): string {
  return shell(title, TEXT_STYLES, `<pre class="plain-text">${escapeHtml(text)}</pre>`);
}

/** A page holding one picture; `fileName` is its name in the same folder. */
export function renderImageDocument(fileName: string, title: string): string {
  return shell(
    title,
    IMAGE_STYLES,
    `<main class="picture"><img src="${escapeHtml(encodeURIComponent(fileName))}" alt="${escapeHtml(title)}"></main>`
  );
}

/**
 * A page that plays one video or audio file from `src` (the computer's stream, `mediaStream.ts`).
 * A file the phone cannot decode, or a stream that stopped answering, says so in the page.
 */
export function renderMediaDocument(kind: 'video' | 'audio', src: string, title: string): string {
  const source = escapeHtml(src);
  const player =
    kind === 'video'
      ? `<video controls playsinline preload="metadata" src="${source}"></video>`
      : `<audio controls preload="metadata" src="${source}"></audio>`;
  return shell(
    title,
    MEDIA_STYLES,
    `<main class="media media-${kind}">${player}<p class="media-name">${escapeHtml(title)}</p>` +
      `<p class="media-error" hidden>This file can't play on the phone. Reload to try again, or open it on the computer.</p></main>` +
      `<script>(function () { var player = document.querySelector('video, audio'); player.addEventListener('error', function () { document.querySelector('.media-error').hidden = false; }); })();</script>`
  );
}

const BASE_STYLES = `
:root { color-scheme: dark; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: ${GhostexPalette.BACKGROUND}; color: #e6e6e6; }
`;

const TEXT_STYLES = `
.plain-text {
  box-sizing: border-box;
  margin: 0;
  padding: 16px 14px calc(48px + env(safe-area-inset-bottom));
  font: 12.5px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  tab-size: 4;
}
`;

const IMAGE_STYLES = `
.picture {
  box-sizing: border-box;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.picture img {
  max-width: 100%;
  height: auto;
  background: repeating-conic-gradient(#2a2a2a 0% 25%, #1f1f1f 0% 50%) 50% / 16px 16px;
}
`;

const MEDIA_STYLES = `
.media {
  box-sizing: border-box;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
}
.media video { width: 100%; max-height: 80vh; background: #000; border-radius: 8px; }
.media audio { width: 100%; }
.media-name { margin: 0; color: #9a9a9a; font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; overflow-wrap: anywhere; text-align: center; }
.media-error { margin: 0; color: #f87171; font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; text-align: center; }
`;
