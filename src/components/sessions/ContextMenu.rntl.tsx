/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. The shared context menu's command with an (i) (the agent menu's "New
 * Coordinator…", `use-sessions-screen-menus.tsx`), FL-A11Y-01 and review s7-r1 r3 K-8: the command and its
 * (i) are two VoiceOver elements, each with its own name, role and action, neither inside the other nor
 * inside an ancestor that iOS would read as one element. The real `ContextMenu`; mocked are the native
 * module, storage and the safe area.
 */

import { Platform } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import ContextMenu from './ContextMenu';

jest.mock('../../../modules/ghostex-native/src', () => ({ GhostexNative: {} }));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

/** A command's role: a button on iOS, a menu item on Android (`COMMAND_ROLE`). */
const COMMAND = Platform.OS === 'ios' ? 'button' : 'menuitem';

/** The element's ancestors that are accessibility elements (iOS reads an element's subtree as one). */
function accessibleAncestors(element: TestInstance): TestInstance[] {
  const found: TestInstance[] = [];
  for (let parent = element.parent; parent !== null; parent = parent.parent) {
    if (parent.props.accessible === true) found.push(parent);
  }
  return found;
}

test('K-8: a command and its (i) are separate elements, each with its own name and action', async () => {
  const startCoordinator = jest.fn();
  const close = jest.fn();
  await render(
    <ContextMenu
      visible
      title="ghostex-mobile"
      onClose={close}
      items={[
        {
          kind: 'item',
          key: 'new-coordinator',
          label: 'New Coordinator…',
          info: 'Synthetic explanation of coordinators',
          onPress: startCoordinator,
        },
        { kind: 'separator', key: 'separator' },
        { kind: 'item', key: 'agent', label: 'Claude Code', selected: true, onPress: jest.fn() },
      ]}
    />,
  );

  // Inside the command, iOS would read one element "New Coordinator…, About New Coordinator…" (r3 native tree).
  const about = screen.getByRole('button', { name: 'About New Coordinator…' });
  expect(accessibleAncestors(about)).toEqual([]);
  const command = screen.getByRole(COMMAND, { name: 'New Coordinator…' });
  expect(accessibleAncestors(command)).toEqual([]);
  expect(command.props.accessibilityState).toEqual({ disabled: false, selected: false });
  expect(about.props.accessibilityState).toEqual({ expanded: false });

  // The (i) shows its explanation and hides it again; the command does not run.
  await fireEvent.press(about);
  expect(screen.getByText('Synthetic explanation of coordinators')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'About New Coordinator…' }).props.accessibilityState).toEqual({
    expanded: true,
  });
  expect(startCoordinator).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'About New Coordinator…' }));
  expect(screen.queryByText('Synthetic explanation of coordinators')).toBeNull();

  // The command runs on its own, the explanation stays closed.
  await fireEvent.press(screen.getByRole(COMMAND, { name: 'New Coordinator…' }));
  expect(startCoordinator).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Synthetic explanation of coordinators')).toBeNull();
  expect(close).not.toHaveBeenCalled();

  // A command without an (i) keeps its shape: one element, its state.
  const agent = screen.getByRole(COMMAND, { name: 'Claude Code' });
  expect(agent.props.accessibilityState).toEqual({ disabled: false, selected: true });
  expect(accessibleAncestors(agent)).toEqual([]);
});
