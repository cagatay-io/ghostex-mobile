/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. A turn, fold or resize of the device, or the keyboard changing its height, while the
 * open command pad is up with Ctrl armed, on the real terminal screen. The system reports such a
 * change as separate updates: the window's new size, its safe area, the keyboard's new frame and the terminal area's
 * new layout, in any order and each on its own; every order of the updates a change makes is taken here, delivered
 * back to back and spaced just under the pad's settle period. However they come, the outcome is the rule applied to
 * the pose the device ends in: where it leaves the open pad no room above the keyboard, even reaching over the header,
 * the pad closes, armed modifiers drop and the keyboard stays; where it has room, the pad stays open with what is
 * armed on it. Until the updates have settled the pad keeps its state. The person's own request in that wait (the
 * text editor opening on the keyboard) is judged at once; a further update in it only once that has settled.
 */
import {
  ACTIONS,
  DUO_FOLDED,
  DUO_UNFOLDED,
  DUO_UNFOLDED_UPRIGHT,
  EDITOR,
  IPHONE_TURNED,
  IPHONE_UPRIGHT,
  everyOrder,
  keyboardAndPadNow,
  keyboardComesUp,
  layOutArea,
  matrixStep,
  mockNative,
  renderPose,
  reportPose,
  type KeyboardAndPad,
  type Pose,
  type PoseReport,
} from './TerminalScreen.commandPadHarness';

import { act, fireEvent, screen } from '@testing-library/react-native';

import { PAD_ROOM_SETTLE_MS } from '../components/terminal/useCommandPad';

/** The unfolded Duo in landscape with a taller keyboard (synthetic: one with a tool row): 646 pt needed, 639 there. */
const DUO_UNFOLDED_TALL_KEYBOARD: Pose = {
  ...DUO_UNFOLDED,
  name: 'iPhone Duo unfolded in landscape, a 330 pt keyboard',
  keyboard: 330,
  roomAboveKeyboard: false,
};
/** The same with a 300 pt keyboard: 616 pt needed, which it has reaching over the header. */
const DUO_UNFOLDED_TALLER_KEYBOARD_WITH_ROOM: Pose = {
  ...DUO_UNFOLDED,
  name: 'iPhone Duo unfolded in landscape, a 300 pt keyboard',
  keyboard: 300,
  roomAboveKeyboard: true,
};

type Route = {
  name: string;
  from: Pose;
  to: Pose;
};

const ROUTES: Route[] = [
  { name: 'an iPhone turned to landscape', from: IPHONE_UPRIGHT, to: IPHONE_TURNED },
  { name: 'the unfolded Duo turned upright', from: DUO_UNFOLDED, to: DUO_UNFOLDED_UPRIGHT },
  { name: 'the unfolded Duo turned to landscape', from: DUO_UNFOLDED_UPRIGHT, to: DUO_UNFOLDED },
  { name: 'the Duo folded from upright', from: DUO_UNFOLDED_UPRIGHT, to: DUO_FOLDED },
  { name: 'the Duo unfolded to upright', from: DUO_FOLDED, to: DUO_UNFOLDED_UPRIGHT },
  { name: 'the Duo folded from landscape', from: DUO_UNFOLDED, to: DUO_FOLDED },
  { name: 'the Duo unfolded to landscape', from: DUO_FOLDED, to: DUO_UNFOLDED },
  {
    name: 'the keyboard growing taller on the unfolded Duo',
    from: DUO_UNFOLDED,
    to: DUO_UNFOLDED_TALL_KEYBOARD,
  },
  {
    name: 'the keyboard growing shorter on the unfolded Duo',
    from: DUO_UNFOLDED_TALLER_KEYBOARD_WITH_ROOM,
    to: DUO_UNFOLDED,
  },
];

/** The reports the change from `route.from` to `route.to` makes: only what differs is reported. */
function reportsOf({ from, to }: Route): PoseReport[] {
  const differs = (a: object, b: object): boolean => JSON.stringify(a) !== JSON.stringify(b);
  const reports: PoseReport[] = [];
  if (differs(from.window, to.window)) reports.push('window');
  if (differs(from.insets, to.insets)) reports.push('safe area');
  if (from.keyboard !== to.keyboard) reports.push('keyboard frame');
  if (differs(from.area, to.area)) reports.push('terminal layout');
  return reports;
}

const TIMINGS = [
  { timing: 'back to back', gap: 0 },
  { timing: `${PAD_ROOM_SETTLE_MS - 1} ms apart`, gap: PAD_ROOM_SETTLE_MS - 1 },
];

const CASES = ROUTES.flatMap((route) =>
  everyOrder(reportsOf(route)).flatMap((order) =>
    TIMINGS.map(({ timing, gap }) => ({
      ...route,
      order,
      gap,
      reports: `${order.join(', ')} (${timing})`,
      outcome: route.to.roomAboveKeyboard
        ? 'the pad stays open with Ctrl armed, and the keyboard stays'
        : 'the pad closes, armed modifiers go, and the keyboard stays',
    })),
  ),
);

