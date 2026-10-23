/**
 * The one-line update notice the Settings row and the Sessions menu show: a newer APK to install
 * (GitHub build, new native code), or a downloaded over-the-air update waiting for a restart.
 */

import { availableUpdate, useAndroidSelfUpdateStore } from './androidSelfUpdateStore';
import { useReadyUpdate } from './overTheAir';

export function useUpdateNotice(): string | null {
  const apkVersion = useAndroidSelfUpdateStore((state) => availableUpdate(state.check)?.version ?? null);
  const ready = useReadyUpdate();
  if (apkVersion !== null) return `Update available: Ghostex ${apkVersion}`;
  if (ready !== null)
    return ready.version === null ? 'Restart to update' : `Restart to update to Ghostex ${ready.version}`;
  return null;
}
