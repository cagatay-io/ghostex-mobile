/**
 * The brief highlight on the question a jump lands on (from the "Previous question" icon pill on the
 * working row, `cards/ChatPills.tsx`, or a Q-tag link in a reply), and the pill's tone. Which questions are unanswered, which one a tap
 * goes to and the row it sits in are the chat core's (`openQuestions`,
 * packages/gx-chat-core/src/questions/open_questions.rs); Transcript.tsx scrolls, this draws.
 *
 * CDXC:SessionChat 2026-10-14 SEE-ALSO:
 * Desktop draws the same pill and highlight in apps/desktop/src/app/native_chat/open_questions.rs and
 * scroll_bottom.rs; the rules are packages/gx-chat-core/src/transcript/open_questions.rs. Change them
 * together.
 */

import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

/** `questionTone`, `pillGap` and `questionFlashMs` in `scroll-bottom.json`. */
export const QUESTION_PILL = {
  gap: 8,
  flashMs: 1600,
  tone: {
    dark: { background: '#1d1712', border: 'rgba(251,146,60,0.4)', text: '#fdba74', ring: '#fb923c' },
    light: { background: '#fff7ed', border: 'rgba(234,88,12,0.35)', text: '#c2410c', ring: '#ea580c' },
  },
};

/**
 * The Q-tag pills in a reply and the Previous question pill's outline: `question-tags.json` in
 * packages/gx-chat-core/visual (desktop reads it in `open_questions.rs`), one tone per state of the
 * tag's question (gx-chat-core `TagState`, where the user's 2026-10-15 decision lives).
 */
export const QUESTION_TAGS = {
  radius: 6,
  paddingX: 5,
  iconSize: 12,
  gap: 3,
  tone: {
    dark: {
      open: { text: '#fdba74', border: 'rgba(251,146,60,0.55)' },
      answered: { text: '#86efac', border: 'rgba(74,222,128,0.4)' },
      withdrawn: { text: '#8a8a8a', border: 'rgba(255,255,255,0.16)' },
    },
    light: {
      open: { text: '#c2410c', border: 'rgba(234,88,12,0.5)' },
      answered: { text: '#15803d', border: 'rgba(22,163,74,0.45)' },
      withdrawn: { text: '#71717a', border: 'rgba(0,0,0,0.16)' },
    },
  },
} as const;

export type QuestionTagState = keyof typeof QUESTION_TAGS.tone.dark;

/** The question a jump just landed on; `key` changes with every jump so a repeat flashes again. */
export type QuestionFlash = { target: string; key: number };

const FlashContext = createContext<QuestionFlash | null>(null);
export const QuestionFlashProvider = FlashContext.Provider;

/** A question form or page card, outlined for a moment when a jump lands on it. */
export function QuestionFlashFrame({
  target,
  light,
  children,
}: {
  target: string;
  light: boolean;
  children: ReactNode;
}) {
  const flash = useContext(FlashContext);
  const active = flash !== null && target.length > 0 && flash.target === target;
  const opacity = useRef(new Animated.Value(0)).current;
  const key = active ? flash.key : null;
  useEffect(() => {
    if (key === null) {
      opacity.setValue(0);
      return;
    }
    opacity.setValue(1);
    const fade = Animated.timing(opacity, {
      toValue: 0,
      duration: QUESTION_PILL.flashMs / 3,
      delay: (QUESTION_PILL.flashMs * 2) / 3,
      useNativeDriver: true,
    });
    fade.start();
    return () => fade.stop();
  }, [key, opacity]);
  const ring = (light ? QUESTION_PILL.tone.light : QUESTION_PILL.tone.dark).ring;
  return (
    <View>
      {children}
      {active ? (
        <Animated.View
          pointerEvents='none'
          style={[styles.ring, { borderColor: ring, backgroundColor: `${ring}14`, opacity }]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', top: -4, left: -4, right: -4, bottom: -4, borderRadius: 18, borderWidth: 2 },
});
