/**
 * History (desktop `native_chat/sent_history.rs`): the pill above the chat box and the sheet it
 * opens, listing every message the user sent in this chat as a card, oldest at the top and opened
 * scrolled to the newest. The core owns what is listed, the search, the filters, the paging and
 * where a jump lands (`gx-chat-core` `composer/sent_history.rs`, where the user's decision lives).
 *
 * A tap on a card jumps to its message in the transcript. Holding a card shows its actions, the
 * phone's long-press rule for message actions (user decision 2026-10-12), each with its name: Copy,
 * then the desktop ⋯ menu's rows in its order (CDXC:SessionChat 2026-11-26 in
 * `native_chat/sent_history.rs`): Copy reference and Reference in chat (a numbered message), Put
 * back in the chat box (the pencil, since the back arrow is Rewind's), then Rewind to here and Fork
 * from here, the same actions a message's own menu runs (`MessageActions.tsx`). A tap is the jump.
 *
 * CDXC:SessionChat 2026-11-26 WHY: the user found History slow to open (the core's decision on it is
 * in `composer/sent_history.rs`). The cards are an inverted list, so only the newest ones on screen
 * are built when the sheet opens, older pages land above them without moving the ones in view, and
 * the next page is asked for well before the top.
 */

import * as Clipboard from 'expo-clipboard';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, Text, TextInput, View } from 'react-native';

import type { UserAction } from '../../rust/actions';
import type { ChatDocument, SentHistoryItem, SentHistoryState } from '../../rust/document';
import type { RustChat } from '../../rust/useRustChat';
import { useChatViewSize } from '../chatPlacement';
import { Glyph as ComposerGlyph } from '../composer/icons';
import { Sheet } from '../composer/Sheet';
import {
  ChatImagesProvider,
  useForkFromMessage,
  useImageDisplay,
  type ChatImageSource,
} from '../transcript/context';
import { themedStyles, useTranscriptTheme } from '../transcript/theme';
import { Glyph } from './icons';
import { openChatImageViewer, type ChatImage } from './overlayStore';
import { ChatButton } from './primitives';

const EMPTY_IMAGES = {};
/** How near the list's top the next older page is asked for, in screens of cards. */
const MORE_AHEAD = 1.5;
/** Cards built when the sheet opens, then per batch as the list scrolls. */
const FIRST_CARDS = 12;

/** The History pill: the history glyph alone, a neutral pill like the ? beside it. */
export function SentHistoryPill({ open, onPress }: { open: boolean; onPress: () => void }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="History"
      accessibilityHint="Lists the messages you sent in this chat"
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.pill, (pressed || open) && styles.pillPressed]}
    >
      <Glyph name="history" size={15} color={P.cardMuted} />
    </Pressable>
  );
}

