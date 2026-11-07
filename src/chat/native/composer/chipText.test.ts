/// <reference types="node" />
/** Run with `bun test src/chat/native/composer/chipText.test.ts` from apps/mobile/app. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { draftOffset, editShown, projectDraft, shownOffset, snapSelection, type ChipText } from './chipText';
import type { ComposerReference } from './references';

const IMAGE = '[Image #1](/Users/me/.ghostex/pasted/2026-11-07-shot.png)';
const IMAGE_2 = '[Image #2](/Users/me/.ghostex/pasted/second.png)';
/** The pill text the core answers for an image (`reference_pill_text`). */
const pillText = (label: string) => `     ${label.replace(/ /gu, ' ')} `;
const CHIP_1 = '  Image #1  ';
const CHIP_2 = '  Image #2  ';

/** The references the core reports for a draft holding these markdown pills. */
function referencesIn(draft: string, ...markdowns: string[]): ComposerReference[] {
  return markdowns.map((markdown) => {
    const start = draft.indexOf(markdown);
    assert.ok(start >= 0, `${markdown} is in the draft`);
    const label = markdown.slice(1, markdown.indexOf(']('));
    return {
      start,
      end: start + markdown.length,
      kind: 'image',
      label,
      path: markdown.slice(markdown.indexOf('](') + 2, -1),
      pill: pillText(label),
    };
  });
}

function chips(draft: string, ...markdowns: string[]): ChipText {
  return projectDraft(draft, referencesIn(draft, ...markdowns));
}

/** The field's text after typing `typed` at `caret` (what a keyboard does to a plain text view). */
function typeAt(shown: string, caret: number, typed: string): string {
  return shown.slice(0, caret) + typed + shown.slice(caret);
}

/** The field's text after one Backspace at `caret`. */
function backspaceAt(shown: string, caret: number): string {
  return shown.slice(0, caret - 1) + shown.slice(caret);
}

const caretAt = (offset: number) => ({ start: offset, end: offset });

describe('the field shows a pasted image as one short chip', () => {
  test('the path never reaches the field', () => {
    const draft = `look ${IMAGE} here`;
    const text = chips(draft, IMAGE);
    assert.equal(text.shown, `look ${CHIP_1} here`);
    assert.ok(!text.shown.includes('/Users/me'));
    assert.equal(text.chips.length, 1);
    assert.equal(text.shown.slice(text.chips[0]!.bodyStart, text.chips[0]!.bodyEnd), ' Image #1 ');
  });

  test('a long file label is shortened the way desktop shortens it', () => {
    const draft = '[a/b/c/deeply/nested/folder/component.tsx](a/b/c/deeply/nested/folder/component.tsx)';
    const [reference] = referencesIn(draft, draft);
    const text = projectDraft(draft, [{ ...reference!, kind: 'file', pill: pillText('…/component.tsx') }]);
    assert.equal(text.shown, '  …/component.tsx  ');
  });

  test('without the core pill text the chip shows the label', () => {
    const draft = `x ${IMAGE}`;
    const [reference] = referencesIn(draft, IMAGE);
    const { pill: _pill, ...bare } = reference!;
    assert.equal(projectDraft(draft, [bare]).shown, `x ${CHIP_1}`);
  });

  test('the Side Chat prefix shows as its chip with a full space after it', () => {
    const draft = '/btw what changed?';
    const text = projectDraft(draft, [
      { start: 0, end: 5, kind: 'sideChat', label: 'Side Chat', path: '/btw', pill: '     Side Chat ' },
    ]);
    assert.equal(text.shown, '  Side Chat  what changed?');
    assert.equal(draftOffset(text, text.chips[0]!.end), 5);
  });

  test('draft and shown offsets map onto each other around chips', () => {
    const draft = `a ${IMAGE} b ${IMAGE_2} c`;
    const text = chips(draft, IMAGE, IMAGE_2);
    const [first, second] = text.chips;
    assert.equal(shownOffset(text, 0), 0);
    assert.equal(shownOffset(text, 2), first!.start);
    assert.equal(shownOffset(text, 2 + IMAGE.length), first!.end);
    assert.equal(shownOffset(text, draft.length), text.shown.length);
    // A draft caret inside a reference stands after its chip.
    assert.equal(shownOffset(text, 10), first!.end);
    assert.equal(draftOffset(text, first!.start), 2);
    assert.equal(draftOffset(text, first!.end), 2 + IMAGE.length);
    assert.equal(draftOffset(text, second!.end), draft.indexOf(IMAGE_2) + IMAGE_2.length);
    assert.equal(draftOffset(text, text.shown.length), draft.length);
  });
});

