/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. The command pad's keys layer: its section titles ("Extra keys", "More keys") are
 * normal-size secondary text and keep 4.5:1 (WCAG AA) on the layer's panel, with any opacity the title applies taken
 * into the measured colour (React Native iOS multiplies a text's foreground alpha by its opacity). The real layer and
 * stores; mocked are the boundaries only: storage and the native module.
 */

import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import type { TerminalKeyInput } from './terminalKeyInput';
import CommandPadLayer from './CommandPadLayer';

jest.mock('../../../modules/ghostex-native/src', () => ({ GhostexNative: {} }));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

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

test.each(['Extra keys', 'More keys'])('the "%s" title keeps 4.5:1 on the layer panel', async (title) => {
  await render(
    <CommandPadLayer
      kind="keys"
      input={{} as TerminalKeyInput}
      modifiers={{ ctrl: false, alt: false, shift: false } as never}
      agentId=""
      onOpenSettings={() => undefined}
      bottomInset={0}
      onHeightChange={() => undefined}
    />,
  );
  const node = screen.getByText(title);
  const own = StyleSheet.flatten(node.props.style) ?? {};
  let panel: string | undefined;
  for (let parent = node.parent; parent !== null && panel === undefined; parent = parent.parent) {
    const fill = StyleSheet.flatten(parent.props.style)?.backgroundColor;
    if (typeof fill === 'string' && fill.startsWith('#')) panel = fill;
  }
  const alpha = Number(own.opacity ?? 1);
  const ink = String(own.color);
  const painted = `#${[1, 3, 5]
    .map((at) => Math.round(parseInt(ink.slice(at, at + 2), 16) * alpha + parseInt(panel!.slice(at, at + 2), 16) * (1 - alpha)))
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
  expect(contrast(painted, panel!)).toBeGreaterThanOrEqual(4.5);
});
