/**
 * Ask Ghostex AI's welcome card, the phone's copy of desktop `native_chat/chief_welcome.rs` (the rules are gx-chat-core
 * `extras/chief_welcome.rs`): the clipboard ghost, then First steps for a new user or the live status and prompts once
 * they are set up. A step, chip or prompt fills the chat box; the white ask button only focuses it. One column on a
 * phone; the chips wrap.
 *
 * CDXC:Chief 2026-11-21 DECISION (gx-chat-core `extras/chief_welcome.rs`): the approved spec cos-welcome-card-v3. The
 * ghost floats, waves and blinks, and holds still while the phone asks for reduced motion.
 */

import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import type { ChiefWelcome as ChiefWelcomeCard, ChiefWelcomePrompt } from '../../rust/document';
import type { RustChat } from '../../rust/useRustChat';
import { Glyph, type GlyphName } from '../composer/icons';
import { themedStyles, useTranscriptTheme } from '../transcript/theme';
import { GHOST_ARMS, GHOST_BODY, GHOST_EYES } from './chiefGhost';

/** The amber of the "needs you" dot. */
const NEEDS_YOU = '#e5a33a';

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => live && setReduced(value))
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}

/** The wave's arm frame and the blink's eyes at `ms` into their beats (the desktop's timings). */
function frames(ms: number): { arm: number; eyes: keyof typeof GHOST_EYES } {
  const wave = (ms % 4000) / 4000;
  const phase = Math.floor(wave / 0.1);
  const within = (wave / 0.1) % 1;
  const swing = phase === 0 || phase === 2 ? within : phase === 1 || phase === 3 ? 1 - within : 0;
  const blink = (ms % 4600) / 4600;
  const eyes = blink < 0.9 ? 'open' : blink < 0.92 || blink >= 0.97 ? 'half' : 'closed';
  return { arm: Math.min(3, Math.round(swing * 3)), eyes };
}