describe('the caret steps over a chip as one unit', () => {
  const draft = `${IMAGE} hello`;
  const text = chips(draft, IMAGE);
  const chip = text.chips[0]!;

  test('Left from after the chip lands before it', () => {
    assert.deepEqual(snapSelection(text, caretAt(chip.end - 1), caretAt(chip.end)), caretAt(chip.start));
  });

  test('Right from before the chip lands after it', () => {
    assert.deepEqual(snapSelection(text, caretAt(chip.start + 1), caretAt(chip.start)), caretAt(chip.end));
  });

  test('walking Left from the end of the line reaches its start', () => {
    let caret = caretAt(text.shown.length);
    for (let step = 0; step < 40 && caret.end > 0; step += 1) {
      caret = snapSelection(text, caretAt(caret.end - 1), caret);
    }
    assert.deepEqual(caret, caretAt(0));
    assert.equal(draftOffset(text, caret.end), 0);
  });

  test('walking Right from the start crosses the chip in one step', () => {
    const visited: number[] = [];
    let caret = caretAt(0);
    while (caret.end < text.shown.length) {
      caret = snapSelection(text, caretAt(caret.end + 1), caret);
      visited.push(caret.end);
    }
    assert.equal(visited[0], chip.end);
    assert.ok(visited.every((offset) => offset <= chip.start || offset >= chip.end));
  });

  test('Home before a chip at the start of the line stays at the start', () => {
    assert.deepEqual(snapSelection(text, caretAt(0), caretAt(text.shown.length)), caretAt(0));
  });

  test('a tap inside the chip goes to its nearer edge', () => {
    assert.deepEqual(snapSelection(text, caretAt(chip.start + 2), caretAt(text.shown.length)), caretAt(chip.start));
    assert.deepEqual(snapSelection(text, caretAt(chip.end - 2), caretAt(0)), caretAt(chip.end));
  });

  test('Shift+Left from after the chip selects all of it, and the next Shift+Left goes on', () => {
    const selected = snapSelection(text, { start: chip.end - 1, end: chip.end }, caretAt(chip.end));
    assert.deepEqual(selected, { start: chip.start, end: chip.end, backward: true });
    const further = { start: chip.start, end: chip.end + 3 };
    const farText = chips(`x ${IMAGE} hello`, IMAGE);
    const farChip = farText.chips[0]!;
    // With text before the chip, the next Shift+Left takes the space before it as well.
    const first = snapSelection(farText, { start: farChip.end - 1, end: farChip.end }, caretAt(farChip.end));
    const second = snapSelection(farText, { start: farChip.start - 1, end: farChip.end }, first);
    assert.deepEqual(second, { start: farChip.start - 1, end: farChip.end, backward: true });
    assert.deepEqual(snapSelection(text, further, selected), further);
  });

  test('Shift+Right over the chip selects all of it; Shift+Left then gives it back', () => {
    const selected = snapSelection(text, { start: chip.start, end: chip.start + 1 }, caretAt(chip.start));
    assert.deepEqual(selected, { start: chip.start, end: chip.end });
    assert.deepEqual(snapSelection(text, { start: chip.start, end: chip.end - 1 }, selected), caretAt(chip.start));
  });

  test('a selection that changed at both ends covers every chip it touches', () => {
    assert.deepEqual(snapSelection(text, { start: 0, end: chip.start + 3 }, null), { start: 0, end: chip.end });
  });

  test('a caret outside every chip is left alone', () => {
    assert.deepEqual(snapSelection(text, caretAt(chip.end + 2), caretAt(chip.end + 1)), caretAt(chip.end + 2));
  });
});

