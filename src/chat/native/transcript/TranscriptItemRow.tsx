/**
 * One transcript item (desktop `transcript.rs` `transcript_item_row`): a message, a summary-mode
 * turn, or a finished turn folded behind its "Worked for 2m 5s" summary (`completed_work_row.rs`,
 * `deferred_work.rs`). A kind this build does not know draws nothing.
 */

import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CompletedWorkItem, ProjectedMessage, SummaryItem, TranscriptItem } from '../../rust/document';
import { QuestionExchangeCards } from '../cards';
import { useNativeChatUi, useTranscriptEnv, useTranscriptFlags } from './context';
import { DisclosureBody, DisclosureHeading, FoldPlaceProvider } from './Disclosure';
import { CompletedFilesFold } from './FileChanges';
import { obj } from './json';
import { MessageRow } from './MessageRow';
import { SentAgentMessageCards } from './AgentMessageCards';
import { useDisclosure } from './state';
import { SINGLE_LINE_CARD, SINGLE_LINE_TITLE, SingleLinePill, SingleLineTile, singleLineShell } from './singleLineCard';
import { PROSE_SIZE } from './theme';

const IN_WORK_FOLD = { inWorkFold: true, hideFileChanges: true };
const HIDE_FILES = { inWorkFold: false, hideFileChanges: true };

export const TranscriptItemView = memo(function TranscriptItemView({ item }: { item: TranscriptItem }) {
  switch (item.kind) {
    case 'message':
      return <MessageRow message={(item as { message: ProjectedMessage }).message} />;
    case 'summary':
      return <SummaryRow item={item as SummaryItem} />;
    case 'completed-work':
      return <CompletedWorkRow item={item as CompletedWorkItem} />;
    default:
      return null;
  }
});

