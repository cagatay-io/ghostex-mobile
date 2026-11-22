/**
 * Blurred artwork backdrop for Live pages in `PageSheet.tsx`, matching the desktop's floating Live
 * page window (`apps/desktop/src/app/window/visual_page_modal/glass.rs` and `server/src/visual_pages/theme.rs`).
 *
 * When the active theme has a still artwork and "Show artwork behind screens" is on, the artwork is
 * softened to a small blurred JPEG (~30pt screen blur, 3-pass separable box blur matching desktop's
 * `soften` at 320px width) and cached under `Paths.cache/theme-art/`. Both the native sheet header
 * and the Live page (`html[data-gx-glass]` via `--gx-glass-picture`, `--gx-glass-size`,
 * `--gx-glass-position`, and `--gx-glass-tint-dark` / `--gx-glass-tint-light`) paint that exact
 * blurred JPEG at matching sheet-coordinate offsets under the phone's combined dimming/surface tint
 * (`combineArtTint`), so the backdrop runs unbroken across the header boundary with no seam or flash.
 * Pages that paint their own background keep it, and the kit's Dark / Light switch works cleanly.
 */

import { Directory, File, Paths } from 'expo-file-system';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ImageSourcePropType } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { useSettingsStore } from '../../../settings/store';
import {
  artworkById,
  cachedArtworkUri,
  isKnownArtworkId,
  useArtworkSource,
  type ThemeArtwork,
} from '../../../theme/artworks';
import { combineArtTint } from '../../../theme/ScreenArtBackdrop';

/** Max side of the softened JPEG, matching desktop's `SOFT_PICTURE_WIDTH`. */
const SOFT_MAX_SIDE = 320;

/**
 * Box-blur radius per pass (3 separable passes) at `SOFT_MAX_SIDE`: sigma = sqrt(r * (r + 1)) = 6.48px,
 * which scales to ~30pt on a portrait phone screen (matching desktop's `PICTURE_BLUR_POINTS = 30.0`).
 */
const BLUR_BOX_RADIUS = 6;

/** JPEG quality for the cached blurred backdrop, matching desktop's `soften`. */
const SOFT_JPEG_QUALITY = 0.88;

/** Sanity bound for a blurred 320px JPEG data URI posted back from the WebView (~5-15 KB in practice). */
export const MAX_BLURRED_DATA_URI_CHARS = 200_000;

export type BlurredArtwork = {
  readonly artId: string;
  readonly sha256: string;
  readonly dataUri: string;
  readonly width: number;
  readonly height: number;
};

export type BackdropRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type SheetSize = {
  readonly width: number;
  readonly height: number;
};

export type PageOrigin = {
  readonly x: number;
  readonly y: number;
};

type PageGlassPayload =
  | {
      readonly kind: 'none';
      readonly theme: 'light' | 'dark';
    }
  | {
      readonly kind: 'ready';
      readonly artId: string;
      readonly sha256: string;
      readonly theme: 'light' | 'dark';
      readonly dataUri: string;
      readonly tint: string;
      readonly sizeCss: string;
      readonly positionCss: string;
    }
  | {
      readonly kind: 'blur';
      readonly artId: string;
      readonly sha256: string;
      readonly theme: 'light' | 'dark';
      readonly rawDataUri: string;
      readonly tint: string;
      readonly sheetWidth: number;
      readonly sheetHeight: number;
      readonly pageOriginX: number;
      readonly pageOriginY: number;
    };

const blurredMemoryCache = new Map<string, BlurredArtwork>();
const rawDataUriCache = new Map<string, string>();
const MAX_RAW_CACHE_ENTRIES = 2;

function cacheKey(artId: string, sha256: string): string {
  return `${artId}:${sha256}`;
}

function softCacheDir(): Directory {
  return new Directory(Paths.cache, 'theme-art');
}

function softCacheFile(artwork: ThemeArtwork): File {
  return new File(softCacheDir(), `${artwork.id}-${artwork.sha256.slice(0, 8)}-soft-v1.json`);
}

function isValidBlurred(value: unknown, expectedId: string, expectedSha: string): value is BlurredArtwork {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.artId === expectedId &&
    candidate.sha256 === expectedSha &&
    typeof candidate.dataUri === 'string' &&
    candidate.dataUri.startsWith('data:image/jpeg;base64,') &&
    candidate.dataUri.length <= MAX_BLURRED_DATA_URI_CHARS &&
    typeof candidate.width === 'number' &&
    Number.isFinite(candidate.width) &&
    candidate.width >= 1 &&
    candidate.width <= 640 &&
    typeof candidate.height === 'number' &&
    Number.isFinite(candidate.height) &&
    candidate.height >= 1 &&
    candidate.height <= 640
  );
}

