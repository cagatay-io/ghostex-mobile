/**
 * The project file browser's rows: folders with their open state, files with their kind's icon, name, folder
 * (in Recently changed and search results) and last change. A tap opens a file or opens and closes a folder; a
 * long press opens the row's menu at the row, with a way to measure the row again; while its menu is open
 * the row reports each new layout of its own (`onHeldLayout`), so the open menu follows it when the window changes
 * and the list lays its rows out again; VoiceOver offers Copy Full Path on every row.
 * Metrics are the phone's Files list's (44 pt rows, 15 pt names, 16 pt per level) as in the design.
 */

import { useMemo, memo, useRef } from 'react';
import { useAppearance, type Appearance } from '../theme/useAppearance';

import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewInstance } from 'react-native';

import { DocsCopy } from '../copy';
import { measureInWindow } from '../components/common/measureInWindow';
import type { MenuAnchor } from '../components/sessions/ContextMenu';
import {
  BinaryGlyph,
  CaretRightGlyph,
  FileCodeGlyph,
  FileGlyph,
  FolderGlyph,
  FolderOpenGlyph,
  NoteGlyph,
  PhotoGlyph,
  WorldGlyph,
} from '../components/sessions/icons';
import { FILE_LIST_DETAIL_SIZE, FILE_LIST_NAME_SIZE } from '../docs/textSizes';

import type { BrowserFile, BrowserFolder } from './list';
import { fileKind } from './preview';

const INDENT = 16;
/** A file in the tree sits past its folders' caret, so its icon lines up with theirs. */
const CARET_SPACE = 18;
const ICON_SIZE = 16;
const COPY_PATH_ACTION = 'copyPath';
const ROW_ACTIONS = [{ name: COPY_PATH_ACTION, label: DocsCopy.copyFullPath }];

/** When a file last changed, as the Files list has always said it. */
export function relativeTime(timestamp: number | null): string {
  if (timestamp === null) return '';
  const seconds = Math.max(0, (Date.now() - timestamp) / 1000);
  if (seconds < 60) return DocsCopy.justNow;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return DocsCopy.minutesAgo(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return DocsCopy.hoursAgo(hours);
  const days = Math.floor(hours / 24);
  if (days < 30) return DocsCopy.daysAgo(days);
  return new Date(timestamp).toLocaleDateString();
}

/** A file's icon by its kind, as the desktop files list tells them apart (Markdown, HTML, picture, code, binary). */
export function FileKindIcon({ name, size }: { name: string; size: number }) {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  switch (fileKind(name)) {
    case 'markdown':
      return <NoteGlyph size={size} color={appearance.foreground} />;
    case 'html':
      return <WorldGlyph size={size} color={appearance.accent} />;
    case 'image':
      return <PhotoGlyph size={size} color={appearance.foreground} />;
    case 'video':
    case 'audio':
    case 'binary':
      return <BinaryGlyph size={size} color={appearance.foreground} />;
    case 'source':
      return <FileCodeGlyph size={size} color={appearance.foreground} />;
    case 'other':
      return <FileGlyph size={size} color={appearance.foreground} />;
  }
}

/** A file row's content; drawn again, lifted, above its menu. */
export function FileRowContent({
  file,
  depth,
  location,
  opening,
}: {
  file: BrowserFile;
  depth: number;
  /** Its folder, where the row stands outside the tree (Recently changed, search); null in the tree. */
  location: string | null;
  opening: boolean;
}) {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  return (
    <View style={[styles.row, { paddingLeft: 12 + depth * INDENT + (location === null ? CARET_SPACE : 0) }]}>
      <FileKindIcon name={file.name} size={ICON_SIZE} />
      <View style={styles.text}>
        <Text style={styles.fileName} numberOfLines={1}>
          {file.name}
        </Text>
        {location !== null && location.length > 0 ? (
          <Text style={styles.location} numberOfLines={1}>
            {location}
          </Text>
        ) : null}
      </View>
      {opening ? (
        <ActivityIndicator size="small" color={appearance.muted} accessibilityLabel={DocsCopy.opening} />
      ) : (
        <Text style={styles.meta}>{relativeTime(file.modifiedAt)}</Text>
      )}
    </View>
  );
}

/** A folder row's content; drawn again, lifted, above its menu. */
export function FolderRowContent({
  folder,
  depth,
  expanded,
  loading,
  error,
}: {
  folder: BrowserFolder;
  depth: number;
  expanded: boolean;
  loading: boolean;
  error: string | null;
}) {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  return (
    <View style={[styles.row, { paddingLeft: 12 + depth * INDENT }]}>
      <CaretRightGlyph size={12} color={appearance.muted} rotated={expanded} />
      {expanded ? (
        <FolderOpenGlyph size={ICON_SIZE} color={appearance.muted} />
      ) : (
        <FolderGlyph size={ICON_SIZE} color={appearance.muted} />
      )}
      <View style={styles.text}>
        <Text style={styles.folderName} numberOfLines={1}>
          {folder.name}
        </Text>
        {error !== null ? (
          <Text style={styles.error} numberOfLines={2}>
            {DocsCopy.folderFailed(error)}
          </Text>
        ) : null}
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={appearance.muted} accessibilityLabel={DocsCopy.folderLoading} />
      ) : null}
    </View>
  );
}

