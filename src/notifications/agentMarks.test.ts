/**
 * The Lock Screen lists the agents as the approved mockup draws a row: the agent's mark first. The Live Activity
 * extension cannot run the app's React Native logo components, so it carries copies: the tint and name tables in
 * `modules/ghostex-live-activity/ios/Extension/GhostexAgentMarks.swift` and one vector image set per logo in
 * `Extension/Assets.xcassets/AgentMarks/`. This test fails when a copy disagrees with what the app draws:
 * `AGENT_ICON_TINTS` / `AGENT_NAME_ALIASES` in `src/contract/mobileSummary.ts` and the components of
 * `src/assets/agentIcons.generated.tsx` (same ids; the same elements with the same geometry: viewBox, path data,
 * transforms, fill rules, strokes, gradient and stops; template unless the component ignores `color`). The judgement
 * of the marks on the device stays; this checks only that the extension draws the app's marks.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

import { AGENT_NAME_ALIASES, agentIconTint, type AgentIconId } from '../contract/mobileSummary';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const EXTENSION = join(ROOT, 'modules/ghostex-live-activity/ios/Extension');
const swift = readFileSync(join(EXTENSION, 'GhostexAgentMarks.swift'), 'utf8');
const generated = readFileSync(join(ROOT, 'src/assets/agentIcons.generated.tsx'), 'utf8');

/** The `"key": value` entries of a Swift dictionary literal `static let <name>: [...] = [ ... ]`. */
function swiftTable(name: string): Array<[string, string]> {
  const body = new RegExp(`static let ${name}: \\[[^\\]]+\\] = \\[\\n([\\s\\S]*?)\\n  \\]`).exec(swift)?.[1];
  assert.ok(body !== undefined, `GhostexAgentMarks.swift has no table ${name}`);
  return body.split('\n').map((line) => {
    const entry = /^\s*"([^"]+)": ("[^"]+"|0x[0-9A-F]{6}),$/.exec(line);
    assert.ok(entry !== null, `unexpected line in ${name}: ${line}`);
    return [entry[1], entry[2]];
  });
}

/** `AGENT_ICONS` of the generated file, icon id → component name (read as text: it imports react-native-svg). */
const COMPONENTS = new Map(
  [
    ...(/export const AGENT_ICONS[^{]*\{([\s\S]*?)\n\};/.exec(generated)?.[1] ?? '').matchAll(
      /'([a-z-]+)': (Icon[A-Za-z]+),/g,
    ),
  ].map((match) => [match[1] ?? '', match[2] ?? '']),
);

/** The body of a react-native-svg component of the generated file, and whether it draws in the tint (`color`). */
function component(id: string): { body: string; tinted: boolean } {
  const name = COMPONENTS.get(id);
  assert.ok(name !== undefined, `no component for ${id}`);
  const match = new RegExp(`function ${name}\\(\\{ ([^}]*) \\}[\\s\\S]*?\\n\\}`).exec(generated);
  assert.ok(match !== null);
  return { body: match[0], tinted: (match[1] ?? '').split(', ').includes('color') };
}

/** SVG attributes whose SVG name is camel case; react-native-svg spells every other one camel case for kebab case. */
const CAMEL_CASE_SVG_ATTRIBUTES: Record<string, true> = { viewBox: true, gradientUnits: true, gradientTransform: true };

/**
 * The drawing of an SVG document or of a react-native-svg component, element by element in document order:
 * the tag and its attributes in SVG spelling, sorted. The tint (`{color}` in the component) is the template
 * image's black, `{7}` is `7`; the outer element's size (`{size}` in the component, the intrinsic size in the
 * file) and `xmlns` are left out: the size is checked against the viewBox on its own.
 */
function drawing(markup: string): string[] {
  const elements: string[] = [];
  for (const tag of markup.matchAll(/<(\/?)([A-Za-z]+)((?:\s+[A-Za-z][\w:-]*=(?:"[^"]*"|\{[^}]*\}))*)\s*\/?>/g)) {
    const name = (tag[2] ?? '').replace(/^[A-Z]/, (first) => first.toLowerCase());
    const attributes = [...(tag[3] ?? '').matchAll(/([A-Za-z][\w:-]*)=(?:"([^"]*)"|\{([^}]*)\})/g)]
      .map((attribute) => {
        const key = attribute[1] ?? '';
        const svgKey = CAMEL_CASE_SVG_ATTRIBUTES[key] ? key : key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
        const expression = attribute[3];
        const value = expression === undefined ? (attribute[2] ?? '') : expression === 'color' ? '#000000' : expression;
        return { svgKey, value };
      })
      .filter(({ svgKey }) => svgKey !== 'xmlns' && !(name === 'svg' && (svgKey === 'width' || svgKey === 'height')))
      .map(({ svgKey, value }) => `${svgKey}="${value}"`)
      .sort();
    elements.push(`${tag[1] ?? ''}${name} ${attributes.join(' ')}`.trim());
  }
  // An element the pattern above cannot read would drop out of both sides unseen.
  assert.equal(elements.length, markup.match(/<\/?[A-Za-z]/g)?.length ?? 0, 'every element is read');
  return elements;
}

const ICON_IDS = [...COMPONENTS.keys()].sort() as AgentIconId[];

describe('the Live Activity extension draws the agent marks the app draws', () => {
  test('the same icon ids with the same tints', () => {
    const tints = swiftTable('tints');
    assert.deepEqual(tints.map(([id]) => id).sort(), ICON_IDS);
    for (const [id, value] of tints) {
      assert.equal(
        value,
        `0x${agentIconTint(id as AgentIconId)
          .slice(1)
          .toUpperCase()}`,
        `tint of ${id}`,
      );
    }
  });

  test('the same name aliases', () => {
    const aliases = Object.fromEntries(swiftTable('aliases').map(([name, id]) => [name, JSON.parse(id) as string]));
    assert.deepEqual(aliases, { ...AGENT_NAME_ALIASES });
  });

  test('one image set per icon id with the drawing of the app component, template unless it ignores color', () => {
    for (const id of ICON_IDS) {
      const imageSet = join(EXTENSION, 'Assets.xcassets/AgentMarks', `AgentMark-${id}.imageset`);
      const svg = readFileSync(join(imageSet, `${id}.svg`), 'utf8');
      const contents = JSON.parse(readFileSync(join(imageSet, 'Contents.json'), 'utf8')) as {
        properties: { 'template-rendering-intent': string };
      };
      const app = component(id);
      const appDrawing = drawing(app.body);
      assert.ok(appDrawing[0]?.startsWith('svg viewBox='), `the component of ${id} draws an Svg with a viewBox`);
      assert.deepEqual(drawing(svg), appDrawing, `drawing of ${id}`);
      assert.equal(contents.properties['template-rendering-intent'], app.tinted ? 'template' : 'original', id);
    }
  });

  test('every image set is as large as its viewBox, so the mark keeps its proportions', () => {
    for (const id of ICON_IDS) {
      const svg = readFileSync(
        join(EXTENSION, 'Assets.xcassets/AgentMarks', `AgentMark-${id}.imageset`, `${id}.svg`),
        'utf8',
      );
      const root = /<svg\b[^>]*>/.exec(svg)?.[0] ?? '';
      const attribute = (key: string) => new RegExp(` ${key}="([^"]+)"`).exec(root)?.[1];
      const [, , width, height] = (attribute('viewBox') ?? '').split(' ');
      assert.deepEqual([attribute('width'), attribute('height')], [width, height], `size of ${id}`);
    }
  });
});
