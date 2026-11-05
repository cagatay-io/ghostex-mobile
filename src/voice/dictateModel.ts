/**
 * Dictate's settings as each computer's gxserver keeps them (`/api/readDictateSettings`): the
 * engine that transcribes (a local model, or the OpenAI or xAI key), the local models and their
 * downloads, the language, the dictionary, filler removal and AI polish. The phone only reads and
 * writes them; the microphone is the phone's own. Kept free of React Native so its rules are
 * testable under `bun test`.
 *
 * CDXC:VoiceMode 2026-11-05 DECISION: User (Q1275): the phone manages Dictate per computer in Settings › Voice, with a computer picker at the top, because the paired computer's gxserver is what transcribes.
 * CDXC:VoiceMode 2026-11-05 SEE-ALSO: the routes and shapes are gxserver's `server/src/voice_agent/speech/http.rs`; the desktop's Voice page draws the same settings.
 */

export type DictateEngineId = 'local' | 'openai' | 'xai';

export type DictionaryWord = { word: string; aliases: string[] };

export type DictateSettings = {
  engine: DictateEngineId;
  localModel: string;
  language: string;
  dictionary: DictionaryWord[];
  addProjectNames: boolean;
  removeFillers: boolean;
  polish: { enabled: boolean; model: string; prompt: string | null };
};

export type SpeechModelState = 'notDownloaded' | 'downloading' | 'preparing' | 'ready' | 'failed';

export type SpeechModel = {
  id: string;
  title: string;
  shortTitle: string;
  languagesLabel: string;
  languages: string[];
  speedLabel: string;
  downloadBytes: number;
  diskBytes: number;
  state: SpeechModelState;
  download?: { receivedBytes: number; totalBytes: number; error: string | null } | null;
  inUse: boolean;
  attribution?: string;
};

export type DictateProblemCode = 'modelMissing' | 'modelDownloading' | 'localUnavailable' | 'noKey' | 'keyUnreadable';

/** What will transcribe on a computer: its label ("Local, Parakeet v3") and why it can't yet. */
export type DictateEngine = {
  engine: DictateEngineId;
  label: string;
  modelId: string | null;
  ready: boolean;
  problem: { code: DictateProblemCode | string; message: string } | null;
  polish: boolean;
};

export type DictateOverview = {
  settings: DictateSettings;
  engine: DictateEngine;
  keys: Record<'xai' | 'openai', { configured: boolean; unreadable: boolean }>;
  models: SpeechModel[];
  localAvailable: boolean;
  modelsDiskBytes: number;
  projectWords: string[];
  polishAvailable: boolean;
  languages: { code: string; label: string }[];
};

export const DICTATE_ENGINES: readonly { value: DictateEngineId; label: string }[] = [
  { value: 'local', label: 'Local' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'xai', label: 'xAI' },
];

/** The dictionary's limits, as gxserver checks them (`speech/settings.rs`). */
export const DICTIONARY_LIMITS = { words: 200, wordLength: 64, aliasMin: 3, aliasMax: 64, aliases: 8 } as const;

/** "0.72 GB", or "150 MB" under a gigabyte's tenth. */
export function formatBytes(bytes: number): string {
  if (bytes >= 100_000_000) return `${(bytes / 1e9).toFixed(2)} GB`;
  return `${Math.max(1, Math.round(bytes / 1e6))} MB`;
}

/** A download's percentage (0 to 100), or null when nothing is downloading. */
export function downloadPercent(model: Pick<SpeechModel, 'state' | 'download'>): number | null {
  if (model.state === 'preparing') return 100;
  if (model.state !== 'downloading') return null;
  const total = model.download?.totalBytes ?? 0;
  if (total <= 0) return 0;
  return Math.min(100, Math.floor(((model.download?.receivedBytes ?? 0) / total) * 100));
}

/** Whether a model list still moves (a download or its preparing step), so the phone keeps polling. */
export function modelsBusy(models: readonly Pick<SpeechModel, 'state'>[]): boolean {
  return models.some((model) => model.state === 'downloading' || model.state === 'preparing');
}

/** A model row's second line: "In use · 0.72 GB · English + 24 European languages · Fastest". */
export function modelDetail(model: SpeechModel): string {
  const percent = downloadPercent(model);
  const size = formatBytes(model.state === 'ready' ? model.diskBytes : model.downloadBytes);
  const status =
    model.state === 'preparing'
      ? 'Preparing…'
      : percent !== null
        ? `Downloading ${percent}%`
        : model.state === 'failed'
          ? 'Download failed'
          : model.state === 'ready'
            ? model.inUse
              ? 'In use'
              : 'Downloaded'
            : null;
  return [status, size, model.languagesLabel, model.speedLabel].filter((part) => part !== null).join(' · ');
}

/** Whether the chosen language is one `model` knows ("auto" always is). */
export function modelSpeaks(model: Pick<SpeechModel, 'languages'>, language: string): boolean {
  return language === 'auto' || model.languages.includes(language);
}

