/**
 * Experience on this phone: Chill, Regular and Advanced, named sets of this phone's own settings for the chat box,
 * the chat and the sessions list. Picking a preset writes its settings; an area whose settings match none says
 * Custom, and the Experience row selects a preset only while every area matches it.
 *
 * CDXC:Experience 2026-11-15 DECISION:
 * The phone's copy of packages/settings-catalog/src/experience.rs, where the user's decisions are (issue #618,
 * Q3280 to Q3289). Q3288: no new syncing, so each device keeps its own picks: the chat box and the sessions list are
 * this phone's own settings, and the chat's Quiet View is this phone's own once Experience sets it (until then each
 * chat follows its computer, as before). The phone has no Maximize, its rows no git numbers, and the computer's hover
 * logos are this phone's agent icons; the rest matches the computer's tables.
 * CDXC:Experience 2026-11-24 DECISION:
 * Mirror desktop `packages/settings-catalog/src/experience.rs` (commit 7314415e6): Native Chat is the default for all
 * new users and onboarding never pitches terminal-based chat. Supersedes the terminal-based chat wording of Q3286 while
 * keeping the preset setting keys unchanged so existing users' saved preferences do not shift on update.
 * SEE-ALSO: src/screens/settings/ExperiencePage.tsx (the page), src/screens/sessions-screen/ExperienceCard.tsx (the
 * first-run card), src/chat/rust/boot.ts and host.ts (what the chat core is told).
 */

import type { GhostexSettings, PhoneQuietView } from './store';

export type ExperiencePreset = 'chill' | 'regular' | 'advanced';
export type ExperienceAreaId = 'chatBox' | 'chat' | 'sessionsList';

export const EXPERIENCE_PRESETS: readonly { value: ExperiencePreset; label: string; description: string }[] = [
  { value: 'chill', label: 'Chill', description: 'A simple chat box and a calm chat. Good for checking in on your agents.' },
  {
    value: 'regular',
    label: 'Regular',
    description: 'Pick the model, mode and effort as you chat, with file attach ready in the chat box.',
  },
  {
    value: 'advanced',
    label: 'Advanced',
    description: 'Every chat box control and detail on screen, including the context ring and last-active times.',
  },
];

/** The preset the first-run card preselects (Q3286 A). */
export const FIRST_RUN_PRESET: ExperiencePreset = 'regular';

type AreaSettings = Partial<GhostexSettings>;

const QUIET: Record<ExperiencePreset, PhoneQuietView> = {
  chill: { coordinators: true, chats: true, expandLast: false, calm: true },
  regular: { coordinators: true, chats: true, expandLast: true, calm: false },
  advanced: { coordinators: true, chats: true, expandLast: true, calm: false },
};

/** What Quiet View is when this phone has none of its own: the computers' defaults. */
const QUIET_DEFAULT: PhoneQuietView = QUIET.regular;

export const EXPERIENCE_AREAS: readonly {
  id: ExperienceAreaId;
  label: string;
  description: string;
  presets: Record<ExperiencePreset, AreaSettings>;
}[] = [
  {
    id: 'chatBox',
    label: 'Chat box',
    description:
      'Chill: the field, the model, the effort, •••, attach, the mic and Send. Regular adds the mode. Advanced adds the terminal button and the context ring.',
    presets: {
      chill: { chatComposerModePicker: false, chatComposerTerminalButton: false, chatComposerContextRing: false },
      regular: { chatComposerModePicker: true, chatComposerTerminalButton: false, chatComposerContextRing: false },
      advanced: { chatComposerModePicker: true, chatComposerTerminalButton: true, chatComposerContextRing: true },
    },
  },
  {
    id: 'chat',
    label: 'Chat',
    description:
      'Chill: Quiet View keeps the running turn as one line with its time and names only reports. Regular and Advanced: Quiet View with the last turn open.',
    presets: {
      chill: { chatQuietView: QUIET.chill, sessionChatDetailedView: false, sessionChatFileEditPreviews: false },
      regular: { chatQuietView: QUIET.regular, sessionChatDetailedView: false, sessionChatFileEditPreviews: false },
      advanced: { chatQuietView: QUIET.advanced, sessionChatDetailedView: false, sessionChatFileEditPreviews: false },
    },
  },
  {
    id: 'sessionsList',
    label: 'Sessions list',
    description:
      'Chill: names and status dots. Regular adds project and agent icons. Advanced adds when each session was last active.',
    presets: {
      chill: { sessionsShowProjectIcons: false, sessionsShowAgentIcons: false, sessionsShowLastActive: false },
      regular: { sessionsShowProjectIcons: true, sessionsShowAgentIcons: true, sessionsShowLastActive: false },
      advanced: { sessionsShowProjectIcons: true, sessionsShowAgentIcons: true, sessionsShowLastActive: true },
    },
  },
];

