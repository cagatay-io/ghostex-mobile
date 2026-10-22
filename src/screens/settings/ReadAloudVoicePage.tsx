/**
 * Settings › Chat › Voice: which of the phone's own voices Read aloud speaks with
 * (`readAloudVoice`; `''` is the phone's default voice). Picking one says a sentence with it.
 *
 * CDXC:VoiceMode 2026-10-22 WHY: a phone's engine lists hundreds of voices in every language, so the list shows the phone's language and English (agents mostly answer in English), plus the chosen voice when it is in another language.
 */

import { useEffect, useState } from 'react';

import type { SpeechVoice, SpeechVoices } from '../../../modules/ghostex-native/src';
import { useSettingsStore } from '../../settings/store';
import { previewReadAloudVoice, readAloudVoices } from '../../voice/readAloud';
import { Caption, ChoiceRow, SectionHeader, SettingsScreenLayout } from './SettingsControls';

/** The short name a voice goes by within its language: Google's `en-us-x-iob-local` is "iob". */
export function voiceVariant(voice: SpeechVoice): string {
  const variant = /-x-([a-z0-9]+)-(?:local|network)$/iu.exec(voice.name)?.[1];
  if (variant !== undefined) return variant;
  return /-language$/iu.test(voice.name) ? 'standard' : voice.name;
}

/**
 * One voice as a row label: its short name, and whether it needs the network or a download. An
 * online voice is never downloaded, though Google's engine marks it not installed too.
 */
export function voiceLabel(voice: SpeechVoice): string {
  const note = voice.network ? 'online' : voice.notInstalled ? 'needs download' : null;
  return `Voice ${voiceVariant(voice)}${note !== null ? ` (${note})` : ''}`;
}

export default function ReadAloudVoicePage() {
  const selected = useSettingsStore((state) => state.settings.readAloudVoice);
  const setSetting = useSettingsStore((state) => state.setSetting);
  const [answer, setAnswer] = useState<SpeechVoices | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    void readAloudVoices()
      .catch(() => null)
      .then((voices) => {
        if (live) setAnswer(voices);
      });
    return () => {
      live = false;
    };
  }, []);

  const choose = (name: string) => {
    setSetting('readAloudVoice', name);
    previewReadAloudVoice();
  };

  if (answer === undefined) {
    return (
      <SettingsScreenLayout>
        <Caption>Reading this phone's voices…</Caption>
      </SettingsScreenLayout>
    );
  }
  if (answer === null) {
    return (
      <SettingsScreenLayout>
        <Caption>
          This phone has no text-to-speech voice. Install one in Android Settings › Text-to-speech output.
        </Caption>
      </SettingsScreenLayout>
    );
  }
  const shown = answer.voices.filter(
    (voice) => voice.language === answer.language || voice.language === 'en' || voice.name === selected,
  );
  const byLocale = new Map<string, SpeechVoice[]>();
  for (const voice of shown) {
    const group = byLocale.get(voice.localeLabel) ?? [];
    group.push(voice);
    byLocale.set(voice.localeLabel, group);
  }
  return (
    <SettingsScreenLayout>
      <ChoiceRow label="Phone's default voice" selected={selected === ''} onPress={() => choose('')} />
      <Caption>The voice set in Android Settings › Text-to-speech output.</Caption>
      {[...byLocale.entries()].map(([locale, voices]) => (
        <VoiceGroup key={locale} title={locale} voices={voices} selected={selected} onChoose={choose} />
      ))}
      <Caption>
        Picking a voice says a sentence with it. A voice marked online needs a connection; one that needs a download is
        fetched the first time it speaks.
      </Caption>
    </SettingsScreenLayout>
  );
}

function VoiceGroup({
  title,
  voices,
  selected,
  onChoose,
}: {
  title: string;
  voices: SpeechVoice[];
  selected: string;
  onChoose: (name: string) => void;
}) {
  return (
    <>
      <SectionHeader title={title} />
      {voices.map((voice) => (
        <ChoiceRow
          key={voice.name}
          label={voiceLabel(voice)}
          selected={selected === voice.name}
          onPress={() => onChoose(voice.name)}
        />
      ))}
    </>
  );
}
