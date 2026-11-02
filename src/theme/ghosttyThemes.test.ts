/// <reference types="node" />
/**
 * Run with `bun test src/theme/ghosttyThemes.test.ts`. Which Ghostty themes ship (D-101: only a licence the app may
 * pass on, by the theme's exact entry in iTerm2-Color-Schemes' licenses.yml) and that the notices cover each one. The
 * licenses.yml lines below are copied from the pinned file
 * (https://raw.githubusercontent.com/mbadolato/iTerm2-Color-Schemes/f6fc23cea088fe144ab0d8c604199afcc3c5da8e/licenses.yml).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

import { EXCLUDED, missingNotices, parseLicences, themeVerdict } from '../../scripts/generate-ghostty-themes';
import { NoticesError } from '../../scripts/notices/common';
import { checkGhosttyThemeCoverage } from '../../scripts/notices/native';

const LICENCES_YML = `# Licence of every colour scheme in this repository, one entry per scheme.

'0x96f':
  license: MIT
  source: https://github.com/filipjanevski/0x96f-term-theme
3024 Day:
  license: unknown
  source: https://github.com/0x3024
  note: Theme is based on artwork of a record label and reuses the same name https://3024world.com/
Alabaster:
  license: MIT
  source: 'https://github.com/mkaschenko/iterm2-theme-alabaster

    https://github.com/tonsky/sublime-scheme-alabaster'
Breeze:
  license: GPL-2.0-only
  source: https://github.com/KDE/konsole/blob/master/data/color-schemes/Breeze.colorscheme
GitHub Dark:
  license: MIT
  source: https://github.com/primer/github-vscode-theme
Molokai:
  license: MIT
  source: https://github.com/tomasr/molokai
Monokai Pro:
  license: nonfree
  source: https://monokai.pro/license
  note: The research lists this row without a name, in the place where Monokai Pro sorts.
Obsidian:
  license: unknown
  source: ''
  note: '"The Obsidian theme was on my hard drive and I don''t recall where it came from. "'
`;

const SHIPPED = Object.keys(
  JSON.parse(readFileSync(new URL('./ghosttyThemes.json', import.meta.url), 'utf8')) as Record<string, unknown>,
);

describe('licenses.yml as the generator reads it', () => {
  const licences = parseLicences(LICENCES_YML);

  test('plain, quoted and multi-line entries', () => {
    assert.equal(licences.size, 8);
    assert.deepEqual(licences.get('0x96f'), {
      licence: 'MIT',
      source: 'https://github.com/filipjanevski/0x96f-term-theme',
    });
    assert.equal(
      licences.get('Alabaster')?.source,
      'https://github.com/mkaschenko/iterm2-theme-alabaster\nhttps://github.com/tonsky/sublime-scheme-alabaster',
    );
    assert.equal(licences.get('Obsidian')?.source, '');
  });

  test('a line it does not understand stops the run', () => {
    assert.throws(() => parseLicences('GitHub Dark:\n  licence: MIT\n'), /line 2 is not understood/);
  });
});

describe('which themes ship (D-101)', () => {
  const licences = parseLicences(LICENCES_YML);

  test('nonfree, GPL-2.0-only and unknown themes are dropped; an MIT theme is kept', () => {
    assert.deepEqual(themeVerdict('Monokai Pro', licences), { kept: false, reason: 'nonfree' });
    assert.deepEqual(themeVerdict('Breeze', licences), { kept: false, reason: 'GPL-2.0-only' });
    assert.deepEqual(themeVerdict('3024 Day', licences), { kept: false, reason: 'unknown' });
    assert.deepEqual(themeVerdict('GitHub Dark', licences), { kept: true, licence: 'MIT' });
  });

  test('a name without its own entry and an excluded name are dropped, even with an MIT entry', () => {
    assert.deepEqual(themeVerdict('hazyland', licences), { kept: false, reason: 'excluded' });
    assert.deepEqual(themeVerdict('Monokai Pro Light', licences), { kept: false, reason: 'no licenses.yml entry' });
    assert.deepEqual(themeVerdict('Molokai', licences), { kept: false, reason: 'excluded' });
  });

  test('a licence nobody classified stops the run', () => {
    const other = parseLicences('Foo:\n  license: MPL-2.0\n  source: https://example.org\n');
    assert.throws(() => themeVerdict('Foo', other), /MPL-2.0 is not classified/);
  });

  test('the bundled palettes hold none of the dropped themes and keep the defaults', () => {
    for (const name of ['Monokai Pro', 'Breeze', '3024 Day', 'Obsidian', ...Object.keys(EXCLUDED)]) {
      assert.equal(SHIPPED.includes(name), false, name);
    }
    for (const name of ['GitHub Dark', 'GitHub Light Default', '0x96f', 'Alabaster']) {
      assert.equal(SHIPPED.includes(name), true, name);
    }
  });
});

describe('the notices cover every palette that ships', () => {
  test('each bundled palette is listed by an entry of its licence', () => {
    assert.doesNotThrow(() => checkGhosttyThemeCoverage(SHIPPED));
    assert.deepEqual(
      missingNotices(
        new Map([
          ['GitHub Dark', 'MIT'],
          ['Fahrenheit', 'CC-BY-SA-4.0'],
          ['Atom', 'WTFPL'],
        ]),
      ),
      [],
    );
  });

  test('a palette no entry lists, or a listed one the file lacks, stops the notices run', () => {
    assert.throws(
      () => checkGhosttyThemeCoverage([...SHIPPED, 'Monokai Pro']),
      (error: unknown) => {
        return error instanceof NoticesError && error.message.includes('Monokai Pro');
      },
    );
    assert.throws(
      () => checkGhosttyThemeCoverage(SHIPPED.filter((name) => name !== 'GitHub Dark')),
      (error: unknown) => error instanceof NoticesError && error.message.includes('GitHub Dark'),
    );
  });

  test('a kept theme without an entry of its own licence is reported', () => {
    assert.deepEqual(missingNotices(new Map([['Brand New', 'MIT']])), ['Brand New (MIT): no entry lists it']);
    assert.deepEqual(missingNotices(new Map([['GitHub Dark', 'Apache-2.0']])), [
      'GitHub Dark (Apache-2.0): no Apache-2.0 entry lists it',
    ]);
  });
});
