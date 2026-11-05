/**
 * Keeping a one-click answer where the reader tapped it (desktop `answer_anchor.rs`).
 *
 * CDXC:SessionChat 2026-11-05 SEE-ALSO: The decision ("when i answer one of these the scroll jumps") is on desktop's `answer_anchor.rs`. The inverted list follows the newest row while the reader is within `autoscrollToTopThreshold` of the bottom, so the "You answered" card an answer adds slid the tapped pill up. A tap on a one-click answer, its Change or its own-answer Send turns that following off (`Transcript.tsx` keeps only `minIndexForVisible`, which holds the rows on screen still), until the reader drags the list, taps Scroll to bottom, or sends from the composer.
 */

import { create } from 'zustand';

type AnswerHold = { held: boolean };

export const useAnswerHold = create<AnswerHold>(() => ({ held: false }));

/** An answer was sent from inside the transcript: stop following the newest row. */
export function holdForAnswer(): void {
  if (!useAnswerHold.getState().held) useAnswerHold.setState({ held: true });
}

/** The reader moved the list or sent from the composer: follow the newest row again near the bottom. */
export function releaseAnswerHold(): void {
  if (useAnswerHold.getState().held) useAnswerHold.setState({ held: false });
}

/** The actions that answer a question in place in the transcript. */
export function holdsTranscript(type: string): boolean {
  return (
    type === 'inlineAnswer' ||
    type === 'inlineAnswerChange' ||
    type === 'inlineAnswerText' ||
    type === 'formSend' ||
    type === 'formSkipAll'
  );
}
