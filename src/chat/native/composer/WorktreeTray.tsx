/**
 * The bar on top of a new chat's message box (`worktree_tray.rs` on desktop): one borderless
 * breadcrumb, project › computer › where › detail, from the document's `worktreeTray` key.
 * gx-chat-core decides when it shows, what it offers and what is picked, and builds the where and
 * detail parts with their menus; `trayLayout.ts` decides one row or a two-row grid; this measures the
 * parts, draws them and opens their menus in the composer's menu sheet. A part cut short shows its
 * full words on a long press. The Cloud Box boot card is `BoxPicker.tsx`.
 *
 * CDXC:Worktrees 2026-11-04 DECISION: User (Q1227 "D. One breadcrumb", "dont have a border around the
 * breadcrumb"): the chips and the 4-way switch are gone; each part opens its own menu and has no border
 * of its own (a pressed wash shows the press).
 */

import { useEffect, useState, type ReactElement } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';

import type { WorktreeTray as Tray } from '../../rust/document';
import { CloudBoxCardView } from './BoxPicker';
import { Glyph, type GlyphName } from './icons';
import type { MenuRow, MenuSearch } from './MenuSheet';
import { NARROW_WIDTH, trayLayout, type PartSize } from './trayLayout';
import { themedStyles, useTranscriptTheme } from '../transcript/theme';

const STAR = '#f5b301';
/** A part's inset at each side, its icon and the gap after it, the › between parts, the least a cut part keeps of its words. */
const PART_PADDING = 6;
const ICON = 13;
const GAP = 5;
const SEPARATOR = 16;
const MIN_WORDS = 36;
/** How long a long press shows a part's full words. */
const PEEK_MS = 2500;

type Part = {
  id: string;
  glyph: GlyphName;
  star: boolean;
  prefix: string | null;
  label: string;
  muted: boolean;
  /** The part's full words, for a long press and the screen reader. */
  full: string;
  onPress: (() => void) | null;
};

/**
 * The core's menu rows with their `glyph` turned into the `iconPath` the menu sheet draws, and a
 * heading before each new `section` (This folder's branch list: Recent, Local, Remote).
 */
function menuRows(rows: { [key: string]: unknown }[] | null | undefined): MenuRow[] {
  const drawn: MenuRow[] = [];
  let section: string | null = null;
  for (const row of rows ?? []) {
    if (typeof row.section === 'string' && row.section.length > 0 && row.section !== section) {
      section = row.section;
      drawn.push({ heading: true, label: section });
    }
    drawn.push(typeof row.glyph === 'string' ? { ...row, iconPath: `titlebar/${row.glyph}.svg` } : row);
  }
  return drawn;
}

/** The search the detail part's list gets: branches and worktrees can run long. */
function detailSearch(detail: NonNullable<Tray['detail']>): MenuSearch | null {
  switch (detail.kind) {
    case 'folderBranch':
      return { placeholder: 'Search branches', create: detail.create ?? null };
    case 'baseBranch':
      return { placeholder: 'Search branches' };
    case 'worktree':
      return { placeholder: 'Search worktrees' };
    default:
      return null;
  }
}

function glyphName(name: string | undefined, fallback: GlyphName): GlyphName {
  const known: GlyphName[] = ['folder-open', 'git-fork', 'stack', 'cloud', 'star-filled', 'git-branch', 'folder'];
  return known.find((glyph) => glyph === name) ?? fallback;
}

