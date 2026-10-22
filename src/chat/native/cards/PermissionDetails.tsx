/**
 * The body of a tool permission card: the file it touches, the command, diff or input, and why the agent's CLI asks.
 * Drawn from the chat core's `approval` on `terminalNotice` (`packages/gx-chat-core/src/questions/permission_card.rs`,
 * which holds the DECISION); port of desktop `permission_card.rs`.
 */

import { Pressable, ScrollView, Text, View } from 'react-native';

import { obj, str } from './json';
import { Glyph } from './icons';
import { toneLook } from './ToneCard';
import { MONO_FONT, themedStyles, useTranscriptTheme } from '../transcript/theme';

/** `#rrggbb` at `alpha`. */
function withAlpha(hex: string, alpha: number): string {
  const value = parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}

/**
 * The card's details, above its choices. A folded card cuts the code to the core's preview; "N more lines" opens the
 * card like its header does.
 */
export function PermissionDetails({
  approval,
  collapsed,
  onExpand,
}: {
  approval: Record<string, unknown>;
  collapsed: boolean;
  onExpand: () => void;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const path = str(approval, 'path');
  const code = str(approval, 'code');
  const preview = str(approval, 'codePreview');
  const folded = collapsed && preview.length > 0;
  const reason = obj(approval.reason);
  const warning = str(reason, 'tone') === 'warning';
  const look = toneLook(warning ? 'warning' : 'info', P.light);
  const hue = look.hue ?? P.muted;
  const label = str(reason, 'label');
  return (
    <View style={styles.column}>
      {path.length > 0 ? <Text style={[styles.mono, styles.path]}>{path}</Text> : null}
      {code.length > 0 ? (
        <View style={styles.well}>
          {folded ? (
            <>
              <Text style={styles.mono}>{preview}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Show the whole command" onPress={onExpand}>
                <Text style={styles.more}>+ {str(approval, 'codeMore')}</Text>
              </Pressable>
            </>
          ) : (
            <ScrollView style={styles.codeScroll} nestedScrollEnabled>
              <Text style={styles.mono} selectable>
                {code}
              </Text>
              {str(approval, 'codeCut').length > 0 ? <Text style={styles.more}>{str(approval, 'codeCut')}</Text> : null}
            </ScrollView>
          )}
        </View>
      ) : null}
      {reason !== null ? (
        <View
          style={[
            styles.reason,
            warning
              ? { borderColor: withAlpha(hue, 0.28), backgroundColor: withAlpha(hue, 0.08) }
              : { borderColor: P.controlBorder },
          ]}
        >
          <View style={styles.reasonIcon}>
            <Glyph name={look.icon} size={14} color={warning ? hue : P.muted} />
          </View>
          <View style={styles.reasonText}>
            {label.length > 0 ? <Text style={styles.reasonLabel}>{label}</Text> : null}
            <Text style={[styles.reasonBody, !warning && { color: P.cardMuted }]}>{str(reason, 'text')}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = themedStyles((P) => ({
  column: {
    gap: 10,
  },
  mono: {
    color: P.foreground,
    fontFamily: MONO_FONT,
    fontSize: 12,
    lineHeight: 17,
  },
  path: {
    color: P.cardMuted,
  },
  well: {
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: P.light ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)',
  },
  codeScroll: {
    maxHeight: 240,
  },
  more: {
    color: P.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  reason: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  reasonIcon: {
    marginTop: 2,
  },
  reasonText: {
    flex: 1,
    minWidth: 0,
  },
  reasonLabel: {
    color: P.foreground,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  reasonBody: {
    color: P.foreground,
    fontSize: 13,
    lineHeight: 18,
  },
}));
