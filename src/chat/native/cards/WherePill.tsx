/**
 * The where pill in the pill strip (`PillsStrip.tsx`): one pill split by a hairline, the
 * computer's own icon with the project on the left, the branch on the right (a fork in a worktree).
 * A tap or a long press opens its sheet: where the session runs, a tap on a value copies it, and
 * the Folder row has Copy path and Open folder (the project's Files browser, the phone's stand-in
 * for a folder window). gx-chat-core words all of it (`wherePill`,
 * packages/gx-chat-core/src/extras/where_pill.rs, where the user's decision lives). Desktop:
 * `where_pill.rs`.
 *
 * On the phone the strip scrolls horizontally, so the pill stays at its full tier and scrolls with
 * the rest of the pills rather than staying pinned or dropping the project name.
 *
 * CDXC:SessionChat 2026-11-17 DECISION:
 * User (Q3825): the phone gets the where pill too, after checking it on the desktop. A phone has no
 * hover, so a tap or a long press opens the details the desktop shows on hover and click; the actions
 * the phone cannot do are left out.
 *
 * CDXC:SessionChat 2026-11-18 DECISION:
 * User, of the pill reading "Ghostex · This computer | main": "no need to mention the name of the
 * machine here. instead just show the icon of the machine that i set instead of the pc icon shown
 * there on the left". The pill no longer names the computer (its sheet still does); its icon is the
 * computer's own, as the computer tabs draw it (`machines/computerIcons.ts`), and today's plain icon
 * only while that is not known yet.
 */

import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { WherePill as WherePillState, WherePillButton } from '../../rust/document';
import type { UserAction } from '../../rust/actions';
import { ComputerIconGlyph } from '../../../components/sessions/ComputerIconGlyph';
import { FlowerGlyph } from '../../../components/sessions/icons';
import { computerIconDrawing, useComputerIconsStore } from '../../../machines/computerIcons';
import { useServerMachineId } from '../transcript/mentionedSession';
import { Glyph, type GlyphName } from '../composer/icons';
import { Sheet } from '../composer/Sheet';
import { themedStyles, useTranscriptTheme } from '../transcript/theme';

/** How much of the pill shows, widest first. */
export type WhereTier = 'full' | 'short' | 'icon';
export const WHERE_TIERS: readonly WhereTier[] = ['full', 'short', 'icon'];

/** The widest the project and the branch may be at each tier; 0 hides one. */
const CAPS: Record<WhereTier, { project: number; branch: number }> = {
  full: { project: 140, branch: 170 },
  short: { project: 110, branch: 120 },
  icon: { project: 0, branch: 90 },
};

/** The glyphs the core names that the phone draws; anything else falls back to a folder. */
const ROW_GLYPHS: readonly GlyphName[] = [
  'folder',
  'folder-open',
  'git-branch',
  'git-fork',
  'git-commit',
  'git-pull-request',
  'cloud',
  'box',
  'server',
  'device-desktop',
  'user',
  'terminal-2',
  'copy',
  'check',
];

function glyphOf(name: string): GlyphName {
  return (ROW_GLYPHS as readonly string[]).includes(name) ? (name as GlyphName) : 'folder';
}

/** The computer's plain icon, until its own is known: a computer, a Cloud Box's cloud or a box's. */
function machineGlyph(pill: WherePillState): GlyphName {
  switch (pill.machine.kind) {
    case 'cloudBox':
      return 'cloud';
    case 'box':
      return 'box';
    case 'remote':
      return 'server';
    default:
      return 'device-desktop';
  }
}

/** The computer's own icon: the drawing its tabs wear, or null while the phone has not read it. */
function useMachineDrawing(pill: WherePillState): string | null {
  const own = pill.machine.kind === 'this' || pill.machine.kind === 'remote';
  const machineId = useServerMachineId(own ? (pill.machine.serverId ?? '') : '');
  const facts = useComputerIconsStore((state) => (machineId.length > 0 ? state.facts[machineId] : undefined));
  return facts !== undefined ? computerIconDrawing(facts) : null;
}

/** The pill at `tier` (defaults to `full`). */
export function WherePill({
  pill,
  tier = 'full',
  open,
  onPress,
}: {
  pill: WherePillState;
  tier?: WhereTier;
  open: boolean;
  onPress?: () => void;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const caps = CAPS[tier];
  const drawing = useMachineDrawing(pill);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={pill.ariaLabel}
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      onLongPress={onPress}
      disabled={onPress === undefined}
      hitSlop={4}
      style={({ pressed }) => [styles.pill, (pressed || open) && styles.pillPressed]}
    >
      <View style={styles.half}>
        {pill.mainHub === true ? (
          // Main Hub's flower stands for the session's place; its sheet names the computer.
          <FlowerGlyph size={14} color={P.cardMuted} />
        ) : drawing !== null ? (
          <ComputerIconGlyph drawing={drawing} size={14} color={P.cardMuted} />
        ) : (
          <Glyph name={machineGlyph(pill)} size={14} color={P.cardMuted} />
        )}
        {caps.project > 0 ? (
          <Text style={[styles.text, { maxWidth: caps.project }]} numberOfLines={1}>
            {pill.project}
          </Text>
        ) : null}
      </View>
      {pill.branch !== null ? (
        <>
          <View style={styles.hairline} />
          <View style={styles.half}>
            <Glyph name={pill.worktree ? 'git-fork' : 'git-branch'} size={14} color={P.cardMuted} />
            <Text style={[styles.text, { maxWidth: caps.branch }]} numberOfLines={1}>
              {pill.branch}
            </Text>
          </View>
        </>
      ) : null}
    </Pressable>
  );
}