/** A comma-separated alias field as aliases: trimmed, empty ones and repeats dropped. */
export function parseAliases(text: string): string[] {
  const seen = new Set<string>();
  const aliases: string[] = [];
  for (const part of text.split(',')) {
    const alias = part.trim().replace(/\s+/g, ' ');
    const key = alias.toLowerCase();
    if (alias.length === 0 || seen.has(key)) continue;
    seen.add(key);
    aliases.push(alias);
  }
  return aliases;
}

/** Why a dictionary word can't be saved as it is, in a sentence, or null when it can. */
export function dictionaryProblem(
  entry: DictionaryWord,
  others: readonly DictionaryWord[],
): string | null {
  const word = entry.word.trim();
  if (word.length === 0) return 'Type the word first.';
  if (word.length > DICTIONARY_LIMITS.wordLength)
    return `A word can be at most ${DICTIONARY_LIMITS.wordLength} characters.`;
  if (others.some((other) => other.word.trim().toLowerCase() === word.toLowerCase()))
    return `"${word}" is already in the dictionary.`;
  if (entry.aliases.length > DICTIONARY_LIMITS.aliases)
    return `A word can have at most ${DICTIONARY_LIMITS.aliases} spellings to replace.`;
  const short = entry.aliases.find(
    (alias) => alias.length < DICTIONARY_LIMITS.aliasMin || alias.length > DICTIONARY_LIMITS.aliasMax,
  );
  if (short !== undefined)
    return `"${short}" is too ${short.length < DICTIONARY_LIMITS.aliasMin ? 'short' : 'long'}: a spelling to replace is ${DICTIONARY_LIMITS.aliasMin} to ${DICTIONARY_LIMITS.aliasMax} characters.`;
  return null;
}

/** The Dictionary row's summary: "4 words + project names". */
export function dictionarySummary(settings: Pick<DictateSettings, 'dictionary' | 'addProjectNames'>): string {
  const count = settings.dictionary.length;
  const words = count === 0 ? 'No words' : `${count} word${count === 1 ? '' : 's'}`;
  return settings.addProjectNames ? `${words} + project names` : words;
}

/** The name the language list gives `code` ("Auto-detect", "English"), or the code itself. */
export function languageLabel(languages: readonly { code: string; label: string }[], code: string): string {
  return languages.find((entry) => entry.code === code)?.label ?? code;
}

/**
 * A recording's engine line for the phone: "Local, Parakeet v3", the engine label gxserver gives,
 * or null before the computer has answered.
 */
export function engineLine(engine: Pick<DictateEngine, 'label'> | null): string | null {
  const label = engine?.label.trim() ?? '';
  return label.length > 0 ? label : null;
}

/**
 * What the chat's long-press menu says under the engine: where it transcribes, or why it can't yet,
 * in the phone's words (gxserver's own sentences say "Click" and "in Settings").
 */
export function engineStatusLine(engine: DictateEngine, computer: string): string {
  if (engine.ready) return `Transcribes on ${computer}${engine.polish ? ', then AI polish' : ''}.`;
  switch (engine.problem?.code) {
    case 'modelMissing':
      return `The model isn't downloaded on ${computer} yet. Download it in Voice settings.`;
    case 'modelDownloading':
      return engine.problem.message;
    case 'noKey':
      return `${computer} has no key for it yet. Add it in Ghostex Settings › Voice there.`;
    case 'keyUnreadable':
      return `${computer} can't read its key anymore. Paste it again in Ghostex Settings › Voice there.`;
    default:
      return engine.problem?.message ?? '';
  }
}

/** A gxserver too old to have these routes answers that the route is unknown. */
export function isUnknownRoute(error: { code?: string | null; message: string }): boolean {
  return error.code === 'notFound' || /unknown .*route|not found/i.test(error.message);
}

/** The engine row's caption on the phone: what transcribes, and what is missing for it. */
export function engineCaption(
  overview: Pick<DictateOverview, 'engine' | 'keys' | 'models' | 'settings'>,
  computer: string,
): string {
  const { engine, keys } = overview;
  if (engine.engine !== 'local') {
    const provider = engine.engine === 'xai' ? 'xAI' : 'OpenAI';
    const key = keys[engine.engine];
    if (key?.unreadable)
      return `${computer} can't read its ${provider} key anymore. Paste it again in Ghostex Settings › Voice there.`;
    if (key?.configured !== true) return `${computer} has no ${provider} key yet. Add it in Ghostex Settings › Voice there.`;
    return `Recordings go to ${provider} with the key saved on ${computer}.`;
  }
  if (engine.ready) return `${computer} transcribes on its own CPU. Recordings never leave it.`;
  const model = overview.models.find((entry) => entry.id === overview.settings.localModel);
  if (model === undefined) return 'Pick a model below.';
  return modelProblem(model);
}

/** Why a local model can't transcribe yet, in the phone's words (gxserver's says "Click"). */
export function modelProblem(model: SpeechModel): string {
  const percent = downloadPercent(model);
  if (model.state === 'preparing') return `${model.shortTitle} is almost ready (preparing it).`;
  if (percent !== null) return `${model.shortTitle} is downloading (${percent}%).`;
  if (model.state === 'failed')
    return model.download?.error ?? `${model.shortTitle}'s download stopped. Download it again.`;
  return `${model.shortTitle} isn't downloaded yet. Download it below (${formatBytes(model.downloadBytes)}).`;
}
