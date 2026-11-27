/**
 * The glyph for every icon id a session menu names (the layout's, packages/gx-core/src/sidebar_menu/layout.rs, and the
 * rows inside its submenus: Copy, Tag As, Link to, Coordinator…), drawn the same in the three phone menus that show
 * them: the long-press card (screens/sessions-screen/sidebar-menu-view.tsx), the terminal's ⋯ (the same card) and the
 * chat's ⋯ sheet (chat/native/composer/MenuSheet.tsx, for the ids its own glyphs lack).
 */

import type { ReactElement } from 'react';
import Svg, { Path } from 'react-native-svg';

import { COMMAND_ICONS, TAG_ICONS } from '../assets/tablerIcons.generated';
import { AlarmGlyph } from '../components/sessions/unified/glyphs';
import {
  ArchiveGlyph,
  ArrowGlyph,
  AxeGlyph,
  BookGlyph,
  BoxGlyph,
  BriefcaseGlyph,
  ChevronLeftGlyph,
  CircleCheckGlyph,
  CircleDotGlyph,
  ClockGlyph,
  CoordinatorGlyph,
  CopyGlyph,
  CrewGlyph,
  DotsGlyph,
  EyeGlyph,
  FileExportGlyph,
  FolderGlyph,
  GitBranchGlyph,
  GitForkGlyph,
  GitPullRequestGlyph,
  HashGlyph,
  HeadsetGlyph,
  InfoGlyph,
  LinkGlyph,
  MessageCircleGlyph,
  NoteGlyph,
  PencilGlyph,
  PinnedGlyph,
  PinnedOffGlyph,
  PlayGlyph,
  PlusGlyph,
  RefreshGlyph,
  RotateClockwiseGlyph,
  SearchGlyph,
  SettingsGlyph,
  SleepGlyph,
  SparklesGlyph,
  StackPushGlyph,
  TagGlyph,
  TagOffGlyph,
  TerminalGlyph,
  UnlinkGlyph,
  WorldGlyph,
  XGlyph,
  type GlyphProps,
} from '../components/sessions/icons';
import { PaperclipIcon } from '../components/terminal/icons';
import { BUILTIN_TAG_ICON_IDS } from '../screens/sessions-screen/sidebar-menus';

/** A stroked Tabler glyph from the paths of the desktop's `titlebar/<id>.svg`. */
function strokeGlyph(paths: readonly string[], strokeWidth = 1.8): (props: GlyphProps) => ReactElement {
  return function StrokeGlyph({ size, color }: GlyphProps) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        {paths.map((d) => (
          <Path key={d} d={d} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </Svg>
    );
  };
}

const PinOutlineGlyph = strokeGlyph([
  'M15 4.5l-4 4l-4 1.5l-1.5 1.5l7 7l1.5 -1.5l1.5 -4l4 -4',
  'M9 15l-4.5 4.5',
  'M14.5 4l5.5 5.5',
]);

function PinFilledGlyph({ size, color }: GlyphProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15.113 3.21l.094 .083l5.5 5.5a1 1 0 0 1 -1.175 1.59l-3.172 3.171l-1.424 3.797a1 1 0 0 1 -.158 .277l-.07 .08l-1.5 1.5a1 1 0 0 1 -1.32 .082l-.095 -.083l-2.793 -2.792l-3.793 3.792a1 1 0 0 1 -1.497 -1.32l.083 -.094l3.792 -3.793l-2.792 -2.793a1 1 0 0 1 -.083 -1.32l.083 -.094l1.5 -1.5a1 1 0 0 1 .258 -.187l.098 -.042l3.796 -1.425l3.171 -3.17a1 1 0 0 1 1.497 -1.26z"
        fill={color}
      />
    </Svg>
  );
}

// Move to project (`titlebar/folders.svg`).
const FoldersGlyph = strokeGlyph([
  'M9 3h3l2 2h5a2 2 0 0 1 2 2v7a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2',
  'M17 16v2a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2h2',
]);
const SwitchHorizontalGlyph = strokeGlyph(['M16 3l4 4l-4 4', 'M10 7l10 0', 'M8 13l-4 4l4 4', 'M4 17l9 0']);
const ClockCheckGlyph = strokeGlyph(['M20.942 13.021a9 9 0 1 0 -9.407 7.967', 'M12 7v5l3 3', 'M15 19l2 2l4 -4']);
const PlayerStopGlyph = strokeGlyph([
  'M5 7a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2l0 -10',
]);
const HistoryGlyph = strokeGlyph(['M12 8v4l3 2', 'M3.05 11a9 9 0 1 1 2.64 6.36', 'M3 17v-6h6']);
const EditGlyph = strokeGlyph([
  'M7 7h-1a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-1',
  'M20.385 6.585a2.1 2.1 0 0 0 -2.97 -2.97l-8.415 8.385v3h3l8.415 -8.415',
  'M16 5l3 3',
]);
const PlugXGlyph = strokeGlyph([
  'M13.55 17.733a5.806 5.806 0 0 1 -7.356 -4.052a5.81 5.81 0 0 1 1.537 -5.627l2.054 -2.054l7.165 7.165',
  'M4 20l3.5 -3.5',
  'M15 4l-3.5 3.5',
  'M20 9l-3.5 3.5',
  'M16 16l4 4',
  'M20 16l-4 4',
]);
const ExternalLinkGlyph = strokeGlyph([
  'M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6',
  'M11 13l9 -9',
  'M15 4h5v5',
]);

