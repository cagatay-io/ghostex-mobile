/**
 * Settings home: one row per Settings page, each with a one-line summary.
 * The pages themselves live in `./settings/` and open through the
 * `SettingsPage` route.
 *
 * CDXC:Settings 2026-09-25 DECISION: User (2026-09-25): "i want settings to be affected by selected colors the and to make contrast a slider and i want to have pages for settings and to move all the ″might be useless″ settings to advanced page (bunch of legacy settings there)". Settings is a home list of pages (Updates, Theme, Chat, Terminal, Keyboard, Sounds, Connection, Advanced), named after the desktop Settings where one exists. Advanced holds the settings carried over from the older Android app and the ones almost nobody changes (legacy terminal toggles, cursor, scrollback, terminal bell, the Web chat view and its font, the transcript width, sessions list opacity, SSH keep-alive); every setting keeps its stored key and behavior. Background Contrast is a slider, and every Settings page follows the Background Tint and Contrast.
 */

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import ErrorBoundary from '../components/common/ErrorBoundary';
import type { RootStackParamList } from '../navigation/types';
import { useUpdateNotice } from '../updates/updateNotice';
import { SETTINGS_PAGE_ORDER, SETTINGS_PAGES } from './settings/pages';
import { LinkRow, SettingsScreenLayout } from './settings/SettingsControls';

/** The Updates row with its "update ready" summary, which reads the update state and can throw. */
function UpdatesNoticeRow({ onPress }: { onPress: () => void }) {
  const notice = useUpdateNotice();
  return (
    <LinkRow
      title={SETTINGS_PAGES.updates.title}
      description={notice ?? SETTINGS_PAGES.updates.description}
      descriptionAccent={notice !== null}
      onPress={onPress}
    />
  );
}

export default function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <SettingsScreenLayout>
      {SETTINGS_PAGE_ORDER.map((page) => {
        const open = () => navigation.navigate('SettingsPage', { page });
        if (page === 'updates') {
          // A throwing summary falls back to the plain row, so the list and the Updates page stay reachable.
          return (
            <ErrorBoundary
              key={page}
              name="settings:home:updates-notice"
              renderFallback={() => (
                <LinkRow
                  title={SETTINGS_PAGES[page].title}
                  description={SETTINGS_PAGES[page].description}
                  onPress={open}
                />
              )}
            >
              <UpdatesNoticeRow onPress={open} />
            </ErrorBoundary>
          );
        }
        return (
          <LinkRow
            key={page}
            title={SETTINGS_PAGES[page].title}
            description={SETTINGS_PAGES[page].description}
            onPress={open}
          />
        );
      })}
    </SettingsScreenLayout>
  );
}
