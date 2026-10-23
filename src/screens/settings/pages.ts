/**
 * The Settings pages listed on the Settings home, in order. Names follow the
 * desktop Settings where one exists (Theme, Chat, Terminal, Sounds).
 */

import { ANDROID_SELF_UPDATE_ENABLED } from '../../config/featureFlags';
import { OTA_ENABLED } from '../../updates/overTheAir';
import { VOICE_SUPPORTED } from '../../voice/conversation';

export type SettingsPageId =
  | 'updates'
  | 'theme'
  | 'chat'
  | 'voice'
  | 'terminal'
  | 'keyboard'
  | 'sounds'
  | 'connection'
  | 'advanced'
  | 'readAloudVoice';

export const SETTINGS_PAGES: Readonly<Record<SettingsPageId, { title: string; description: string }>> = {
  updates: { title: 'Updates', description: 'Your Ghostex version, and newer releases.' },
  theme: { title: 'Theme', description: 'Background contrast and tint.' },
  chat: { title: 'Chat', description: 'Default agent view, chat theme and detail.' },
  voice: { title: 'Voice agent', description: 'Regular or push-to-talk calls, and what each costs.' },
  terminal: { title: 'Terminal', description: 'Font size, screen and tab behavior.' },
  keyboard: { title: 'Keyboard', description: 'Extra keys row and agent hotkeys.' },
  sounds: { title: 'Sounds', description: 'A sound when an agent needs you.' },
  connection: { title: 'Connection', description: 'Reconnecting to your computer.' },
  advanced: { title: 'Advanced', description: 'Older settings most people never change.' },
  // Opened from Settings › Chat's Read aloud rows, not listed on the Settings home.
  readAloudVoice: { title: 'Read aloud voice', description: "Which of this phone's voices reads replies aloud." },
};

export const SETTINGS_PAGE_ORDER: readonly SettingsPageId[] = [
  ...(ANDROID_SELF_UPDATE_ENABLED || OTA_ENABLED ? (['updates'] as const) : []),
  'theme',
  'chat',
  ...(VOICE_SUPPORTED ? (['voice'] as const) : []),
  'terminal',
  'keyboard',
  'sounds',
  'connection',
  'advanced',
];
