/**
 * Theme artworks: the 32 still artworks from the desktop catalog (`packages/settings-catalog/src/data/themes.rs`).
 *
 * No full-resolution artwork ships inside the app or OTA bundle. Each artwork downloads on demand from the
 * public `ghostex-components` `theme-art` release (`<id>-<first 8 of sha256>.webp`), is checked against its
 * expected byte size, and is cached under `Paths.cache/theme-art/` so it loads instantly and works offline
 * afterwards. The 6 tiny thumbnails already in `assets/theme-art/` (~45 KB total) serve only as instant
 * picker thumbnails for those 6 entries before their full artwork is cached.
 */

import { Directory, File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';
import type { ImageSourcePropType } from 'react-native';

export const ARTWORK_RELEASE_BASE_URL =
  'https://github.com/maddada/ghostex-components/releases/download/theme-art';

/**
 * Desktop's `windowArt` / `windowArtLight` value for a per-computer custom image (`YOUR_IMAGE_ART_ID`).
 * The picture file itself stays on that computer and is never synced; on the phone this stays solid.
 */
export const YOUR_IMAGE_ART_ID = 'yourImage';

export type ThemeArtwork = {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly mode: 'dark' | 'light';
  readonly sha256: string;
  readonly sizeBytes: number;
  /** Fallback tile gradient stops while loading or offline. */
  readonly previewStops: readonly [string, string, string];
  readonly previewAccent: string;
};

/** Exact desktop order and integrity metadata (`ARTWORKS` in packages/settings-catalog/src/data/themes.rs). */
export const THEME_ARTWORKS: readonly ThemeArtwork[] = [
  {
    id: 'moonwater',
    name: 'Moonwater',
    label: 'Moonwater',
    mode: 'dark',
    sha256: '6d080bb4daa871d95cc0836de35d26adfbe72ed418eff348740b2d3868a71798',
    sizeBytes: 350522,
    previewStops: ['#121d28', '#1b2b3a', '#0f161f'],
    previewAccent: '#b9d6e7',
  },
  {
    id: 'polar-night',
    name: 'Polar Night',
    label: 'Polar',
    mode: 'dark',
    sha256: 'a7184e97de83d179f177f9235edceb50f3fa3cdd515c1244e8ffde8d81589c36',
    sizeBytes: 113042,
    previewStops: ['#141c2e', '#1f2d47', '#101624'],
    previewAccent: '#7cb8f7',
  },
  {
    id: 'glasshouse',
    name: 'Glasshouse',
    label: 'Glasshouse',
    mode: 'dark',
    sha256: 'cc44012979bc456b13d845bcd75a5c8889a9126a2819cfee9429921aaa4b50ca',
    sizeBytes: 499062,
    previewStops: ['#141d18', '#1f2e24', '#101814'],
    previewAccent: '#b3c98c',
  },
  {
    id: 'red-earth',
    name: 'Red Earth',
    label: 'Earth',
    mode: 'dark',
    sha256: '41da3d9c551c8083d9d707d1ec0b851efc46856ccfe2b133194bae0e8179890d',
    sizeBytes: 178612,
    previewStops: ['#21171b', '#332226', '#1a1215'],
    previewAccent: '#e2a68d',
  },
  {
    id: 'deep-current',
    name: 'Deep Current',
    label: 'Current',
    mode: 'dark',
    sha256: '4060531dad7f13bb48cb7d73d95bbc60ed5f24ca69da3ad3958daa50d965703e',
    sizeBytes: 294282,
    previewStops: ['#111d1f', '#192d30', '#0d1719'],
    previewAccent: '#7ecdc5',
  },
  {
    id: 'night-garden',
    name: 'Night Garden',
    label: 'Garden',
    mode: 'dark',
    sha256: '29317325308c19394aa7b56d053fcc60f593572c2dab81f62deb2e64d825ba7f',
    sizeBytes: 282744,
    previewStops: ['#1e1820', '#2e2232', '#171219'],
    previewAccent: '#d8a8ce',
  },
  {
    id: 'nocturne-canyon',
    name: 'Nocturne Canyon',
    label: 'Canyon',
    mode: 'dark',
    sha256: '87f5accc7e668b918a68d67ef21cbcfe623088184e9c0940b35b0ee8062c5863',
    sizeBytes: 189330,
    previewStops: ['#201913', '#32271d', '#18130e'],
    previewAccent: '#ddb985',
  },
  {
    id: 'inkstone',
    name: 'Inkstone',
    label: 'Inkstone',
    mode: 'dark',
    sha256: '53fbe6af737e817d671f8654aea9ca73393776f57949e7dd7a6ca3076cef4821',
    sizeBytes: 189638,
    previewStops: ['#151820', '#202634', '#11131a'],
    previewAccent: '#d8664f',
  },
  {
    id: 'firefly-forest',
    name: 'Firefly Forest',
    label: 'Firefly',
    mode: 'dark',
    sha256: '9c0d8ff86fa22ee9dcdd3153ad4246231953ac94fee363c4f58ddf87cac3e4fc',
    sizeBytes: 168822,
    previewStops: ['#161f19', '#223127', '#121814'],
    previewAccent: '#a9c46c',
  },
  {
    id: 'ember-forge',
    name: 'Ember Forge',
    label: 'Ember',
    mode: 'dark',
    sha256: '403ad58947132977ddc15e530afef0f976e49c8272b4e6cc563ab6973b2dbf40',
    sizeBytes: 93516,
    previewStops: ['#1e1815', '#31251e', '#171210'],
    previewAccent: '#d9824a',
  },
  {
    id: 'synthwave-84',
    name: "Synthwave '84",
    label: 'Synthwave',
    mode: 'dark',
    sha256: '6a0c9321e30d0d1e6e7ad6783a2809b63c4755910a98e887dc98ea4a3e6960a1',
    sizeBytes: 173314,
    previewStops: ['#1a1623', '#2c2340', '#14111d'],
    previewAccent: '#d77cc8',
  },
  {
    id: 'orchid-dusk',
    name: 'Orchid Dusk',
    label: 'Orchid',
    mode: 'dark',
    sha256: 'c26bc583df15d8cf4e2fbd81875697cbb467da0f110a8c80bc405c92f98f4773',
    sizeBytes: 106318,
    previewStops: ['#1f171c', '#32242e', '#181216'],
    previewAccent: '#d69bb5',
  },
  {
    id: 'mocha',
    name: 'Catppuccin Mocha',
    label: 'Mocha',
    mode: 'dark',
    sha256: '8fa2dbeff395562f8a4bd10c0b2c0e2b09fa32747ad3253a90457e4b1af3d2ab',
    sizeBytes: 230176,
    previewStops: ['#1e1e2e', '#2a2a3e', '#181825'],
    previewAccent: '#cba6f7',
  },
  {
    id: 'macchiato',
    name: 'Catppuccin Macchiato',
    label: 'Macchiato',
    mode: 'dark',
    sha256: 'fe4a4a57fc2a97f8eb5ea5299665a6864802f62885b159d59ef31126346d506d',
    sizeBytes: 175542,
    previewStops: ['#24273a', '#31364e', '#1e2030'],
    previewAccent: '#c6a0f6',
  },
  {
    id: 'frappe',
    name: 'Catppuccin Frappé',
    label: 'Frappé',
    mode: 'dark',
    sha256: 'b05ee8d6a57120310caefc7f579a5589cbd89c596e832ae02ce48dbec97ae025',
    sizeBytes: 134738,
    previewStops: ['#303446', '#3d4259', '#292c3c'],
    previewAccent: '#ca9ee6',
  },
  {
    id: 'latte',
    name: 'Catppuccin Latte',
    label: 'Latte',
    mode: 'light',
    sha256: 'e6dc6509f235c677ecd98e57347afedb29a31040f79058030f3552a850344dc0',
    sizeBytes: 321008,
    previewStops: ['#eff1f5', '#dce0e8', '#e6e9ef'],
    previewAccent: '#8839ef',
  },
  {
    id: 'dracula',
    name: 'Dracula',
    label: 'Dracula',
    mode: 'dark',
    sha256: '02d1becadcb0326f62110da6f2d897786818c12e487bb30e8576146f1ce6c890',
    sizeBytes: 210752,
    previewStops: ['#282a36', '#383b4d', '#21222c'],
    previewAccent: '#bd93f9',
  },
  {
    id: 'alucard',
    name: 'Alucard',
    label: 'Alucard',
    mode: 'light',
    sha256: 'ff50ec477d2ce33f987c2f250886dfb29cb6e8a2ea7c286dd473c28556660345',
    sizeBytes: 289726,
    previewStops: ['#fffbeb', '#f5eed6', '#f9f3de'],
    previewAccent: '#644ac9',
  },
  {
    id: 'sol-dark',
    name: 'Solarized Dark',
    label: 'Sol. Dark',
    mode: 'dark',
    sha256: 'c423d3aa6f46c71ade02c85c0cd219d2470bdb33693a4135aabe81528625cf60',
    sizeBytes: 152798,
    previewStops: ['#002b36', '#073642', '#00212b'],
    previewAccent: '#268bd2',
  },
  {
    id: 'sol-light',
    name: 'Solarized Light',
    label: 'Sol. Light',
    mode: 'light',
    sha256: '94e4ee34ea46b4258bff50cfd4b1951bf21995737f79688c6e439a4e47528b5b',
    sizeBytes: 220978,
    previewStops: ['#fdf6e3', '#eee8d5', '#f6efd9'],
    previewAccent: '#268bd2',
  },
  {
    id: 'tn-night',
    name: 'Tokyo Night',
    label: 'Tokyo',
    mode: 'dark',
    sha256: '038cc32c84a2ca6d22a4f78d66d7b1ce9fac884a48c6ed47b2c9dc97553ec366',
    sizeBytes: 161658,
    previewStops: ['#1a1b26', '#24283b', '#16161e'],
    previewAccent: '#7aa2f7',
  },
  {
    id: 'tn-storm',
    name: 'Tokyo Night Storm',
    label: 'Storm',
    mode: 'dark',
    sha256: '63edf6d4f3674db55fbf1be565dbe33a4cc34eafc2da6e1cf2df6e1e803e8371',
    sizeBytes: 154126,
    previewStops: ['#24283b', '#2f3549', '#1f2335'],
    previewAccent: '#7aa2f7',
  },
  {
    id: 'tn-moon',
    name: 'Tokyo Night Moon',
    label: 'Moon',
    mode: 'dark',
    sha256: '9f9b2dbe1162ddbc4c47c11f9f802bced7154cfeb400f93a93ef35ef49ffc4aa',
    sizeBytes: 216206,
    previewStops: ['#222436', '#2f334d', '#1e2030'],
    previewAccent: '#82aaff',
  },
  {
    id: 'tn-day',
    name: 'Tokyo Night Day',
    label: 'Day',
    mode: 'light',
    sha256: '74964e9fb264d57a0afbe21f35d29d56e61f71817696d60a655b987fa9c22602',
    sizeBytes: 278828,
    previewStops: ['#e1e2e7', '#d0d5e3', '#d7dae3'],
    previewAccent: '#2e7de9',
  },
  {
    id: 'nord',
    name: 'Nord',
    label: 'Nord',
    mode: 'dark',
    sha256: '65f62f9ae1b4d9d648dfd7432788f50570e7cbc03d0490348631b38a3a1ef504',
    sizeBytes: 133470,
    previewStops: ['#2e3440', '#3b4252', '#272c36'],
    previewAccent: '#88c0d0',
  },
  {
    id: 'kg-wave',
    name: 'Kanagawa Wave',
    label: 'Wave',
    mode: 'dark',
    sha256: '407c43a0d1918969002cea56613b7c0b1acad78e0da921e81c959df48c50b61b',
    sizeBytes: 175160,
    previewStops: ['#1f1f28', '#2a2a37', '#16161d'],
    previewAccent: '#7e9cd8',
  },
  {
    id: 'kg-dragon',
    name: 'Kanagawa Dragon',
    label: 'Dragon',
    mode: 'dark',
    sha256: '04d8907b8ebdab5fdb57123470d04e06d4afa8e90baef2d16f175e5410c37e5c',
    sizeBytes: 160706,
    previewStops: ['#181616', '#282727', '#12120f'],
    previewAccent: '#8ba4b0',
  },
  {
    id: 'kg-lotus',
    name: 'Kanagawa Lotus',
    label: 'Lotus',
    mode: 'light',
    sha256: 'cdc20d9f85a7e656338e2afb0afe4efffa2b24771fb1fb44c63634749ebb8f71',
    sizeBytes: 178622,
    previewStops: ['#f2ecbc', '#e5ddb0', '#ebe3b4'],
    previewAccent: '#4d699b',
  },
  {
    id: 'ef-dark',
    name: 'Everforest Dark',
    label: 'Everforest',
    mode: 'dark',
    sha256: '85bbe256514e94adca1c4216f408fc0781455ff09ef961d79e4ecee79da6e4a0',
    sizeBytes: 167934,
    previewStops: ['#2d353b', '#38434a', '#232a2e'],
    previewAccent: '#a7c080',
  },
  {
    id: 'ef-light',
    name: 'Everforest Light',
    label: 'EF Light',
    mode: 'light',
    sha256: '92eb5f60fa8a0df92096ce7c47f12e0231102e5c4e80c6699f7b4267175c9de6',
    sizeBytes: 273350,
    previewStops: ['#fdf6e3', '#f4f0d9', '#efebd4'],
    previewAccent: '#8da101',
  },
  {
    id: 'gm-dark',
    name: 'Gruvbox Material Dark',
    label: 'Gruvbox',
    mode: 'dark',
    sha256: '5895ad6973964a1262b97cc721e3ca4c311683ee39b44607d096f1c683d6648e',
    sizeBytes: 250932,
    previewStops: ['#282828', '#3c3836', '#1d2021'],
    previewAccent: '#d8a657',
  },
  {
    id: 'gm-light',
    name: 'Gruvbox Material Light',
    label: 'GM Light',
    mode: 'light',
    sha256: 'eba8a362ed0cfcf78960e0f7439560a09d0bb74fb5de650c3db6fb355c4fa62c',
    sizeBytes: 378868,
    previewStops: ['#fbf1c7', '#f2e5bc', '#f5ebd0'],
    previewAccent: '#b47109',
  },
];

const ARTWORKS_BY_ID: ReadonlyMap<string, ThemeArtwork> = new Map(
  THEME_ARTWORKS.map((artwork) => [artwork.id, artwork]),
);

/** Existing tiny bundled thumbnails (~45 KB total, already in assets/theme-art/) for zero-latency preview tiles. */
const BUNDLED_THUMB_IMAGES: Readonly<Record<string, ImageSourcePropType>> = {
  moonwater: require('../../assets/theme-art/moonwater.webp'),
  glasshouse: require('../../assets/theme-art/glasshouse.webp'),
  'red-earth': require('../../assets/theme-art/red-earth.webp'),
  'deep-current': require('../../assets/theme-art/deep-current.webp'),
  'night-garden': require('../../assets/theme-art/night-garden.webp'),
  'nocturne-canyon': require('../../assets/theme-art/nocturne-canyon.webp'),
};

export function artworkById(id: string | null | undefined): ThemeArtwork | undefined {
  if (typeof id !== 'string') return undefined;
  return ARTWORKS_BY_ID.get(id.trim().toLowerCase());
}

export function isKnownArtworkId(id: unknown): id is string {
  return typeof id === 'string' && ARTWORKS_BY_ID.has(id.trim().toLowerCase());
}

/**
 * Normalizes a `windowArt` / `windowArtLight` value from storage or settings sync while preserving
 * `'yourImage'` case-sensitively so a computer's custom image choice is never corrupted on sync.
 */
export function sanitizeWindowArt(value: unknown, fallback = 'none'): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (trimmed === '') return fallback;
  if (trimmed === YOUR_IMAGE_ART_ID || trimmed.toLowerCase() === 'yourimage') return YOUR_IMAGE_ART_ID;
  const lowered = trimmed.toLowerCase();
  if (lowered === 'none') return 'none';
  return ARTWORKS_BY_ID.has(lowered) ? lowered : fallback;
}