export function WorktreeTray({
  tray,
  openRows,
  runCommand,
  retry,
  projectLabel,
  openProjects,
  machineLabel,
  openMachines,
  noProject = false,
}: {
  tray: Tray;
  /** Opens the composer's menu sheet with these rows, and a search over them. */
  openRows: (title: string, rows: MenuRow[], search?: MenuSearch | null) => void;
  /** Runs a core command (the folder switch prompt's buttons). */
  runCommand: (command: MenuRow) => void;
  /** Sends the box's text again (Try again after a failure). */
  retry: () => void;
  /** The project part's words, or null while the tray can't offer one. */
  projectLabel: string | null;
  /** Opens the project list. */
  openProjects: () => void;
  /** The computer part's words, or null while there is one computer to run on. */
  machineLabel: string | null;
  /** Opens the machines that have the project. */
  openMachines: () => void;
  /** No project pill is toggled on: hides project/where/detail, leaving only the computer picker. */
  noProject?: boolean;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const status = tray.status;
  const busy = tray.busy;
  const [available, setAvailable] = useState(0);
  const [sizes, setSizes] = useState<Record<string, { part: number; words: number }>>({});
  const [peek, setPeek] = useState<string | null>(null);
  useEffect(() => {
    if (peek === null) return;
    const timer = setTimeout(() => setPeek(null), PEEK_MS);
    return () => clearTimeout(timer);
  }, [peek]);

  const place: Part[] = [];
  if (!noProject && projectLabel !== null) {
    place.push({
      id: 'project',
      glyph: 'folder',
      star: false,
      prefix: null,
      label: projectLabel,
      muted: false,
      full: `Project: ${projectLabel}`,
      onPress: openProjects,
    });
  }
  if (machineLabel !== null && (noProject || projectLabel !== null)) {
    place.push({
      id: 'machine',
      glyph: 'device-desktop',
      star: false,
      prefix: null,
      label: machineLabel,
      muted: false,
      full: `Computer: ${machineLabel}`,
      onPress: openMachines,
    });
  }
  const choice: Part[] = [];
  const where = noProject ? null : tray.where;
  if (where) {
    choice.push({
      id: 'where',
      glyph: glyphName(where.glyph, 'folder-open'),
      star: false,
      prefix: null,
      label: where.label,
      muted: false,
      full: `Where it runs: ${where.label}`,
      onPress: () => openRows('Where it runs', menuRows(where.menu)),
    });
  }
  const detail = noProject ? null : tray.detail;
  if (detail) {
    const menu = detail.menu;
    choice.push({
      id: 'detail',
      glyph: glyphName(detail.glyph, 'git-branch'),
      star: detail.star === true,
      prefix: detail.prefix ?? null,
      label: detail.label,
      muted: menu === null || detail.placeholder === true,
      full: detail.tooltip ?? detail.label,
      onPress:
        menu === null ? null : () => openRows(detail.menuTitle ?? detail.label, menuRows(menu), detailSearch(detail)),
    });
  }
  const rows: [Part[], Part[]] = [place, choice];
  const keyOf = (part: Part): string => `${part.id}\u0000${part.prefix ?? ''}\u0000${part.label}`;
  const measuredAll = rows.flat().every((part) => (sizes[keyOf(part)]?.part ?? 0) > 0);
  const partSizes = rows.map((row) =>
    row.map((part): PartSize => {
      const size = sizes[keyOf(part)] ?? { part: 0, words: 0 };
      return { natural: size.part, min: size.part - size.words + Math.min(size.words, MIN_WORDS) };
    }),
  ) as [PartSize[], PartSize[]];
  const layout = trayLayout(partSizes, SEPARATOR, measuredAll ? available : 0, NARROW_WIDTH);
  const note = (key: string, field: 'part' | 'words', width: number): void =>
    setSizes((before) => {
      const current = before[key] ?? { part: 0, words: 0 };
      const rounded = Math.ceil(width);
      return current[field] === rounded ? before : { ...before, [key]: { ...current, [field]: rounded } };
    });

  const drawPart = (part: Part, width: number | null): ReactElement => (
    <Pressable
      key={part.id}
      accessibilityRole="button"
      accessibilityLabel={part.full}
      accessibilityState={{ disabled: busy || part.onPress === null }}
      disabled={busy}
      onPress={part.onPress ?? (() => setPeek(part.full))}
      onLongPress={() => setPeek(part.full)}
      style={({ pressed }) => [styles.part, width !== null ? { width } : null, pressed ? styles.pressed : null]}
    >
      <Glyph name={part.glyph} size={ICON} color={part.star ? STAR : P.muted} />
      {part.prefix !== null ? <Text style={styles.prefix}>{part.prefix}</Text> : null}
      <Text style={[styles.label, part.muted ? styles.labelMuted : null]} numberOfLines={1} ellipsizeMode="tail">
        {part.label}
      </Text>
    </Pressable>
  );
  const separator = (key: string): ReactElement => (
    <View key={key} style={styles.separator}>
      <Glyph name="chevron-right" size={12} color={P.muted} />
    </View>
  );
  /** The width a part is drawn at: its own while whole, the layout's when cut. */
  const cutWidth = (row: number, index: number): number | null => {
    const width = layout.widths[row][index];
    const natural = partSizes[row][index]?.natural ?? 0;
    return width !== undefined && measuredAll && width + 0.5 < natural ? width : null;
  };

  let breadcrumb: ReactElement | null = null;
  if (place.length + choice.length > 0) {
    if (layout.twoRows) {
      const gridWidth = layout.columns.reduce((total, width) => total + width, 0) + SEPARATOR * (layout.columns.length - 1);
      // CDXC:NewSession 2026-11-24 DECISION: User: "Also on phone don't center the row for picking
      // machine branch etc make it align left like always". Keep the phone tray left-aligned.
      breadcrumb = (
        <View style={styles.grid}>
          {rows
            .filter((row) => row.length > 0)
            .map((row) => {
              const rowIndex = row === place ? 0 : 1;
              return (
                <View key={rowIndex} style={[styles.row, { width: gridWidth }]}>
                  {row.flatMap((part, index) => [
                    ...(index > 0 ? [separator(`sep-${part.id}`)] : []),
                    <View key={`cell-${part.id}`} style={[styles.cell, { width: layout.columns[index] }]}>
                      {drawPart(part, cutWidth(rowIndex, index))}
                    </View>,
                  ])}
                </View>
              );
            })}
        </View>
      );
    } else {
      const parts = [...place.map((part, index) => ({ part, row: 0, index })), ...choice.map((part, index) => ({ part, row: 1, index }))];
      breadcrumb = (
        <View style={styles.row}>
          {parts.flatMap(({ part, row, index }, at) => [
            ...(at > 0 ? [separator(`sep-${part.id}`)] : []),
            drawPart(part, cutWidth(row, index)),
          ])}
        </View>
      );
    }
  }

  const hasStatusLine = status?.state === 'creating' || status?.state === 'opened' || status?.state === 'failed';
  const hasCloudCard = status !== null && status.state !== 'failed' && Boolean(status.card);
  if (breadcrumb === null && peek === null && !hasStatusLine && !tray.folderPrompt && !hasCloudCard) {
    return null;
  }

  return (
    <View style={styles.tray}>
      <View
        accessibilityLabel="Where this chat runs"
        style={[styles.content, busy ? styles.busy : null]}
        onLayout={(event: LayoutChangeEvent) => setAvailable(Math.floor(event.nativeEvent.layout.width))}
      >
        {breadcrumb}
        {/* Each part measured whole, off screen, for the layout. */}
        <View style={styles.measure} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {rows.flat().map((part) => (
            <View
              key={keyOf(part)}
              style={styles.part}
              onLayout={(event: LayoutChangeEvent) => note(keyOf(part), 'part', event.nativeEvent.layout.width)}
            >
              <Glyph name={part.glyph} size={ICON} color={P.muted} />
              {part.prefix !== null ? <Text style={styles.prefix}>{part.prefix}</Text> : null}
              <Text
                style={styles.label}
                numberOfLines={1}
                onLayout={(event: LayoutChangeEvent) => note(keyOf(part), 'words', event.nativeEvent.layout.width)}
              >
                {part.label}
              </Text>
            </View>
          ))}
        </View>
      </View>
      {peek !== null ? (
        <Text style={styles.peek} numberOfLines={3}>
          {peek}
        </Text>
      ) : null}
      {status?.state === 'creating' || status?.state === 'opened' ? (
        <View style={styles.status}>
          <Glyph name="loader" size={13} color={P.muted} />
          <Text style={styles.statusText} numberOfLines={1}>
            {status.label}
          </Text>
        </View>
      ) : null}
      {status?.state === 'failed' ? (
        <View style={styles.status}>
          <Glyph name="alert-triangle" size={13} color={P.error} />
          <Text style={[styles.statusText, { color: P.error }]} numberOfLines={2}>
            {status.message}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Try again"
            onPress={retry}
            style={({ pressed }) => [styles.part, pressed ? styles.pressed : null]}
          >
            <Text style={styles.label}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
      {tray.folderPrompt ? (
        <View style={styles.prompt}>
          <View style={styles.promptLine}>
            <Glyph
              name={tray.folderPrompt.tone === 'busy' ? 'loader' : tray.folderPrompt.tone === 'done' ? 'check' : 'alert-triangle'}
              size={13}
              color={tray.folderPrompt.tone === 'error' ? P.error : P.muted}
            />
            <Text style={[styles.statusText, tray.folderPrompt.tone === 'error' ? { color: P.error } : null]} numberOfLines={3}>
              {tray.folderPrompt.message}
            </Text>
          </View>
          {tray.folderPrompt.actions.length > 0 ? (
            <View style={styles.promptActions}>
              {tray.folderPrompt.actions.map((action, index) => (
                <Pressable
                  key={action.label}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  onPress={() => runCommand(action.command)}
                  style={({ pressed }) => [styles.part, pressed ? styles.pressed : null]}
                >
                  <Text style={[styles.label, index === 0 ? styles.promptFirst : null]}>{action.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
      {status !== null && status.state !== 'failed' && status.card ? <CloudBoxCardView card={status.card} /> : null}
    </View>
  );
}

const useStyles = themedStyles((P) => ({
  /**
   * Part of the message box, like desktop's `worktree_tray.rs`: the box's own fill and border, ending
   * exactly on its top edge (the root's 8pt gap) so the two fills never stack, inset by the box's 22pt
   * corner radius so its sides meet the straight part of that edge.
   */
  tray: {
    gap: 2,
    marginHorizontal: 22,
    marginBottom: -8,
    paddingHorizontal: 8,
    paddingTop: 5,
    paddingBottom: 6,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: P.composerBorder,
    backgroundColor: P.composerBackground,
  },
  content: { alignSelf: 'stretch' },
  busy: { opacity: 0.6 },
  grid: { gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center' },
  cell: { flexDirection: 'row' },
  separator: { width: SEPARATOR, alignItems: 'center' },
  part: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: GAP,
    height: 28,
    paddingHorizontal: PART_PADDING,
    borderRadius: 6,
    flexShrink: 0,
  },
  pressed: { backgroundColor: P.border },
  prefix: { color: P.muted, fontSize: 13 },
  label: { color: P.primary, fontSize: 13, flexShrink: 1 },
  labelMuted: { color: P.muted },
  /** Laid out at full size but never seen or touched: only its widths are read. */
  measure: { position: 'absolute', top: 0, left: 0, flexDirection: 'row', opacity: 0, width: 4000 },
  peek: { color: P.primary, fontSize: 12.5, paddingHorizontal: PART_PADDING },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: PART_PADDING },
  statusText: { color: P.muted, fontSize: 12.5, flexShrink: 1 },
  prompt: { gap: 2, paddingHorizontal: PART_PADDING },
  promptLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingTop: 2 },
  promptActions: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -PART_PADDING },
  promptFirst: { fontWeight: '600' },
}));
