/**
 * What a `caption` or `tool` frame from gxserver makes of the voice screen's lines: the paragraphs a
 * long agent reply is drawn in, and the line a tool call lands on (its run's, when gxserver groups
 * calls of one tool). gxserver decides both (server/src/voice_agent/paragraphs.rs, tool_runs.rs,
 * where the user's decision is); the screen only follows.
 *
 * CDXC:VoiceMode 2026-10-24 SEE-ALSO: the desktop's apps/desktop/src/app/voice_agent/rows.rs reads the same frames the same way, with the same tests.
 */

/** gxserver's `paragraphs` of an agent caption; empty when the caption is one paragraph. */
export function captionParagraphs(frame: Record<string, unknown>): string[] {
  const parts = frame.paragraphs;
  return Array.isArray(parts) ? parts.filter((part): part is string => typeof part === 'string') : [];
}

export type ToolLineFrame = {
  /** `tool-<run id>` when the call is part of a run (the run's first call), else `tool-<callId>`. */
  key: string;
  label: string;
  /** Every call of the line has finished. */
  finished: boolean;
  ok: boolean;
};

export function toolLineFrame(frame: Record<string, unknown>): ToolLineFrame {
  const run = typeof frame.run === 'object' && frame.run !== null ? (frame.run as Record<string, unknown>) : null;
  if (run !== null && typeof run.id === 'string') {
    return {
      key: `tool-${run.id}`,
      label: typeof run.label === 'string' ? run.label : '',
      finished: run.finished === true,
      ok: run.ok !== false,
    };
  }
  return {
    key: `tool-${typeof frame.callId === 'string' ? frame.callId : ''}`,
    label: typeof frame.label === 'string' ? frame.label : typeof frame.name === 'string' ? frame.name : '',
    finished: frame.phase === 'finished',
    ok: frame.ok !== false,
  };
}
