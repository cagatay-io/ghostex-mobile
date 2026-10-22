/**
 * The workflow card (desktop `workflow_card.rs`): a Claude Code Workflow call drawn as the run it
 * started, in the shell every transcript card wears (`singleLineCard.tsx`). A header with the run's
 * state, name, description and agent counts; one small heading per phase with its progress; one row
 * per agent (Claude's logo in the card tile with a status badge, its label, a one-line preview, its
 * duration and a chevron) that opens the agent in the subagent viewer on a tap; then the script in
 * the transcript's code block, clipped until "Show full script". The code block keeps its own
 * controls; the card adds no buttons to the message.
 *
 * Everything it says comes from the core's `workflowCards`
 * (packages/gx-chat-core/src/transcript/workflow_card.rs, where the user's request is the
 * `CDXC:SessionChat 2026-10-22 DECISION`); this file only lays it out.
 */

import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Json } from '../../rust/document';
import { AgentMark } from '../cards/agentMark';
import { subagentOpenAction } from '../cards';
import { useNativeChatUi, useTranscriptEnv, useTranscriptFlags } from './context';
import { Glyph } from './icons';
import { arr, obj, str, type JsonRecord } from './json';
import { Markdown } from './markdown/Markdown';
import {
  SINGLE_LINE_CARD,
  SINGLE_LINE_TITLE,
  SingleLineBadge,
  SingleLineTileBox,
  singleLinePressed,
  singleLineShell,
} from './singleLineCard';
import { useDisclosure } from './state';
import type { TranscriptTheme } from './theme';

/** The script block's header and one code line, for the collapsed clip (desktop `SCRIPT_HEADER`). */
const SCRIPT_HEADER = 40;
const SCRIPT_LINE = 20;

function badgeFill(status: string, theme: TranscriptTheme): string {
  if (status === 'done') return SINGLE_LINE_CARD.badge.fill;
  if (status === 'failed') return SINGLE_LINE_CARD.badge.errorFill;
  if (status === 'running') return theme.light ? '#2563eb' : '#60a5fa';
  return theme.ink(0.35);
}

/** The cards of every Workflow call `ids` names that the document has a run for. */
export function WorkflowCards({ ids }: { ids: Json | undefined }) {
  const { workflowCards } = useTranscriptFlags();
  const cards = arr(ids)
    .filter((id): id is string => typeof id === 'string')
    .map((id) => [id, obj(workflowCards[id])] as const)
    .filter((entry): entry is readonly [string, JsonRecord] => entry[1] !== null);
  if (cards.length === 0) return null;
  return (
    <View style={styles.cards}>
      {cards.map(([id, card]) => (
        <WorkflowCard key={id} id={id} card={card} />
      ))}
    </View>
  );
}

const WorkflowCard = memo(function WorkflowCard({ id, card }: { id: string; card: JsonRecord }) {
  const { theme } = useTranscriptEnv();
  const description = str(card, 'description');
  return (
    <View
      style={[singleLineShell(theme), styles.card]}
      accessibilityLabel={`${str(card, 'heading')}: ${str(card, 'name')}`}
    >
      <View style={styles.header}>
        <SingleLineTileBox>
          <Glyph name="sitemap" size={SINGLE_LINE_CARD.tile.glyphSize} color={theme.prose} />
        </SingleLineTileBox>
        <View style={styles.headerText}>
          <View style={styles.headingRow}>
            <Text style={[styles.heading, { color: theme.cardMuted }]} numberOfLines={1}>
              {str(card, 'heading')}
            </Text>
            <Text style={[styles.summary, { color: theme.cardMuted }]} numberOfLines={1}>
              {str(card, 'summary')}
            </Text>
          </View>
          <Text style={[SINGLE_LINE_TITLE, { color: theme.foreground }]} numberOfLines={1}>
            {str(card, 'name')}
          </Text>
          {description.length > 0 ? (
            <Text style={[styles.description, { color: theme.cardMuted }]}>{description}</Text>
          ) : null}
        </View>
      </View>
      <View style={styles.phases}>
        {arr(card.phases).map((phase, index) => {
          const value = obj(phase);
          return value === null ? null : <Phase key={str(value, 'key') || index} phase={value} />;
        })}
      </View>
      <Script id={id} card={card} />
    </View>
  );
});

function Phase({ phase }: { phase: JsonRecord }) {
  const { theme } = useTranscriptEnv();
  const title = str(phase, 'title');
  const detail = str(phase, 'detail');
  return (
    <View style={styles.phase}>
      {title.length > 0 ? (
        <View style={styles.phaseHeading}>
          <Text style={[styles.phaseTitle, { color: theme.cardMuted }]}>{title}</Text>
          <Text style={[styles.phaseCount, { color: theme.cardMuted }]}>{str(phase, 'countLabel')}</Text>
        </View>
      ) : null}
      {/* The phase's description from the script, in full under its heading. */}
      {title.length > 0 && detail.length > 0 ? (
        <Text style={[styles.phaseDetail, { color: theme.muted }]}>{detail}</Text>
      ) : null}
      {arr(phase.agents).map((agent, index) => {
        const value = obj(agent);
        return value === null ? null : <AgentRow key={str(value, 'key') || index} agent={value} />;
      })}
    </View>
  );
}

