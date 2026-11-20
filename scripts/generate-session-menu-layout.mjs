#!/usr/bin/env node
/*
Writes src/session-menu/layout.generated.json: the one session menu (rows' names, icons and each
spot's order) as gx-core's `session_menu_layout::layout_json()` builds it
(packages/gx-core/src/sidebar_menu/layout.rs in the Ghostex main repo this app sits in).

The phone reads the list from its chat core at run time (src/session-menu/layout.ts); this bundled
copy is what its menus use when the core cannot answer (an old core page, a page that keeps
crashing or never starts), so Close, Kill Session, Disconnect and Settings never disappear. It is
printed by gx-core's own `session_menu_layout` example, so it is the core's value, not a copy of
its source. Run after changing layout.rs (release builds run it and fail on a stale copy):

  node scripts/generate-session-menu-layout.mjs          (here)
  cargo xtask generate-mobile-session-menu               (from the Ghostex main repo)
*/
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ghostexRoot = path.resolve(mobileRoot, '..', '..', '..');
const outFile = path.join(mobileRoot, 'src', 'session-menu', 'layout.generated.json');

const run = spawnSync(
  'cargo',
  ['run', '--quiet', '--example', 'session_menu_layout'],
  { cwd: path.join(ghostexRoot, 'packages', 'gx-core'), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
);
if (run.status !== 0) {
  process.stderr.write(run.stderr ?? '');
  throw new Error(`gx-core's session_menu_layout example failed (exit ${run.status}).`);
}
const layout = JSON.parse(run.stdout);
if (!layout?.entries || !layout?.spots?.phoneRow) throw new Error('The session menu layout has no phone spots.');
const text = `${JSON.stringify(layout, null, 2)}\n`;
const previous = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : null;
if (previous !== text) fs.writeFileSync(outFile, text);
console.log(`${previous === text ? 'unchanged' : 'wrote'} ${path.relative(mobileRoot, outFile)}`);
