/**
 * Mobile Places picker for Add Project: a horizontal quick-jump pill strip
 * (Home, Default projects folder, Pinned, Project folders, Recent, Volumes)
 * plus an expandable grouped Places list covering every section gxserver
 * returns from `/api/projectPickerPlaces`.
 *
 * Competitor app names are never displayed anywhere in the UI; the server
 * already groups those paths under `otherApps` ("Found in other apps").
 */

import { useMemo, type ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  ClockGlyph,
  FolderGlyph,
  FolderOpenGlyph,
  PinnedGlyph,
  ServerGlyph,
  XGlyph,
} from '../components/sessions/icons';
import { AddProjectCopy } from '../copy';
import {
  colorWithOpacity,
  GhostexRadii,
  GhostexStrokeWidth,
  mixHexColors,
} from '../theme/palette';
import { useAppearance, type Appearance } from '../theme/useAppearance';
import type { AddProjectPlace, AddProjectPlaces } from './client';
import {
  expandHomePrefix,
  pathFolderName,
  remotePathIdentity,
  tildifyRemotePath,
} from './paths';
import { ListRow, ListSection, MetadataBadge, SectionTitle } from './primitives';

export type QuickPlaceItem = {
  id: string;
  label: string;
  path: string;
  kind: 'home' | 'default' | 'pinned' | 'projectFolder' | 'recent' | 'volume';
  badge?: string;
};

function volumeKindLabel(kind?: string): string | undefined {
  if (kind === 'external') return AddProjectCopy.placeKindExternal;
  if (kind === 'network') return AddProjectCopy.placeKindNetwork;
  if (kind === 'wsl') return AddProjectCopy.placeKindWsl;
  return undefined;
}

/** Deduplicated quick-jump places ordered for fastest one-tap navigation on phone. */
export function buildQuickPlaces(places: AddProjectPlaces): QuickPlaceItem[] {
  const items: QuickPlaceItem[] = [];
  const seen = new Set<string>();

  const push = (item: QuickPlaceItem): void => {
    const expanded = expandHomePrefix(item.path, places.home);
    const key = remotePathIdentity(expanded);
    if (key.length === 0 || seen.has(key)) return;
    seen.add(key);
    items.push({ ...item, path: expanded });
  };

  if (places.defaultProjectsFolder !== undefined) {
    const expanded = expandHomePrefix(places.defaultProjectsFolder, places.home);
    const label = pathFolderName(expanded) || places.defaultProjectsFolder;
    push({
      id: `default:${expanded}`,
      label,
      path: expanded,
      kind: 'default',
      badge: AddProjectCopy.placeDefaultBadge,
    });
  }

  for (const pinned of places.pinned) {
    push({ id: `pinned:${pinned.path}`, label: pinned.name, path: pinned.path, kind: 'pinned' });
  }

  push({ id: `home:${places.home}`, label: AddProjectCopy.placeHome, path: places.home, kind: 'home' });

  for (const folder of places.projectFolders) {
    push({ id: `project:${folder.path}`, label: folder.name, path: folder.path, kind: 'projectFolder' });
  }

  for (const recent of places.recent) {
    push({ id: `recent:${recent.path}`, label: recent.name, path: recent.path, kind: 'recent' });
  }

  for (const volume of places.volumes) {
    push({
      id: `volume:${volume.path}`,
      label: volume.name,
      path: volume.path,
      kind: 'volume',
      badge: volumeKindLabel(volume.kind),
    });
  }

  return items;
}

function quickPlaceIcon(kind: QuickPlaceItem['kind'], color: string): ReactElement {
  switch (kind) {
    case 'pinned':
      return <PinnedGlyph size={13} color={color} />;
    case 'recent':
      return <ClockGlyph size={13} color={color} />;
    case 'volume':
      return <ServerGlyph size={13} color={color} />;
    case 'home':
    case 'default':
      return <FolderOpenGlyph size={13} color={color} />;
    case 'projectFolder':
      return <FolderGlyph size={13} color={color} />;
  }
}

