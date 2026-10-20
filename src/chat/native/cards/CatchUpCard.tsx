/**
 * Catch me up (desktop `native_chat/catch_up.rs`): the card above the composer that shows where the
 * session stands. The core owns when it shows and what it holds (`gx-chat-core`
 * `composer/catch_up.rs`): loading while the small agent writes, then the summary drawn with the
 * transcript's marked sections, or the refusal in plain words, with Refresh, Copy and Close.
 */

import * as Clipboard from 'expo-clipboard';
import { useMemo } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';

import type { UserAction } from '../../rust/actions';
import type { CatchUpState, Json } from '../../rust/document';
import { Glyph } from '../composer/icons';
import { themedStyles, useTranscriptTheme } from '../transcript/theme';
import { ChatButton, StatusCard } from './primitives';
import { TranscriptEnvProvider, type TranscriptEnv } from '../transcript/context';
import { Markdown } from '../transcript/markdown/Markdown';

export function CatchUpCard({
  catchUp,
  dispatch,
}: {
  catchUp: CatchUpState | undefined;
  dispatch: (action: UserAction) => void;
}) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  if (catchUp === undefined || !catchUp.open) return null;
  const header = (
    <View style={styles.header}>
      <Glyph name="sparkles" size={14} color={P.primary} />
      <Text style={styles.title}>Catch me up</Text>
      {catchUp.loading ? <Text style={styles.status}>Reading the session…</Text> : null}
    </View>
  );
  const body = catchUp.loading
    ? [<Placeholder key="loading" />]
    : catchUp.error !== null && catchUp.error !== undefined
      ? [
          <Text key="error" style={styles.error}>
            {catchUp.error}
          </Text>,
        ]
      : [
          <Summary
            key="summary"
            dispatch={dispatch}
            markdown={catchUp.markdown}
            references={catchUp.references as Json}
          />,
          catchUp.caption ? (
            <Text key="caption" style={styles.caption}>
              {catchUp.caption}
            </Text>
          ) : null,
        ];
  const actions = [
    <ChatButton
      key="refresh"
      label="Refresh"
      icon="refresh"
      disabled={catchUp.loading}
      onPress={() => dispatch({ type: 'catchUpRefresh' })}
    />,
    <ChatButton
      key="copy"
      label="Copy"
      icon="copy"
      disabled={catchUp.copyText.length === 0}
      onPress={() => void Clipboard.setStringAsync(catchUp.copyText)}
    />,
    <ChatButton key="close" label="Close" icon="x" onPress={() => dispatch({ type: 'catchUpClose' })} />,
  ];
  return <StatusCard header={header} body={body} actions={actions} />;
}

/**
 * The whole catch-up at once (no "Show all" cap: it is short and read in one go); a tall one
 * scrolls inside the card so the transcript stays in view.
 */
function Summary({
  dispatch,
  markdown,
  references,
}: {
  dispatch: (action: UserAction) => void;
  markdown: string;
  references?: Json;
}) {
  const theme = useTranscriptTheme();
  const { height } = useWindowDimensions();
  const env = useMemo<TranscriptEnv>(
    () => ({
      dispatch,
      theme,
      verbose: false,
      simple: false,
      workOpen: false,
      filePreviews: false,
      mutedThinking: false,
      main: false,
    }),
    [dispatch, theme],
  );
  return (
    <TranscriptEnvProvider value={env}>
      <ScrollView style={{ maxHeight: height * 0.45 }} nestedScrollEnabled>
        <Markdown text={markdown} references={references} color={theme.prose} />
      </ScrollView>
    </TranscriptEnvProvider>
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, minWidth: 0, color: P.foreground, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  status: { color: P.muted, fontSize: 12, lineHeight: 20 },
  error: { color: P.error, fontSize: 13, lineHeight: 19 },
  caption: { color: P.muted, fontSize: 12, marginTop: 6 },
  placeholder: { gap: 9, paddingVertical: 4 },
  placeholderBar: { height: 9, borderRadius: 5, backgroundColor: P.muted, opacity: 0.28 },
}));
