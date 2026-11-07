/**
 * The chat box's text as the field shows it: each reference pill in the draft (`[Image #1](/path)`)
 * stands in the field as one short chip (" Image #1 "), and the draft's markdown stays beside it,
 * mapped back on every edit. What the core keeps, saves and sends is always the draft.
 *
 * CDXC:SessionChat 2026-11-07 FIX:
 * User (Android app): "When I paste an image in the chat of the Android app, it's very bad. The image tag is inside the chat line. I can't use my arrow keys to go around the image that's pasted, and whenever I type anything in the chat, the tag keeps flickering. The issue is that the path of the image tag is being taken into consideration when I use the arrow keys. If I want to go to the beginning of the line, for example, if I have an image there, it's literally impossible. If I type a letter or a word and the image tag is in front of me, it just jumps my cursor after it. ... I want the image [tag], one thing that we add there, to work like it does on the PC." The field used to hold the whole markdown and draw the path as invisible glyphs, so the caret walked through every hidden character and was pushed past the pill. Like desktop's `InlineReplacement`, a chip is one unit to the caret: arrow keys step over it, a tap lands at its nearer edge, Backspace after it deletes the whole reference, and text typed against it stays where it was typed.
 *
 * CDXC:SessionChat 2026-11-07 WHY: A React Native `TextInput` cannot draw a view or other words over its own text, so the chip's label is the text itself. It starts and ends with a hair space drawn untinted: the keyboard sees a word break at both edges (Gboard never composes a typed word into the chip), iOS gives text typed against it the plain style of that space, and the chip keeps a hairline gap from its neighbours.
 */

import { diffEdit, type ComposerReference } from './references';

export type Chip = {
  reference: ComposerReference;
  /** UTF-16 range of the whole chip in the shown text. */
  start: number;
  end: number;
  /** The tinted part, inside `[start, end)`. */
  bodyStart: number;
  bodyEnd: number;
};

export type ChipText = {
  /** The draft: what the core keeps and what Send sends. */
  draft: string;
  /** What the field shows. */
  shown: string;
  /** The chips in `shown`, in order. */
  chips: Chip[];
};

export type Selection = { start: number; end: number };

const EDGE = ' ';
const PAD = ' ';
/** The space the core's pill text keeps for desktop's icon (`REFERENCE_PILL_ICON_SPACE`). */
const ICON_SPACE = '     ';

/**
 * The chip's words: the core's pill text without desktop's icon space and trailing gap (so a long
 * file path is shortened the way desktop shortens it), its spaces made unbreakable.
 */
export function chipLabel(reference: ComposerReference): string {
  const pill = reference.pill;
  const label =
    typeof pill === 'string' && pill.startsWith(ICON_SPACE) && pill.length > ICON_SPACE.length + 1
      ? pill.slice(ICON_SPACE.length, -1)
      : reference.label;
  return label.replace(/ /gu, ' ');
}

/**
 * The Side Chat chip stands for `/btw ` with its space, which desktop draws at full width after the
 * pill (core `reference_pill_text`), so its trailing edge is a no-break space.
 */
function chipPieces(reference: ComposerReference): { lead: string; body: string; trail: string } {
  return { lead: EDGE, body: `${PAD}${chipLabel(reference)}${PAD}`, trail: reference.kind === 'sideChat' ? ' ' : EDGE };
}

/** The draft as the field shows it. References that overlap or fall outside the draft are left as text. */
export function projectDraft(draft: string, references: readonly ComposerReference[]): ChipText {
  const sorted = [...references].sort((a, b) => a.start - b.start);
  let shown = '';
  let cursor = 0;
  const chips: Chip[] = [];
  for (const reference of sorted) {
    if (reference.start < cursor || reference.end > draft.length || reference.start >= reference.end) continue;
    shown += draft.slice(cursor, reference.start);
    const { lead, body, trail } = chipPieces(reference);
    const start = shown.length;
    shown += lead + body + trail;
    chips.push({
      reference,
      start,
      end: shown.length,
      bodyStart: start + lead.length,
      bodyEnd: start + lead.length + body.length,
    });
    cursor = reference.end;
  }
  shown += draft.slice(cursor);
  return { draft, shown, chips };
}

/** A draft offset in the shown text; one inside a reference lands after its chip. */
export function shownOffset(text: ChipText, draftOffset: number): number {
  let delta = 0;
  for (const chip of text.chips) {
    const { start, end } = chip.reference;
    if (draftOffset <= start) break;
    if (draftOffset < end) return chip.end;
    delta += chip.end - chip.start - (end - start);
  }
  return draftOffset + delta;
}