function AgentRow({ agent }: { agent: JsonRecord }) {
  const { theme, dispatch } = useTranscriptEnv();
  const label = str(agent, 'label');
  const preview = str(agent, 'preview');
  const duration = str(agent, 'durationLabel');
  const open = subagentOpenAction({
    selector: agent.selector,
    name: label,
    agentType: 'workflow-subagent',
    // The viewer's subtitle: which of the run's agents this is.
    task: label,
    model: agent.model,
  });
  return (
    <Pressable
      disabled={open === null}
      onPress={open === null ? undefined : () => dispatch(open)}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${str(agent, 'statusLabel')}${duration.length > 0 ? `, ${duration}` : ''}`}
      style={({ pressed }) => [styles.agent, pressed && singleLinePressed(theme)]}
    >
      <SingleLineTileBox>
        <AgentMark icon="claude" size={SINGLE_LINE_CARD.tile.glyphSize} />
        <SingleLineBadge fill={badgeFill(str(agent, 'status'), theme)}>
          {str(agent, 'status') === 'done' ? (
            <Glyph name="check" size={SINGLE_LINE_CARD.badge.glyphSize} color="#ffffff" strokeWidth={3} />
          ) : str(agent, 'status') === 'failed' ? (
            <Glyph name="x" size={SINGLE_LINE_CARD.badge.glyphSize} color="#ffffff" strokeWidth={3} />
          ) : null}
        </SingleLineBadge>
      </SingleLineTileBox>
      <View style={styles.agentText}>
        <Text style={[styles.agentLabel, { color: theme.foreground }]} numberOfLines={1}>
          {label}
        </Text>
        {preview.length > 0 ? (
          <Text style={[styles.agentPreview, { color: theme.cardMuted }]} numberOfLines={1}>
            {preview}
          </Text>
        ) : null}
      </View>
      {duration.length > 0 ? <Text style={[styles.duration, { color: theme.cardMuted }]}>{duration}</Text> : null}
      {open !== null ? <Glyph name="chevron-right" size={14} color={theme.muted} /> : null}
    </Pressable>
  );
}

/** The script in the transcript's code block, clipped to its first lines until "Show full script". */
function Script({ id, card }: { id: string; card: JsonRecord }) {
  const { theme } = useTranscriptEnv();
  const { disclosures } = useNativeChatUi();
  const [openState, toggle] = useDisclosure(disclosures, `workflow-script:${id}`);
  const markdown = str(card, 'scriptMarkdown');
  if (markdown.length === 0) return null;
  const collapsible = card.scriptCollapsible === true;
  const open = !collapsible || openState;
  const lines = typeof card.scriptPreviewLines === 'number' ? card.scriptPreviewLines : 6;
  return (
    <View style={[styles.script, { borderTopColor: theme.ink(0.06) }]}>
      <View style={open ? null : { maxHeight: SCRIPT_HEADER + lines * SCRIPT_LINE, overflow: 'hidden' }}>
        <Markdown text={markdown} />
      </View>
      {collapsible ? (
        <Pressable onPress={toggle} accessibilityRole="button" accessibilityState={{ expanded: open }}>
          <Text style={[styles.scriptToggle, { color: theme.muted }]}>
            {str(card, open ? 'hideScriptLabel' : 'showScriptLabel')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cards: { gap: 8 },
  card: { overflow: 'hidden' },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: SINGLE_LINE_CARD.paddingX,
    paddingTop: 10,
  },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { flex: 1, fontSize: 12.5 },
  summary: { flexShrink: 0, fontSize: 12.5, fontVariant: ['tabular-nums'] },
  description: { fontSize: 13, lineHeight: 18 },
  phases: { gap: 10, paddingHorizontal: SINGLE_LINE_CARD.paddingX, paddingVertical: 10 },
  phase: { gap: 2 },
  phaseHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 2 },
  phaseTitle: { fontSize: 12, fontWeight: '500' },
  phaseCount: { fontSize: 12, fontVariant: ['tabular-nums'] },
  phaseDetail: { fontSize: 12, lineHeight: 16, paddingBottom: 2 },
  agent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: -6,
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: 8,
  },
  agentText: { flex: 1, minWidth: 0 },
  agentLabel: { fontSize: 13.5, fontWeight: '500' },
  agentPreview: { fontSize: 12.5 },
  duration: { flexShrink: 0, fontSize: 12.5, fontVariant: ['tabular-nums'] },
  script: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SINGLE_LINE_CARD.paddingX,
    paddingTop: 10,
    paddingBottom: 10,
  },
  scriptToggle: { paddingTop: 6, fontSize: 12.5 },
});
