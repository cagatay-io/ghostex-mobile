/**
 * Files: a project's file browser on the phone. The whole project folder, one folder at a
 * time as it is opened (gxserver's project-scope listing, `src/files/`), the Markdown and HTML files changed
 * last on top, a search over the whole project with the desktop's file type filter, and per row a menu with
 * Open and Copy Full Path, and for files Share… and, in a browser opened from an agent session, Add to Session
 * Context. Markdown and HTML open rendered in the Docs viewer, other text as source, and pictures, binary and
 * large files by name and size (`ProjectFileScreen`). Nothing here changes the project.
 *
 * CDXC:Docs 2026-09-24 DECISION:
 * User: "i want also docs list in the app for folders and the docs and mds in them. implement this
 * with react native." The list is native React Native (not a bundled web page), reached from a
 * project's long-press menu and the terminal screen's menu. Its first form showed only Markdown and HTML;
 * the next decision widened it to the whole project.
 *
 * CDXC:Docs 2026-10-25 WHY:
 * Files becomes the project browser instead of a second entry, read-only: folder tree, preview, copy path and
 * search, no upload, edit or delete. The maintainer asked that it copy the desktop files list's ideas ("copy ideas
 * from the files extension in the side panel in the desktop app so they're similar"), so its labels, menu
 * and type filter are the desktop's where the phone has the same thing.
 * SEE-ALSO: apps/desktop/src/app/native_docs/files_list.rs, server/src/project_docs/project_scope.rs
 */

import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import HeaderButton from '../components/common/HeaderButton';
import { measureInWindow } from '../components/common/measureInWindow';
import NoticeToast, { type Notice } from '../components/common/NoticeToast';
import { useStackScreenRail } from '../components/common/verticalBar/stackRail';
import { useHeaderMenu, useScrollToBarEdges } from '../components/common/verticalBar/VerticalBarArea';
import ContextMenu, { type ContextMenuItem, type MenuAnchor } from '../components/sessions/ContextMenu';
import {
  CopyGlyph,
  EyeGlyph,
  EyeOffGlyph,
  FilterGlyph,
  MessagePlusGlyph,
  ShareGlyph,
  XGlyph,
} from '../components/sessions/icons';
import { EllipsisIcon, ExternalLinkIcon, RefreshIcon } from '../components/terminal/icons';
import { DocsCopy } from '../copy';
import { listProjectDocs, resolveDocsEntryPath } from '../docs/client';
import type { DocsEntry } from '../docs/entries';
import { FileRow, FileRowContent, FolderRow, FolderRowContent, type MeasureAnchor } from '../files/FileRows';
import {
  browserFile,
  isHiddenPath,
  recentDocsFiles,
  treeRows,
  type BrowserFile,
  type BrowserFolder,
  type TreeRow,
} from '../files/list';
import { currentMachine, useProjectDocsRpc } from '../files/machine';
import { filePreview, statProjectFile } from '../files/preview';
import { failureMessage } from '../files/request';
import { rowMenuActions, type RowAction } from '../files/rowMenu';
import {
  filteredTreeRows,
  searchedFiles,
  searchProjectFiles,
  TYPE_FILTERS,
  type SearchAnswer,
  type TypeFilter,
} from '../files/search';
import { canShareFiles } from '../files/shareSheet';
import { useProjectTree } from '../files/useProjectTree';
import { useAddToSessionContext } from '../files/useSessionContext';
import { useShareFile } from '../files/useShareFile';
import type { RootStackParamList } from '../navigation/types';
import { useSettingsStore } from '../settings/store';
import { GhostexPalette } from '../theme/palette';

type Props = NativeStackScreenProps<RootStackParamList, 'Docs'>;

const RECENT_LIMIT = 6;
/** Typing pauses this long before the search goes out: one request per term, not per keystroke. */
const SEARCH_DELAY_MS = 300;
/** On a wide window (the unfolded iPhone Duo) the list stays one readable column, as in the approved mockup. */
const COLUMN_MAX_WIDTH = 720;
const MENU_ICON_SIZE = 14;

/** The last top level and Recently changed per project, so returning to Files shows them at once while they refresh. */
const browserCache = new Map<string, { root: readonly DocsEntry[] | null; recent: readonly BrowserFile[] }>();