export function SentHistorySheet({ chat, document }: { chat: RustChat; document: ChatDocument }) {
  const history = document.sentHistory;
  const styles = useStyles();
  const P = useTranscriptTheme();
  const { height } = useChatViewSize();
  const dispatch = chat.dispatch;
  const fork = useForkFromMessage();
  const [query, setQuery] = useState(history?.query ?? '');
  const [held, setHeld] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const open = history?.open === true;
  // Newest first, for the inverted list, which draws the first at the bottom.
  const newestFirst = useMemo(() => [...(history?.items ?? [])].reverse(), [history?.items]);
  useEffect(() => {
    if (!open) {
      setQuery('');
      setHeld(null);
      setCopied(null);
    }
  }, [open]);
  if (history === undefined) return null;
  const close = () => dispatch({ type: 'sentHistoryClose' });
  if (!open)
    return (
      <Sheet visible={false} onClose={close} title="History">
        {null}
      </Sheet>
    );
  const items = history.items ?? [];
  const canFork = fork !== null && document.forkFromMessageAvailable === true;
  const canRewind = document.rewindAvailable === true && document.rewindEnabled === true;
  const run = (item: SentHistoryItem, action: () => void, keepOpen = false) => {
    setHeld(null);
    if (!keepOpen) close();
    action();
  };
  const caption = history.loadingMore ? 'Loading older…' : history.caption;
  let list;
  if (history.loading && items.length === 0) {
    list = <Text style={styles.empty}>Reading your messages…</Text>;
  } else if (history.error !== null && history.error !== undefined) {
    list = <Text style={styles.error}>{history.error}</Text>;
  } else if (items.length === 0) {
    list = <Text style={styles.empty}>{history.emptyLabel}</Text>;
  } else {
    const renderCard = ({ item }: { item: SentHistoryItem }) => (
          <SentCard
            item={item}
            held={held === item.id}
            onPress={() => {
              setHeld(null);
              close();
              dispatch({ type: 'sentHistoryJump', messageId: item.id, timestamp: item.timestamp });
            }}
            onLongPress={() => setHeld(held === item.id ? null : item.id)}
          >
            <View style={styles.actions}>
              <ChatButton
                label={copied === item.id ? 'Copied' : 'Copy'}
                icon="copy"
                onPress={() => {
                  const id = item.id;
                  void Clipboard.setStringAsync(item.copyText).then(() => setCopied(id));
                }}
              />
              {item.referenceLink ? (
                <ChatButton
                  label="Copy reference"
                  icon="hash"
                  onPress={() => run(item, () => void Clipboard.setStringAsync(item.referenceLink ?? ''), true)}
                />
              ) : null}
              {item.referencePill ? (
                <ChatButton
                  label="Reference in chat"
                  icon="quote"
                  onPress={() =>
                    run(item, () =>
                      dispatch({ type: 'appendToDraft', text: item.referencePill ?? '', inline: true }),
                    )
                  }
                />
              ) : null}
              <ChatButton
                label="Put back in the chat box"
                icon="pencil"
                onPress={() => run(item, () => dispatch({ type: 'appendToDraft', text: item.draft }))}
              />
              {canRewind ? (
                <ChatButton
                  label="Rewind to here"
                  icon="arrow-back-up"
                  onPress={() =>
                    run(item, () => dispatch({ type: 'rewindOpen', messageId: item.id, prompt: item.copyText }))
                  }
                />
              ) : null}
              {canFork ? (
                <ChatButton label="Fork from here" icon="git-branch" onPress={() => run(item, () => fork(item.id))} />
              ) : null}
            </View>
          </SentCard>
    );
    list = (
      <ChatImagesProvider value={chat.state?.images ?? EMPTY_IMAGES}>
        <FlatList
          inverted
          data={newestFirst}
          keyExtractor={(item) => item.id}
          renderItem={renderCard}
          extraData={`${held ?? ''}:${copied ?? ''}:${canFork}:${canRewind}`}
          style={{ maxHeight: height * 0.55 }}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          initialNumToRender={FIRST_CARDS}
          maxToRenderPerBatch={FIRST_CARDS}
          windowSize={7}
          // The end of an inverted list is its top: the oldest card.
          onEndReachedThreshold={MORE_AHEAD}
          onEndReached={() => {
            if (history.hasMore && !history.loadingMore) dispatch({ type: 'sentHistoryMore' });
          }}
          ListFooterComponent={<Text style={styles.hint}>Tap a card to jump to it; hold it for its actions.</Text>}
        />
      </ChatImagesProvider>
    );
  }
  return (
    <Sheet visible onClose={close} title="History" subtitle={caption}>
      <View style={styles.sheetBody}>
        <View style={styles.search}>
          <ComposerGlyph name="search" size={14} color={P.muted} />
          <TextInput
            accessibilityLabel="Search your messages"
            style={styles.searchInput}
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              dispatch({ type: 'sentHistoryFilter', text });
            }}
            placeholder="Search your messages, or type M3"
            placeholderTextColor={P.muted}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
        <Filters history={history} dispatch={dispatch} />
        {list}
      </View>
    </Sheet>
  );
}

