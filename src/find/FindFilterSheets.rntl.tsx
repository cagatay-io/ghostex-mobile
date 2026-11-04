/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. Find's agent and project filter sheets follow the app's model-coloured bottom sheet:
 * their title, rows, path details, field placeholder and empty text read on that actual sheet
 * (4.5:1, WCAG AA for normal-size text) under the light presets as under the dark ones. The real sheets and
 * `BottomSheet`; mocked are the boundaries only: the native module, storage and the safe area.
 */

import { StyleSheet } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import { useSettingsStore } from '../settings/store';
import { THEME_PRESETS, themePresetPatch } from '../theme/presets';
import { FindAgentFilterSheet, FindProjectFilterSheet } from './FindFilterSheets';

jest.mock('../../modules/ghostex-native/src', () => ({ GhostexNative: {} }));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

/** WCAG contrast of two `#rrggbb` colours. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5]
      .map((at) => parseInt(hex.slice(at, at + 2), 16) / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const flat = (node: TestInstance) => StyleSheet.flatten(node.props.style) ?? {};

/** The nearest painted ancestor of `node`: the surface it is drawn on. */
function surfaceOf(node: TestInstance): string {
  for (let parent = node.parent; parent !== null; parent = parent.parent) {
    const fill = flat(parent).backgroundColor;
    if (typeof fill === 'string' && fill.startsWith('#')) return fill;
  }
  throw new Error('no painted surface');
}

const PROJECTS = [{ name: 'ghostex', path: '/Users/owner/Code/ghostex' }];
const initialSettings = useSettingsStore.getState().settings;

afterEach(async () => {
  await act(() => {
    useSettingsStore.setState({ settings: initialSettings });
  });
});

describe.each(THEME_PRESETS.map((preset) => [preset.id, preset.mode] as const))('%s (%s)', (preset) => {
  beforeEach(() => {
    const patch = themePresetPatch(preset, false);
    if (patch === undefined) throw new Error(`Unknown preset ${preset}`);
    useSettingsStore.getState().patchSettings(patch);
  });

  test('the project sheet: title, rows, path, placeholder and empty text read on the dark sheet', async () => {
    await render(
      <FindProjectFilterSheet
        visible
        projects={PROJECTS}
        selected={null}
        onSelect={() => undefined}
        onClose={() => undefined}
      />,
    );
    const failures: string[] = [];
    const check = (name: string, color: unknown, surface: string) => {
      const ratio = contrast(String(color), surface);
      if (ratio < 4.5) failures.push(`${name} ${String(color)} on ${surface}: ${ratio.toFixed(2)}`);
    };
    for (const text of ['Filter by project', 'All projects', 'ghostex', '/Users/owner/Code/ghostex']) {
      const node = screen.getByText(text);
      check(text, flat(node).color, surfaceOf(node));
    }
    const field = screen.getByLabelText('Filter projects...');
    check('placeholder', field.props.placeholderTextColor, String(flat(field).backgroundColor));
    check('typed text', flat(field).color, String(flat(field).backgroundColor));
    expect(failures).toEqual([]);
  });

  test('no project matches: the empty text reads on the dark sheet', async () => {
    await render(
      <FindProjectFilterSheet
        visible
        projects={[]}
        selected={null}
        onSelect={() => undefined}
        onClose={() => undefined}
      />,
    );
    const empty = screen.getByText('No projects found.');
    expect(contrast(String(flat(empty).color), surfaceOf(empty))).toBeGreaterThanOrEqual(4.5);
  });

  test('the agent sheet: title and rows read on the dark sheet', async () => {
    await render(
      <FindAgentFilterSheet
        visible
        colors={{}}
        selected={[]}
        onToggle={() => undefined}
        onClear={() => undefined}
        onClose={() => undefined}
      />,
    );
    for (const text of ['Filter by agent', 'All agents', 'claude']) {
      const node = screen.getByText(text);
      expect(contrast(String(flat(node).color), surfaceOf(node))).toBeGreaterThanOrEqual(4.5);
    }
  });
});