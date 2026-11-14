/**
 * The image tiles above the input (`attachment_previews.rs`): one 48pt thumbnail per image
 * reference in the draft, with its remove button (always shown: a phone has no hover), plus a
 * spinner tile per upload still in flight (`pendingAttachments`). Tapping a tile opens the image
 * viewer, as a click does on desktop. A picture whose upload failed twice stays as a tile of its own, from the
 * phone's copy, with a red mark and the words saying Send tries again (`ComposerModelState.failedPictures`;
 * CDXC:Clipboard 2026-11-15 DECISION, issue #618 Q3274 A: never "tap the picture to retry", Send retries).
 */

import { useEffect, useRef } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';

import type { UserAction } from '../../rust/actions';
import type { ChatImageState } from '../../rust/host';
import { openChatImageViewer, type ChatImage } from '../cards';
import { Glyph } from './icons';
import { themedStyles, useTranscriptTheme } from '../transcript/theme';
import type { ComposerReference } from './references';
import type { FailedPicture } from '../../rust/composer';

/** Under the failed tiles: what happened, and that Send uploads them again. */
export const PICTURE_FAILED_WORDS = "Couldn't upload. Press Send to try again.";

export function AttachmentPreviews({
  references,
  pending,
  images,
  draft,
  active,
  dispatch,
  waiting = false,
  failed = [],
  onDropFailed,
}: {
  references: readonly ComposerReference[];
  pending: number;
  /** Send was pressed while an upload was still on its way (`ComposerModelState.heldSend`). */
  waiting?: boolean;
  images: { [path: string]: ChatImageState };
  draft: string;
  active: string | null;
  dispatch: (action: UserAction) => void;
  /** Pictures whose upload failed, still in the chat box. */
  failed?: readonly FailedPicture[];
  /** A failed picture's remove button. */
  onDropFailed?: (key: number) => void;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const tiles = references.filter((reference) => reference.kind === 'image');
  const requested = useRef(new Set<string>());
  useEffect(() => {
    for (const tile of tiles) {
      if (images[tile.path] !== undefined || requested.current.has(tile.path)) continue;
      requested.current.add(tile.path);
      dispatch({ type: 'loadImage', path: tile.path });
    }
  }, [tiles, images, dispatch]);
  if (tiles.length === 0 && pending === 0 && failed.length === 0) return null;
  const viewerImages: ChatImage[] = tiles.map((tile) => ({
    transport: 'read',
    path: tile.path,
    label: tile.label,
    copyPath: tile.path,
    fileName: tile.path.replace(/^.*[\\/]/u, ''),
  }));
  return (
    <View style={styles.row}>
      {tiles.map((tile, index) => {
        const image = images[tile.path];
        return (
          <View key={`${tile.start}:${tile.path}`} style={styles.tileWrap}>
            <Pressable
              onPress={() => openChatImageViewer(viewerImages, index)}
              accessibilityRole="imagebutton"
              accessibilityLabel={`View ${tile.label}`}
              style={[styles.tile, active === tile.path ? styles.tileActive : null]}
            >
              {image?.status === 'loaded' ? (
                <Image
                  source={{ uri: `data:${image.mediaType};base64,${image.base64Data}` }}
                  style={styles.image}
                  resizeMode="cover"
                />
              ) : image === undefined ? (
                <ActivityIndicator size="small" color={P.muted} />
              ) : (
                <Glyph name="photo" size={18} color={P.muted} />
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove image"
              hitSlop={8}
              onPress={() => dispatch({ type: 'removeAttachment', text: draft, start: tile.start, end: tile.end })}
              style={styles.remove}
            >
              <Glyph name="x" size={10} color={P.foreground} strokeWidth={2.4} />
            </Pressable>
          </View>
        );
      })}
      {Array.from({ length: pending }, (_, index) => (
        <View key={`pending:${index}`} style={styles.tile}>
          <ActivityIndicator size="small" color={P.muted} />
        </View>
      ))}
      {failed.map((picture) => (
        <View key={`failed:${picture.key}`} style={styles.tileWrap}>
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={`${picture.name ?? 'Picture'}: ${PICTURE_FAILED_WORDS}`}
            style={[styles.tile, styles.tileFailed]}
          >
            <Image source={{ uri: picture.uri }} style={[styles.image, styles.imageFailed]} resizeMode="cover" />
            <View pointerEvents="none" style={styles.failedMark}>
              <Text style={styles.failedMarkText}>!</Text>
            </View>
          </View>
          {onDropFailed !== undefined ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove image"
              hitSlop={8}
              onPress={() => onDropFailed(picture.key)}
              style={styles.remove}
            >
              <Glyph name="x" size={10} color={P.foreground} strokeWidth={2.4} />
            </Pressable>
          ) : null}
        </View>
      ))}
      {failed.length > 0 ? <Text style={styles.failedWords}>{PICTURE_FAILED_WORDS}</Text> : null}
      {waiting && pending > 0 ? <Text style={styles.waiting}>Sends once the image is attached</Text> : null}
    </View>
  );
}

const useStyles = themedStyles((P) => ({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, paddingTop: 4, paddingBottom: 8 },
  tileWrap: { width: 48, height: 48 },
  tile: {
    width: 48,
    height: 48,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: P.inputBorder,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: P.background,
  },
  tileActive: { borderColor: P.foreground, borderWidth: 2 },
  image: { width: '100%', height: '100%' },
  waiting: { color: P.muted, fontSize: 12 },
  tileFailed: { borderColor: P.error, borderWidth: 1.5 },
  imageFailed: { opacity: 0.55 },
  failedMark: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: P.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  failedMarkText: { color: P.light ? '#ffffff' : '#1a0b0b', fontSize: 12, lineHeight: 14, fontWeight: '700' },
  failedWords: { color: P.error, fontSize: 12, flexShrink: 1 },
  remove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: P.inputBorder,
    backgroundColor: P.light ? P.menu : '#262626',
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