export function QuickPlacesStrip({
  currentPath,
  onSelectPlace,
  places,
}: {
  currentPath?: string;
  onSelectPlace: (path: string) => void;
  places: AddProjectPlaces;
}): ReactElement | null {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  const items = useMemo(() => buildQuickPlaces(places), [places]);

  const activeIdentity = useMemo(() => {
    if (currentPath === undefined || currentPath.trim().length === 0) return '';
    return remotePathIdentity(expandHomePrefix(currentPath, places.home));
  }, [currentPath, places.home]);

  if (items.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.stripContent}
    >
      {items.map((item) => {
        const active = activeIdentity.length > 0 && remotePathIdentity(item.path) === activeIdentity;
        const iconColor = active ? appearance.accent : appearance.muted;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: active }}
            testID={`add-project-place-pill-${item.label}`}
            onPress={() => onSelectPlace(item.path)}
            style={({ pressed }) => [
              styles.pill,
              active && styles.pillActive,
              pressed && styles.pillPressed,
            ]}
          >
            {quickPlaceIcon(item.kind, iconColor)}
            <Text numberOfLines={1} style={[styles.pillLabel, active && styles.pillLabelActive]}>
              {item.label}
            </Text>
            {item.badge === undefined ? null : (
              <Text numberOfLines={1} style={[styles.pillBadge, active && styles.pillBadgeActive]}>
                {item.badge}
              </Text>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

type PlaceGroup = {
  key: string;
  title: string;
  items: {
    key: string;
    name: string;
    path: string;
    subtitle?: string;
    badge?: string;
    badgeTone?: 'muted' | 'accent';
    icon: ReactElement;
    unpinnable?: boolean;
  }[];
};

function dedupedProjectFolders(places: AddProjectPlaces): {
  defaultFolder: { name: string; path: string } | null;
  folders: AddProjectPlace[];
} {
  const defaultExpanded =
    places.defaultProjectsFolder !== undefined
      ? expandHomePrefix(places.defaultProjectsFolder, places.home)
      : null;
  const defaultId = defaultExpanded !== null ? remotePathIdentity(defaultExpanded) : '';
  const folders =
    defaultId.length === 0
      ? places.projectFolders
      : places.projectFolders.filter((folder) => remotePathIdentity(folder.path) !== defaultId);
  return {
    defaultFolder:
      defaultExpanded !== null
        ? {
            name: pathFolderName(defaultExpanded) || places.defaultProjectsFolder || defaultExpanded,
            path: defaultExpanded,
          }
        : null,
    folders,
  };
}

export function AllPlacesPanel({
  onSelectPlace,
  onUnpin,
  pinningPath,
  places,
}: {
  onSelectPlace: (path: string) => void;
  onUnpin?: (path: string) => void;
  pinningPath?: string | null;
  places: AddProjectPlaces;
}): ReactElement | null {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);

  const groups = useMemo<PlaceGroup[]>(() => {
    const out: PlaceGroup[] = [];
    const iconColor = appearance.muted;

    if (places.pinned.length > 0) {
      out.push({
        key: 'pinned',
        title: AddProjectCopy.placesPinnedSection,
        items: places.pinned.map((item) => ({
          key: `pinned:${item.path}`,
          name: item.name,
          path: item.path,
          subtitle: tildifyRemotePath(item.path, places.home),
          icon: <PinnedGlyph size={15} color={appearance.accent} />,
          unpinnable: onUnpin !== undefined,
        })),
      });
    }

    const { defaultFolder, folders } = dedupedProjectFolders(places);
    const projectItems: PlaceGroup['items'] = [];
    if (defaultFolder !== null) {
      projectItems.push({
        key: `default:${defaultFolder.path}`,
        name: defaultFolder.name,
        path: defaultFolder.path,
        subtitle: tildifyRemotePath(defaultFolder.path, places.home),
        badge: AddProjectCopy.placeDefaultBadge,
        badgeTone: 'accent',
        icon: <FolderOpenGlyph size={15} color={appearance.accent} />,
      });
    }
    for (const folder of folders) {
      projectItems.push({
        key: `project:${folder.path}`,
        name: folder.name,
        path: folder.path,
        subtitle: tildifyRemotePath(folder.path, places.home),
        icon: <FolderGlyph size={15} color={iconColor} />,
      });
    }
    if (projectItems.length > 0) {
      out.push({
        key: 'projectFolders',
        title: AddProjectCopy.placesProjectFoldersSection,
        items: projectItems,
      });
    }

    if (places.recent.length > 0) {
      out.push({
        key: 'recent',
        title: AddProjectCopy.placesRecentSection,
        items: places.recent.map((item) => ({
          key: `recent:${item.path}`,
          name: item.name,
          path: item.path,
          subtitle: tildifyRemotePath(item.path, places.home),
          icon: <ClockGlyph size={15} color={iconColor} />,
        })),
      });
    }

    if (places.otherApps.length > 0) {
      out.push({
        key: 'otherApps',
        title: AddProjectCopy.placesOtherAppsSection,
        items: places.otherApps.map((item) => ({
          key: `otherApps:${item.path}`,
          name: item.name,
          path: item.path,
          subtitle: tildifyRemotePath(item.path, places.home),
          icon: <FolderOpenGlyph size={15} color={iconColor} />,
        })),
      });
    }

    if (places.standard.length > 0) {
      out.push({
        key: 'standard',
        title: AddProjectCopy.placesStandardSection,
        items: places.standard.map((item) => ({
          key: `standard:${item.path}`,
          name: item.name,
          path: item.path,
          subtitle: tildifyRemotePath(item.path, places.home),
          icon: <FolderGlyph size={15} color={iconColor} />,
        })),
      });
    }

    const locationItems: PlaceGroup['items'] = [
      {
        key: `home:${places.home}`,
        name: AddProjectCopy.placeHome,
        path: places.home,
        subtitle: places.home,
        icon: <FolderOpenGlyph size={15} color={iconColor} />,
      },
      ...places.volumes.map((volume) => ({
        key: `volume:${volume.path}`,
        name: volume.name,
        path: volume.path,
        subtitle: volume.path,
        badge: volumeKindLabel(volume.kind),
        badgeTone: 'muted' as const,
        icon: <ServerGlyph size={15} color={iconColor} />,
      })),
    ];

    out.push({
      key: 'volumes',
      title: places.platform === 'win32' ? AddProjectCopy.placesDrivesSection : AddProjectCopy.placesLocationsSection,
      items: locationItems,
    });

    return out;
  }, [appearance.accent, appearance.muted, onUnpin, places]);

  if (groups.length === 0) return null;

  return (
    <View style={styles.panel}>
      {groups.map((group) => (
        <View key={group.key} style={styles.group}>
          <SectionTitle>{group.title}</SectionTitle>
          <ListSection>
            {group.items.map((item, index) => {
              const isBusyUnpin = pinningPath !== null && pinningPath !== undefined && remotePathIdentity(pinningPath) === remotePathIdentity(item.path);
              return (
                <ListRow
                  key={item.key}
                  first={index === 0}
                  title={item.name}
                  description={item.subtitle}
                  icon={item.icon}
                  badges={
                    item.badge === undefined ? undefined : (
                      <MetadataBadge label={item.badge} tone={item.badgeTone ?? 'muted'} />
                    )
                  }
                  trailing={
                    item.unpinnable === true && onUnpin !== undefined ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={AddProjectCopy.unpinAccessibilityLabel(item.name)}
                        disabled={isBusyUnpin}
                        hitSlop={8}
                        onPress={() => onUnpin(item.path)}
                        style={({ pressed }) => [styles.unpinButton, pressed && styles.unpinButtonPressed]}
                      >
                        <XGlyph size={14} color={appearance.muted} />
                      </Pressable>
                    ) : undefined
                  }
                  onPress={() => onSelectPlace(item.path)}
                />
              );
            })}
          </ListSection>
        </View>
      ))}
    </View>
  );
}

const createStyles = (appearance: Appearance) =>
  StyleSheet.create({
    stripContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 2,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: GhostexRadii.pill,
      borderWidth: GhostexStrokeWidth,
      borderColor: appearance.border,
      backgroundColor: appearance.card,
      paddingHorizontal: 11,
      paddingVertical: 7,
      maxWidth: 200,
    },
    pillActive: {
      borderColor: colorWithOpacity(appearance.accent, 50),
      backgroundColor: mixHexColors(appearance.accent, appearance.card, 14),
    },
    pillPressed: {
      backgroundColor: appearance.cardActive,
    },
    pillLabel: {
      color: appearance.foreground,
      fontSize: 13,
      fontWeight: '600',
      flexShrink: 1,
    },
    pillLabelActive: {
      color: appearance.accent,
    },
    pillBadge: {
      color: appearance.muted,
      fontSize: 11,
      fontWeight: '500',
    },
    pillBadgeActive: {
      color: appearance.accent,
    },
    panel: {
      gap: 4,
    },
    group: {
      gap: 6,
    },
    unpinButton: {
      width: 28,
      height: 28,
      borderRadius: GhostexRadii.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    unpinButtonPressed: {
      backgroundColor: appearance.cardActive,
    },
  });