function ArrowUpGlyph(props: GlyphProps) {
  return <ArrowGlyph {...props} direction="up" />;
}

function ArrowDownGlyph(props: GlyphProps) {
  return <ArrowGlyph {...props} direction="down" />;
}

function PaperclipGlyph({ size, color }: GlyphProps) {
  return <PaperclipIcon size={size} color={color} />;
}

/** Every icon id a session menu names, to its glyph. */
const SESSION_MENU_GLYPHS: Readonly<Record<string, (props: GlyphProps) => ReactElement>> = {
  alarm: AlarmGlyph,
  archive: ArchiveGlyph,
  'arrow-down': ArrowDownGlyph,
  'arrow-up': ArrowUpGlyph,
  axe: AxeGlyph,
  book: BookGlyph,
  box: BoxGlyph,
  brain: COMMAND_ICONS.brain,
  briefcase: BriefcaseGlyph,
  checklist: COMMAND_ICONS.checklist,
  'chevron-left': ChevronLeftGlyph,
  'circle-check': CircleCheckGlyph,
  'circle-dot': CircleDotGlyph,
  clock: ClockGlyph,
  'clock-check': ClockCheckGlyph,
  // An older chat core names the captain's hat (or its small copy) for the same row.
  'coordinator-captain-hat': CoordinatorGlyph,
  'coordinator-captain-hat-small': CoordinatorGlyph,
  'coordinator-crown-points': CoordinatorGlyph,
  copy: CopyGlyph,
  dots: DotsGlyph,
  edit: EditGlyph,
  'external-link': ExternalLinkGlyph,
  eye: EyeGlyph,
  'file-diff': COMMAND_ICONS.fileDiff,
  'file-export': FileExportGlyph,
  folder: FolderGlyph,
  folders: FoldersGlyph,
  'git-branch': GitBranchGlyph,
  'git-fork': GitForkGlyph,
  'git-pull-request': GitPullRequestGlyph,
  hash: HashGlyph,
  headset: HeadsetGlyph,
  history: HistoryGlyph,
  'info-circle': InfoGlyph,
  link: LinkGlyph,
  'message-circle': MessageCircleGlyph,
  moon: SleepGlyph,
  note: NoteGlyph,
  paperclip: PaperclipGlyph,
  pencil: PencilGlyph,
  'pin-filled': PinFilledGlyph,
  'pin-outline': PinOutlineGlyph,
  pinned: PinnedGlyph,
  'pinned-off': PinnedOffGlyph,
  'player-play': PlayGlyph,
  'player-stop': PlayerStopGlyph,
  'plug-x': PlugXGlyph,
  plus: PlusGlyph,
  refresh: RefreshGlyph,
  'rotate-clockwise': RotateClockwiseGlyph,
  search: SearchGlyph,
  settings: SettingsGlyph,
  sparkles: SparklesGlyph,
  'stack-push': StackPushGlyph,
  'switch-horizontal': SwitchHorizontalGlyph,
  tag: TagGlyph,
  'tag-off': TagOffGlyph,
  terminal: TerminalGlyph,
  'terminal-2': TerminalGlyph,
  unlink: UnlinkGlyph,
  'users-group': CrewGlyph,
  world: WorldGlyph,
  x: XGlyph,
};

/** Whether a session menu can draw this icon id. */
export function hasSessionMenuGlyph(icon: string): boolean {
  return SESSION_MENU_GLYPHS[icon] !== undefined;
}

/** Built-in tag glyph id → the tag value TAG_ICONS is keyed by. */
const TAG_VALUE_BY_ICON_ID: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(BUILTIN_TAG_ICON_IDS).map(([tag, icon]) => [icon, tag]),
);

/**
 * The glyph for a menu row's icon id. A tag row carries its tag's colour (`iconColor`) and its tag's own glyph; every
 * other row, danger rows included, draws its icon in the menu foreground like the desktop does.
 */
export function sessionMenuIcon(
  icon: string | undefined,
  options: { size: number; color: string; iconColor?: string },
): ReactElement | undefined {
  if (icon === undefined || icon.length === 0) return undefined;
  const color = options.iconColor ?? options.color;
  if (options.iconColor !== undefined) {
    const tagValue = TAG_VALUE_BY_ICON_ID[icon];
    const TagIcon = tagValue === undefined ? undefined : TAG_ICONS[tagValue];
    if (TagIcon !== undefined) return <TagIcon size={options.size} color={color} strokeWidth={1.9} />;
    const CustomIcon = COMMAND_ICONS[icon];
    if (CustomIcon !== undefined) return <CustomIcon size={options.size} color={color} strokeWidth={1.9} />;
  }
  const Glyph = SESSION_MENU_GLYPHS[icon];
  return Glyph === undefined ? undefined : <Glyph size={options.size} color={color} />;
}
