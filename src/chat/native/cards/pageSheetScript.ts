/**
 * What the page sheet adds to a published page and reads back from it: a tap on a picture opens the
 * chat's image viewer over the sheet with every picture of the page, and the page's scroll offset is
 * remembered so closing and reopening the page goes back to where the reader was.
 *
 * CDXC:SessionChat 2026-10-23 SEE-ALSO:
 * The desktop's page window does the same through a DevTools binding instead of
 * `ReactNativeWebView.postMessage`: apps/desktop/src/app/window/visual_page_modal/page.rs. Which
 * pictures count, the message shapes and the scroll memory match it (only SVG pictures differ, turned
 * into PNGs here); change them together.
 */

import type { ChatImage } from './overlayStore';

/**
 * Added to every document the sheet loads (before the content where the WebView can, and again once
 * it has loaded; the flag keeps it to one copy). The WebView's own scroll restoration on reload is
 * turned off: the sheet puts the offset back itself (`restoreScrollScript`). Pictures inside links,
 * buttons, form controls and the question kit's choices keep doing what the page made them do; so
 * does a tap the page handled itself (`defaultPrevented`). `blob:` pictures and data URIs that are
 * not base64 are turned into base64 data URIs here, where they can still be read, and SVG pictures
 * into PNGs, which the phone's image view can draw. The WebView tells the app nothing when the page
 * calls `window.close()`, which a page in the sheet does once its answers are sent, so the script
 * turns that into a message.
 */
export const PAGE_SCRIPT = `(() => {
  if (window.top !== window || window.__ghostexPageSheetScript) return;
  Object.defineProperty(window, '__ghostexPageSheetScript', { value: true });
  try { history.scrollRestoration = 'manual'; } catch (_) {}
  const send = (message) => { try { window.ReactNativeWebView.postMessage(JSON.stringify(message)); } catch (_) {} };
  // The page closes itself once its answers are sent (gx-floating=1); the WebView reports no close.
  window.close = () => send({ type: 'close' });
  const SKIP = 'a[href],button,label,summary,select,input,textarea,[role=button],[role=link],[role=radio],[role=checkbox],[role=option],[onclick],[contenteditable],gx-option,gx-questions .gx-choice,[data-gx-no-viewer]';
  const sourceOf = (img) => img.currentSrc || img.src || '';
  const viewable = (img) => {
    if (!(img instanceof HTMLImageElement) || !img.isConnected || !img.complete || !img.naturalWidth) return false;
    if (img.closest(SKIP)) return false;
    const box = img.getBoundingClientRect();
    return box.width >= 24 && box.height >= 24 && /^(data:image\\/|https:|blob:)/i.test(sourceOf(img));
  };
  const nameOf = (src) => {
    if (/^data:/i.test(src)) {
      const type = ((/^data:image\\/([a-z0-9.+-]+)/i.exec(src) || [])[1] || 'png').toLowerCase();
      return 'image.' + ({ jpeg: 'jpg', 'svg+xml': 'svg' }[type] || type);
    }
    try { return decodeURIComponent(new URL(src).pathname.split('/').pop()) || 'image'; } catch (_) { return 'image'; }
  };
  const raster = (img) => {
    try {
      const scale = Math.min(4, Math.max(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight)));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png');
    } catch (_) { return null; }
  };
  const readable = (img) => {
    const src = sourceOf(img);
    // The phone's image view draws no SVG, so a vector picture is handed over as a PNG.
    if (/^data:image\\/svg/i.test(src) || /^https:[^?#]*\\.svg(?:[?#]|$)/i.test(src)) return raster(img);
    if (/^https:/i.test(src) || /^data:[^,]*;base64,/i.test(src)) return src;
    if (/^data:/i.test(src)) {
      const comma = src.indexOf(',');
      try { return src.slice(0, comma) + ';base64,' + btoa(unescape(encodeURIComponent(decodeURIComponent(src.slice(comma + 1))))); } catch (_) { return null; }
    }
    return raster(img);
  };
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const tapped = event.target;
    if (!viewable(tapped)) return;
    event.preventDefault();
    const images = [];
    let index = -1;
    for (const img of document.images) {
      if (!viewable(img)) continue;
      const src = readable(img);
      if (!src) continue;
      if (img === tapped) index = images.length;
      images.push({ src, name: nameOf(src) });
    }
    if (index >= 0) send({ type: 'images', index, images });
  });
  let timer = 0;
  addEventListener('scroll', () => {
    if (timer) return;
    timer = setTimeout(() => { timer = 0; send({ type: 'scroll', x: scrollX, y: scrollY }); }, 150);
  }, { passive: true });
})();
true;`;