const ORDER: readonly ExperiencePreset[] = ['chill', 'regular', 'advanced'];

function sameValue(key: string, wanted: unknown, settings: GhostexSettings): boolean {
  const current = (settings as Record<string, unknown>)[key];
  if (key === 'chatQuietView') {
    const have = (current as PhoneQuietView | null) ?? QUIET_DEFAULT;
    const want = wanted as PhoneQuietView;
    return (
      have.coordinators === want.coordinators &&
      have.chats === want.chats &&
      have.expandLast === want.expandLast &&
      have.calm === want.calm
    );
  }
  return current === wanted;
}

/** The presets an area's settings match; Regular and Advanced give the chat the same settings. */
export function areaMatches(areaId: ExperienceAreaId, settings: GhostexSettings): ExperiencePreset[] {
  const area = EXPERIENCE_AREAS.find((candidate) => candidate.id === areaId);
  if (area === undefined) return [];
  return ORDER.filter((preset) =>
    Object.entries(area.presets[preset]).every(([key, wanted]) => sameValue(key, wanted, settings)),
  );
}

/** The preset every area matches, which the Experience row selects; `null` is Custom. */
export function overallPreset(settings: GhostexSettings): ExperiencePreset | null {
  const matches = EXPERIENCE_AREAS.map((area) => areaMatches(area.id, settings));
  return ORDER.find((preset) => matches.every((area) => area.includes(preset))) ?? null;
}

/**
 * The preset an area's row selects; `null` is Custom. An area that matches several shows the one the whole of
 * Experience is on, else the one most other areas match, else the calmest (the computer's `experience::shown`).
 */
export function shownPreset(areaId: ExperienceAreaId, settings: GhostexSettings): ExperiencePreset | null {
  const matches = areaMatches(areaId, settings);
  if (matches.length <= 1) return matches[0] ?? null;
  const overall = overallPreset(settings);
  if (overall !== null && matches.includes(overall)) return overall;
  const votes = (preset: ExperiencePreset) =>
    EXPERIENCE_AREAS.filter((other) => other.id !== areaId).filter((other) => {
      const otherMatches = areaMatches(other.id, settings);
      return otherMatches.length === 1 && otherMatches[0] === preset;
    }).length;
  const most = Math.max(...matches.map(votes));
  return matches.find((preset) => votes(preset) === most) ?? null;
}

/** The settings picking `preset` for one area writes. */
export function areaPatch(areaId: ExperienceAreaId, preset: ExperiencePreset): AreaSettings {
  return { ...(EXPERIENCE_AREAS.find((area) => area.id === areaId)?.presets[preset] ?? {}) };
}

/** The settings picking `preset` for the whole of Experience writes. */
export function experiencePatch(preset: ExperiencePreset): AreaSettings {
  return Object.assign({}, ...EXPERIENCE_AREAS.map((area) => area.presets[preset]));
}

/** The chat core's `composerRow` switches (gx-chat-core `composer/row.rs`); the phone has no Maximize. */
export function composerRowSettings(settings: GhostexSettings) {
  return {
    modePicker: settings.chatComposerModePicker,
    terminalButton: settings.chatComposerTerminalButton,
    contextRing: settings.chatComposerContextRing,
    maximize: true,
  };
}