/** Measures a row (or a control) where it stands now in the window; nothing once it is no longer mounted. */
export type MeasureAnchor = (onFrame: (frame: MenuAnchor) => void) => void;

/** A file row: a tap opens the file, a long press its menu (memoized as a list row). */
export const FileRow = memo(function FileRow({
  file,
  depth,
  location,
  opening,
  held,
  onOpen,
  onMenu,
  onHeldLayout,
  onCopyPath,
}: {
  file: BrowserFile;
  depth: number;
  location: string | null;
  opening: boolean;
  /** Its menu is open: the row shows pressed underneath its lifted copy. */
  held: boolean;
  onOpen: (file: BrowserFile) => void;
  onMenu: (
    file: BrowserFile,
    location: string | null,
    depth: number,
    anchor: MenuAnchor,
    measure: MeasureAnchor,
  ) => void;
  /** The row was laid out again while its menu is open (the native layout callback, not a timer). */
  onHeldLayout: () => void;
  onCopyPath: (path: string) => void;
}) {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  const rowRef = useRef<ViewInstance | null>(null);
  return (
    <Pressable
      ref={rowRef}
      accessibilityRole="button"
      accessibilityLabel={location !== null && location.length > 0 ? `${file.name}, ${location}` : file.name}
      accessibilityActions={ROW_ACTIONS}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === COPY_PATH_ACTION) onCopyPath(file.path);
      }}
      onPress={() => onOpen(file)}
      onLayout={held ? onHeldLayout : undefined}
      onLongPress={() => {
        const measure: MeasureAnchor = (onFrame) => measureInWindow(rowRef, onFrame);
        measure((frame) => onMenu(file, location, depth, frame, measure));
      }}
      style={({ pressed }) => (pressed || held ? styles.pressed : null)}
    >
      <FileRowContent file={file} depth={depth} location={location} opening={opening} />
    </Pressable>
  );
});

/** A folder row: a tap opens or closes it, a long press its menu (memoized as a list row). */
export const FolderRow = memo(function FolderRow({
  folder,
  depth,
  expanded,
  loading,
  error,
  held,
  onToggle,
  onMenu,
  onHeldLayout,
  onCopyPath,
}: {
  folder: BrowserFolder;
  depth: number;
  expanded: boolean;
  loading: boolean;
  error: string | null;
  held: boolean;
  onToggle: (path: string) => void;
  onMenu: (folder: BrowserFolder, depth: number, expanded: boolean, anchor: MenuAnchor, measure: MeasureAnchor) => void;
  /** The row was laid out again while its menu is open (the native layout callback, not a timer). */
  onHeldLayout: () => void;
  onCopyPath: (path: string) => void;
}) {
  const appearance = useAppearance();
  const styles = useMemo(() => createStyles(appearance), [appearance]);
  const rowRef = useRef<ViewInstance | null>(null);
  return (
    <Pressable
      ref={rowRef}
      accessibilityRole="button"
      accessibilityLabel={error === null ? folder.name : `${folder.name}, ${DocsCopy.folderFailed(error)}`}
      accessibilityState={{ expanded, busy: loading }}
      accessibilityActions={ROW_ACTIONS}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === COPY_PATH_ACTION) onCopyPath(folder.path);
      }}
      onPress={() => onToggle(folder.path)}
      onLayout={held ? onHeldLayout : undefined}
      onLongPress={() => {
        const measure: MeasureAnchor = (onFrame) => measureInWindow(rowRef, onFrame);
        measure((frame) => onMenu(folder, depth, expanded, frame, measure));
      }}
      style={({ pressed }) => (pressed || held ? styles.pressed : null)}
    >
      <FolderRowContent folder={folder} depth={depth} expanded={expanded} loading={loading} error={error} />
    </Pressable>
  );
});

const createStyles = (appearance: Appearance) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingRight: 14, paddingVertical: 6 },
  pressed: { backgroundColor: appearance.cardActive },
  text: { flex: 1, minWidth: 0 },
  folderName: { color: appearance.foreground, fontSize: FILE_LIST_NAME_SIZE, fontWeight: '500' },
  fileName: { color: appearance.foreground, fontSize: FILE_LIST_NAME_SIZE },
  location: { color: appearance.muted, fontSize: FILE_LIST_DETAIL_SIZE, marginTop: 1 },
  meta: { color: appearance.muted, fontSize: FILE_LIST_DETAIL_SIZE },
  error: { color: appearance.danger, fontSize: FILE_LIST_DETAIL_SIZE, marginTop: 1 },
});
