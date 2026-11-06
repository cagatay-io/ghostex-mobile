/**
 * The copy of THIRD_PARTY_NOTICES.md bundled with the app, read and parsed for Settings › Licences. Metro bundles
 * the file as an asset, so it ships with every build and over-the-air update of this exact version.
 */

import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { useCallback, useEffect, useState } from 'react';

import NOTICES_FILE from '../../THIRD_PARTY_NOTICES.md';
import { parseNotices, type ParsedNotices } from './notices';

// Why a module-level promise: the file is part of the build and cannot change while the app runs, so the list page
// and an entry page share one read and parse. A failed read is dropped, so Retry reads again.
let loading: Promise<ParsedNotices> | null = null;

function loadBundledNotices(): Promise<ParsedNotices> {
  loading ??= Asset.fromModule(NOTICES_FILE)
    .downloadAsync()
    .then(async (asset) => parseNotices(await new File(asset.localUri ?? asset.uri).text()))
    .catch((error: unknown) => {
      loading = null;
      throw error;
    });
  return loading;
}

export type BundledNotices =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly notices: ParsedNotices }
  | { readonly status: 'failed'; readonly message: string };

/** The bundled notices for a screen, with a retry after a failed read. */
export function useBundledNotices(): { state: BundledNotices; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<BundledNotices>({ status: 'loading' });
  useEffect(() => {
    let ignore = false;
    loadBundledNotices().then(
      (notices) => {
        if (!ignore) setState({ status: 'ready', notices });
      },
      (error: unknown) => {
        if (!ignore) setState({ status: 'failed', message: error instanceof Error ? error.message : String(error) });
      },
    );
    return () => {
      ignore = true;
    };
  }, [attempt]);
  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((value) => value + 1);
  }, []);
  return { state, retry };
}
