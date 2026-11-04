/// <reference types="jest" />
/** Run with `bun run test:jest`. Measure consumed text styles on their composited surfaces, not native pixels. */
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import { ErrorBanner } from '../addProject/primitives';
import { FindProjectFilterSheet } from '../find/FindFilterSheets';
import FindPromptRow from '../find/FindPromptRow';
import { useFindStyles } from '../find/findStyles';
import { FindPromptsCopy } from '../copy';
import AgentHotkeysEditorScreen from '../screens/AgentHotkeysEditorScreen';
import ExtraKeysEditorScreen from '../screens/ExtraKeysEditorScreen';
import { SettingsScreenLayout, ToggleRow } from '../screens/settings/SettingsControls';
import UpdatesPage from '../screens/settings/UpdatesPage';
import { defaultSettings, useSettingsStore } from '../settings/store';
import { GhostexPalette, mixHexColors } from './palette';
import { readableSecondaryText, resolveSidebarAppearance, SIDEBAR_BACKGROUND_TINT_OPTIONS } from './sidebarAppearance';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../../modules/ghostex-native/src', () => ({ GhostexNative: {} }));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ setOptions() {}, goBack() {} }), useFocusEffect: () => undefined,
}));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../screens/settings/SettingsColumns', () => ({
  SettingsColumnsFrame: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('expo-updates', () => ({
  isEnabled: true,
  useUpdates: () => ({ isChecking: false, isDownloading: false, checkError: new Error('Update unavailable') }),
}));

function contrast(a: string, b: string): number {
  const values = [a, b].map((hex) => {
    const [r, g, blue] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255)
      .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return r! * 0.2126 + g! * 0.7152 + blue! * 0.0722;
  });
  return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
}
function over(fill: string, base: string): string {
  if (fill.startsWith('#')) return fill;
  const [r, g, b, alpha] = fill.match(/[0-9.]+/g)!.map(Number);
  return '#' + [r!, g!, b!].map((value, at) =>
    Math.round(value * alpha! + parseInt(base.slice(1 + at * 2, 3 + at * 2), 16) * (1 - alpha!))
      .toString(16).padStart(2, '0')).join('');
}
const flat = (node: TestInstance) => StyleSheet.flatten(node.props.style) ?? {};
function surface(node: TestInstance): string {
  const fills: string[] = [];
  for (let parent = node.parent; parent !== null; parent = parent.parent) {
    const fill = flat(parent).backgroundColor;
    if (typeof fill !== 'string' || fill === 'transparent') continue;
    if (fill.startsWith('#')) return fills.reverse().reduce((base, wash) => over(wash, base), fill);
    fills.push(fill);
  }
  throw new Error('Text has no opaque containing surface');
}
function readable(node: TestInstance): void {
  expect(contrast(String(flat(node).color), surface(node))).toBeGreaterThanOrEqual(4.5);
}
afterEach(() => { useSettingsStore.setState({ settings: defaultSettings() }); jest.restoreAllMocks(); });

test('secondary ink reaches 4.5:1 on every shipped tint, contrast stop and resolved surface without recolouring glyphs', () => {
  for (const { value } of SIDEBAR_BACKGROUND_TINT_OPTIONS) {
    for (let stop = 85; stop <= 100; stop += 1) {
      const appearance = resolveSidebarAppearance(value, stop);
      for (const background of [appearance.background, appearance.card, appearance.cardActive]) {
        expect(contrast(appearance.muted, background)).toBeGreaterThanOrEqual(4.5);
      }
      expect(appearance.mutedGlyph).toBe(mixHexColors(appearance.foreground, appearance.background, 56));
    }
  }
  expect(readableSecondaryText('#ffffff', '#000000', ['#ffffff'])).not.toBe('#ffffff');
  expect(readableSecondaryText('#000000', '#000000', ['#ffffff'])).toBe('#000000');
});

test('the inline error banner uses readable ink over its real translucent wash', async () => {
  const page = { background: '#383838', foreground: GhostexPalette.FOREGROUND };
  await render(<View style={{ backgroundColor: page.background }}><ErrorBanner message="Could not save" page={page} /></View>);
  readable(screen.getByText('Could not save'));
});

function FindSurface() {
  const { appearance, styles } = useFindStyles();
  return <View style={{ backgroundColor: appearance.background }}>
    <FindPromptRow styles={styles} dimColor={appearance.mutedGlyph} timeLabel="Just now"
      row={{ agent: 'codex', agentColor: '', dayKey: 0, favorite: false, highlights: [], key: 'prompt',
        meta: { model: '', plan: '', provider: '', thinking: '', usage: { cacheRead: 0, cacheWrite: 0, contextWindow: 0, cost: 0, input: 0, output: 0, ratePercent: 0, total: 0 } },
        project: '/repo/example', projectName: 'Example', sessionId: 'session', text: 'Example prompt', title: 'Example session', truncated: false, ts: 0 }}
      onOpen={() => {}} onToggleFavorite={() => {}} />
    <View style={styles.noticeError}><Text style={styles.noticeTextError}>Search unavailable</Text></View>
    <FindProjectFilterSheet visible projects={[{ name: 'Example', path: '/repo/example' }]} selected={null}
      onSelect={() => {}} onClose={() => {}} />
  </View>;
}
test('Find secondary and error text and filter-sheet labels use their actual page and sheet surfaces', async () => {
  useSettingsStore.setState({ settings: { ...defaultSettings(), sidebarBackgroundTint: '#123456', sidebarBackgroundContrast: 85 } });
  await render(<FindSurface />);
  readable(screen.getByText('codex'));
  readable(screen.getByText('Search unavailable'));
  readable(screen.getByText('/repo/example'));
  const field = screen.getByLabelText(FindPromptsCopy.projectsPlaceholder);
  expect(contrast(field.props.placeholderTextColor, String(flat(field).backgroundColor))).toBeGreaterThanOrEqual(4.5);
});

test('both keyboard editors use readable labels on accent and destructive controls', async () => {
  await render(<AgentHotkeysEditorScreen />);
  const add = screen.getAllByText('Add hotkey').find((node) => flat(node.parent!).backgroundColor !== undefined)!;
  readable(add);
  readable(screen.getAllByText('×')[0]!);
  readable(screen.getByText(/^Restore .* defaults$/));
  await cleanup();
  await render(<ExtraKeysEditorScreen />);
  await fireEvent.press(screen.getByText('ESC'));
  readable(screen.getByText('ESC'));
  readable(screen.getByText('Remove'));
  await fireEvent.press(screen.getByText('Remove'));
  readable(screen.getByText('Save keys'));
});

test('Settings descriptions and update errors keep readable text on their containing surfaces', async () => {
  useSettingsStore.setState({ settings: { ...defaultSettings(), sidebarBackgroundTint: '#123456', sidebarBackgroundContrast: 85 } });
  await render(<SettingsScreenLayout><ToggleRow label="Example setting" detail="Setting explanation" value={false} onValueChange={() => {}} /></SettingsScreenLayout>);
  readable(screen.getByText('Setting explanation'));
  await cleanup();
  await render(<UpdatesPage />);
  readable(screen.getByText(/Update unavailable/));
});
