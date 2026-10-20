/**
 * The status line under the composer (`context_meter.rs`, `render_context_status`): the context
 * rows the user starred, separated by diamonds, with the pen that opens the context editor. While
 * the values are still loading it keeps its row with the shared skeleton geometry
 * (`status-line-skeleton.json`) so the composer does not jump.
 *
 * CDXC:SessionChat 2026-10-17 DECISION:
 * User: "make the status line on phones and narrow screen not wrap anymore but it should scroll sideways". The line is always one row; when it is wider than the chat a sideways swipe scrolls the values, and the pen stays at their right end instead of scrolling away. This supersedes the 2026-09-14 balanced, centered rows. `apps/desktop/src/app/native_chat/context_meter.rs` draws the same line on the desktop and the web build.
 */

import * as Clipboard from 'expo-clipboard';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { UserAction } from '../../rust/actions';
import type { ChatDocument } from '../../rust/document';
import { Glyph } from './icons';
import { arr, isTrue, obj, str } from './json';
import { themedStyles, useTranscriptTheme } from '../transcript/theme';

const SKELETON = { widths: [52, 72, 36], height: 10, gap: 12 };

export function statusLineReserved(document: ChatDocument): boolean {
  const context = obj(document.contextMeter);
  if (context === null) return false;
  return (
    isTrue(context, 'statusLineReserved') || isTrue(context, 'hasConfiguredItems') || arr(context.starred).length > 0
  );
}

export function StatusLine({ document, dispatch }: { document: ChatDocument; dispatch: (action: UserAction) => void }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const starred = arr(obj(document.contextMeter)?.starred);
  if (starred.length === 0) {
    return (
      <View style={[styles.line, { gap: SKELETON.gap }]}>
        {SKELETON.widths.map((width, index) => (
          <View key={index} style={[styles.skeleton, { width, height: SKELETON.height }]} />
        ))}
      </View>
    );
  }
  return (
    <View style={styles.line}>
      {/* Sized to its values and shrunk to the chat's width, so a line that fits stays centered and still; only a wider one scrolls. */}
      <ScrollView
        horizontal
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.values}
        contentContainerStyle={styles.valuesContent}
      >
        {starred.map((item, index) => {
          const copy = str(obj(obj(item)?.copy), 'text');
          const value = (
            <Text style={styles.value} numberOfLines={1}>
              {str(item, 'value')}
            </Text>
          );
          return (
            <View key={`${index}:${str(item, 'id')}`} style={styles.item}>
              {index > 0 ? <Text style={styles.separator}>◆</Text> : null}
              {copy.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${str(item, 'label')}, copy id`}
                  onPress={() => void Clipboard.setStringAsync(copy)}
                >
                  {value}
                </Pressable>
              ) : (
                value
              )}
            </View>
          );
        })}
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Edit status line"
        hitSlop={10}
        onPress={() => dispatch({ type: 'contextEdit' })}
        style={styles.pen}
      >
        <Glyph name="pencil" size={11} color={P.muted} />
      </Pressable>
    </View>
  );
}

const useStyles = themedStyles((P) => ({
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 16, paddingHorizontal: 4 },
  values: { flexGrow: 0, flexShrink: 1 },
  valuesContent: { alignItems: 'center' },
  item: { flexDirection: 'row', alignItems: 'center' },
  separator: { width: 18, textAlign: 'center', fontSize: 7, color: P.mutedInk(0.4) },
  value: { color: P.mutedInk(0.8), fontSize: 11, lineHeight: 16 },
  pen: { marginLeft: 4, width: 16, height: 16, alignItems: 'center', justifyContent: 'center', opacity: 0.55 },
  skeleton: { borderRadius: 5, backgroundColor: P.mutedInk(0.24) },
}));
