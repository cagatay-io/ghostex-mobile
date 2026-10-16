/**
 * Web preview preferences: the port the user last previewed on each machine, so
 * the picker's manual field comes back prefilled with it, and the sites the user
 * asked for in desktop mode (the Desktop site switch). Persisted to
 * AsyncStorage the same way the header launcher preferences are
 * (src/components/sessions/launcherStore.ts).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { isValidPort } from './urls';

const WEB_PREVIEW_STORAGE_KEY = 'webPreview.v1';

type PersistedWebPreview = {
  lastPortByMachine?: Record<string, number>;
  /** Site keys (`siteKeyForUrl`) that were switched to the desktop site. Off is the absence of the key. */
  desktopSites?: string[];
};

type WebPreviewState = {
  hydrated: boolean;
  /** Last previewed port, keyed by machine id. */
  lastPortByMachine: Record<string, number>;
  /** Sites shown as their desktop version, keyed by `siteKeyForUrl`. */
  desktopSites: Record<string, true>;

  hydrate: () => Promise<void>;
  setLastPort: (machineId: string, port: number) => void;
  setDesktopSite: (siteKey: string, desktop: boolean) => void;
};

export const useWebPreviewStore = create<WebPreviewState>()((set, get) => {
  const persist = (): void => {
    const payload: PersistedWebPreview = {
      lastPortByMachine: get().lastPortByMachine,
      desktopSites: Object.keys(get().desktopSites),
    };
    void AsyncStorage.setItem(WEB_PREVIEW_STORAGE_KEY, JSON.stringify(payload));
  };

  return {
    hydrated: false,
    lastPortByMachine: {},
    desktopSites: {},

    hydrate: async () => {
      if (get().hydrated) return;
      const lastPortByMachine: Record<string, number> = {};
      const desktopSites: Record<string, true> = {};
      try {
        const raw = await AsyncStorage.getItem(WEB_PREVIEW_STORAGE_KEY);
        if (raw !== null) {
          const parsed: unknown = JSON.parse(raw);
          if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            const record = (parsed as PersistedWebPreview).lastPortByMachine;
            if (typeof record === 'object' && record !== null) {
              for (const [machineId, port] of Object.entries(record)) {
                if (typeof port === 'number' && isValidPort(port)) lastPortByMachine[machineId] = port;
              }
            }
            const sites = (parsed as PersistedWebPreview).desktopSites;
            if (Array.isArray(sites)) {
              for (const site of sites) if (typeof site === 'string' && site.length > 0) desktopSites[site] = true;
            }
          }
        }
      } catch {
        // Corrupt preview state has no remembered ports to contribute.
      }
      /*
       * A preview opened before hydration finished has already recorded its
       * port in memory, and that is the newer of the two. Merging keeps it
       * instead of replacing it with the older persisted table.
       */
      const memory = get();
      set({
        hydrated: true,
        lastPortByMachine: { ...lastPortByMachine, ...memory.lastPortByMachine },
        desktopSites: { ...desktopSites, ...memory.desktopSites },
      });
    },

    setLastPort: (machineId, port) => {
      if (!isValidPort(port)) return;
      set({ lastPortByMachine: { ...get().lastPortByMachine, [machineId]: port } });
      persist();
    },

    setDesktopSite: (siteKey, desktop) => {
      const next = { ...get().desktopSites };
      if (desktop) next[siteKey] = true;
      else delete next[siteKey];
      set({ desktopSites: next });
      persist();
    },
  };
});