/** Synchronously reads a cached softened JPEG from memory or `Paths.cache/theme-art/`. */
function readCachedBlurredArtwork(artwork: ThemeArtwork): BlurredArtwork | null {
  const key = cacheKey(artwork.id, artwork.sha256);
  const memo = blurredMemoryCache.get(key);
  if (memo !== undefined) return memo;
  try {
    const file = softCacheFile(artwork);
    if (!file.exists) return null;
    const parsed: unknown = JSON.parse(file.textSync());
    if (!isValidBlurred(parsed, artwork.id, artwork.sha256)) return null;
    blurredMemoryCache.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

/** Keeps a softened JPEG in memory and writes it to `Paths.cache/theme-art/` for instant reuse. */
function saveBlurredArtwork(entry: BlurredArtwork): void {
  const artwork = artworkById(entry.artId);
  if (artwork === undefined || artwork.sha256 !== entry.sha256) return;
  blurredMemoryCache.set(cacheKey(entry.artId, entry.sha256), entry);
  try {
    const dir = softCacheDir();
    if (!dir.exists) dir.create({ idempotent: true, intermediates: true });
    const file = softCacheFile(artwork);
    void file.write(JSON.stringify(entry)).catch(() => undefined);
  } catch {
    // Best-effort disk cache write; in-memory entry still serves the session.
  }
}

async function readRawArtworkDataUri(artwork: ThemeArtwork, fileUri: string): Promise<string | null> {
  const key = cacheKey(artwork.id, artwork.sha256);
  const cached = rawDataUriCache.get(key);
  if (cached !== undefined) return cached;
  try {
    const base64 = await new File(fileUri).base64();
    if (base64.length === 0) return null;
    const dataUri = `data:image/webp;base64,${base64}`;
    if (rawDataUriCache.size >= MAX_RAW_CACHE_ENTRIES) {
      const oldest = rawDataUriCache.keys().next().value;
      if (oldest !== undefined) rawDataUriCache.delete(oldest);
    }
    rawDataUriCache.set(key, dataUri);
    return dataUri;
  } catch {
    return null;
  }
}

/**
 * Places an artwork of aspect `(artWidth, artHeight)` covering the full sheet `(sheetWidth, sheetHeight)`,
 * centred, in the sheet's coordinates (matching desktop's `picture_rect` with `on_screen = None`).
 */
export function coverRect(
  sheetWidth: number,
  sheetHeight: number,
  artWidth: number,
  artHeight: number,
): BackdropRect {
  const sw = Math.max(1, sheetWidth);
  const sh = Math.max(1, sheetHeight);
  const aw = Math.max(1, artWidth);
  const ah = Math.max(1, artHeight);
  const scale = Math.max(sw / aw, sh / ah);
  const width = aw * scale;
  const height = ah * scale;
  return {
    x: (sw - width) / 2,
    y: (sh - height) / 2,
    width,
    height,
  };
}

function cssPx(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function extractSourceUri(source: ImageSourcePropType | null): string | null {
  if (source !== null && typeof source === 'object' && 'uri' in source && typeof source.uri === 'string') {
    return source.uri;
  }
  return null;
}

/**
 * Runs `body` with `d` set to `document.documentElement`, waiting for `<html>` via MutationObserver
 * when injected before content loads (matching desktop's `on_root` in `glass.rs`).
 */
function onRoot(body: string): string {
  return (
    `(function(){if(window.top!==window)return;function run(d){${body}}` +
    `var d=document.documentElement;if(d){run(d);return;}` +
    `new MutationObserver(function(_,o){var d=document.documentElement;if(d){o.disconnect();run(d);}})` +
    `.observe(document,{childList:true});})();\ntrue;`
  );
}

/** Keeps `data-gx-theme` synced with the app unless the reader or page chose one (`data-gx-theme-from`). */
function syncThemeSnippet(theme: 'light' | 'dark'): string {
  const t = JSON.stringify(theme);
  return (
    `if(!d.hasAttribute("data-gx-theme-from")&&d.getAttribute("data-gx-theme")!==${t}){` +
    `d.setAttribute("data-gx-theme",${t});` +
    `Array.prototype.forEach.call(document.querySelectorAll(".gx-theme-switch [data-gx-set-theme]"),function(b){` +
    `b.setAttribute("aria-pressed",b.getAttribute("data-gx-set-theme")===${t}?"true":"false");});}`
  );
}

/**
 * Builds the JS injected into the Live page WebView to apply (or clear) the `data-gx-glass` backdrop.
 * When the artwork is not softened yet (`kind: 'blur'`), performs a fast 3-pass separable box blur
 * on a 320px canvas inside the WebView, applies it immediately, and posts the small JPEG back to
 * React Native so both the header bar and future opens reuse it with zero seam or flash.
 */
function buildPageGlassScript(payload: PageGlassPayload, appliedKey: string): string {
  const keyJson = JSON.stringify(appliedKey);
  if (payload.kind === 'none') {
    return onRoot(
      `if(window.__gxGlassApplied===${keyJson})return;window.__gxGlassApplied=${keyJson};` +
        `window.__gxGlassSeq=(window.__gxGlassSeq||0)+1;` +
        `var s=d.style;d.removeAttribute("data-gx-glass");` +
        `s.removeProperty("--gx-glass-picture");s.removeProperty("--gx-glass-size");` +
        `s.removeProperty("--gx-glass-position");s.removeProperty("--gx-glass-tint-light");` +
        `s.removeProperty("--gx-glass-tint-dark");` +
        syncThemeSnippet(payload.theme),
    );
  }

  const other = payload.theme === 'light' ? 'dark' : 'light';
  const themeTintVar = JSON.stringify(`--gx-glass-tint-${payload.theme}`);
  const otherTintVar = JSON.stringify(`--gx-glass-tint-${other}`);
  const tintJson = JSON.stringify(payload.tint);

  if (payload.kind === 'ready') {
    const pictureCss = JSON.stringify(`url(${JSON.stringify(payload.dataUri)})`);
    return onRoot(
      `if(window.__gxGlassApplied===${keyJson})return;window.__gxGlassApplied=${keyJson};` +
        `window.__gxGlassSeq=(window.__gxGlassSeq||0)+1;` +
        `var s=d.style;` +
        `d.setAttribute("data-gx-glass","");` +
        `s.setProperty("--gx-glass-picture",${pictureCss});` +
        `s.setProperty("--gx-glass-size",${JSON.stringify(payload.sizeCss)});` +
        `s.setProperty("--gx-glass-position",${JSON.stringify(payload.positionCss)});` +
        `s.setProperty(${themeTintVar},${tintJson});` +
        `s.removeProperty(${otherTintVar});` +
        syncThemeSnippet(payload.theme),
    );
  }

  // First-time blur inside the WebView: 3-pass sliding-window box blur with edge clamping.
  return onRoot(
    `if(window.__gxGlassApplied===${keyJson})return;window.__gxGlassApplied=${keyJson};` +
      `var seq=(window.__gxGlassSeq||0)+1;window.__gxGlassSeq=seq;` +
      syncThemeSnippet(payload.theme) +
      `try{var img=new Image();img.onload=function(){` +
      `if(window.__gxGlassSeq!==seq)return;` +
      `try{` +
      `var nw=img.naturalWidth,nh=img.naturalHeight;if(!nw||!nh)return;` +
      `var sc=Math.min(1,${SOFT_MAX_SIDE}/Math.max(nw,nh));` +
      `var w=Math.max(1,Math.round(nw*sc)),h=Math.max(1,Math.round(nh*sc));` +
      `var c=document.createElement("canvas");c.width=w;c.height=h;` +
      `var ctx=c.getContext("2d");if(!ctx)return;` +
      `ctx.drawImage(img,0,0,w,h);` +
      `var id=ctx.getImageData(0,0,w,h),src=id.data,tmp=new Uint8ClampedArray(src.length);` +
      `var r=Math.max(1,Math.round(${BLUR_BOX_RADIUS}*Math.max(w,h)/${SOFT_MAX_SIDE}));` +
      `var div=2*r+1;` +
      `function boxH(a,b){for(var y=0;y<h;y++){var row=y*w,sr=0,sg=0,sb=0;` +
      `var f=row*4;sr=a[f]*(r+1);sg=a[f+1]*(r+1);sb=a[f+2]*(r+1);` +
      `for(var i=1;i<=r;i++){var p=(row+Math.min(i,w-1))*4;sr+=a[p];sg+=a[p+1];sb+=a[p+2];}` +
      `for(var x=0;x<w;x++){var o=(row+x)*4;b[o]=(sr/div+0.5)|0;b[o+1]=(sg/div+0.5)|0;b[o+2]=(sb/div+0.5)|0;b[o+3]=255;` +
      `var add=(row+Math.min(w-1,x+r+1))*4,sub=(row+Math.max(0,x-r))*4;` +
      `sr+=a[add]-a[sub];sg+=a[add+1]-a[sub+1];sb+=a[add+2]-a[sub+2];}}}` +
      `function boxV(a,b){for(var x=0;x<w;x++){var sr=0,sg=0,sb=0;` +
      `var f=x*4;sr=a[f]*(r+1);sg=a[f+1]*(r+1);sb=a[f+2]*(r+1);` +
      `for(var i=1;i<=r;i++){var p=(Math.min(i,h-1)*w+x)*4;sr+=a[p];sg+=a[p+1];sb+=a[p+2];}` +
      `for(var y=0;y<h;y++){var o=(y*w+x)*4;b[o]=(sr/div+0.5)|0;b[o+1]=(sg/div+0.5)|0;b[o+2]=(sb/div+0.5)|0;b[o+3]=255;` +
      `var add=(Math.min(h-1,y+r+1)*w+x)*4,sub=(Math.max(0,y-r)*w+x)*4;` +
      `sr+=a[add]-a[sub];sg+=a[add+1]-a[sub+1];sb+=a[add+2]-a[sub+2];}}}` +
      `for(var pass=0;pass<3;pass++){boxH(src,tmp);boxV(tmp,src);}` +
      `ctx.putImageData(id,0,0);` +
      `var out=c.toDataURL("image/jpeg",${SOFT_JPEG_QUALITY});` +
      `if(!out||out.indexOf("data:image/jpeg;base64,")!==0)return;` +
      `var sw=${Math.max(1, payload.sheetWidth)},sh=${Math.max(1, payload.sheetHeight)};` +
      `var cs=Math.max(sw/w,sh/h),rw=w*cs,rh=h*cs,rx=(sw-rw)/2,ry=(sh-rh)/2;` +
      `var r2=function(v){return Math.round(v*100)/100;};` +
      `var root=document.documentElement;if(root){var s=root.style;` +
      `root.setAttribute("data-gx-glass","");` +
      `s.setProperty("--gx-glass-picture",'url("'+out+'")');` +
      `s.setProperty("--gx-glass-size",r2(rw)+"px "+r2(rh)+"px");` +
      `s.setProperty("--gx-glass-position",r2(rx-${payload.pageOriginX})+"px "+r2(ry-${payload.pageOriginY})+"px");` +
      `s.setProperty(${themeTintVar},${tintJson});` +
      `s.removeProperty(${otherTintVar});}` +
      `try{window.ReactNativeWebView.postMessage(JSON.stringify({type:"blurredArt",artId:${JSON.stringify(payload.artId)},sha256:${JSON.stringify(payload.sha256)},dataUri:out,width:w,height:h}));}catch(_){}` +
      `}catch(_){}};img.src=${JSON.stringify(payload.rawDataUri)};}catch(_){}`,
  );
}

export type UsePageArtBackdropParams = {
  readonly open: boolean;
  readonly light: boolean;
  readonly baseColor: string;
  readonly sheetSize: SheetSize;
  readonly pageOrigin: PageOrigin;
};

export type PageArtBackdropState = {
  /** Whether an artwork backdrop is active and its local artwork file is cached and ready. */
  readonly active: boolean;
  /** The cached/generated blurred JPEG + aspect size, or `null` during the first-ever blur pass. */
  readonly blurred: BlurredArtwork | null;
  /** Local cached artwork source for the native header fallback while `blurred` is still generating. */
  readonly rawSource: ImageSourcePropType | null;
  /** Combined dimming + surface tint veil matching `ScreenArtBackdrop` (`area="chat"`). */
  readonly tint: string;
  /** Placement of `blurred` in the sheet's coordinates, matching `--gx-glass-size` / `--gx-glass-position`. */
  readonly rect: BackdropRect | null;
  /** JS script to inject into the Live page WebView (runs before content loads and on live changes). */
  readonly glassScript: string;
  /** Stable key representing the current injected backdrop state; changes trigger live re-injection. */
  readonly glassKey: string;
  /** Receives a newly blurred JPEG posted back by the WebView and caches it for immediate & future use. */
  readonly receiveBlurredArt: (entry: BlurredArtwork) => void;
};

export function usePageArtBackdrop({
  open,
  light,
  baseColor,
  sheetSize,
  pageOrigin,
}: UsePageArtBackdropParams): PageArtBackdropState {
  const stored = useSettingsStore(
    useShallow(({ settings }) => ({
      enabled: settings.showHeaderArtworkBackdrop,
      artId: light ? settings.windowArtLight : settings.windowArt,
      dim: settings.windowArtDim,
    })),
  );

  const activeArtId = open && stored.enabled && isKnownArtworkId(stored.artId) ? stored.artId : null;
  const artwork = artworkById(activeArtId);
  const downloadedSource = useArtworkSource(activeArtId);

  // Check the synchronous cache first so the very first render after opening has the URI with zero flash.
  const sourceUri = useMemo(() => {
    if (artwork === undefined) return null;
    return cachedArtworkUri(artwork) ?? extractSourceUri(downloadedSource);
  }, [artwork, downloadedSource]);

  const [cacheVersion, setCacheVersion] = useState(0);
  const blurred = useMemo(() => {
    void cacheVersion;
    if (artwork === undefined || sourceUri === null) return null;
    return readCachedBlurredArtwork(artwork);
  }, [artwork, sourceUri, cacheVersion]);

  const [rawState, setRawState] = useState<{ key: string; dataUri: string } | null>(null);
  const artworkKey = artwork !== undefined ? cacheKey(artwork.id, artwork.sha256) : null;
  const rawDataUri = rawState !== null && rawState.key === artworkKey ? rawState.dataUri : null;

  useEffect(() => {
    if (artwork === undefined || sourceUri === null || blurred !== null || artworkKey === null) return undefined;
    if (rawState !== null && rawState.key === artworkKey) return undefined;
    let cancelled = false;
    void readRawArtworkDataUri(artwork, sourceUri).then((dataUri) => {
      if (!cancelled && dataUri !== null) setRawState({ key: artworkKey, dataUri });
    });
    return () => {
      cancelled = true;
    };
  }, [artwork, artworkKey, sourceUri, blurred, rawState]);

  const receiveBlurredArt = useCallback((entry: BlurredArtwork) => {
    if (!isValidBlurred(entry, entry.artId, entry.sha256)) return;
    const known = artworkById(entry.artId);
    if (known === undefined || known.sha256 !== entry.sha256) return;
    saveBlurredArtwork(entry);
    setCacheVersion((current) => current + 1);
  }, []);

  const active = artwork !== undefined && sourceUri !== null;
  const tint = useMemo(
    () => combineArtTint(baseColor, stored.dim, light, 'chat'),
    [baseColor, stored.dim, light],
  );
  const theme: 'light' | 'dark' = light ? 'light' : 'dark';

  const rect = useMemo(() => {
    if (!active || blurred === null) return null;
    return coverRect(sheetSize.width, sheetSize.height, blurred.width, blurred.height);
  }, [active, blurred, sheetSize.width, sheetSize.height]);

  const { glassKey, glassScript } = useMemo(() => {
    if (!active || artwork === undefined) {
      const key = `none:${theme}`;
      return { glassKey: key, glassScript: buildPageGlassScript({ kind: 'none', theme }, key) };
    }
    if (blurred !== null && rect !== null) {
      const sizeCss = `${cssPx(rect.width)}px ${cssPx(rect.height)}px`;
      const positionCss = `${cssPx(rect.x - pageOrigin.x)}px ${cssPx(rect.y - pageOrigin.y)}px`;
      const key = `ready:${artwork.id}:${artwork.sha256}:${theme}:${tint}:${sizeCss}:${positionCss}`;
      return {
        glassKey: key,
        glassScript: buildPageGlassScript(
          {
            kind: 'ready',
            artId: artwork.id,
            sha256: artwork.sha256,
            theme,
            dataUri: blurred.dataUri,
            tint,
            sizeCss,
            positionCss,
          },
          key,
        ),
      };
    }
    if (rawDataUri !== null) {
      const key = `blur:${artwork.id}:${artwork.sha256}:${theme}:${tint}:${cssPx(sheetSize.width)}:${cssPx(sheetSize.height)}:${cssPx(pageOrigin.x)}:${cssPx(pageOrigin.y)}`;
      return {
        glassKey: key,
        glassScript: buildPageGlassScript(
          {
            kind: 'blur',
            artId: artwork.id,
            sha256: artwork.sha256,
            theme,
            rawDataUri,
            tint,
            sheetWidth: sheetSize.width,
            sheetHeight: sheetSize.height,
            pageOriginX: pageOrigin.x,
            pageOriginY: pageOrigin.y,
          },
          key,
        ),
      };
    }
    const key = `none:${theme}`;
    return { glassKey: key, glassScript: buildPageGlassScript({ kind: 'none', theme }, key) };
  }, [active, artwork, blurred, rect, rawDataUri, theme, tint, sheetSize.width, sheetSize.height, pageOrigin.x, pageOrigin.y]);

  const rawSource = useMemo<ImageSourcePropType | null>(
    () => (sourceUri !== null ? { uri: sourceUri } : null),
    [sourceUri],
  );

  return {
    active,
    blurred,
    rawSource,
    tint,
    rect,
    glassScript,
    glassKey,
    receiveBlurredArt,
  };
}
