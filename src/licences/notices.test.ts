/// <reference types="node" />
/**
 * The notices file format: what the generator writes is what Settings › Licences reads, licence texts stay word
 * for word, and the committed file parses with the heading layout of the main repo's notices file.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';

import { crateEntry } from '../../scripts/notices/rust';
import {
  entryHeading,
  filterEntries,
  licenceParagraphs,
  NOTICES_INTRO,
  parseNotices,
  renderNotices,
  type NoticeEntry,
} from './notices';

const MIT: NoticeEntry = {
  name: '@scope/pkg',
  version: '1.2.3',
  about: 'JavaScript package in the app bundle.',
  url: 'https://github.com/scope/pkg',
  licence: 'MIT',
  texts: [
    {
      file: 'LICENSE',
      text: 'MIT License\n\nCopyright (c) 2024 Someone\n\nPermission is hereby granted,\nfree of charge.',
    },
  ],
};
const GO: NoticeEntry = {
  name: 'golang.org/x/net',
  version: 'v0.58.0',
  about: 'Go module compiled into the tailcat bridge.',
  url: 'https://pkg.go.dev/golang.org/x/net@v0.58.0',
  texts: [
    { file: 'LICENSE', text: 'Copyright 2009 The Go Authors.\n## not a heading\n```\ncode fence inside\n```' },
    { file: 'NOTICE', text: '  indented line\n\n\ttabbed' },
  ],
};

describe('notices file format', () => {
  test('starts like the main repo notices file and has one ## entry per component', () => {
    const file = renderNotices([MIT, GO], 'note');
    const lines = file.split('\n');
    assert.equal(lines[0], '# Third-party notices');
    assert.equal(lines[2], NOTICES_INTRO);
    assert.ok(lines.includes('## @scope/pkg@1.2.3'));
    assert.ok(lines.includes('## golang.org/x/net@v0.58.0'));
  });

  test('round trip keeps every entry and licence text word for word, even ones with fences and headings', () => {
    const parsed = parseNotices(renderNotices([MIT, GO], 'note'));
    assert.equal(parsed.intro, NOTICES_INTRO);
    assert.deepEqual(parsed.entries, [MIT, GO]);
  });

  test('a scoped name keeps its own @ when the heading is split', () => {
    assert.equal(entryHeading(MIT), '@scope/pkg@1.2.3');
    assert.equal(parseNotices(renderNotices([MIT], 'note')).entries[0].name, '@scope/pkg');
  });

  test('a file that is not a notices file is reported, not read as empty', () => {
    assert.throws(() => parseNotices('# Something else\n'));
    assert.throws(() => parseNotices(`# Third-party notices\n\n## broken heading\n`));
  });

  test("a crate's Cargo repository is written as a URL the page reads, else its crates.io page", () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'notices-crate-'));
    try {
      writeFileSync(path.join(dir, 'LICENSE'), 'MIT License');
      const about = 'Rust crate compiled into the chat core (WebAssembly).';
      const crates = [
        { name: 'dep', version: '1.0.0', repository: 'git+https://github.com/example/dep.git' },
        { name: 'other', version: '0.2.0', repository: 'not a url' },
      ].map((crate) => crateEntry(crate, dir, about));
      const { entries } = parseNotices(renderNotices(crates, 'note'));
      assert.deepEqual(
        entries.map((entry) => entry.url),
        ['https://github.com/example/dep', 'https://crates.io/crates/other/0.2.0'],
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test('the committed THIRD_PARTY_NOTICES.md parses and lists Ghostty, libssh2, OpenSSL and the terminal font', () => {
    const { entries } = parseNotices(readFileSync(new URL('../../THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8'));
    const names = new Set(entries.map((entry) => entry.name));
    for (const name of ['Ghostty', 'libssh2', 'OpenSSL', 'JetBrains Mono Nerd Font']) assert.ok(names.has(name), name);
    assert.ok(entries.every((entry) => entry.texts.length > 0 && entry.texts.every(({ text }) => text.length > 0)));
  });
});

describe('Licences page helpers', () => {
  test('licence paragraphs join hard line breaks inside a paragraph and keep paragraph breaks', () => {
    assert.deepEqual(licenceParagraphs(MIT.texts[0].text), [
      'MIT License',
      'Copyright (c) 2024 Someone',
      'Permission is hereby granted, free of charge.',
    ]);
  });

  test('search filters by name, ignoring case; an empty search shows everything', () => {
    assert.deepEqual(filterEntries([MIT, GO], ''), [MIT, GO]);
    assert.deepEqual(filterEntries([MIT, GO], 'X/NET'), [GO]);
    assert.deepEqual(filterEntries([MIT, GO], 'ssl'), []);
  });
});
