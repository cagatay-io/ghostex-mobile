/**
 * A work-mode session card's second line of chips (./workChipModel.ts holds what they show): borderless
 * glyph + label pairs under the title, like the desktop's
 * apps/desktop/src/app/native_sidebar/work_chips.rs.
 *
 * CDXC:WorkMode 2026-10-09 DECISION:
 * User: in work mode a session linked to a PR, issue or Linear project gets a second line of borderless chips (PR with state and checks, issue with status); clicking one opens it; sessions with no links stay one line. On the phone a tap opens the link, a long press copies it (the phone has no hover, so a pressed chip underlines instead), and the merged-PR offer's Clean up / Keep chips answer it.
 */

import { useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';

import { linkChipsThatFit } from '../../chat/native/sessionLinks';
import { SidebarPalette } from '../../theme/palette';
import { ds } from './rows';
import type { WorkChip, WorkChipGlyph } from './workChipModel';

/** The chip line's height under the 34dp first line; the card is 52dp, leaving 2dp below it. */
export const WORK_CHIP_LINE_HEIGHT = 16;
/** A session card with a chip line (desktop session_list.rs `WORK_SESSION_HEIGHT`). */
export const WORK_SESSION_ROW_HEIGHT = 52;

const GLYPH_SIZE = 12;

/** The desktop's chip glyphs (apps/desktop/assets/titlebar/*.svg), 24-unit Tabler artwork. */
export function ChipGlyph({ glyph, color, size }: { glyph: WorkChipGlyph; color: string; size: number }): ReactElement {
  const stroke = { stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const ring = <Path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" {...stroke} />;
  let body: ReactElement;
  switch (glyph) {
    case 'pullRequest':
      body = (
        <>
          <Path d="M4 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" {...stroke} />
          <Path d="M4 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" {...stroke} />
          <Path d="M16 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" {...stroke} />
          <Path d="M6 8l0 8" {...stroke} />
          <Path d="M11 6h5a2 2 0 0 1 2 2v8" {...stroke} />
          <Path d="M14 9l-3 -3l3 -3" {...stroke} />
        </>
      );
      break;
    case 'branch':
      body = (
        <>
          <Path d="M5 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" {...stroke} />
          <Path d="M5 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" {...stroke} />
          <Path d="M15 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" {...stroke} />
          <Path d="M7 8l0 8" {...stroke} />
          <Path d="M9 18h6a2 2 0 0 0 2 -2v-5" {...stroke} />
          <Path d="M14 14l3 -3l3 3" {...stroke} />
        </>
      );
      break;
    case 'github':
      body = (
        <Path
          d="M9 19c-4.3 1.4 -4.3 -2.5 -6 -3m12 5v-3.5c0 -1 .1 -1.4 -.5 -2c2.8 -.3 5.5 -1.4 5.5 -6a4.6 4.6 0 0 0 -1.3 -3.2a4.2 4.2 0 0 0 -.1 -3.2s-1.1 -.3 -3.5 1.3a12.3 12.3 0 0 0 -6.2 0c-2.4 -1.6 -3.5 -1.3 -3.5 -1.3a4.2 4.2 0 0 0 -.1 3.2a4.6 4.6 0 0 0 -1.3 3.2c0 4.6 2.7 5.7 5.5 6c-.6 .6 -.6 1.2 -.5 2v3.5"
          {...stroke}
        />
      );
      break;
    case 'linearLogo':
      // The Linear mark (apps/desktop/assets/titlebar/brand-linear.svg), drawn in its -2..26 box.
      body = (
        <G transform="translate(1.714 1.714) scale(0.857)">
          <Path
            d="M2.886 4.18A11.982 11.982 0 0 1 11.99 0C18.624 0 24 5.376 24 12.009c0 3.64-1.62 6.903-4.18 9.105L2.887 4.18ZM1.817 5.626l16.556 16.556c-.524.33-1.075.62-1.65.866L.951 7.277c.247-.575.537-1.126.866-1.65ZM.322 9.163l14.515 14.515c-.71.172-1.443.282-2.195.322L0 11.358a12 12 0 0 1 .322-2.195Zm-.17 4.862 9.823 9.824a12.02 12.02 0 0 1-9.824-9.824Z"
            fill={color}
          />
        </G>
      );
      break;
    case 'pin':
      // The outline twin of `pinFilled` (apps/desktop/assets/titlebar/pin-outline.svg).
      body = (
        <>
          <Path d="M15 4.5l-4 4l-4 1.5l-1.5 1.5l7 7l1.5 -1.5l1.5 -4l4 -4" {...stroke} />
          <Path d="M9 15l-4.5 4.5" {...stroke} />
          <Path d="M14.5 4l5.5 5.5" {...stroke} />
        </>
      );
      break;
    case 'pinFilled':
      body = (
        <Path
          d="M15.113 3.21l.094 .083l5.5 5.5a1 1 0 0 1 -1.175 1.59l-3.172 3.171l-1.424 3.797a1 1 0 0 1 -.158 .277l-.07 .08l-1.5 1.5a1 1 0 0 1 -1.32 .082l-.095 -.083l-2.793 -2.792l-3.793 3.792a1 1 0 0 1 -1.497 -1.32l.083 -.094l3.792 -3.793l-2.792 -2.793a1 1 0 0 1 -.083 -1.32l.083 -.094l1.5 -1.5a1 1 0 0 1 .258 -.187l.098 -.042l3.796 -1.425l3.171 -3.17a1 1 0 0 1 1.497 -1.26z"
          fill={color}
        />
      );
      break;
    case 'restore':
      body = (
        <>
          <Path d="M9 14l-4 -4l4 -4" {...stroke} />
          <Path d="M5 10h11a4 4 0 1 1 0 8h-1" {...stroke} />
        </>
      );
      break;
    case 'merged':
      body = (
        <>
          <Path d="M5 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" {...stroke} />
          <Path d="M5 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" {...stroke} />
          <Path d="M15 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" {...stroke} />
          <Path d="M7 8l0 8" {...stroke} />
          <Path d="M7 8a4 4 0 0 0 4 4h4" {...stroke} />
        </>
      );
      break;
    case 'checksPassing':
    case 'issueClosed':
      body = (
        <>
          {ring}
          <Path d="M9 12l2 2l4 -4" {...stroke} />
        </>
      );
      break;
    case 'checksFailing':
    case 'linearCanceled':
      body = (
        <>
          {ring}
          <Path d="M10 10l4 4m0 -4l-4 4" {...stroke} />
        </>
      );
      break;
    case 'checksPending':
      body = <Path d="M12 3a9 9 0 1 0 9 9" {...stroke} />;
      break;
    case 'issueOpen':
      body = (
        <>
          {ring}
          <Path d="M9.5 12a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0" {...stroke} fill={color} />
        </>
      );
      break;
    case 'linearStarted':
      body = (
        <>
          {ring}
          <Path d="M12 7a5 5 0 0 1 0 10z" fill={color} />
        </>
      );
      break;
    case 'linearReview':
      body = (
        <>
          {ring}
          <Path d="M12 12l0 -5a5 5 0 1 1 -5 5z" fill={color} />
        </>
      );
      break;
    case 'linearDone':
      body = (
        <Path
          d="M17 3.34a10 10 0 1 1 -14.995 8.984l-.005 -.324l.005 -.324a10 10 0 0 1 14.995 -8.336zm-1.293 5.953a1 1 0 0 0 -1.32 -.083l-.094 .083l-3.293 3.292l-1.293 -1.292l-.094 -.083a1 1 0 0 0 -1.403 1.403l.083 .094l2 2l.094 .083a1 1 0 0 0 1.226 0l.094 -.083l4 -4l.083 -.094a1 1 0 0 0 -.083 -1.32z"
          fill={color}
        />
      );
      break;
    case 'linearBacklog':
      body = (
        <>
          <Path d="M8.56 3.69a9 9 0 0 0 -2.92 1.95" {...stroke} />
          <Path d="M3.69 8.56a9 9 0 0 0 -.69 3.44" {...stroke} />
          <Path d="M3.69 15.44a9 9 0 0 0 1.95 2.92" {...stroke} />
          <Path d="M8.56 20.31a9 9 0 0 0 3.44 .69" {...stroke} />
          <Path d="M15.44 20.31a9 9 0 0 0 2.92 -1.95" {...stroke} />
          <Path d="M20.31 15.44a9 9 0 0 0 .69 -3.44" {...stroke} />
          <Path d="M20.31 8.56a9 9 0 0 0 -1.95 -2.92" {...stroke} />
          <Path d="M15.44 3.69a9 9 0 0 0 -3.44 -.69" {...stroke} />
        </>
      );
      break;
    case 'linearCircle':
      body = <Circle cx={12} cy={12} r={6} stroke={color} strokeWidth={2.4} />;
      break;
    case 'linearProject':
      body = (
        <>
          <Path d="M12 3l8 4.5l0 9l-8 4.5l-8 -4.5l0 -9l8 -4.5" {...stroke} />
          <Path d="M12 12l8 -4.5" {...stroke} />
          <Path d="M12 12l0 9" {...stroke} />
          <Path d="M12 12l-8 -4.5" {...stroke} />
        </>
      );
      break;
    case 'cleanUp':
      body = (
        <>
          <Path d="M3 6a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2" {...stroke} />
          <Path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-10" {...stroke} />
          <Path d="M10 12l4 0" {...stroke} />
        </>
      );
      break;
    case 'keep':
      body = <Path d="M18 6l-12 12M6 6l12 12" {...stroke} />;
      break;
    case 'link':
      body = (
        <>
          <Path d="M9 15l6 -6" {...stroke} />
          <Path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464" {...stroke} />
          <Path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463" {...stroke} />
        </>
      );
      break;
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {body}
    </Svg>
  );
}

export type WorkChipActions = {
  /** A chip with a link was tapped. */
  openLink: (url: string) => void;
  /** A chip with a link was long-pressed. */
  copyLink: (url: string) => void;
  /** Clean up or Keep was tapped. */
  answerCleanup: (answer: 'cleanUp' | 'keep') => void;
};

export default function WorkChips({
  chips,
  paddingLeft,
  actions,
  overflow = 0,
  fitLinks,
}: {
  chips: readonly WorkChip[];
  /** Lines the chips up under the title. */
  paddingLeft: number;
  actions: WorkChipActions;
  /** Links left out of a session links line: drawn as "+N" after the chips. */
  overflow?: number;
  /**
   * A session links line: the chips that fit the line's width show, the rest (and `neverShown`)
   * go into "+N". The chips, the pill and the line are measured as they lay out.
   *
   * CDXC:SessionLinks 2026-10-24 WHY: The desktop line's "+N" ran past the card's edge ("stuff is
   * cut off here fam"); the phone showed a fixed three chips the same way, so it measures too.
   */
  fitLinks?: { neverShown: number };
}) {
  const [lineWidth, setLineWidth] = useState(0);
  const [chipWidths, setChipWidths] = useState<Record<string, number>>({});
  const [pillWidth, setPillWidth] = useState(0);
  let shown = chips.length;
  let more = overflow;
  if (fitLinks !== undefined) {
    const widths = chips.map((chip) => chipWidths[chip.key]);
    if (lineWidth > 0 && pillWidth > 0 && widths.every((width) => width !== undefined)) {
      shown = linkChipsThatFit(
        widths as number[],
        fitLinks.neverShown,
        lineWidth - paddingLeft - ds(6),
        ds(10),
        () => pillWidth,
      );
    }
    more = chips.length - shown + fitLinks.neverShown;
  }
  return (
    <View
      style={[styles.line, { paddingLeft }]}
      onLayout={fitLinks !== undefined ? (event) => setLineWidth(event.nativeEvent.layout.width) : undefined}
    >
      {chips.map((chip, index) => {
        const answer = chip.cleanupAnswer;
        const url = chip.url;
        const pressable = answer !== undefined || url.length > 0;
        return (
          <Pressable
            key={chip.key}
            accessibilityRole={answer !== undefined ? 'button' : 'link'}
            accessibilityLabel={chip.description}
            accessibilityHint={url.length > 0 ? 'Touch and hold to copy the link' : undefined}
            disabled={!pressable}
            hitSlop={{ top: ds(4), bottom: ds(4), left: ds(4), right: ds(4) }}
            onPress={() => {
              if (answer !== undefined) actions.answerCleanup(answer);
              else if (url.length > 0) actions.openLink(url);
            }}
            onLongPress={url.length > 0 ? () => actions.copyLink(url) : undefined}
            onLayout={
              fitLinks !== undefined
                ? (event) => {
                    const width = event.nativeEvent.layout.width;
                    setChipWidths((known) => (known[chip.key] === width ? known : { ...known, [chip.key]: width }));
                  }
                : undefined
            }
            // A chip that does not fit is still laid out, out of sight, so its width stays known.
            style={[styles.chip, index >= shown && styles.measureOnly]}
            importantForAccessibility={index >= shown ? 'no-hide-descendants' : 'auto'}
          >
            {({ pressed }) => (
              <>
                <ChipGlyph glyph={chip.glyph} color={chip.glyphColor} size={ds(GLYPH_SIZE)} />
                <Text numberOfLines={1} style={[styles.label, pressed ? styles.labelPressed : null]}>
                  {chip.label}
                </Text>
                {chip.trailing !== undefined ? (
                  <ChipGlyph glyph={chip.trailing.glyph} color={chip.trailing.color} size={ds(GLYPH_SIZE)} />
                ) : null}
              </>
            )}
          </Pressable>
        );
      })}
      {more > 0 ? <Text style={styles.overflow}>{`+${more}`}</Text> : null}
      {fitLinks !== undefined ? (
        // The pill's room, sized for the widest count it can show.
        <View
          style={styles.measureOnly}
          onLayout={(event) => setPillWidth(event.nativeEvent.layout.width)}
          importantForAccessibility="no-hide-descendants"
        >
          <Text style={styles.overflow}>{`+${chips.length + fitLinks.neverShown}`}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    height: ds(WORK_CHIP_LINE_HEIGHT),
    flexDirection: 'row',
    alignItems: 'center',
    gap: ds(10),
    paddingRight: ds(6),
    overflow: 'hidden',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: ds(3),
  },
  label: {
    color: SidebarPalette.MUTED,
    fontSize: ds(11.5),
    lineHeight: ds(WORK_CHIP_LINE_HEIGHT),
  },
  overflow: {
    color: SidebarPalette.FOREGROUND,
    fontSize: ds(11),
    lineHeight: ds(WORK_CHIP_LINE_HEIGHT),
    flexShrink: 0,
  },
  measureOnly: {
    position: 'absolute',
    opacity: 0,
    pointerEvents: 'none',
  },
  labelPressed: {
    color: SidebarPalette.FOREGROUND,
    textDecorationLine: 'underline',
  },
});
