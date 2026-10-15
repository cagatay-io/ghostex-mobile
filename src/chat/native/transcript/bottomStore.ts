/**
 * Whether the reader has left the bottom of the main transcript, and how to go back there. The
 * transcript owns its scroll; the working row's scroll-to-bottom pill (`ChatPills.tsx`) sits outside
 * it, in the cards above the composer, so the transcript publishes both here (desktop reads the same
 * from its own list in `chat_pills.rs`).
 */

import { create } from 'zustand';

type TranscriptBottom = {
  awayFromBottom: boolean;
  jumpToBottom: (() => void) | null;
};

export const useTranscriptBottomStore = create<TranscriptBottom>(() => ({ awayFromBottom: false, jumpToBottom: null }));
