/**
 * The phone's saved links (./links.ts), in their saved order, persisted to AsyncStorage the way the Web Preview's
 * preferences are (src/webPreview/store.ts). They are this phone's only: nothing syncs them, as the desktop's
 * `customLinks` stays on its computer.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { isComputerLink, linksFromValue, newLinkId, PHONE_LINKS_MAX, type PhoneLink } from './links';

const PHONE_LINKS_STORAGE_KEY = 'phoneLinks.v1';

/** What the Add link / Edit link dialog saves. `machineId`: the computer a loopback address opens on. */
export type PhoneLinkDraft = { name: string; url: string; icon?: string; machineId?: string };

export type AddManyLinksResult = { added: number; updated: number };

type PhoneLinksState = {
  hydrated: boolean;
  links: PhoneLink[];
  hydrate: () => Promise<void>;
  /** Adds the link last; past `PHONE_LINKS_MAX` the oldest goes (the desktop's Add). */
  add: (draft: PhoneLinkDraft) => void;
  /** Saves an edited link in its place. */
  update: (id: string, draft: PhoneLinkDraft) => void;
  remove: (id: string) => void;
  /**
   * Adds the links of a computer that the list lacks (same address, and for a loopback address the same computer),
   * up to `PHONE_LINKS_MAX`, each with a new id, and updates the icon of any matching link whose icon changed on the
   * computer. Returns how many were added and how many existing links had their icon updated.
   */
  addMany: (drafts: PhoneLinkDraft[]) => AddManyLinksResult;
};

/** A draft as it is kept: a computer only for a loopback address, and a trimmed non-empty icon when set. */
function linkFrom(id: string, draft: PhoneLinkDraft): PhoneLink {
  const link: PhoneLink = { id, name: draft.name.trim(), url: draft.url };
  const icon = draft.icon?.trim();
  if (icon !== undefined && icon.length > 0) {
    link.icon = icon;
  }
  if (draft.machineId !== undefined && draft.machineId.length > 0 && isComputerLink(draft.url)) {
    link.machineId = draft.machineId;
  }
  return link;
}

function sameLink(link: PhoneLink, draft: PhoneLink): boolean {
  return link.url === draft.url && (link.machineId ?? null) === (draft.machineId ?? null);
}

export const usePhoneLinksStore = create<PhoneLinksState>()((set, get) => {
  const save = (links: PhoneLink[]): void => {
    set({ links });
    void AsyncStorage.setItem(PHONE_LINKS_STORAGE_KEY, JSON.stringify(links));
  };

  return {
    hydrated: false,
    links: [],

    hydrate: async () => {
      if (get().hydrated) return;
      let stored: PhoneLink[] = [];
      try {
        const raw = await AsyncStorage.getItem(PHONE_LINKS_STORAGE_KEY);
        if (raw !== null) stored = linksFromValue(JSON.parse(raw));
      } catch {
        // A corrupt list has no links to give.
      }
      // A link added before the stored list was read is the newer one and stays, after the stored ones.
      const added = get().links.filter((link) => !stored.some((saved) => saved.id === link.id));
      set({ hydrated: true, links: [...stored, ...added].slice(-PHONE_LINKS_MAX) });
    },

    add: (draft) => {
      const links = [...get().links, linkFrom(newLinkId(), draft)];
      save(links.slice(-PHONE_LINKS_MAX));
    },

    update: (id, draft) => {
      save(get().links.map((link) => (link.id === id ? linkFrom(id, draft) : link)));
    },

    remove: (id) => {
      const links = get().links.filter((link) => link.id !== id);
      if (links.length !== get().links.length) save(links);
    },

    addMany: (drafts) => {
      const links = [...get().links];
      let added = 0;
      let updated = 0;
      for (const draft of drafts) {
        const candidate = linkFrom(newLinkId(), draft);
        const existingIndex = links.findIndex((existing) => sameLink(existing, candidate));
        if (existingIndex >= 0) {
          const existing = links[existingIndex]!;
          if ((existing.icon ?? undefined) !== (candidate.icon ?? undefined)) {
            const next: PhoneLink = { id: existing.id, name: existing.name, url: existing.url };
            if (candidate.icon !== undefined) next.icon = candidate.icon;
            if (existing.machineId !== undefined) next.machineId = existing.machineId;
            links[existingIndex] = next;
            updated += 1;
          }
          continue;
        }
        if (links.length >= PHONE_LINKS_MAX) continue;
        links.push(candidate);
        added += 1;
      }
      if (added > 0 || updated > 0) save(links);
      return { added, updated };
    },
  };
});