/** The most pictures one tap hands the viewer. */
const IMAGES_MAX = 200;
/** The most pages whose scroll offset is remembered. */
const SCROLL_MEMORY_MAX = 500;

export type PageMessage =
  /** The reader tapped picture `index` of `images` (image values the chat's viewer reads). */
  | { type: 'images'; images: ChatImage[]; index: number }
  | { type: 'scroll'; x: number; y: number }
  /** The page asked to close (`window.close()`). */
  | { type: 'close' };

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const offset = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : null;

/** One message from the page's script; anything else the page sends is ignored. */
export function readPageMessage(payload: string): PageMessage | null {
  let message: Record<string, unknown> | null;
  try {
    message = record(JSON.parse(payload));
  } catch {
    return null;
  }
  if (message === null) return null;
  if (message.type === 'images') {
    const tapped = message.index;
    if (typeof tapped !== 'number' || !Number.isInteger(tapped) || !Array.isArray(message.images)) return null;
    const images: ChatImage[] = [];
    let index: number | null = null;
    message.images.forEach((entry, at) => {
      const image = record(entry);
      const src = typeof image?.src === 'string' ? image.src : '';
      const transport = src.startsWith('data:image/') ? 'data' : src.startsWith('https://') ? 'url' : null;
      if (transport === null || images.length >= IMAGES_MAX) return;
      if (at === tapped) index = images.length;
      images.push({ transport, url: src, fileName: typeof image?.name === 'string' ? image.name : 'image' });
    });
    return index === null ? null : { type: 'images', images, index };
  }
  if (message.type === 'close') return { type: 'close' };
  if (message.type === 'scroll') {
    const x = offset(message.x);
    const y = offset(message.y);
    return x === null || y === null ? null : { type: 'scroll', x, y };
  }
  return null;
}

/** Kept for as long as the app runs, like the desktop's. */
const scrollMemory = new Map<string, { x: number; y: number }>();

export function rememberScroll(page: string, at: { x: number; y: number }): void {
  if (scrollMemory.size >= SCROLL_MEMORY_MAX && !scrollMemory.has(page)) scrollMemory.clear();
  scrollMemory.set(page, at);
}

export function rememberedScroll(page: string): { x: number; y: number } | null {
  const at = scrollMemory.get(page);
  return at !== undefined && (at.x > 0 || at.y > 0) ? at : null;
}

/**
 * Scrolls the loaded page back to `at`, trying again for a few seconds while its pictures and fonts
 * are still growing it, and giving up as soon as the reader touches the page.
 */
export function restoreScrollScript(at: { x: number; y: number }): string {
  const x = Math.round(at.x);
  const y = Math.round(at.y);
  return `(() => {
  let tries = 0, stopped = false;
  const stop = () => { stopped = true; };
  for (const kind of ['wheel', 'keydown', 'mousedown', 'touchstart']) addEventListener(kind, stop, { once: true, passive: true, capture: true });
  const go = () => {
    if (stopped) return;
    scrollTo({ left: ${x}, top: ${y}, behavior: 'instant' });
    if ((Math.abs(scrollY - ${y}) > 1 || Math.abs(scrollX - ${x}) > 1) && ++tries < 30) setTimeout(go, 100);
  };
  go();
})();
true;`;
}

/** The page's id when `path` is a page gxserver serves (`/visual/<32 hex>`). */
export function pageIdOfPath(path: string): string | null {
  const match = /^\/visual\/([0-9a-fA-F]{32})(?=[/?#]|$)/u.exec(path);
  return match?.[1]?.toLowerCase() ?? null;
}