/** The pad, the keyboard and whether Ctrl is armed, as shown and as sent to the terminal. */
function padNow(): KeyboardAndPad & { ctrl: boolean; ctrlSent: unknown } {
  return {
    ...keyboardAndPadNow(),
    ctrl: screen.queryByText('Ctrl') !== null,
    ctrlSent: mockNative.setKeyModifiers.mock.calls.at(-1)?.[1],
  };
}

/** In `route.from`, the open pad with Ctrl armed and the keyboard up; returns the blurs. */
async function openPadWithCtrl({ from }: Route): Promise<number> {
  await renderPose(from);
  await keyboardComesUp();
  await matrixStep(ACTIONS.toggle);
  // Ctrl armed in the Keys layer; the same button again brings back what was there before.
  await matrixStep(ACTIONS.Keys);
  await fireEvent.press(screen.getByLabelText('CTRL'));
  await matrixStep(ACTIONS.Keys);
  expect(padNow()).toEqual({
    keyboard: true,
    layer: 'none',
    pad: 'open',
    ctrl: true,
    ctrlSent: expect.objectContaining({ ctrl: true, alt: false, shift: false }),
  });
  return mockNative.blurTerminal.mock.calls.length;
}

describe('a change of the pose or the keyboard while the open pad is up, its reports in every order', () => {
  test.each(CASES)('$name, reported as $reports: $outcome', async (route) => {
    const blurs = await openPadWithCtrl(route);
    const started = padNow();

    for (const [index, report] of route.order.entries()) {
      if (index > 0 && route.gap > 0) await act(() => jest.advanceTimersByTime(route.gap));
      await reportPose(route.to, report);
    }
    const whileSettling = padNow();
    await act(() => jest.advanceTimersByTime(PAD_ROOM_SETTLE_MS));
    await act(async () => undefined);

    const room = route.to.roomAboveKeyboard;
    expect(padNow()).toEqual({
      keyboard: true,
      layer: 'none',
      pad: room ? 'open' : 'closed',
      // Closing the pad drops what is armed: where it stays open, Ctrl still armed shows it never closed on the way.
      ctrl: room,
      ctrlSent: expect.objectContaining({ ctrl: room, alt: false, shift: false }),
    });
    // Nothing lowers the keyboard.
    expect(mockNative.blurTerminal).toHaveBeenCalledTimes(blurs);
    // Until the reports have settled, the pad is as it was.
    expect(whileSettling).toEqual(started);
  });
});

/** The unfolded Duo in landscape with a 300 pt keyboard: the open pad fits above it, but not with the text editor. */
const DUO_TALLER_KEYBOARD: Route = {
  name: 'the keyboard growing taller on the unfolded Duo',
  from: DUO_UNFOLDED_TALLER_KEYBOARD_WITH_ROOM,
  to: DUO_UNFOLDED_TALL_KEYBOARD,
};

/** The terminal area reported 1 pt shorter: the pad's room waits to settle, the pad still fitting where it fitted. */
async function areaUpdateStillSettling({ area }: Pose): Promise<void> {
  await layOutArea({ ...area, height: area.height - 1 }, area.y);
}

describe('while a terminal area update is still settling', () => {
  test('iOS: the text editor opened on a keyboard that leaves the open pad no room with it closes the pad at once, and the keyboard stays with the editor on it', async () => {
    const blurs = await openPadWithCtrl(DUO_TALLER_KEYBOARD);
    await areaUpdateStillSettling(DUO_TALLER_KEYBOARD.from);
    expect(padNow()).toMatchObject({ pad: 'open', ctrl: true });

    await fireEvent.press(screen.getByLabelText('Text editor'));
    expect(screen.getByLabelText(EDITOR)).toBeTruthy();
    expect(padNow()).toEqual({
      keyboard: true,
      layer: 'none',
      pad: 'closed',
      ctrl: false,
      ctrlSent: expect.objectContaining({ ctrl: false, alt: false, shift: false }),
    });
    expect(mockNative.blurTerminal).toHaveBeenCalledTimes(blurs);
  });

  test(`iOS: the keyboard growing taller into no room for the open pad keeps the pad open with Ctrl armed for ${PAD_ROOM_SETTLE_MS - 1} ms after the last update and closes it at ${PAD_ROOM_SETTLE_MS} ms, dropping Ctrl`, async () => {
    const blurs = await openPadWithCtrl(DUO_TALLER_KEYBOARD);
    await areaUpdateStillSettling(DUO_TALLER_KEYBOARD.from);
    await reportPose(DUO_TALLER_KEYBOARD.to, 'keyboard frame');

    await act(() => jest.advanceTimersByTime(PAD_ROOM_SETTLE_MS - 1));
    await act(async () => undefined);
    expect(padNow()).toEqual({
      keyboard: true,
      layer: 'none',
      pad: 'open',
      ctrl: true,
      ctrlSent: expect.objectContaining({ ctrl: true, alt: false, shift: false }),
    });

    await act(() => jest.advanceTimersByTime(1));
    await act(async () => undefined);
    expect(padNow()).toEqual({
      keyboard: true,
      layer: 'none',
      pad: 'closed',
      ctrl: false,
      ctrlSent: expect.objectContaining({ ctrl: false, alt: false, shift: false }),
    });
    expect(mockNative.blurTerminal).toHaveBeenCalledTimes(blurs);
  });
});
