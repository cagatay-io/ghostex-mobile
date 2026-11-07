/**
 * The draft's markdown references as the core parses them (`composerReferences`, the rules in
 * `packages/gx-chat-core/src/composer/reference_pills.rs`). The field shows each one as a chip
 * (`chipText.ts`), the job gpui-component's `InlineReplacement` does on desktop
 * (`composer_references.rs`).
 */

import { arr, obj } from './json';

export type ComposerReference = {
  /** UTF-16 range of `[label](path)` in the draft. */
  start: number;
  end: number;
  kind: string;
  label: string;
  path: string;
  /** The core's pill text (desktop's icon space, the shortened label, a trailing gap). */
  pill?: string;
};

/** Decodes the core's answer; references that are revealed (shown as source) are skipped. */
export function parseReferences(draft: string, answer: unknown): ComposerReference[] {
  const references: ComposerReference[] = [];
  for (const entry of arr(answer)) {
    const reference = obj(entry);
    if (reference === null || reference.revealed === true) continue;
    const { start, end, kind, label, path, pill } = reference;
    if (typeof start !== 'number' || typeof end !== 'number' || typeof kind !== 'string') continue;
    if (typeof label !== 'string' || typeof path !== 'string' || start >= end || end > draft.length) continue;
    // The Side Chat pill is the `/btw ` prefix itself; every other pill is `[label](path)`.
    if (kind !== 'sideChat') {
      const labelEnd = draft.indexOf('](', start);
      if (draft[start] !== '[' || labelEnd < 0 || labelEnd >= end) continue;
    }
    references.push({ start, end, kind, label, path, ...(typeof pill === 'string' ? { pill } : {}) });
  }
  return references;
}

/** The single edit that turns `before` into `after`: `[start, removedEnd)` of `before` replaced. */
export function diffEdit(before: string, after: string): { start: number; removedEnd: number; inserted: string } {
  let start = 0;
  const max = Math.min(before.length, after.length);
  while (start < max && before[start] === after[start]) start += 1;
  let tail = 0;
  while (tail < max - start && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail += 1;
  return { start, removedEnd: before.length - tail, inserted: after.slice(start, after.length - tail) };
}

/**
 * `references`, parsed from `before`, carried over the edit that made `after`: the pills before the
 * edit stay, the ones after it move by its length, and one the edit touched is dropped (the core's
 * own answer for `after` settles it).
 *
 * CDXC:SessionChat 2026-10-24 DECISION:
 * User: "Typing in the chat on the phone when there's an image or another pill like that doesn't work well because it keeps expanding that pill text then collapsing it. Please fix this (i have browser brain now and I'm on android)". The Browser view brain answers `composerReferences` a turn after the keystroke, and the field drew the new draft with no pills until then: the raw `[label](path)` showed, the image tile left, and both came back with the answer. Typing never changes a pill it does not touch, so the phone carries the last pills over the edit until the core answers; the core stays the only parser.
 */
export function rebaseReferences(
  before: string,
  references: readonly ComposerReference[],
  after: string,
): ComposerReference[] {
  if (before === after) return [...references];
  const edit = diffEdit(before, after);
  const shift = edit.inserted.length - (edit.removedEnd - edit.start);
  const kept: ComposerReference[] = [];
  for (const reference of references) {
    if (reference.end <= edit.start) kept.push(reference);
    else if (reference.start >= edit.removedEnd) {
      kept.push({ ...reference, start: reference.start + shift, end: reference.end + shift });
    }
  }
  return kept;
}

/**
 * The composer's pill parser: the core's answer for a draft when it has one (`answer`), else the
 * last draft's pills carried over the edit ({@link rebaseReferences}). The core answers a draft a
 * turn after it is asked.
 */
export function createDraftReferenceParser(): (draft: string, answer: unknown) => ComposerReference[] {
  let last: { draft: string; references: readonly ComposerReference[] } = { draft: '', references: [] };
  return (draft, answer) => {
    const parsed =
      answer !== null && answer !== undefined
        ? parseReferences(draft, answer)
        : rebaseReferences(last.draft, last.references, draft);
    last = { draft, references: parsed };
    return parsed;
  };
}
