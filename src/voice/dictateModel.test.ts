/// <reference types="node" />
/** Run with `bun test src/voice/dictateModel.test.ts` from apps/mobile/app. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  dictionaryProblem,
  dictionarySummary,
  downloadPercent,
  engineCaption,
  engineStatusLine,
  formatBytes,
  isUnknownRoute,
  modelDetail,
  modelsBusy,
  modelSpeaks,
  parseAliases,
  type DictateEngine,
  type DictateOverview,
  type SpeechModel,
} from './dictateModel';

const parakeet: SpeechModel = {
  id: 'parakeet-tdt-0.6b-v3',
  title: 'Parakeet TDT 0.6B v3',
  shortTitle: 'Parakeet v3',
  languagesLabel: 'English + 24 European languages',
  languages: ['en', 'de', 'fr'],
  speedLabel: 'Fastest',
  downloadBytes: 715_135_416,
  diskBytes: 723_000_000,
  state: 'notDownloaded',
  inUse: true,
};

const overview = (patch: Partial<DictateOverview> = {}): DictateOverview => ({
  settings: {
    engine: 'local',
    localModel: parakeet.id,
    language: 'auto',
    dictionary: [],
    addProjectNames: true,
    removeFillers: true,
    polish: { enabled: true, model: 'claude-sonnet-5-5', prompt: null },
  },
  engine: { engine: 'local', label: 'Local, Parakeet v3', modelId: parakeet.id, ready: false, problem: null, polish: true },
  keys: { xai: { configured: false, unreadable: false }, openai: { configured: false, unreadable: false } },
  models: [parakeet],
  localAvailable: true,
  modelsDiskBytes: 0,
  projectWords: [],
  polishAvailable: true,
  languages: [{ code: 'auto', label: 'Auto-detect' }],
  ...patch,
});

describe('model sizes and downloads', () => {
  test('sizes read in GB, small ones in MB', () => {
    assert.equal(formatBytes(715_135_416), '0.72 GB');
    assert.equal(formatBytes(1_620_000_000), '1.62 GB');
    assert.equal(formatBytes(147_000_000), '0.15 GB');
    assert.equal(formatBytes(42_000_000), '42 MB');
  });

  test('a download counts up to 100, and preparing shows as done', () => {
    assert.equal(downloadPercent(parakeet), null);
    const half = { state: 'downloading' as const, download: { receivedBytes: 50, totalBytes: 200, error: null } };
    assert.equal(downloadPercent(half), 25);
    assert.equal(downloadPercent({ state: 'downloading', download: null }), 0);
    assert.equal(downloadPercent({ state: 'preparing', download: null }), 100);
  });

  test('polling goes on while any model downloads or prepares', () => {
    assert.equal(modelsBusy([{ state: 'ready' }, { state: 'notDownloaded' }]), false);
    assert.equal(modelsBusy([{ state: 'ready' }, { state: 'preparing' }]), true);
    assert.equal(modelsBusy([{ state: 'downloading' }]), true);
  });

  test('a model row says its state, size, languages and speed', () => {
    assert.equal(modelDetail(parakeet), '0.72 GB · English + 24 European languages · Fastest');
    assert.equal(
      modelDetail({ ...parakeet, state: 'ready' }),
      'In use · 0.72 GB · English + 24 European languages · Fastest',
    );
    assert.match(
      modelDetail({ ...parakeet, state: 'downloading', download: { receivedBytes: 1, totalBytes: 2, error: null } }),
      /^Downloading 50% · /,
    );
  });

  test('auto is every language; otherwise the model must list it', () => {
    assert.equal(modelSpeaks(parakeet, 'auto'), true);
    assert.equal(modelSpeaks(parakeet, 'de'), true);
    assert.equal(modelSpeaks(parakeet, 'ja'), false);
  });
});

describe('the dictionary', () => {
  test('aliases split on commas, trimmed, without repeats', () => {
    assert.deepEqual(parseAliases(' GX server,  g x   server , gx SERVER,,'), ['GX server', 'g x server']);
    assert.deepEqual(parseAliases(''), []);
  });

  test('a word needs text, must be new, and its spellings keep gxserver limits', () => {
    const others = [{ word: 'Ghostex', aliases: [] }];
    assert.equal(dictionaryProblem({ word: ' ', aliases: [] }, others), 'Type the word first.');
    assert.match(dictionaryProblem({ word: 'ghostex', aliases: [] }, others) ?? '', /already/);
    assert.match(dictionaryProblem({ word: 'gxserver', aliases: ['gx'] }, others) ?? '', /too short/);
    assert.match(
      dictionaryProblem({ word: 'gxserver', aliases: Array.from({ length: 9 }, (_, at) => `alias ${at}`) }, others) ?? '',
      /at most 8/,
    );
    assert.equal(dictionaryProblem({ word: 'gxserver', aliases: ['GX server'] }, others), null);
  });

  test('the summary counts words and says when project names count too', () => {
    assert.equal(dictionarySummary({ dictionary: [], addProjectNames: false }), 'No words');
    assert.equal(
      dictionarySummary({ dictionary: [{ word: 'a', aliases: [] }], addProjectNames: true }),
      '1 word + project names',
    );
  });
});

describe('what the phone says about the engine', () => {
  test('a local model not downloaded yet says so in the phone’s words, with its size', () => {
    assert.equal(
      engineCaption(overview(), 'MacBook Pro'),
      "Parakeet v3 isn't downloaded yet. Download it below (0.72 GB).",
    );
    const ready = overview({ engine: { ...overview().engine, ready: true } });
    assert.match(engineCaption(ready, 'MacBook Pro'), /on its own CPU/);
  });

  test('a cloud engine names the computer whose key it uses, or the missing key', () => {
    const xai = overview({
      settings: { ...overview().settings, engine: 'xai' },
      engine: { ...overview().engine, engine: 'xai', label: 'xAI speech to text' },
    });
    assert.match(engineCaption(xai, 'Studio PC'), /Studio PC has no xAI key yet/);
    const keyed = { ...xai, keys: { ...xai.keys, xai: { configured: true, unreadable: false } } };
    assert.equal(engineCaption(keyed, 'Studio PC'), 'Recordings go to xAI with the key saved on Studio PC.');
  });

  test('the Dictate menu never says Click', () => {
    const engine: DictateEngine = {
      engine: 'local',
      label: 'Local, Parakeet v3',
      modelId: parakeet.id,
      ready: false,
      problem: { code: 'modelMissing', message: 'Not downloaded yet. Click to download (0.72 GB)' },
      polish: false,
    };
    assert.doesNotMatch(engineStatusLine(engine, 'MacBook Pro'), /Click/);
    assert.equal(
      engineStatusLine({ ...engine, ready: true, problem: null, polish: true }, 'MacBook Pro'),
      'Transcribes on MacBook Pro, then AI polish.',
    );
  });

  test('a computer without the routes reads as one to update', () => {
    assert.equal(isUnknownRoute({ code: 'notFound', message: 'Unknown Dictate route.' }), true);
    assert.equal(isUnknownRoute({ code: 'unreachable', message: "Couldn't reach Ghostex." }), false);
  });
});