function SummaryRow({ item }: { item: SummaryItem }) {
  const { disclosures } = useNativeChatUi();
  const hasFinal = obj(item.final) !== null;
  // A running turn's "Active work" fold starts open and has a key of its own, so closing it holds
  // for that turn without closing the reply fold that replaces it (gx-chat-core `summary_mode_turns`).
  const [open, toggle] = useDisclosure(
    disclosures,
    hasFinal ? `summary:${item.id}` : `active-work:${item.id}`,
    item.latestReply === true || item.workOpen === true,
  );
  return (
    <View style={styles.column}>
      <MessageRow message={item.user} />
      {(item.outcome ?? []).map((message) => (
        <MessageRow key={message.id} message={message} />
      ))}
      {hasFinal || item.active ? (
        <>
          <DisclosureHeading label={hasFinal ? 'Agent reply' : 'Active work'} open={open} onToggle={toggle} />
          {open ? (
            <View style={styles.column}>
              {hasFinal
                ? [...(item.earlierReplies ?? []), item.final!].map((message) => <MessageRow key={message.id} message={message} />)
                : item.work.map((message) => <MessageRow key={message.id} message={message} />)}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function CompletedWorkRow({ item }: { item: CompletedWorkItem }) {
  const { workOpen, simple, dispatch } = useTranscriptEnv();
  const { disclosures } = useNativeChatUi();
  const flags = useTranscriptFlags();
  const key = `work:${item.id}`;
  const [open, toggleRaw] = useDisclosure(disclosures, key, workOpen);
  const deferred = obj(item.deferred);
  const toggle = () => {
    // Opening a turn whose work is not in the document reads it on demand.
    if (!open && deferred !== null) dispatch({ type: 'loadWork', id: item.id, work: deferred as never });
    toggleRaw();
  };
  const deferredState = flags.deferredWork[item.id];
  return (
    <View style={styles.completedColumn}>
      <WorkSummary item={item} open={open} onToggle={toggle} />
      {open ? (
        <FoldPlaceProvider value={IN_WORK_FOLD}>
          <DisclosureBody onCollapse={toggle} label='Collapse completed work' rail='work'>
            {deferredState !== undefined ? <DeferredNotice item={item} error={deferredState.error ?? ''} /> : null}
            {item.work.map((message) => (
              <MessageRow key={message.id} message={message} />
            ))}
          </DisclosureBody>
        </FoldPlaceProvider>
      ) : null}
      <CompletedFilesFold
        itemId={item.id}
        files={item.files}
        card={item.filesCard}
        label={simple ? item.simpleFilesLabel : item.filesLabel}
        deferred={item.deferred}
        notice={deferredState !== undefined ? <DeferredNotice item={item} error={deferredState.error ?? ''} /> : null}
      />
      <FoldPlaceProvider value={HIDE_FILES}>
        {item.artifacts.map((message) => (
          <MessageRow key={message.id} message={message} />
        ))}
        <QuestionExchangeCards exchanges={item.questions} />
        <SentAgentMessageCards cards={item.sentMessages} />
        {item.final !== undefined && item.final !== null ? <MessageRow message={item.final} /> : null}
      </FoldPlaceProvider>
    </View>
  );
}

/**
 * The bar a finished turn folds behind (desktop `work_summary` in `completed_work_row.rs`): a clock
 * tile with a green check badge, "Worked for 2m 5s" and the turn's counts as pills (gx-chat-core `work_summary.rs`), so the closed
 * fold still says what happened; the whole bar opens and closes it, with no chevron.
 */
function WorkSummary({ item, open, onToggle }: { item: CompletedWorkItem; open: boolean; onToggle(): void }) {
  const { theme } = useTranscriptEnv();
  const stats = item.stats ?? [];
  const spoken = [item.label, ...stats.map((stat) => stat.label)].join(', ');
  return (
    <Pressable
      disabled={!item.expandable}
      onPress={onToggle}
      accessibilityRole='button'
      accessibilityLabel={spoken}
      accessibilityState={{ expanded: open }}
      style={({ pressed }) => [styles.summary, singleLineShell(theme), pressed && { backgroundColor: theme.input }]}
    >
      <SingleLineTile glyph='clock' checked />
      <Text style={[SINGLE_LINE_TITLE, { color: item.expandable ? theme.foreground : theme.muted }]}>{item.label}</Text>
      {/* The count pills sit at the row's right end and wrap among themselves (desktop `work_summary`). */}
      <View style={styles.chips}>
        {stats.map((stat) => {
          const failed = stat.kind === 'failed' || stat.kind === 'recovered';
          const tone = failed ? theme.error : theme.cardMuted;
          return (
            <SingleLinePill
              key={stat.kind}
              icon={stat.kind === 'files' ? 'pencil' : failed ? 'alert-triangle' : 'tool'}
              label={stat.label}
              color={tone}
            />
          );
        })}
      </View>
    </Pressable>
  );
}

/** The work fold while its history is being read, or after the read failed (`deferred_work.rs`). */
function DeferredNotice({ item, error }: { item: CompletedWorkItem; error: string }) {
  const { theme, dispatch } = useTranscriptEnv();
  const failed = error.length > 0;
  return (
    <View style={styles.deferred}>
      <Text style={[styles.deferredText, { color: failed ? theme.error : theme.muted }]}>{failed ? error : 'Loading work details…'}</Text>
      {failed ? (
        <Pressable
          onPress={() => dispatch({ type: 'loadWork', id: item.id, work: (item.deferred ?? null) as never })}
          style={({ pressed }) => [styles.retry, pressed && { backgroundColor: theme.pressed }]}
          accessibilityRole='button'
        >
          <Text style={[styles.deferredText, { color: theme.muted }]}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: 8, minWidth: 0 },
  completedColumn: { gap: 10, minWidth: 0 },
  // Every one-line card's height and padding (`singleLineCard.ts`).
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: SINGLE_LINE_CARD.height,
    paddingHorizontal: SINGLE_LINE_CARD.paddingX,
  },
  chips: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 6 },
  deferred: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  deferredText: { fontSize: PROSE_SIZE, flexShrink: 1 },
  retry: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
});