function Ghost({ size }: { size: number }) {
  const still = useReducedMotion();
  const [clock, setClock] = useState(0);
  const lift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (still) {
      setClock(0);
      lift.setValue(0);
      return;
    }
    const started = Date.now();
    const timer = setInterval(() => setClock(Date.now() - started), 90);
    const float = Animated.loop(
      Animated.sequence([
        Animated.timing(lift, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(lift, { toValue: 0, duration: 1700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    float.start();
    return () => {
      clearInterval(timer);
      float.stop();
    };
  }, [still, lift]);
  const { arm, eyes } = frames(clock);
  const layer = { position: 'absolute' as const, top: 0, left: 0 };
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View
        style={{ width: size, height: size, transform: [{ translateY: Animated.multiply(lift, -4) }] }}
      >
        <SvgXml xml={GHOST_ARMS[arm] ?? GHOST_ARMS[0]} width={size} height={size} style={layer} />
        <SvgXml xml={GHOST_BODY} width={size} height={size} style={layer} />
        <SvgXml xml={GHOST_EYES[eyes]} width={size} height={size} style={layer} />
      </Animated.View>
    </View>
  );
}

export function ChiefWelcome({ chat, card }: { chat: RustChat; card: ChiefWelcomeCard }) {
  const styles = useStyles();
  const P = useTranscriptTheme();
  const fill = (text: string) => chat.composer?.replace(text);
  const focus = () => chat.composer?.replace(chat.state?.composer.text ?? '');
  const newUser = card.card === 'newUser';
  const done = card.steps.filter((step) => step.done).length;
  const ink = P.light ? '#27272a' : '#0d0d0d';
  const glyph = (name: string) => name as GlyphName;
  const prompt = (row: ChiefWelcomePrompt, kind: 'chip' | 'prompt') => (
    <Pressable
      key={row.fill}
      accessibilityRole="button"
      accessibilityLabel={row.label}
      onPress={() => fill(row.fill)}
      style={({ pressed }) => [kind === 'chip' ? styles.chip : styles.prompt, pressed ? styles.pressed : null]}
    >
      <Glyph name={glyph(row.icon)} size={kind === 'chip' ? 13 : 15} color={P.ink(kind === 'chip' ? 0.65 : 0.7)} />
      <Text style={kind === 'chip' ? styles.chipText : styles.promptText} numberOfLines={1}>
        {row.label}
      </Text>
    </Pressable>
  );
  return (
    <View style={styles.region}>
      <Ghost size={newUser ? 92 : 88} />
      <Text style={styles.title}>{card.title}</Text>
      {card.line ? <Text style={styles.line}>{card.line}</Text> : null}
      {card.status !== null ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => card.status !== null && fill(card.status.fill)}
          style={({ pressed }) => [styles.status, pressed ? styles.pressed : null]}
        >
          <View style={[styles.dot, { backgroundColor: card.status.attention ? NEEDS_YOU : P.muted }]} />
          <Text style={styles.statusText}>
            {card.status.text}
            {card.status.needs !== null ? (
              <>
                {' · '}
                <Text style={styles.statusNeeds}>{card.status.needs}</Text>
              </>
            ) : null}
          </Text>
        </Pressable>
      ) : null}
      {newUser ? (
        <View style={styles.steps}>
          <View style={[styles.clip, { backgroundColor: P.light ? '#2b2b33' : P.ink(0.22) }]} />
          <View style={styles.stepsHead}>
            <Text style={styles.stepsTitle}>First steps</Text>
            <Text style={styles.stepsCount}>{`${done} of ${card.steps.length}`}</Text>
          </View>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${(done / Math.max(1, card.steps.length)) * 100}%` }]} />
          </View>
          {card.steps.map((step) => (
            <Pressable
              key={step.fill}
              accessibilityRole="button"
              accessibilityLabel={step.label}
              accessibilityState={{ checked: step.done }}
              onPress={() => fill(step.fill)}
              style={({ pressed }) => [styles.step, pressed ? styles.pressed : null]}
            >
              <View style={step.done ? styles.markDone : styles.mark}>
                {step.done ? <Glyph name="check" size={11} color={P.background} /> : null}
              </View>
              <Text style={step.done ? styles.stepDone : styles.stepText} numberOfLines={1}>
                {step.label}
              </Text>
              {step.done ? null : <Glyph name="chevron-right" size={13} color={P.ink(0.35)} />}
            </Pressable>
          ))}
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={card.askTitle}
        onPress={focus}
        style={({ pressed }) => [styles.ask, P.light ? styles.askLight : null, pressed ? styles.pressed : null]}
      >
        <Glyph name="message-circle" size={18} color={ink} />
        <View style={styles.askWords}>
          <Text style={[styles.askTitle, { color: ink }]}>{card.askTitle}</Text>
          <Text style={[styles.askDetail, { color: ink }]}>{card.askDetail}</Text>
        </View>
        <Glyph name="chevron-right" size={15} color={ink} />
      </Pressable>
      {newUser ? (
        <View style={styles.chips}>{card.chips.map((chip) => prompt(chip, 'chip'))}</View>
      ) : (
        <View style={styles.prompts}>{card.prompts.map((row) => prompt(row, 'prompt'))}</View>
      )}
    </View>
  );
}

const useStyles = themedStyles((P) => ({
  region: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: 28,
  },
  title: { fontSize: 22, lineHeight: 27, fontWeight: '600', color: P.foreground },
  line: { marginTop: -6, maxWidth: 380, textAlign: 'center', fontSize: 14, lineHeight: 20, color: P.muted },
  status: {
    marginTop: -4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: P.ink(P.light ? 0.06 : 0.07),
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12.5, color: P.muted },
  statusNeeds: { fontWeight: '600', color: P.foreground },
  steps: {
    width: '100%',
    maxWidth: 440,
    marginTop: 4,
    paddingTop: 16,
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderRadius: 18,
    backgroundColor: P.light ? 'rgba(255,255,255,0.55)' : P.ink(0.04),
    borderWidth: 1,
    borderColor: P.ink(0.08),
  },
  clip: { position: 'absolute', top: -6, alignSelf: 'center', width: 36, height: 10, borderRadius: 4 },
  stepsHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: 8 },
  stepsTitle: { flex: 1, fontSize: 13, fontWeight: '600', color: P.foreground },
  stepsCount: { fontSize: 12, color: P.muted },
  bar: {
    height: 3,
    borderRadius: 2,
    marginHorizontal: 8,
    marginTop: 8,
    marginBottom: 6,
    overflow: 'hidden',
    backgroundColor: P.ink(0.07),
  },
  barFill: { height: '100%', borderRadius: 2, backgroundColor: P.ink(0.55) },
  step: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 8, paddingVertical: 9, borderRadius: 10 },
  mark: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: P.mutedInk(0.7) },
  markDone: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: P.ink(0.85),
  },
  stepText: { flex: 1, fontSize: 13.5, fontWeight: '500', color: P.foreground },
  stepDone: { flex: 1, fontSize: 13.5, fontWeight: '500', color: P.muted, textDecorationLine: 'line-through' },
  ask: {
    width: '100%',
    maxWidth: 440,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: P.light ? '#ffffff' : '#fcfcfc',
  },
  askLight: {
    borderWidth: 1,
    borderColor: 'rgba(39,39,42,0.10)',
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  askWords: { flex: 1, minWidth: 0 },
  askTitle: { fontSize: 14, fontWeight: '600' },
  askDetail: { marginTop: 1, fontSize: 12, opacity: 0.62 },
  chips: { maxWidth: 440, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: P.composerBorder,
  },
  chipText: { fontSize: 12.5, fontWeight: '500', color: P.foreground },
  prompts: { width: '100%', maxWidth: 440, gap: 8 },
  prompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: P.light ? 'rgba(255,255,255,0.55)' : P.ink(0.04),
    borderWidth: 1,
    borderColor: P.ink(0.08),
  },
  promptText: { flexShrink: 1, fontSize: 13, fontWeight: '500', color: P.foreground },
  pressed: { opacity: 0.7 },
}));
