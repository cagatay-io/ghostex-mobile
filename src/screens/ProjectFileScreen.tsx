/**
 * A file the project file browser opened that is not Markdown or HTML (those open in the Docs viewer): other
 * text up to 2 MB as numbered source (REQ-FILES-002 AC2), and pictures, files that are not text and files over
 * 2 MB by their name and size only, with Copy Full Path (REQ-FILES-006). Both offer Share… (REQ-FILES-009), as the
 * approved mockup draws it: in the source view's header, on the name-and-size view under Copy Full Path. The source
 * view's header also offers Add to Session Context in a preview opened from an agent session (REQ-FILES-010, the
 * mockup's `previewButtons`). The text is read off the computer as the Docs viewer reads files (`readRemoteFiles`),
 * never more than the 2 MB limit, and shown only when its bytes are UTF-8 text.
 */

import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import HeaderButton from '../components/common/HeaderButton';
import NoticeToast, { type Notice } from '../components/common/NoticeToast';
import { useStackScreenRail } from '../components/common/verticalBar/stackRail';
import { useScrollToBarEdges, type RailEntry } from '../components/common/verticalBar/VerticalBarArea';
import { CopyGlyph, MessagePlusGlyph, ShareGlyph } from '../components/sessions/icons';
import { RefreshIcon } from '../components/terminal/icons';
import { DocsCopy } from '../copy';
import { baseName, extensionOf } from '../docs/paths';
import { renderSourceDocument } from '../docs/plainDocument';
import { decodeBase64Utf8, readRemoteFiles } from '../docs/remoteFiles';
import { FileKindIcon } from '../files/FileRows';
import { currentMachine, useProjectDocsRpc } from '../files/machine';
import {
  filePreview,
  formatFileSize,
  isTextFile,
  PREVIEW_MAX_BYTES,
  statProjectFile,
  type InfoReason,
} from '../files/preview';
import { previewActions, type PreviewAction } from '../files/rowMenu';
import { canShareFiles } from '../files/shareSheet';
import { useShareFile } from '../files/useShareFile';
import { useAddToSessionContext } from '../files/useSessionContext';
import type { RootStackParamList } from '../navigation/types';
import { GhostexPalette } from '../theme/palette';

type Props = NativeStackScreenProps<RootStackParamList, 'ProjectFile'>;

type FileView =
  | { kind: 'loading' }
  | { kind: 'source'; html: string }
  | { kind: 'info'; reason: InfoReason; size: number | null }
  | { kind: 'failed'; message: string };

/** The info view's column, as wide as the approved mockup's. */
const INFO_MAX_WIDTH = 420;

/**
 * Reads the file and decides what shows: name and size for what the browser does not show by its kind and size,
 * else the text, unless it turns out not to be text or to have grown past the limit since it was listed.
 */
async function loadFile(machineId: string, path: string, size: number | null): Promise<FileView> {
  const preview = filePreview(baseName(path), size);
  if (preview.kind === 'info') return { kind: 'info', reason: preview.reason, size };
  const [read] = await readRemoteFiles(currentMachine(machineId), [path], PREVIEW_MAX_BYTES);
  if (read === undefined || read.status === 'missing') return { kind: 'failed', message: DocsCopy.fileMissing };
  if (read.status === 'tooLarge') return { kind: 'info', reason: 'large', size };
  if (!isTextFile(read.base64)) return { kind: 'info', reason: 'binary', size: read.bytes };
  return { kind: 'source', html: renderSourceDocument(decodeBase64Utf8(read.base64), baseName(path)) };
}