/** A shown offset in the draft; one inside a chip lands after its reference. */
export function draftOffset(text: ChipText, shown: number): number {
  let delta = 0;
  for (const chip of text.chips) {
    if (shown <= chip.start) break;
    if (shown < chip.end) return chip.reference.end;
    delta += chip.reference.end - chip.reference.start - (chip.end - chip.start);
  }
  return shown + delta;
}

export type ShownEdit = {
  /** The draft and shown text after the edit. */
  text: ChipText;
  /** The caret after the edit, in the shown text and in the draft. */
  caret: number;
  draftCaret: number;
  /** The field's own text is not what it must show (the edit cut into a chip): push it back. */
  rewritten: boolean;
};

/**
 * The field's text changed from `text.shown` to `next`: the same edit made to the draft. An edit
 * that deletes any part of a chip deletes its whole reference (desktop's Backspace steps over a pill
 * as one character), and text typed inside a chip lands after it.
 */
export function editShown(text: ChipText, next: string): ShownEdit {
  const edit = diffEdit(text.shown, next);
  let start = edit.start;
  let end = edit.removedEnd;
  for (const chip of text.chips) {
    if (end > start) {
      if (start < chip.end && end > chip.start) {
        start = Math.min(start, chip.start);
        end = Math.max(end, chip.end);
      }
    } else if (start > chip.start && start < chip.end) {
      start = chip.end;
      end = chip.end;
    }
  }
  const draftStart = draftOffset(text, start);
  const draftEnd = draftOffset(text, end);
  const inserted = edit.inserted;
  const draft = text.draft.slice(0, draftStart) + inserted + text.draft.slice(draftEnd);
  const shown = text.shown.slice(0, start) + inserted + text.shown.slice(end);
  const shownShift = inserted.length - (end - start);
  const draftShift = inserted.length - (draftEnd - draftStart);
  const chips: Chip[] = [];
  for (const chip of text.chips) {
    if (chip.end <= start) chips.push(chip);
    else if (chip.start >= end) {
      chips.push({
        reference: { ...chip.reference, start: chip.reference.start + draftShift, end: chip.reference.end + draftShift },
        start: chip.start + shownShift,
        end: chip.end + shownShift,
        bodyStart: chip.bodyStart + shownShift,
        bodyEnd: chip.bodyEnd + shownShift,
      });
    }
  }
  return {
    text: { draft, shown, chips },
    caret: start + inserted.length,
    draftCaret: draftStart + inserted.length,
    rewritten: shown !== next,
  };
}

/** A selection, and whether its moving end is its start (Shift+Left grew it). */
export type SnappedSelection = Selection & { backward?: true };

/**
 * Where a caret or selection the field reported must go so it never splits a chip. A caret that
 * stepped into a chip from one edge goes on to the other (an arrow key steps over it), one that
 * lands inside otherwise (a tap) goes to the nearer edge. A selection's moving end goes through a
 * chip the way it moved while its other end stays (Shift+Left past a chip selects it whole and the
 * next Shift+Left goes on); a selection that changed at both ends grows over the chips it touches.
 */
export function snapSelection(text: ChipText, selection: Selection, previous: Selection | null): SnappedSelection {
  const inside = (offset: number) => text.chips.find((chip) => offset > chip.start && offset < chip.end);
  if (selection.start === selection.end) {
    const caret = selection.end;
    const chip = inside(caret);
    if (chip === undefined) return selection;
    const from = previous !== null && previous.start === previous.end ? previous.end : null;
    const edge =
      from === chip.start ? chip.end : from === chip.end ? chip.start : caret - chip.start <= chip.end - caret ? chip.start : chip.end;
    return { start: edge, end: edge };
  }
  /** A moving end that landed in a chip, carried to the chip's edge in the direction it moved. */
  const through = (offset: number, from: number): number => {
    const chip = inside(offset);
    return chip === undefined ? offset : offset < from ? chip.start : chip.end;
  };
  const { start, end } = selection;
  if (previous !== null && start === previous.start && end !== previous.end) {
    return { start, end: Math.max(start, through(end, previous.end)) };
  }
  if (previous !== null && end === previous.end && start !== previous.start) {
    const moved = Math.min(end, through(start, previous.start));
    return moved === end ? { start: end, end } : { start: moved, end, backward: true };
  }
  return { start: inside(start)?.start ?? start, end: inside(end)?.end ?? end };
}
