/**
 * Files and links (desktop `native_chat/files_links.rs`): the sheet, opened from More actions, that lists
 * every attachment, file and link the session mentioned, and a coordinator's threads too. The core
 * owns what is listed, the sections, the filter and where a jump lands (`gx-chat-core`
 * `composer/files_links.rs`). A tap opens the item: a picture in the image viewer, a file or a link
 * the way the transcript's own pill or link opens it. Holding a row shows its jumps (to the message
 * that first or last mentioned it, or the thread that did), the phone's long-press rule for message
 * actions (user decision 2026-10-12), so no row carries an always-visible button. A held file or
 * folder also offers Copy path (CDXC:SessionChat 2026-10-17 in desktop `native_chat/file_actions.rs`;
 * the desktop's folder row is left out because the phone cannot show a folder on the computer).
 */

import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';

import type { UserAction } from '../../rust/actions';
import type { FilesLinksRow, FilesLinksState } from '../../rust/document';
import { Glyph, type GlyphName } from '../composer/icons';
import { themedStyles, useTranscriptTheme } from '../transcript/theme';
import { openChatImageViewer, type ChatImage } from './overlayStore';
import { Sheet } from '../composer/Sheet';
import { ChatButton } from './primitives';

const ROW_GLYPHS: Record<string, GlyphName> = { photo: 'photo', folder: 'folder', link: 'link', file: 'file' };

function isPicture(image: unknown): image is ChatImage {
  return typeof image === 'object' && image !== null && (image as ChatImage).transport !== 'none';
}

