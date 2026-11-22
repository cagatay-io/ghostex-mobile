/**
 * Link icons on the phone: draws the same icon a link shows on desktop (`customLinks[i].icon` from
 * `SPACE_EDITOR_ICONS`, already bundled in `COMMAND_ICONS` in `src/assets/tablerIcons.generated.tsx`),
 * or the site's favicon with a crisp globe fallback when no custom icon is chosen.
 *
 * Zero new SVG or image assets: 100% JS-only and OTA-safe.
 */

import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { COMMAND_ICONS } from '../assets/tablerIcons.generated';
import { WorldGlyph } from '../components/sessions/icons';
import { linkFaviconUrl } from './links';

export type LinkIconChoice = {
  readonly id: string;
  readonly label: string;
};

/** Exact desktop `SPACE_EDITOR_ICONS` order and labels (apps/desktop/src/app/window/space_editor_modal.rs). */
export const LINK_ICON_CHOICES: readonly LinkIconChoice[] = [
  { id: 'playerPlay', label: 'Play' },
  { id: 'api', label: 'API' },
  { id: 'archive', label: 'Archive' },
  { id: 'bell', label: 'Notification' },
  { id: 'bolt', label: 'Bolt' },
  { id: 'book', label: 'Book' },
  { id: 'brain', label: 'Brain' },
  { id: 'braces', label: 'Braces' },
  { id: 'brandDocker', label: 'Docker' },
  { id: 'brandGithub', label: 'GitHub' },
  { id: 'brandPython', label: 'Python' },
  { id: 'brandReact', label: 'React' },
  { id: 'brandVscode', label: 'VS Code' },
  { id: 'bug', label: 'Bug' },
  { id: 'chartBar', label: 'Metrics' },
  { id: 'cloud', label: 'Cloud' },
  { id: 'checklist', label: 'Checklist' },
  { id: 'clock', label: 'Timer' },
  { id: 'code', label: 'Code' },
  { id: 'command', label: 'Command' },
  { id: 'cpu', label: 'Compute' },
  { id: 'database', label: 'Database' },
  { id: 'deviceDesktop', label: 'Desktop' },
  { id: 'deviceLaptop', label: 'Laptop' },
  { id: 'download', label: 'Download' },
  { id: 'fileCode', label: 'Code File' },
  { id: 'fileDiff', label: 'Diff' },
  { id: 'fileSearch', label: 'Search File' },
  { id: 'fileText', label: 'Docs' },
  { id: 'flask', label: 'Experiment' },
  { id: 'folder', label: 'Folder' },
  { id: 'folderOpen', label: 'Open Folder' },
  { id: 'gitBranch', label: 'Branch' },
  { id: 'gitCommit', label: 'Commit' },
  { id: 'gitMerge', label: 'Merge' },
  { id: 'gitPullRequest', label: 'Pull Request' },
  { id: 'key', label: 'Key' },
  { id: 'layoutDashboard', label: 'Dashboard' },
  { id: 'link', label: 'Link' },
  { id: 'lock', label: 'Lock' },
  { id: 'messageCircle', label: 'Chat' },
  { id: 'package', label: 'Package' },
  { id: 'pencilCode', label: 'Edit' },
  { id: 'refresh', label: 'Refresh' },
  { id: 'robot', label: 'Agent' },
  { id: 'route', label: 'Route' },
  { id: 'rocket', label: 'Launch' },
  { id: 'search', label: 'Search' },
  { id: 'server', label: 'Server' },
  { id: 'settings', label: 'Settings' },
  { id: 'shieldSearch', label: 'Security' },
  { id: 'sparkles', label: 'Sparkles' },
  { id: 'stack', label: 'Stack' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'testPipe', label: 'Test' },
  { id: 'tool', label: 'Tools' },
  { id: 'upload', label: 'Upload' },
  { id: 'wand', label: 'Generate' },
  { id: 'world', label: 'Browser' },
];

const LINK_ICON_LABELS: ReadonlyMap<string, string> = new Map(
  LINK_ICON_CHOICES.map((entry) => [entry.id, entry.label]),
);

export function isKnownLinkIcon(id: string | undefined): id is string {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(COMMAND_ICONS, id);
}

export function linkIconLabel(id: string | undefined): string | undefined {
  return id !== undefined ? LINK_ICON_LABELS.get(id) : undefined;
}

/** Site favicon for public web addresses with a globe underneath until loaded (or when unavailable). */
function FaviconOrGlobe({ url, size, color }: { url: string; size: number; color: string }) {
  const faviconUri = linkFaviconUrl(url);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [faviconUri]);

  if (faviconUri === null || failed) {
    return <WorldGlyph size={size} color={color} />;
  }

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {!loaded ? <WorldGlyph size={size} color={color} /> : null}
      <Image
        source={{ uri: faviconUri }}
        resizeMode="contain"
        onLoad={(event) => {
          const { width, height } = event.nativeEvent.source;
          if (width > 0 && height > 0) setLoaded(true);
          else setFailed(true);
        }}
        onError={() => setFailed(true)}
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: 3, opacity: loaded ? 1 : 0 },
        ]}
      />
    </View>
  );
}

export function LinkIcon({
  icon,
  url,
  size = 14,
  color,
}: {
  icon?: string;
  url: string;
  size?: number;
  color: string;
}) {
  if (isKnownLinkIcon(icon)) {
    const Glyph = COMMAND_ICONS[icon]!;
    return <Glyph size={size} color={color} />;
  }
  return <FaviconOrGlobe url={url} size={size} color={color} />;
}