type FileListRow = { kind: 'file'; key: string; file: BrowserFile; depth: number; location: string | null };
type Row =
  | { kind: 'section'; key: string; title: string }
  | { kind: 'status'; key: string; text: string }
  | Extract<TreeRow, { kind: 'folder' }>
  | FileListRow;

/**
 * The menu of a long-pressed row, kept while it fades out after closing; `measure` finds the row again, so the open
 * menu follows it when the window changes.
 */
type RowMenu =
  | {
      kind: 'file';
      file: BrowserFile;
      location: string | null;
      depth: number;
      anchor: MenuAnchor;
      measure: MeasureAnchor;
    }
  | {
      kind: 'folder';
      folder: BrowserFolder;
      depth: number;
      expanded: boolean;
      anchor: MenuAnchor;
      measure: MeasureAnchor;
    };

type SearchState = { key: string; answer: SearchAnswer | null; error: string | null };

/** A file row outside the tree (Recently changed, search): it names its folder, or the project at the top level. */
function placedRow(key: string, file: BrowserFile, projectName: string): FileListRow {
  const slash = file.displayPath.lastIndexOf('/');
  return { kind: 'file', key, file, depth: 0, location: slash < 0 ? projectName : file.displayPath.slice(0, slash) };
}

function fileListRow(row: Extract<TreeRow, { kind: 'file' }>): FileListRow {
  return { ...row, location: null };
}

