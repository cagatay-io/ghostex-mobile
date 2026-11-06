/**
 * The Settings pages listed on the Settings home, in order. Names follow the
 * desktop Settings where one exists (Interface, Chat, Terminal, Notifications:
 * the desktop files its sounds under Notifications).
 */

import { ANDROID_SELF_UPDATE_ENABLED } from '../../config/featureFlags';
import { LiveActivityCopy, NotificationsCopy } from '../../copy';
import { OTA_ENABLED } from '../../updates/overTheAir';
import { LIVE_ACTIVITY_SUPPORTED } from '../../notifications/liveActivity';
import { VOICE_SUPPORTED } from '../../voice/conversation';

export type SettingsPageId =
  | 'updates'
  | 'theme'
  | 'sessionsList'
  | 'chat'
  | 'voice'
  | 'terminal'
  | 'keyboard'
  | 'notifications'
  | 'liveActivity'
  | 'connection'
  | 'sync'
  | 'advanced'
  | 'readAloudVoice'
  | 'dictateLanguage'
  | 'dictateDictionary';

export const SETTINGS_PAGES: Readonly<Record<SettingsPageId, { title: string; description: string }>> = {
  updates: { title: 'Updates', description: 'Your Ghostex version, and newer releases.' },
  theme: { title: 'Interface', description: 'Background contrast and tint.' },
  sessionsList: { title: 'Sessions list', description: 'Unified or Project layout, and how Unified groups.' },
  chat: { title: 'Chat', description: 'Default agent view, chat theme and detail.' },
  voice: { title: 'Voice', description: "Dictate's engine and models, and the voice agent, per computer." },
  terminal: { title: 'Terminal', description: 'Font size, screen and tab behavior.' },
  keyboard: { title: 'Keyboard', description: 'Command pad, its keys and agent hotkeys.' },
  notifications: { title: NotificationsCopy.title, description: NotificationsCopy.settings.pageDescription },
  liveActivity: { title: LiveActivityCopy.pageTitle, description: LiveActivityCopy.pageDescription },
  connection: { title: 'Connection', description: 'Reconnecting to your computer.' },
  sync: { title: 'Sync', description: 'Carrying Spaces and settings between your computers.' },
  advanced: { title: 'Advanced', description: 'Older settings most people never change.' },
  // Opened from Settings › Chat's Read aloud rows, not listed on the Settings home.
  readAloudVoice: { title: 'Read aloud voice', description: "Which of this phone's voices reads replies aloud." },
  // Opened from Settings › Voice, for the computer picked there; not listed on the Settings home.
  dictateLanguage: { title: 'Language', description: 'The language Dictate listens for.' },
  dictateDictionary: { title: 'Dictionary', description: 'Words Dictate should spell your way.' },
};

export const SETTINGS_PAGE_ORDER: readonly SettingsPageId[] = [
  ...(ANDROID_SELF_UPDATE_ENABLED || OTA_ENABLED ? (['updates'] as const) : []),
  'theme',
  'sessionsList',
  'chat',
  ...(VOICE_SUPPORTED ? (['voice'] as const) : []),
  'terminal',
  'keyboard',
  'notifications',
  ...(LIVE_ACTIVITY_SUPPORTED ? (['liveActivity'] as const) : []),
  'connection',
  'sync',
  'advanced',
];
