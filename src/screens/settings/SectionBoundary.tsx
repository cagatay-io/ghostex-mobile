/**
 * An error boundary for one Settings section or page: a throw inside it shows a small error card in
 * the Settings style (themed like every Settings card) and the rest of the page keeps working.
 */

import type { ReactNode } from 'react';
import { View } from 'react-native';

import ErrorBoundary from '../../components/common/ErrorBoundary';
import { NoticeCard, useSettingsStyles } from './SettingsControls';
import { SettingsSearchSectionContext } from './search/SettingsSearchAnchor';

export const SectionErrorCopy = {
  title: "This section couldn't load",
  /** The crash text itself goes to the app log (ErrorBoundary), not on the card (CDXC:Notices 2026-11-06). */
  detail: 'Tap Try Again. If it keeps happening, send feedback.',
  tryAgain: 'Try Again',
} as const;

function SectionErrorCard({ retry }: { error: unknown; retry: () => void }) {
  return (
    <NoticeCard
      title={SectionErrorCopy.title}
      detail={SectionErrorCopy.detail}
      actions={[{ label: SectionErrorCopy.tryAgain, onPress: retry }]}
    />
  );
}

/**
 * `name` is the log line's name, like `settings:advanced:cursor`, and the section a Settings search result lands in
 * (search/settingsSearchIndex.ts names sections by it).
 */
export function SettingsSection({ name, children }: { name: string; children: ReactNode }) {
  return (
    <ErrorBoundary name={name} renderFallback={(props) => <SectionErrorCard {...props} />}>
      <SettingsSearchSectionContext.Provider value={name}>{children}</SettingsSearchSectionContext.Provider>
    </ErrorBoundary>
  );
}

/**
 * A whole page's boundary: catches what the page's own hooks and layout throw. The card sits on the
 * Settings page color without `SettingsScreenLayout` (whose header hook could be what threw).
 */
export function SettingsPageBoundary({ name, children }: { name: string; children: ReactNode }) {
  return (
    <ErrorBoundary name={name} renderFallback={(props) => <PageErrorScreen {...props} />}>
      {children}
    </ErrorBoundary>
  );
}

function PageErrorScreen(props: { error: unknown; retry: () => void }) {
  const styles = useSettingsStyles();
  return (
    <View style={[styles.container, styles.list]}>
      <SectionErrorCard {...props} />
    </View>
  );
}