export default function ProjectFileScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const infoEdges = useScrollToBarEdges(styles.infoContent);
  const { machineId, projectId, entryPath, path, size: listedSize, session } = route.params;
  const name = baseName(path);
  const rpc = useProjectDocsRpc(machineId);
  const [shown, setShown] = useState<FileView>({ kind: 'loading' });
  const [run, setRun] = useState(0);
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
  // Ends a lasting notice (the file being fetched for Share…); a notice shown meanwhile stays.
  const clearNotice = useCallback(() => setNotice((current) => (current?.lasting === true ? null : current)), []);
  const { share, sharing } = useShareFile(rpc, projectId, { show: showNotice, clear: clearNotice });
  // The size the progress notice names: the one measured for the name-and-size view, else the listed one.
  const knownSize = shown.kind === 'info' ? shown.size : listedSize;
  const shareFile = useCallback(
    () => share({ path: entryPath, name, size: knownSize }),
    [entryPath, knownSize, name, share],
  );
  // REQ-FILES-010: in a preview opened from an agent session, the file's context text into that session's input.
  const addToContext = useAddToSessionContext(rpc, machineId, projectId, session, showNotice);
  const addFileToContext = useMemo(
    () => (addToContext === null ? null : () => addToContext({ path: entryPath, name })),
    [addToContext, entryPath, name],
  );

  // The first run goes by the size the browser listed; Reload measures the file again, since it may have
  // changed kind or size since then.
  useEffect(() => {
    let ignore = false;
    void (async () => {
      try {
        const size = run === 0 ? listedSize : await statProjectFile(rpc, projectId, entryPath);
        const next = await loadFile(machineId, path, size);
        if (!ignore) setShown(next);
      } catch (failure) {
        const message = failure instanceof Error ? failure.message : String(failure);
        if (!ignore) setShown({ kind: 'failed', message });
      }
    })();
    return () => {
      ignore = true;
    };
  }, [entryPath, listedSize, machineId, path, projectId, rpc, run]);

  const reload = useCallback(() => {
    setShown({ kind: 'loading' });
    setRun((current) => current + 1);
  }, []);
  // REQ-FILES-003: the full path on the computer.
  const copyPath = useCallback(() => {
    Clipboard.setStringAsync(path).then(
      () => showNotice(path, false, DocsCopy.pathCopied),
      (failure: unknown) =>
        showNotice(failure instanceof Error ? failure.message : String(failure), true, DocsCopy.copyFailed),
    );
  }, [path, showNotice]);

  // The source view's header as the approved mockup draws a preview's (`previewButtons`); the name-and-size view
  // keeps only Reload there, its Copy Full Path and Share… stand under the name.
  const showsPreviewActions = shown.kind !== 'info';
  const buttons = useMemo(() => {
    const actions: PreviewAction[] = showsPreviewActions
      ? previewActions({ sessionContext: addFileToContext !== null, share: canShareFiles })
      : ['reload'];
    return actions.flatMap((action): RailEntry[] => {
      switch (action) {
        case 'copyPath':
          return [
            {
              key: 'copy-path',
              label: DocsCopy.copyFullPath,
              icon: (glyph: number) => <CopyGlyph size={glyph} color={GhostexPalette.FOREGROUND} />,
              onPress: copyPath,
            },
          ];
        case 'addToSessionContext':
          return addFileToContext === null
            ? []
            : [
                {
                  key: 'context',
                  label: DocsCopy.addToSessionContext,
                  icon: (glyph: number) => <MessagePlusGlyph size={glyph} color={GhostexPalette.FOREGROUND} />,
                  onPress: addFileToContext,
                },
              ];
        case 'share':
          return [
            {
              key: 'share',
              label: DocsCopy.shareButton,
              icon: (glyph: number) => <ShareGlyph size={glyph} color={GhostexPalette.FOREGROUND} />,
              onPress: shareFile,
              // One share at a time for the whole app: dimmed while any share runs, this screen's or another's.
              disabled: sharing,
            },
          ];
        case 'reload':
          return [
            {
              key: 'reload',
              label: DocsCopy.reload,
              icon: (glyph: number) => <RefreshIcon size={glyph} color={GhostexPalette.FOREGROUND} />,
              onPress: reload,
            },
          ];
      }
    });
  }, [addFileToContext, copyPath, reload, shareFile, sharing, showsPreviewActions]);
  useLayoutEffect(() => {
    navigation.setOptions({
      title: name,
      headerRight: () => (
        <View style={styles.headerButtons}>
          {buttons.map((button) => (
            <HeaderButton
              key={button.key}
              label={button.label}
              onPress={button.onPress}
              disabled={button.disabled}
              icon={button.icon(button.key === 'reload' ? 18 : 17)}
            />
          ))}
        </View>
      ),
    });
  }, [buttons, name, navigation]);
  // On the iPhone Duo the same buttons stand in the side bar under Back.
  useStackScreenRail(useMemo(() => ({ entries: buttons, reserveKeyboard: false }), [buttons]));

  const extension = extensionOf(name);
  return (
    <View style={styles.screen}>
      {shown.kind === 'source' ? (
        <WebView
          // A new read loads the page afresh.
          key={run}
          source={{ html: shown.html }}
          originWhitelist={['about:blank']}
          javaScriptEnabled={false}
          accessibilityLabel={DocsCopy.sourceView(name)}
          style={styles.source}
          containerStyle={styles.source}
          allowsLinkPreview={false}
          setSupportMultipleWindows={false}
          webviewDebuggingEnabled={__DEV__}
        />
      ) : shown.kind === 'info' ? (
        <ScrollView style={infoEdges.scroll} contentContainerStyle={[styles.infoContent, infoEdges.content]}>
          <View style={styles.info}>
            <View style={styles.infoIcon}>
              <FileKindIcon name={name} size={34} />
            </View>
            <Text style={styles.infoTitle} accessibilityRole="header">
              {DocsCopy.cantPreview}
            </Text>
            <Text style={styles.infoName} selectable>
              {name}
            </Text>
            <Text style={styles.infoMeta}>
              {DocsCopy.infoMeta(
                shown.size === null ? DocsCopy.sizeUnknown : formatFileSize(shown.size),
                DocsCopy.infoKind(extension, shown.reason === 'image'),
              )}
            </Text>
            <Text style={styles.infoMeta}>{DocsCopy.infoWhy[shown.reason]}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={copyPath}
              style={({ pressed }) => [styles.copyButton, pressed && styles.pressed]}
            >
              <CopyGlyph size={16} color={GhostexPalette.ACCENT_FOREGROUND} />
              <Text style={styles.copyText}>{DocsCopy.copyFullPath}</Text>
            </Pressable>
            {canShareFiles ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: sharing }}
                disabled={sharing}
                onPress={shareFile}
                style={({ pressed }) => [styles.shareButton, (pressed || sharing) && styles.pressed]}
              >
                <ShareGlyph size={16} color={GhostexPalette.FOREGROUND} />
                <Text style={styles.shareText}>{DocsCopy.share}</Text>
              </Pressable>
            ) : null}
            <Text style={styles.infoPath} selectable>
              {path}
            </Text>
          </View>
        </ScrollView>
      ) : shown.kind === 'failed' ? (
        <View style={styles.centered}>
          <Text style={styles.failureTitle}>{DocsCopy.openFailed}</Text>
          <Text style={styles.failureBody} selectable>
            {shown.message}
          </Text>
          <Pressable accessibilityRole="button" onPress={reload} style={styles.retryButton}>
            <Text style={styles.retryText}>{DocsCopy.retry}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.centered}>
          <ActivityIndicator color={GhostexPalette.MUTED} />
          <Text style={styles.loadingText}>{DocsCopy.readingFile}</Text>
        </View>
      )}
      <NoticeToast notice={notice} bottom={insets.bottom + 16} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: GhostexPalette.BACKGROUND },
  source: { flex: 1, backgroundColor: GhostexPalette.BACKGROUND },
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pressed: { opacity: 0.6 },
  infoContent: { paddingHorizontal: 28, paddingTop: 56, paddingBottom: 32 },
  info: { width: '100%', maxWidth: INFO_MAX_WIDTH, alignSelf: 'center', alignItems: 'center', gap: 8 },
  infoIcon: {
    width: 72,
    height: 72,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    backgroundColor: GhostexPalette.CARD,
  },
  infoTitle: { color: GhostexPalette.FOREGROUND, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  infoName: { color: GhostexPalette.FOREGROUND, fontSize: 15, textAlign: 'center' },
  infoMeta: { color: GhostexPalette.MUTED, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    minWidth: 200,
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: GhostexPalette.ACCENT,
  },
  copyText: { color: GhostexPalette.ACCENT_FOREGROUND, fontSize: 14, fontWeight: '600' },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minWidth: 200,
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GhostexPalette.BORDER,
    backgroundColor: GhostexPalette.CARD,
  },
  shareText: { color: GhostexPalette.FOREGROUND, fontSize: 14, fontWeight: '600' },
  infoPath: {
    marginTop: 4,
    color: GhostexPalette.MUTED,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'Menlo',
    textAlign: 'center',
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  loadingText: { color: GhostexPalette.MUTED, fontSize: 13 },
  failureTitle: { color: GhostexPalette.FOREGROUND, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  failureBody: { color: GhostexPalette.MUTED, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  retryButton: {
    marginTop: 6,
    paddingHorizontal: 18,
    height: 40,
    borderRadius: 10,
    backgroundColor: GhostexPalette.ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { color: GhostexPalette.ACCENT_FOREGROUND, fontSize: 14, fontWeight: '600' },
});