describe('typing next to a chip', () => {
  const draft = `${IMAGE} world`;
  const text = chips(draft, IMAGE);
  const chip = text.chips[0]!;

  test('a letter typed before the chip stays before it', () => {
    const result = editShown(text, typeAt(text.shown, chip.start, 'H'));
    assert.equal(result.text.draft, `H${IMAGE} world`);
    assert.equal(result.caret, chip.start + 1);
    assert.equal(result.draftCaret, 1);
    assert.equal(result.rewritten, false);
    assert.equal(result.text.chips[0]!.start, chip.start + 1);
  });

  test('a word typed right after the chip stays after it', () => {
    let current = text;
    let caret = chip.end;
    for (const letter of 'see') {
      const result = editShown(current, typeAt(current.shown, caret, letter));
      assert.equal(result.rewritten, false);
      current = result.text;
      caret = result.caret;
    }
    assert.equal(current.draft, `${IMAGE}see world`);
    assert.equal(caret, chip.end + 3);
  });

  test('text that lands inside the chip goes after it', () => {
    const result = editShown(text, typeAt(text.shown, chip.start + 3, 'x'));
    assert.equal(result.text.draft, `${IMAGE}x world`);
    assert.equal(result.caret, chip.end + 1);
    assert.equal(result.rewritten, true);
  });

  test('typing never changes the chip it does not touch', () => {
    const result = editShown(text, typeAt(text.shown, text.shown.length, '!'));
    assert.equal(result.text.draft, `${IMAGE} world!`);
    assert.deepEqual(result.text.chips, text.chips);
    assert.equal(result.text.shown, projectDraft(result.text.draft, referencesIn(result.text.draft, IMAGE)).shown);
  });
});

describe('Backspace and Delete take the whole chip', () => {
  const draft = `see ${IMAGE} and ${IMAGE_2}`;
  const text = chips(draft, IMAGE, IMAGE_2);
  const [first, second] = text.chips;

  test('Backspace right after a chip deletes its whole reference', () => {
    const result = editShown(text, backspaceAt(text.shown, first!.end));
    assert.equal(result.text.draft, `see  and ${IMAGE_2}`);
    assert.equal(result.caret, first!.start);
    assert.equal(result.draftCaret, 4);
    assert.equal(result.rewritten, true);
    assert.equal(result.text.shown, `see  and ${CHIP_2}`);
    assert.equal(result.text.chips.length, 1);
    assert.equal(result.text.chips[0]!.reference.start, result.text.draft.indexOf(IMAGE_2));
  });

  test('held Backspace deletes the chip once, then the text before it', () => {
    let current = text;
    let caret = second!.end;
    for (let press = 0; press < 3; press += 1) {
      const result = editShown(current, backspaceAt(current.shown, caret));
      current = result.text;
      caret = result.caret;
    }
    assert.equal(current.draft, `see ${IMAGE} an`);
    assert.equal(current.chips.length, 1);
  });

  test('Delete right before a chip deletes its whole reference', () => {
    const forward = text.shown.slice(0, first!.start) + text.shown.slice(first!.start + 1);
    const result = editShown(text, forward);
    assert.equal(result.text.draft, `see  and ${IMAGE_2}`);
    assert.equal(result.caret, first!.start);
  });

  test('Backspace before a chip deletes the letter, not the chip', () => {
    const result = editShown(text, backspaceAt(text.shown, first!.start));
    assert.equal(result.text.draft, `see${IMAGE} and ${IMAGE_2}`);
    assert.equal(result.text.chips.length, 2);
  });

  test('replacing a selection that cuts into a chip replaces the whole chip', () => {
    const typed = text.shown.slice(0, 2) + 'Z' + text.shown.slice(first!.start + 4);
    const result = editShown(text, typed);
    assert.equal(result.text.draft, `seZ and ${IMAGE_2}`);
    assert.equal(result.caret, 3);
  });
});

describe('what is sent is the markdown desktop sends', () => {
  test('a message written around a pasted image keeps the image reference whole', () => {
    // The paste: the core put the reference at the caret and answered its pill.
    let draft = `${IMAGE} `;
    let text = chips(draft, IMAGE);
    let caret = text.shown.length;
    const type = (letters: string) => {
      for (const letter of letters) {
        const result = editShown(text, typeAt(text.shown, caret, letter));
        text = result.text;
        caret = result.caret;
      }
    };
    type('is this right?');
    // Home, then type in front of the chip.
    caret = snapSelection(text, caretAt(0), caretAt(caret)).end;
    type('Look: ');
    draft = text.draft;
    assert.equal(draft, `Look: ${IMAGE} is this right?`);
    assert.equal(text.shown, `Look: ${CHIP_1} is this right?`);
  });
});