export function FilesLinksCard({
  filesLinks,
  dispatch,
}: {
  filesLinks: FilesLinksState | undefined;
  dispatch: (action: UserAction) => void;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const { height } = useWindowDimensions();
  const [query, setQuery] = useState(filesLinks?.query ?? '');
  const [held, setHeld] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const open = filesLinks?.open === true;
  useEffect(() => {
    if (!open) {
      setQuery('');
      setHeld(null);
    }
  }, [open]);
  if (filesLinks === undefined) return null;
  const close = () => dispatch({ type: 'filesLinksClose' });
  if (!open)
    return (
      <Sheet visible={false} onClose={close} title="Files and links">
        {null}
      </Sheet>
    );
  const sections = filesLinks.sections ?? [];
  const header = (
    <Text style={styles.status} numberOfLines={1}>
      {filesLinks.loading && filesLinks.caption.length === 0 ? 'Reading the session…' : filesLinks.caption}
    </Text>
  );
  const run = (command: unknown) => dispatch(command as UserAction);
  const openRow = (row: FilesLinksRow, gallery: ChatImage[]) => {
    if (isPicture(row.image)) {
      openChatImageViewer(gallery, Math.max(0, gallery.indexOf(row.image)));
    } else {
      run(row.open);
    }
  };
  const body = [];
  if (filesLinks.filter) {
    body.push(
      <View key="filter" style={styles.filter}>
        <Glyph name="search" size={14} color={P.muted} />
        <TextInput
          accessibilityLabel="Filter files and links"
          style={styles.filterInput}
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            dispatch({ type: 'filesLinksFilter', text });
          }}
          placeholder="Filter by name, path or link"
          placeholderTextColor={P.muted}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>,
    );
  }
  if (filesLinks.loading && sections.length === 0) {
    body.push(<Placeholder key="loading" />);
  } else if (filesLinks.error !== null && filesLinks.error !== undefined) {
    body.push(
      <Text key="error" style={styles.error}>
        {filesLinks.error}
      </Text>,
    );
  } else if (sections.length === 0) {
    body.push(
      <Text key="empty" style={styles.empty}>
        {filesLinks.emptyLabel}
      </Text>,
    );
  } else {
    body.push(
      <ScrollView
        key="list"
        style={{ maxHeight: height * 0.55 }}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.hint}>Tap to open; hold a row to jump to where it was mentioned.</Text>
        {sections.map((section) => (
          <View key={section.id} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>{section.label}</Text>
              <Text style={styles.sectionCount}>{section.count}</Text>
            </View>
            {section.groups.map((group) => {
              const gallery: ChatImage[] = [];
              for (const row of group.rows) if (isPicture(row.image)) gallery.push(row.image);
              return (
                <View key={group.key}>
                  {group.title.length > 0 ? (
                    <Text style={styles.groupTitle} numberOfLines={1}>
                      {group.title}
                    </Text>
                  ) : null}
                  {group.rows.map((row) => (
                    <View key={row.key}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Open ${row.label}`}
                        accessibilityHint="Hold to jump to where it was mentioned"
                        onPress={() => openRow(row, gallery)}
                        onLongPress={() => setHeld(held === row.key ? null : row.key)}
                        style={({ pressed }) => [
                          styles.row,
                          pressed || held === row.key ? { backgroundColor: P.pressedFill } : null,
                        ]}
                      >
                        <Glyph name={ROW_GLYPHS[row.icon] ?? 'file'} size={15} color={P.muted} />
                        <View style={styles.rowText}>
                          <View style={styles.rowTitle}>
                            <Text style={styles.rowLabel} numberOfLines={1}>
                              {row.label}
                            </Text>
                            {row.tag ? <Text style={styles.tag}>{row.tag}</Text> : null}
                          </View>
                          <Text style={styles.rowDetail} numberOfLines={1} ellipsizeMode="middle">
                            {row.detail}
                          </Text>
                          <Text style={styles.rowMeta} numberOfLines={1}>
                            {row.meta}
                          </Text>
                        </View>
                      </Pressable>
                      {held === row.key ? (
                        <View style={styles.jumps}>
                          {row.jumps.map((jump) => (
                            <ChatButton
                              key={jump.label}
                              label={
                                jump.label === 'Show'
                                  ? 'Show message'
                                  : jump.label === 'First' || jump.label === 'Last'
                                    ? `${jump.label} mention`
                                    : jump.label
                              }
                              onPress={() => {
                                setHeld(null);
                                run(jump.command);
                              }}
                            />
                          ))}
                          {row.path ? (
                            <ChatButton
                              label={copied === row.key ? 'Path copied' : 'Copy path'}
                              icon="copy"
                              onPress={() => {
                                const key = row.key;
                                void Clipboard.setStringAsync(row.path ?? '').then(() => setCopied(key));
                              }}
                            />
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              );
            })}
            {section.moreLabel.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                hitSlop={6}
                onPress={() => dispatch({ type: 'filesLinksShowAll', section: section.id })}
              >
                <Text style={styles.more}>{section.moreLabel}</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </ScrollView>,
    );
  }
  // The sheet's title row says "Files and links"; Refresh sits beside it and a tap outside or Back closes it.
  return (
    <Sheet
      visible
      onClose={close}
      title="Files and links"
      accessory={
        <ChatButton
          label="Refresh"
          icon="refresh"
          disabled={filesLinks.loading}
          onPress={() => dispatch({ type: 'filesLinksRefresh' })}
        />
      }
    >
      <View style={styles.sheetBody}>
        {header}
        {body}
      </View>
    </Sheet>
  );
}

/** The three bars the side question card shows while it answers. */
function Placeholder() {
  const styles = useStyles();
  return (
    <View style={styles.placeholder}>
      {[0.92, 0.78, 0.45].map((width) => (
        <View key={width} style={[styles.placeholderBar, { width: `${width * 100}%` }]} />
      ))}
    </View>
  );
}

const useStyles = themedStyles((P) => ({
  sheetBody: { flexShrink: 1, gap: 10, paddingHorizontal: 16, paddingBottom: 8 },
  status: { flexShrink: 1, color: P.muted, fontSize: 12, lineHeight: 20 },
  error: { color: P.error, fontSize: 13, lineHeight: 19 },
  empty: { color: P.muted, fontSize: 13, lineHeight: 19 },
  hint: { color: P.muted, fontSize: 11, marginBottom: 6 },
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: P.inputBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: P.cardRow,
  },
  filterInput: { flex: 1, minWidth: 0, color: P.primary, fontSize: 14, paddingVertical: 6 },
  section: { marginBottom: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 2 },
  sectionLabel: { color: P.foreground, fontSize: 12, fontWeight: '600' },
  sectionCount: { color: P.muted, fontSize: 12 },
  groupTitle: { color: P.muted, fontSize: 11, paddingTop: 4, paddingHorizontal: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: 6,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowLabel: { flexShrink: 1, color: P.foreground, fontSize: 13 },
  tag: {
    color: P.muted,
    fontSize: 10,
    paddingHorizontal: 5,
    borderRadius: 4,
    backgroundColor: P.border,
    overflow: 'hidden',
  },
  rowDetail: { color: P.muted, fontSize: 11.5 },
  rowMeta: { color: P.muted, fontSize: 11, opacity: 0.75 },
  jumps: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 29, paddingBottom: 4 },
  more: { color: P.cardMuted, fontSize: 12, paddingHorizontal: 6, paddingTop: 2 },
  placeholder: { gap: 9, paddingVertical: 4 },
  placeholderBar: { height: 9, borderRadius: 5, backgroundColor: P.muted, opacity: 0.28 },
}));
