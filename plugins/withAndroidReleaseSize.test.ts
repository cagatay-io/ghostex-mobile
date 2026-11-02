/// <reference types="node" />
/** Run with `bun test plugins/withAndroidReleaseSize.test.ts` from apps/mobile/app. */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';

const { writeAppProguardRules } = require('./withAndroidReleaseSize.js') as {
  writeAppProguardRules: (file: string) => void;
};

describe('withAndroidReleaseSize', () => {
  test('keeps the ML Kit registrar constructors R8 would strip (issue #394)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-size-'));
    try {
      const file = path.join(root, 'proguard-rules.pro');
      fs.writeFileSync(file, '# Add project specific ProGuard rules here.\n');
      // `expo prebuild` runs the plugin on every build, over the file the last run wrote.
      writeAppProguardRules(file);
      writeAppProguardRules(file);
      const rules = fs.readFileSync(file, 'utf8');
      assert.match(
        rules,
        /^-keep class \* implements com\.google\.firebase\.components\.ComponentRegistrar \{ void <init>\(\); \}$/m,
      );
      assert.equal(rules.split('# BEGIN plugins/withAndroidReleaseSize.js').length - 1, 1, 'one rules block after two runs');
      assert.ok(rules.startsWith('# Add project specific ProGuard rules here.\n'), 'the file keeps its own rules');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
