/**
 * The Live Activity cannot run the app's React Native logo components, so it carries one vector image set per
 * logo in `modules/ghostex-live-activity/ios/Extension/Assets.xcassets/AgentMarks/`. The content state supplies the
 * artwork identity and tint from the app's registry. These checks cover that payload and the asset copies
 * against `src/assets/agentIcons.generated.tsx`: the same elements with the same geometry (viewBox, path data,
 * transforms, fill rules, strokes, gradient and stops), template unless the component ignores `color`.
 * The judgement of the marks on the device stays; these checks do not render the extension.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

import { AGENT_NAME_ALIASES, agentIconTint, parseMobileSummary, type AgentArtId } from '../contract/mobileSummary';
import { buildContentState } from './contentState';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const EXTENSION = join(ROOT, 'modules/ghostex-live-activity/ios/Extension');
const generated = readFileSync(join(ROOT, 'src/assets/agentIcons.generated.tsx'), 'utf8');

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

const ICON_IDS = [...COMPONENTS.keys()].sort() as AgentArtId[];

describe('the Live Activity extension draws the agent marks the app draws', () => {
  test('the same icon ids with the same tints travel in the content state', () => {
    const assets = readdirSync(join(EXTENSION, 'Assets.xcassets/AgentMarks'))
      .filter((name) => name.endsWith('.imageset'))
      .map((name) => name.slice('AgentMark-'.length, -'.imageset'.length))
      .sort();
    assert.deepEqual(assets, ICON_IDS);
    for (const id of ICON_IDS) {
      const now = Date.parse('2026-10-24T10:42:00Z');
      const summary = parseMobileSummary(
        JSON.stringify({
          sessions: [
            {
              sessionId: 's',
              provider: 'zmx',
              agentName: 'My helper',
              agentIcon: id,
              activity: 'working',
              workingStartedAt: new Date(now).toISOString(),
            },
          ],
        }),
      );
      assert.ok(summary !== null);
      const [row] = buildContentState([{ machineId: 'm', summary, loadedAt: now }], now).agents;
      assert.equal(row?.agentIcon, id);
      assert.equal(row?.agentTint, Number.parseInt(agentIconTint(id).slice(1), 16), `tint of ${id}`);
    }
  });

  test('name aliases, known ids and unknown names use the app resolver before the content is sent', () => {
    const aliases = [...Object.entries(AGENT_NAME_ALIASES), ['empryo', 'empryo'], ['aider', 'terminal']];
    for (const [name, id] of aliases) {
      const now = Date.parse('2026-10-24T10:42:00Z');
      const summary = parseMobileSummary(
        JSON.stringify({
          sessions: [
            {
              sessionId: 's',
              provider: 'zmx',
              agentName: `  ${name.toUpperCase()}  `,
              activity: 'working',
              workingStartedAt: new Date(now).toISOString(),
            },
          ],
        }),
      );
      assert.ok(summary !== null);
      const [row] = buildContentState([{ machineId: 'm', summary, loadedAt: now }], now).agents;
      const expected = name === 'claude-cloud' || name === 'claude (cloud)' ? 'claude-cloud' : id;
      assert.equal(row?.agentIcon, expected, `mark of ${name}`);
    }
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