/** How long "Copied" stays beside a value or on Copy path. */
const COPIED_MS = 1400;

/**
 * The pill's sheet: the project and computer as its title, then a row per other fact.
 *
 * CDXC:SessionChat 2026-11-18 DECISION:
 * User: "remove the buttons at the bottom, instead make clicking on different values there copy them
 * also make folder have 2 buttons next to it for copy path and open folder". No bottom actions: a
 * row with something to copy (the core's `copy`) copies it on a tap and says "Copied" in its
 * detail's place for a moment, and the Folder row ends in Copy path and Open folder. Desktop:
 * `where_pill.rs` `where_menu_body`.
 */
export function WhereSheet({
  pill,
  open,
  onClose,
  dispatch,
  onOpenFolder,
}: {
  pill: WherePillState | null | undefined;
  open: boolean;
  onClose: () => void;
  dispatch: (action: UserAction) => void;
  /** Opens the project's Files browser; without it Open folder is left out. */
  onOpenFolder?: () => void;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  const noteCopied = (id: string) => {
    setCopied(id);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), COPIED_MS);
  };
  const copyRow = (id: string) => {
    dispatch({ type: 'wherePill', do: 'copy', row: id } as unknown as UserAction);
    noteCopied(id);
  };
  const press = (button: WherePillButton) => {
    if (button.id === 'openFolder') {
      onClose();
      onOpenFolder?.();
      return;
    }
    dispatch(button.action as UserAction);
    noteCopied(button.id);
  };
  return (
    <Sheet
      visible={open && pill != null}
      onClose={onClose}
      title={pill?.card.title ?? ''}
      subtitle={pill?.card.subtitle ?? ''}
    >
      {pill ? (
        <View style={styles.body}>
          {pill.card.rows.map((row) => {
            const done = copied === row.id;
            // Open folder is the phone's Files browser, where it has one.
            const buttons = (row.buttons ?? []).filter(
              (button) => button.id !== 'openFolder' || onOpenFolder !== undefined,
            );
            const line = (
              <>
                <Glyph name={glyphOf(row.icon)} size={15} color={P.cardMuted} />
                <Text style={styles.rowLabel} numberOfLines={1}>
                  {row.label}
                </Text>
                <View style={styles.rowValue}>
                  <Text style={styles.value} numberOfLines={1}>
                    {row.value}
                  </Text>
                  {done ? (
                    <View style={styles.copied}>
                      <Glyph name="check" size={13} color={P.cardMuted} />
                      <Text style={styles.detail}>Copied</Text>
                    </View>
                  ) : row.detail !== undefined && row.detail.length > 0 ? (
                    <Text style={styles.detail} numberOfLines={1}>
                      {row.detail}
                    </Text>
                  ) : null}
                </View>
              </>
            );
            return (
              <View key={row.id} style={styles.row}>
                {row.copy !== undefined ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Copy ${row.label.toLowerCase()}`}
                    onPress={() => copyRow(row.id)}
                    style={({ pressed }) => [styles.rowLine, pressed && styles.rowPressed]}
                  >
                    {line}
                  </Pressable>
                ) : (
                  <View style={styles.rowLine}>{line}</View>
                )}
                {buttons.map((button) => {
                  const buttonDone = button.id !== 'openFolder' && copied === button.id;
                  return (
                    <Pressable
                      key={button.id}
                      accessibilityRole="button"
                      accessibilityLabel={buttonDone ? 'Copied' : button.label}
                      onPress={() => press(button)}
                      hitSlop={4}
                      style={({ pressed }) => [styles.iconButton, pressed && styles.buttonPressed]}
                    >
                      <Glyph name={buttonDone ? 'check' : glyphOf(button.icon)} size={16} color={P.cardMuted} />
                    </Pressable>
                  );
                })}
              </View>
            );
          })}
        </View>
      ) : null}
    </Sheet>
  );
}

const useStyles = themedStyles((P) => ({
  /** The panel pills' shape (`ChatPills.tsx` `pill`), split in two halves. */
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    height: 25,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: P.ink(0.1),
  },
  pillPressed: {
    backgroundColor: P.ink(0.08),
  },
  half: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  /** The hairline between the halves, the pill's border colour, its full height. */
  hairline: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: P.ink(0.1),
  },
  text: {
    color: P.foreground,
    fontSize: 13,
    lineHeight: 19,
    flexShrink: 1,
  },
  body: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 36,
    borderBottomWidth: 1,
    borderBottomColor: P.ink(0.06),
  },
  /** The tappable part of a row: its icon, label and value. */
  rowLine: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 36,
    borderRadius: 8,
  },
  rowPressed: {
    backgroundColor: P.ink(0.06),
  },
  copied: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 0,
  },
  /** Copy path and Open folder at the end of the Folder row. */
  iconButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  rowLabel: {
    width: 96,
    color: P.cardMuted,
    fontSize: 14,
  },
  rowValue: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  value: {
    flexShrink: 1,
    color: P.foreground,
    fontSize: 14,
  },
  detail: {
    flexShrink: 0,
    maxWidth: 140,
    color: P.cardMuted,
    fontSize: 13,
  },
  buttonPressed: {
    backgroundColor: P.ink(0.1),
  },
}));