export function artworkFileName(artwork: ThemeArtwork): string {
  return `${artwork.id}-${artwork.sha256.slice(0, 8)}.webp`;
}

export function artworkRemoteUrl(artwork: ThemeArtwork): string {
  return `${ARTWORK_RELEASE_BASE_URL}/${artworkFileName(artwork)}`;
}

const resolvedUris = new Map<string, string>();
const inFlight = new Map<string, Promise<string | null>>();
const listeners = new Set<() => void>();

function notifyListeners(): void {
  for (const listener of listeners) listener();
}

function cacheDirectory(): Directory {
  return new Directory(Paths.cache, 'theme-art');
}

function cacheFileFor(artwork: ThemeArtwork): File {
  return new File(cacheDirectory(), artworkFileName(artwork));
}

/** Synchronously checks the memory map and disk cache for an already-downloaded artwork. */
export function cachedArtworkUri(artwork: ThemeArtwork): string | null {
  const memo = resolvedUris.get(artwork.id);
  if (memo !== undefined) return memo;
  try {
    const file = cacheFileFor(artwork);
    if (file.exists && file.size === artwork.sizeBytes) {
      resolvedUris.set(artwork.id, file.uri);
      return file.uri;
    }
  } catch {
    // Cache inspection errors fall through to on-demand download.
  }
  return null;
}