/** All, With attachments and Text only: neutral chips, the picked one filled. */
function Filters({ history, dispatch }: { history: SentHistoryState; dispatch: (action: UserAction) => void }) {
  const styles = useStyles();
  return (
    <View style={styles.filters}>
      {(history.filters ?? []).map((filter) => (
        <Pressable
          key={filter.id}
          accessibilityRole="button"
          accessibilityLabel={filter.label}
          accessibilityState={{ selected: filter.active }}
          hitSlop={4}
          onPress={() => dispatch({ type: 'sentHistoryKind', filter: filter.id })}
          style={({ pressed }) => [styles.chip, (filter.active || pressed) && styles.chipActive]}
        >
          <Text style={[styles.chipLabel, filter.active && styles.chipLabelActive]}>{filter.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function SentCard({
  item,
  held,
  onPress,
  onLongPress,
  children,
}: {
  item: SentHistoryItem;
  held: boolean;
  onPress: () => void;
  onLongPress: () => void;
  children: ReactNode;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const images = (item.images ?? []) as ChatImageSource[];
  return (
    <View style={[styles.card, held && styles.cardHeld]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Jump to your message: ${item.preview}`}
        accessibilityHint="Hold for its actions"
        onPress={onPress}
        onLongPress={onLongPress}
        style={({ pressed }) => [styles.cardBody, pressed && { backgroundColor: P.pressedFill }]}
      >
        {item.time?.label ? (
          <Text style={styles.time} numberOfLines={1}>
            {item.time.label}
          </Text>
        ) : null}
        {item.preview.length > 0 ? (
          <Text style={styles.preview} numberOfLines={3}>
            {item.preview}
          </Text>
        ) : null}
        {images.length > 0 || item.files.length > 0 ? (
          <View style={styles.attachments}>
            {images.map((image, index) => (
              <Pressable
                key={`image:${index}`}
                accessibilityRole="imagebutton"
                accessibilityLabel="Open picture"
                onPress={() => openChatImageViewer(images as ChatImage[], index)}
              >
                <Thumb image={image} />
              </Pressable>
            ))}
            {item.files.map((file) => (
              <View key={file.path} style={styles.file}>
                <Glyph name="file" size={12} color={P.muted} />
                <Text style={styles.fileLabel} numberOfLines={1} ellipsizeMode="middle">
                  {file.label}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </Pressable>
      {held ? children : null}
    </View>
  );
}

/** A picture's small square, read from the computer the first time like the transcript's. */
function Thumb({ image }: { image: ChatImageSource }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const display = useImageDisplay(image);
  if (display.state === 'ready') return <Image source={{ uri: display.uri }} style={styles.thumb} resizeMode="cover" />;
  return (
    <View style={[styles.thumb, styles.thumbEmpty]}>
      {display.state === 'loading' ? (
        <ActivityIndicator size="small" color={P.muted} />
      ) : (
        <Glyph name="photo" size={14} color={P.muted} />
      )}
    </View>
  );
}

const useStyles = themedStyles((P) => ({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    height: 25,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: P.ink(0.1),
  },
  pillPressed: { backgroundColor: P.ink(0.08) },
  sheetBody: { flexShrink: 1, gap: 10, paddingHorizontal: 16, paddingBottom: 8 },
  error: { color: P.error, fontSize: 13, lineHeight: 19 },
  empty: { color: P.muted, fontSize: 13, lineHeight: 19 },
  hint: { color: P.muted, fontSize: 11, marginBottom: 6 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: P.inputBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: P.cardRow,
  },
  searchInput: { flex: 1, minWidth: 0, color: P.primary, fontSize: 14, paddingVertical: 6 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: P.ink(0.1),
  },
  chipActive: { backgroundColor: P.ink(0.08) },
  chipLabel: { color: P.cardMuted, fontSize: 12 },
  chipLabelActive: { color: P.foreground },
  card: {
    borderWidth: 1,
    borderColor: P.border,
    borderRadius: 10,
    marginBottom: 8,
    overflow: 'hidden',
    backgroundColor: P.cardRow,
  },
  cardHeld: { borderColor: P.ink(0.2) },
  cardBody: { gap: 4, paddingHorizontal: 10, paddingVertical: 8 },
  time: { color: P.muted, fontSize: 11 },
  preview: { color: P.foreground, fontSize: 13.5, lineHeight: 19 },
  attachments: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingTop: 2 },
  thumb: { width: 36, height: 36, borderRadius: 6, borderWidth: 1, borderColor: P.border },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  file: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 200,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: P.ink(0.05),
  },
  fileLabel: { flexShrink: 1, color: P.cardMuted, fontSize: 11.5 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 10, paddingBottom: 8 },
}));
