/**
 * Folder browser used by both path screens: a "Browse folders" section with an
 * optional ".." row and one row per directory. Tapping a row REPLACES the input
 * text and never submits; hidden folders are always excluded on mobile.
 *
 * When a newer computer returns folder details (`git`, `branch`, `language`,
 * `projectId`), each row displays lightweight badges for Git/branch, detected
 * language, and "In Ghostex". Older computers omit those fields and render the
 * plain folder rows unchanged.
 */

import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';

import {
  ArrowGlyph,
  CircleCheckGlyph,
  FolderGlyph,
  GitBranchGlyph,
} from '../components/sessions/icons';
import { AddProjectCopy } from '../copy';
import { useAppearance } from '../theme/useAppearance';
import type { AddProjectBrowseEntry } from './client';
import {
  appendBrowsePathSegment,
  canNavigateUp,
  ensureBrowseDirectoryPath,
  getBrowseParentPath,
} from './paths';
import {
  ListRow,
  ListSection,
  MetadataBadge,
  MutedText,
  PendingRow,
  SectionHeaderRow,
} from './primitives';
import type { DirectoryBrowseState } from './useDirectoryBrowse';

function EntryBadges({ entry }: { entry: AddProjectBrowseEntry }): ReactElement | null {
  const appearance = useAppearance();
  const inGhostex = entry.projectId !== undefined && entry.projectId.length > 0;
  const isGit = entry.git === true;
  const hasBranch = entry.branch !== undefined && entry.branch.length > 0;
  const hasLanguage = entry.language !== undefined && entry.language.length > 0;

  if (!inGhostex && !isGit && !hasLanguage) return null;

  return (
    <>
      {inGhostex ? (
        <MetadataBadge
          label={AddProjectCopy.inGhostexBadge}
          tone="connected"
          icon={<CircleCheckGlyph size={11} color={appearance.connected} />}
        />
      ) : null}
      {isGit ? (
        <MetadataBadge
          label={hasBranch ? entry.branch! : AddProjectCopy.gitBadge}
          tone="accent"
          icon={<GitBranchGlyph size={11} color={appearance.accent} />}
        />
      ) : null}
      {hasLanguage ? <MetadataBadge label={entry.language!} tone="muted" /> : null}
    </>
  );
}

export default function FolderBrowser({
  browse,
  headerAction,
  headerContent,
  onChangePath,
  path,
}: {
  browse: DirectoryBrowseState;
  headerAction?: ReactNode;
  headerContent?: ReactNode;
  onChangePath: (next: string) => void;
  path: string;
}): ReactElement {
  const appearance = useAppearance();
  const isDriveList = browse.result?.isDriveList === true;
  const showUpRow = !isDriveList && canNavigateUp(path);
  const rows = browse.entries;

  return (
    <View style={{ gap: 10 }}>
      <SectionHeaderRow title={AddProjectCopy.browseSection} action={headerAction} />
      {headerContent ?? null}
      {browse.firstLoad ? (
        <PendingRow label={AddProjectCopy.browseSection} />
      ) : (
        <ListSection>
          {showUpRow ? (
            <ListRow
              first
              testID="add-project-browse-up"
              title={AddProjectCopy.parentRow}
              icon={<ArrowGlyph size={16} color={appearance.muted} direction="up" />}
              trailing={<View />}
              onPress={() => {
                const parent = getBrowseParentPath(path);
                if (parent !== null) onChangePath(parent);
              }}
            />
          ) : null}
          {rows.map((entry, index) => {
            const isGit = entry.git === true;
            const hasDetails =
              isGit ||
              (entry.projectId !== undefined && entry.projectId.length > 0) ||
              (entry.language !== undefined && entry.language.length > 0);
            return (
              <ListRow
                key={entry.fullPath}
                first={index === 0 && !showUpRow}
                testID={`add-project-browse-entry-${entry.name}`}
                title={entry.name}
                icon={
                  isGit ? (
                    <GitBranchGlyph size={16} color={appearance.accent} />
                  ) : (
                    <FolderGlyph size={16} color={appearance.muted} />
                  )
                }
                badges={hasDetails ? <EntryBadges entry={entry} /> : undefined}
                onPress={() =>
                  onChangePath(
                    isDriveList
                      ? ensureBrowseDirectoryPath(entry.fullPath)
                      : appendBrowsePathSegment(path, entry.name),
                  )
                }
              />
            );
          })}
          {rows.length === 0 && !showUpRow ? (
            <ListRow first disabled title={AddProjectCopy.browseEmpty} onPress={() => undefined} />
          ) : null}
        </ListSection>
      )}
      {rows.length === 0 && showUpRow && !browse.pending ? <MutedText>{AddProjectCopy.browseEmpty}</MutedText> : null}
    </View>
  );
}