/**
 * Downloads `artwork` on demand from the `ghostex-components` `theme-art` release into `Paths.cache/theme-art/`,
 * verifying its exact expected byte size. Deduplicated per artwork id; returns `null` when offline or failed.
 */
export async function ensureArtworkCached(id: string): Promise<string | null> {
  const artwork = artworkById(id);
  if (artwork === undefined) return null;

  const existing = cachedArtworkUri(artwork);
  if (existing !== null) return existing;

  const pending = inFlight.get(artwork.id);
  if (pending !== undefined) return pending;

  const task = (async (): Promise<string | null> => {
    try {
      const dir = cacheDirectory();
      if (!dir.exists) dir.create({ idempotent: true, intermediates: true });
      const destination = cacheFileFor(artwork);
      if (destination.exists && destination.size !== artwork.sizeBytes) {
        destination.delete();
      }
      const downloaded = await File.downloadFileAsync(artworkRemoteUrl(artwork), destination, {
        idempotent: true,
      });
      if (!downloaded.exists || downloaded.size !== artwork.sizeBytes) {
        try {
          if (downloaded.exists) downloaded.delete();
        } catch {
          // Best-effort cleanup of incomplete download.
        }
        return null;
      }
      resolvedUris.set(artwork.id, downloaded.uri);
      notifyListeners();
      return downloaded.uri;
    } catch {
      return null;
    } finally {
      inFlight.delete(artwork.id);
    }
  })();

  inFlight.set(artwork.id, task);
  return task;
}