export default function DocsScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  // The list reaches under the iPhone Duo's side bar, its rows keep clear of it.
  const listEdges = useScrollToBarEdges(styles.listContent);
  const { machineId, projectId, projectName, projectPath, session } = route.params;
  const rpc = useProjectDocsRpc(machineId);
  const cacheKey = `${machineId}\u0000${projectId}`;
  const [cached] = useState(() => browserCache.get(cacheKey) ?? null);
  const tree = useProjectTree(rpc, projectId, cached?.root ?? null);
  const { folders, expanded } = tree;
  const showHidden = useSettingsStore((state) => state.settings.showHiddenFiles);
  const settingsHydrated = useSettingsStore((state) => state.hydrated);
  const setSetting = useSettingsStore((state) => state.setSetting);
  const [recent, setRecent] = useState<readonly BrowserFile[]>(cached?.recent ?? []);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [recentRun, setRecentRun] = useState(0);
  const [query, setQuery] = useState('');
  const [types, setTypes] = useState<readonly TypeFilter[]>([]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [search, setSearch] = useState<SearchState | null>(null);
  const [searchRun, setSearchRun] = useState(0);
  const [opening, setOpening] = useState<string | null>(null);
  const [rowMenu, setRowMenu] = useState<{ menu: RowMenu; open: boolean } | null>(null);
  const [filterMenu, setFilterMenu] = useState<{ anchor: MenuAnchor; open: boolean } | null>(null);
  const filterButtonRef = useRef<ViewInstance | null>(null);
  const headerMenu = useHeaderMenu();
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeCounter = useRef(0);

  const showNotice = useCallback((message: string, error: boolean, title?: string, lasting = false) => {
    noticeCounter.current += 1;
    setNotice({
      id: noticeCounter.current,
      message,
      error,
      ...(title !== undefined ? { title } : {}),
      ...(lasting ? { lasting } : {}),
    });
  }, []);
  // Ends a lasting notice (a file being fetched); a notice shown meanwhile stays.
  const clearNotice = useCallback(() => setNotice((current) => (current?.lasting === true ? null : current)), []);
  // Share…: the file fetched under a progress notice, then the share sheet.
  const { share: shareFile, sharing } = useShareFile(rpc, projectId, { show: showNotice, clear: clearNotice });

  // Add to Session Context: the file's context text into the input of the session Files was opened from, never sent.
  const addToSessionContext = useAddToSessionContext(rpc, machineId, projectId, session, showNotice);

  // Recently changed: the Markdown and HTML files the Docs listing names, newest first, as Files showed them before.
  // `recentRun` lists them again on Refresh.
  useEffect(() => {
    let ignore = false;
    void (async () => {
      try {
        const entries = await listProjectDocs(currentMachine(machineId), projectId);
        if (ignore) return;
        setRecent(recentDocsFiles(entries, RECENT_LIMIT));
        setRecentError(null);
      } catch (failure) {
        if (!ignore) setRecentError(failureMessage(failure));
      }
    })();
    return () => {
      ignore = true;
    };
  }, [machineId, projectId, recentRun]);

  const rootEntries = folders.get('')?.entries ?? null;
  useEffect(() => {
    browserCache.set(cacheKey, { root: rootEntries, recent });
  }, [cacheKey, recent, rootEntries]);

  // The project-wide search, and the type filter's listing when only types are picked.
  const trimmed = query.trim();
  const searchKey = trimmed.length === 0 && types.length === 0 ? null : `${trimmed}\u0000${types.join(',')}`;
  useEffect(() => {
    if (searchKey === null) return undefined;
    const [term = '', picked = ''] = searchKey.split('\u0000');
    const pickedTypes = TYPE_FILTERS.map((filter) => filter.id).filter((id) => picked.split(',').includes(id));
    let ignore = false;
    // Waits until typing pauses (SEARCH_DELAY_MS), so a term goes out once rather than for every keystroke.
    const timer = setTimeout(() => {
      searchProjectFiles(rpc, projectId, term, pickedTypes).then(
        (answer) => {
          if (!ignore) setSearch({ key: searchKey, answer, error: null });
        },
        (failure: unknown) => {
          if (!ignore) setSearch({ key: searchKey, answer: null, error: failureMessage(failure) });
        },
      );
    }, SEARCH_DELAY_MS);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [projectId, rpc, searchKey, searchRun]);
  const searched = search !== null && search.key === searchKey ? search : null;

  const refreshTree = tree.refresh;
  const refresh = useCallback(() => {
    refreshTree();
    setRecentRun((run) => run + 1);
    setSearchRun((run) => run + 1);
  }, [refreshTree]);

  // Copy Full Path: the full path on the computer, not the path in the project.
  const copyPath = useCallback(
    (entryPath: string) => {
      void (async () => {
        try {
          const path = await resolveDocsEntryPath(currentMachine(machineId), projectId, projectPath, entryPath);
          await Clipboard.setStringAsync(path);
          showNotice(path, false, DocsCopy.pathCopied);
        } catch (failure) {
          showNotice(failureMessage(failure), true, DocsCopy.copyFailed);
        }
      })();
    },
    [machineId, projectId, projectPath, showNotice],
  );

  // Markdown and HTML open rendered in the Docs viewer; everything else in the file view.
  // A search result carries no size, so it is measured first: a file over 2 MB never opens its content. A browser
  // opened from an agent session hands that session on, for the preview's Add to Session Context.
  const openFile = useCallback(
    (file: BrowserFile) => {
      if (opening !== null) return;
      setOpening(file.path);
      void (async () => {
        try {
          const size = file.size ?? (await statProjectFile(rpc, projectId, file.path));
          const path = await resolveDocsEntryPath(currentMachine(machineId), projectId, projectPath, file.path);
          const from = session !== undefined ? { session } : {};
          if (filePreview(file.name, size).kind === 'document') {
            navigation.push('DocViewer', { machineId, path, projectId, entryPath: file.path, ...from });
          } else {
            navigation.push('ProjectFile', { machineId, projectId, entryPath: file.path, path, size, ...from });
          }
        } catch (failure) {
          showNotice(failureMessage(failure), true, DocsCopy.openFailed);
        } finally {
          setOpening(null);
        }
      })();
    },
    [machineId, navigation, opening, projectId, projectPath, rpc, session, showNotice],
  );

  const filtering = trimmed.length === 0 && types.length > 0;
  const toggleTreeFolder = tree.toggleFolder;
  const toggleFolder = useCallback(
    (path: string) => {
      if (!filtering) {
        toggleTreeFolder(path);
        return;
      }
      setCollapsed((current) => {
        const next = new Set(current);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
    },
    [filtering, toggleTreeFolder],
  );

  const openFileMenu = useCallback(
    (file: BrowserFile, location: string | null, depth: number, anchor: MenuAnchor, measure: MeasureAnchor) =>
      setRowMenu({ menu: { kind: 'file', file, location, depth, anchor, measure }, open: true }),
    [],
  );
  const openFolderMenu = useCallback(
    (folder: BrowserFolder, depth: number, expanded: boolean, anchor: MenuAnchor, measure: MeasureAnchor) =>
      setRowMenu({ menu: { kind: 'folder', folder, depth, expanded, anchor, measure }, open: true }),
    [],
  );

  // An open row or filter menu stays at its row or button when the window changes (the iPhone rotating, the
  // Duo unfolding): both are measured again where they stand now, and the menu stays open. Measured in a
  // layout effect when the window's new size is committed (before that frame is painted), and again in the held
  // row's and the filter button's own layout callbacks whenever the list lays them out later; no timer guesses.
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const openMenus = useRef({ rowMenu, filterMenu });
  openMenus.current = { rowMenu, filterMenu };
  const followRowMenu = useCallback(() => {
    const row = openMenus.current.rowMenu;
    if (row?.open !== true) return;
    row.menu.measure((anchor) =>
      setRowMenu((current) =>
        current?.open === true && current.menu.measure === row.menu.measure
          ? { ...current, menu: { ...current.menu, anchor } }
          : current,
      ),
    );
  }, []);
  const followFilterMenu = useCallback(() => {
    if (openMenus.current.filterMenu?.open !== true) return;
    measureInWindow(filterButtonRef, (anchor) =>
      setFilterMenu((current) => (current?.open === true ? { ...current, anchor } : current)),
    );
  }, []);
  // Prevents the visible jump of an open menu painted for one frame at its row's place in the old window.
  useLayoutEffect(() => {
    followRowMenu();
    followFilterMenu();
  }, [followFilterMenu, followRowMenu, windowHeight, windowWidth]);

  const rows = useMemo<Row[]>(() => {
    if (searchKey !== null) {
      if (searched === null) return [{ kind: 'status', key: 'searching', text: DocsCopy.searching }];
      if (searched.answer === null) return [{ kind: 'status', key: 'search-error', text: searched.error ?? '' }];
      const { entries, truncated, incomplete } = searched.answer;
      const files = searchedFiles(entries, showHidden);
      const out: Row[] = [];
      const empty = files.length === 0 ? (incomplete ? DocsCopy.searchIncomplete : DocsCopy.noMatches) : null;
      if (filtering) {
        if (empty !== null) out.push({ kind: 'status', key: 'empty', text: empty });
        else if (truncated) out.push({ kind: 'status', key: 'truncated', text: DocsCopy.filterTruncated });
        for (const row of filteredTreeRows(files, collapsed)) out.push(row.kind === 'file' ? fileListRow(row) : row);
        return out;
      }
      out.push({ kind: 'section', key: 'matches', title: DocsCopy.searchSection(files.length) });
      for (const entry of files) out.push(placedRow(`match:${entry.path}`, browserFile(entry), projectName));
      if (empty !== null) out.push({ kind: 'status', key: 'empty', text: empty });
      else if (truncated) out.push({ kind: 'status', key: 'truncated', text: DocsCopy.searchTruncated });
      return out;
    }
    const out: Row[] = [];
    const recentShown = showHidden ? recent : recent.filter((file) => !isHiddenPath(file.displayPath));
    if (recentShown.length > 0 || recentError !== null) {
      out.push({ kind: 'section', key: 'recent', title: DocsCopy.recentSection });
      for (const file of recentShown) out.push(placedRow(`recent:${file.path}`, file, projectName));
      if (recentError !== null) out.push({ kind: 'status', key: 'recent-error', text: recentError });
      out.push({ kind: 'section', key: 'folders', title: DocsCopy.foldersSection });
    }
    const listed = treeRows(folders, expanded, showHidden);
    for (const row of listed) out.push(row.kind === 'file' ? fileListRow(row) : row);
    const root = folders.get('');
    if ((root?.entries ?? null) === null) {
      if ((root?.error ?? null) === null) out.push({ kind: 'status', key: 'loading', text: DocsCopy.loading });
    } else if (listed.length === 0) {
      out.push({ kind: 'status', key: 'no-files', text: DocsCopy.noFiles });
    }
    return out;
  }, [collapsed, expanded, filtering, folders, projectName, recent, recentError, searchKey, searched, showHidden]);

  const heldPath =
    rowMenu === null || !rowMenu.open
      ? null
      : rowMenu.menu.kind === 'file'
        ? rowMenu.menu.file.path
        : rowMenu.menu.folder.path;
  const renderRow = useCallback(
    ({ item }: { item: Row }) => {
      switch (item.kind) {
        case 'section':
          return (
            <Text style={styles.sectionTitle} accessibilityRole="header">
              {item.title}
            </Text>
          );
        case 'status':
          return <Text style={styles.status}>{item.text}</Text>;
        case 'folder':
          return (
            <FolderRow
              folder={item.folder}
              depth={item.depth}
              expanded={item.expanded}
              loading={item.loading}
              error={item.error}
              held={heldPath === item.folder.path}
              onToggle={toggleFolder}
              onMenu={openFolderMenu}
              onHeldLayout={followRowMenu}
              onCopyPath={copyPath}
            />
          );
        case 'file':
          return (
            <FileRow
              file={item.file}
              depth={item.depth}
              location={item.location}
              opening={opening === item.file.path}
              held={heldPath === item.file.path}
              onOpen={openFile}
              onMenu={openFileMenu}
              onHeldLayout={followRowMenu}
              onCopyPath={copyPath}
            />
          );
      }
    },
    [copyPath, followRowMenu, heldPath, openFile, openFileMenu, openFolderMenu, opening, toggleFolder],
  );

  const openHeaderMenu = headerMenu.open;
  useLayoutEffect(() => {
    navigation.setOptions({
      title: projectName.length > 0 ? `${DocsCopy.listTitle} · ${projectName}` : DocsCopy.listTitle,
      headerRight: () => (
        <View style={styles.headerButtons}>
          <HeaderButton
            label={DocsCopy.refresh}
            onPress={refresh}
            icon={<RefreshIcon size={18} color={GhostexPalette.FOREGROUND} />}
          />
          <HeaderButton
            label={DocsCopy.filesMenu}
            onPress={() => openHeaderMenu()}
            buttonRef={headerMenu.buttonRef}
            icon={<EllipsisIcon size={18} color={GhostexPalette.FOREGROUND} />}
          />
        </View>
      ),
    });
  }, [headerMenu.buttonRef, navigation, openHeaderMenu, projectName, refresh]);
  // On the iPhone Duo the same buttons stand in the side bar under Back; the search field takes the keyboard.
  useStackScreenRail(
    useMemo(
      () => ({
        entries: [
          {
            key: 'refresh',
            label: DocsCopy.refresh,
            icon: (size: number) => <RefreshIcon size={size} color={GhostexPalette.FOREGROUND} />,
            onPress: refresh,
          },
          {
            key: 'files-menu',
            label: DocsCopy.filesMenu,
            icon: (size: number) => <EllipsisIcon size={size} color={GhostexPalette.FOREGROUND} />,
            onPress: openHeaderMenu,
          },
        ],
        reserveKeyboard: true,
      }),
      [openHeaderMenu, refresh],
    ),
  );

  const closeHeaderMenu = () => headerMenu.setVisible(false);
  const headerMenuItems: ContextMenuItem[] = [
    {
      kind: 'item',
      key: 'refresh',
      label: DocsCopy.refresh,
      icon: <RefreshIcon size={MENU_ICON_SIZE} color={GhostexPalette.FOREGROUND} />,
      onPress: () => {
        closeHeaderMenu();
        refresh();
      },
    },
    {
      kind: 'item',
      key: 'hidden',
      label: DocsCopy.showHiddenFiles,
      icon: showHidden ? (
        <EyeGlyph size={MENU_ICON_SIZE} color={GhostexPalette.FOREGROUND} />
      ) : (
        <EyeOffGlyph size={MENU_ICON_SIZE} color={GhostexPalette.FOREGROUND} />
      ),
      selected: showHidden,
      disabled: !settingsHydrated,
      onPress: () => {
        closeHeaderMenu();
        setSetting('showHiddenFiles', !showHidden);
      },
    },
  ];

  const pickType = (type: TypeFilter | null) => {
    setTypes((current) =>
      type === null ? [] : current.includes(type) ? current.filter((id) => id !== type) : [...current, type],
    );
    setCollapsed(new Set());
  };
  const filterItems: ContextMenuItem[] = [
    {
      kind: 'item',
      key: 'all',
      label: DocsCopy.allFiles,
      selected: types.length === 0,
      onPress: () => pickType(null),
    },
    { kind: 'separator', key: 'types' },
    ...TYPE_FILTERS.map((filter): ContextMenuItem => ({
      kind: 'item',
      key: filter.id,
      label: DocsCopy.typeFilterLabels[filter.id],
      selected: types.includes(filter.id),
      onPress: () => pickType(filter.id),
    })),
  ];
  const pickedLabels = types.map((type) => DocsCopy.typeFilterLabels[type]);

  const closeRowMenu = () => setRowMenu((current) => (current === null ? null : { ...current, open: false }));
  const menu = rowMenu?.menu ?? null;
  // Files: Open, Copy Full Path, Add to Session Context, Share…; folders: Copy Full Path. Nothing that changes the
  // project.
  const rowMenuItem = (action: RowAction, row: RowMenu): ContextMenuItem => {
    const pick = (run: () => void) => () => {
      closeRowMenu();
      run();
    };
    switch (action) {
      case 'open':
        return {
          kind: 'item',
          key: action,
          label: DocsCopy.open,
          icon: <ExternalLinkIcon size={MENU_ICON_SIZE} color={GhostexPalette.FOREGROUND} />,
          onPress: pick(() => row.kind === 'file' && openFile(row.file)),
        };
      case 'copyPath':
        return {
          kind: 'item',
          key: action,
          label: DocsCopy.copyFullPath,
          icon: <CopyGlyph size={MENU_ICON_SIZE} color={GhostexPalette.FOREGROUND} />,
          onPress: pick(() => copyPath(row.kind === 'file' ? row.file.path : row.folder.path)),
        };
      case 'addToSessionContext':
        return {
          kind: 'item',
          key: action,
          label: DocsCopy.addToSessionContext,
          icon: <MessagePlusGlyph size={MENU_ICON_SIZE} color={GhostexPalette.FOREGROUND} />,
          onPress: pick(() => row.kind === 'file' && addToSessionContext?.(row.file)),
        };
      case 'share':
        return {
          kind: 'item',
          key: action,
          label: DocsCopy.share,
          icon: <ShareGlyph size={MENU_ICON_SIZE} color={GhostexPalette.FOREGROUND} />,
          disabled: sharing,
          onPress: pick(() => row.kind === 'file' && shareFile(row.file)),
        };
    }
  };
  const rowMenuItems: ContextMenuItem[] =
    menu === null
      ? []
      : rowMenuActions(menu.kind, { sessionContext: addToSessionContext !== null, share: canShareFiles }).map(
          (action) => rowMenuItem(action, menu),
        );
  const menuShownPath = menu === null ? '' : menu.kind === 'file' ? menu.file.displayPath : menu.folder.displayPath;
  const menuFolder = menuShownPath.includes('/') ? menuShownPath.slice(0, menuShownPath.lastIndexOf('/')) : '';
  // The pressed row, lifted above the dimmed list (approved mockup): a tap on a file's opens it.
  const liftedRow =
    menu === null
      ? undefined
      : menu.kind === 'file'
        ? {
            content: <FileRowContent file={menu.file} depth={menu.depth} location={menu.location} opening={false} />,
            accessibilityLabel: DocsCopy.openFile(menu.file.name),
            onPress: () => {
              closeRowMenu();
              openFile(menu.file);
            },
          }
        : {
            content: (
              <FolderRowContent
                folder={menu.folder}
                depth={menu.depth}
                expanded={menu.expanded}
                loading={false}
                error={null}
              />
            ),
            accessibilityLabel: menu.folder.name,
            onPress: closeRowMenu,
          };

  const rootError = folders.get('')?.error ?? null;
  const rootLoading = folders.get('')?.loading ?? false;

  return (
    <View style={styles.screen}>
      <View style={styles.column}>
        <View style={styles.searchBar}>
          <Pressable
            ref={filterButtonRef}
            accessibilityRole="button"
            accessibilityLabel={types.length === 0 ? DocsCopy.filterByType : DocsCopy.filterShowing(pickedLabels)}
            accessibilityState={{ selected: types.length > 0, expanded: filterMenu?.open === true }}
            hitSlop={3}
            onPress={() => measureInWindow(filterButtonRef, (anchor) => setFilterMenu({ anchor, open: true }))}
            onLayout={followFilterMenu}
            style={({ pressed }) => [
              styles.filterButton,
              types.length > 0 && styles.filterButtonOn,
              pressed && styles.pressed,
            ]}
          >
            <FilterGlyph size={16} color={types.length > 0 ? GhostexPalette.ACCENT : GhostexPalette.MUTED} />
            {types.length > 0 ? <View style={styles.filterDot} /> : null}
          </Pressable>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder={DocsCopy.searchPlaceholder}
            placeholderTextColor={GhostexPalette.MUTED}
            accessibilityLabel={DocsCopy.searchPlaceholder}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            clearButtonMode="never"
            returnKeyType="search"
          />
          {query.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={DocsCopy.clearSearch}
              onPress={() => setQuery('')}
              style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
            >
              <XGlyph size={14} color={GhostexPalette.MUTED} />
            </Pressable>
          ) : null}
        </View>
      </View>
      {rootError !== null && searchKey === null ? (
        <View style={styles.column}>
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>{DocsCopy.listFailed}</Text>
            <Text style={styles.errorBody} selectable>
              {failureMessage(rootError)}
            </Text>
            <Pressable accessibilityRole="button" onPress={refresh} style={styles.retryButton}>
              <Text style={styles.retryText}>{DocsCopy.retry}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        renderItem={renderRow}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        style={listEdges.scroll}
        contentContainerStyle={[
          styles.listContent,
          styles.column,
          listEdges.content,
          { paddingBottom: insets.bottom + 24 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={rootLoading && rootEntries !== null}
            onRefresh={refresh}
            tintColor={GhostexPalette.MUTED}
          />
        }
        initialNumToRender={30}
        windowSize={11}
      />
      <ContextMenu
        visible={headerMenu.visible}
        title={DocsCopy.listTitle}
        subtitle={projectName}
        items={headerMenuItems}
        onClose={closeHeaderMenu}
        anchor={headerMenu.anchor}
      />
      <ContextMenu
        visible={filterMenu?.open === true}
        title={DocsCopy.filterByType}
        items={filterItems}
        onClose={() => setFilterMenu((current) => (current === null ? null : { ...current, open: false }))}
        rowAnchor={filterMenu?.anchor}
      />
      <ContextMenu
        visible={rowMenu?.open === true}
        title={menu === null ? '' : menu.kind === 'file' ? menu.file.name : menu.folder.name}
        subtitle={menuFolder.length > 0 ? `${projectName}/${menuFolder}` : projectName}
        items={rowMenuItems}
        onClose={closeRowMenu}
        rowAnchor={menu?.anchor}
        lifted={liftedRow}
      />
      <NoticeToast notice={notice} bottom={insets.bottom + 16} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: GhostexPalette.BACKGROUND },
  column: { width: '100%', maxWidth: COLUMN_MAX_WIDTH, alignSelf: 'center' },
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pressed: { opacity: 0.6 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    paddingLeft: 2,
    paddingRight: 2,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GhostexPalette.BORDER,
    backgroundColor: GhostexPalette.INPUT_BACKGROUND,
  },
  // 34 pt inside the 40 pt field, as in the approved mockup (above the 28 pt minimum).
  filterButton: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  filterButtonOn: { backgroundColor: 'rgba(125,211,252,0.12)' },
  filterDot: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: GhostexPalette.ACCENT,
  },
  searchInput: { flex: 1, color: GhostexPalette.FOREGROUND, fontSize: 15, paddingVertical: 0 },
  clearButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingTop: 4 },
  sectionTitle: {
    color: GhostexPalette.MUTED,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
  },
  status: { color: GhostexPalette.MUTED, fontSize: 13, lineHeight: 19, paddingHorizontal: 16, paddingVertical: 10 },
  errorCard: {
    margin: 12,
    padding: 14,
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GhostexPalette.BORDER,
    backgroundColor: GhostexPalette.CARD,
  },
  errorTitle: { color: GhostexPalette.FOREGROUND, fontSize: 14, fontWeight: '600' },
  errorBody: { color: GhostexPalette.MUTED, fontSize: 13, lineHeight: 18 },
  retryButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 14,
    height: 34,
    borderRadius: 8,
    backgroundColor: GhostexPalette.ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { color: GhostexPalette.ACCENT_FOREGROUND, fontSize: 13, fontWeight: '600' },
});