/**
 * Returns the local cached image source for a full-screen artwork backdrop, downloading on demand when
 * not yet cached. While downloading (or offline), returns `null` so screens stay solid in the theme's colour.
 */
export function useArtworkSource(artId: string | null | undefined): ImageSourcePropType | null {
  const artwork = artworkById(artId);
  const [uri, setUri] = useState<string | null>(() => (artwork !== undefined ? cachedArtworkUri(artwork) : null));

  useEffect(() => {
    if (artwork === undefined) {
      setUri(null);
      return;
    }
    const existing = cachedArtworkUri(artwork);
    if (existing !== null) {
      setUri(existing);
      return;
    }
    setUri(null);
    let cancelled = false;
    const onUpdate = () => {
      if (cancelled) return;
      const ready = cachedArtworkUri(artwork);
      if (ready !== null) setUri(ready);
    };
    listeners.add(onUpdate);
    void ensureArtworkCached(artwork.id).then((downloadedUri) => {
      if (!cancelled && downloadedUri !== null) setUri(downloadedUri);
    });
    return () => {
      cancelled = true;
      listeners.delete(onUpdate);
    };
  }, [artwork]);

  if (artwork === undefined || uri === null) return null;
  return { uri };
}

/**
 * Returns the best preview source for an artwork tile in Settings > Themes: cached local file first,
 * else the tiny existing bundled thumbnail (for the 6 original art looks), else the remote release URL
 * so React Native streams thumbnails lazily only as tiles scroll into view.
 */
export function artworkThumbSource(artId: string | null | undefined): ImageSourcePropType | null {
  const artwork = artworkById(artId);
  if (artwork === undefined) return null;
  const cached = cachedArtworkUri(artwork);
  if (cached !== null) return { uri: cached };
  const bundled = BUNDLED_THUMB_IMAGES[artwork.id];
  if (bundled !== undefined) return bundled;
  return { uri: artworkRemoteUrl(artwork) };
}
