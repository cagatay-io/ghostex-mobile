/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. A turn, fold or resize of the device, or the keyboard changing its height, while the
 * open command pad is up with Ctrl armed, on the real terminal screen, iOS and Android. The system reports such a
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

import { Platform } from 'react-native';
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

/*
 * Android presets, all synthetic (not measured on a device). The terminal does not slide there: the keyboard takes
 * its room from the screen's layout, so the terminal area given is the one left above the keyboard, and the open pad
 * needs 340 pt of it, reaching over the header (the area's top less the safe area's top) if it must.
 */
/** A stacked split pane of a multi-window resize: 310 pt plus a 44 pt header, 354 pt. */
const ANDROID_SPLIT: Pose = {
  name: 'Android bottom split pane',
  window: { width: 700, height: 754 },
  insets: { top: 0, bottom: 0, left: 0, right: 0 },
  area: { x: 0, y: 44, width: 700, height: 310 },
  keyboard: 200,
  roomAboveKeyboard: true,
};
/** The same app enlarged to the full window, the same width, a 24 pt status bar inset: 532 pt. */
const ANDROID_FULL: Pose = {
  name: 'Android full window',
  window: { width: 700, height: 1000 },
  insets: { top: 24, bottom: 0, left: 0, right: 0 },
  area: { x: 0, y: 68, width: 700, height: 532 },
  keyboard: 200,
  roomAboveKeyboard: true,
};
/** A folded Android phone: 310 pt plus a 44 pt header, 354 pt. */
const ANDROID_FOLDED: Pose = {
  name: 'Android folded',
  window: { width: 400, height: 800 },
  insets: { top: 0, bottom: 0, left: 0, right: 0 },
  area: { x: 0, y: 44, width: 400, height: 310 },
  keyboard: 446,
  roomAboveKeyboard: true,
};
/** Unfolded: wider, a deeper top inset (80 pt), its own keyboard; 476 pt. */
const ANDROID_UNFOLDED: Pose = {
  name: 'Android unfolded',
  window: { width: 700, height: 900 },
  insets: { top: 80, bottom: 0, left: 0, right: 0 },
  area: { x: 0, y: 124, width: 700, height: 476 },
  keyboard: 300,
  roomAboveKeyboard: true,
};
/** A 700 x 700 window, its terminal area below the 24 pt inset and a 44 pt header; keyboards of different heights. */
const ANDROID_WINDOW = { width: 700, height: 700 };
const ANDROID_INSETS = { top: 24, bottom: 0, left: 0, right: 0 };
const ANDROID_AREA_TOP = ANDROID_INSETS.top + 44;
function androidKeyboardPose(name: string, keyboard: number, areaHeight: number): Pose {
  return {
    name,
    window: ANDROID_WINDOW,
    insets: ANDROID_INSETS,
    area: { x: 0, y: ANDROID_AREA_TOP, width: ANDROID_WINDOW.width, height: areaHeight },
    keyboard,
    roomAboveKeyboard: areaHeight + 44 >= 340,
  };
}
/** The keyboard down: the whole area. */
const ANDROID_KEYBOARD_DOWN = androidKeyboardPose('Android, keyboard down', 200, 632);
/** A 200 pt keyboard that resizes the screen to 500 pt; with the screen's own keyboard padding, 232 pt are left. */
const ANDROID_RESIZED = androidKeyboardPose('Android, a 200 pt keyboard resizing the screen', 200, 232);
/** A 400 pt keyboard taken off by the screen's bottom padding, the screen keeping the window's height: 232 pt. */
const ANDROID_PADDED = androidKeyboardPose('Android, a 400 pt keyboard', 400, 232);
/** A 200 pt keyboard leaving 432 pt. */
const ANDROID_ROOM_ABOVE = androidKeyboardPose('Android, a 200 pt keyboard with room above it', 200, 432);
/** A 300 pt keyboard leaving 332 pt: with the header, 376 pt. */
const ANDROID_TALLER_ROOM = androidKeyboardPose('Android, a 300 pt keyboard with room above it', 300, 332);

type Route = {
  platform: 'ios' | 'android';
  name: string;
  from: Pose;
  to: Pose;
  /** The keyboard is down before the change and comes up as part of it (otherwise it is up throughout). */
  keyboardComes?: true;
};

const ROUTES: Route[] = [
  { platform: 'ios', name: 'an iPhone turned to landscape', from: IPHONE_UPRIGHT, to: IPHONE_TURNED },
  { platform: 'ios', name: 'the unfolded Duo turned upright', from: DUO_UNFOLDED, to: DUO_UNFOLDED_UPRIGHT },
  { platform: 'ios', name: 'the unfolded Duo turned to landscape', from: DUO_UNFOLDED_UPRIGHT, to: DUO_UNFOLDED },
  { platform: 'ios', name: 'the Duo folded from upright', from: DUO_UNFOLDED_UPRIGHT, to: DUO_FOLDED },
  { platform: 'ios', name: 'the Duo unfolded to upright', from: DUO_FOLDED, to: DUO_UNFOLDED_UPRIGHT },
  { platform: 'ios', name: 'the Duo folded from landscape', from: DUO_UNFOLDED, to: DUO_FOLDED },
  { platform: 'ios', name: 'the Duo unfolded to landscape', from: DUO_FOLDED, to: DUO_UNFOLDED },
  {
    platform: 'ios',
    name: 'the keyboard growing taller on the unfolded Duo',
    from: DUO_UNFOLDED,
    to: DUO_UNFOLDED_TALL_KEYBOARD,
  },
  {
    platform: 'ios',
    name: 'the keyboard growing shorter on the unfolded Duo',
    from: DUO_UNFOLDED_TALLER_KEYBOARD_WITH_ROOM,
    to: DUO_UNFOLDED,
  },
  { platform: 'android', name: 'a split pane enlarged to the full window', from: ANDROID_SPLIT, to: ANDROID_FULL },
  { platform: 'android', name: 'the full window resized to a split pane', from: ANDROID_FULL, to: ANDROID_SPLIT },
  { platform: 'android', name: 'unfolding', from: ANDROID_FOLDED, to: ANDROID_UNFOLDED },
  { platform: 'android', name: 'folding', from: ANDROID_UNFOLDED, to: ANDROID_FOLDED },
  {
    platform: 'android',
    name: 'the keyboard coming up and resizing the screen',
    from: ANDROID_KEYBOARD_DOWN,
    to: ANDROID_RESIZED,
    keyboardComes: true,
  },
  {
    platform: 'android',
    name: 'the keyboard coming up, the screen keeping its height',
    from: ANDROID_KEYBOARD_DOWN,
    to: ANDROID_PADDED,
    keyboardComes: true,
  },
  {
    platform: 'android',
    name: 'the keyboard coming up with room above it',
    from: ANDROID_KEYBOARD_DOWN,
    to: ANDROID_ROOM_ABOVE,
    keyboardComes: true,
  },
  {
    platform: 'android',
    name: 'the keyboard growing taller',
    from: ANDROID_ROOM_ABOVE,
    to: ANDROID_PADDED,
  },
  {
    platform: 'android',
    name: 'the keyboard growing shorter',
    from: ANDROID_TALLER_ROOM,
    to: ANDROID_ROOM_ABOVE,
  },
];

/** The reports the change from `route.from` to `route.to` makes: only what differs is reported. */
function reportsOf({ from, to, keyboardComes }: Route): PoseReport[] {
  const differs = (a: object, b: object): boolean => JSON.stringify(a) !== JSON.stringify(b);
  const reports: PoseReport[] = [];
  if (differs(from.window, to.window)) reports.push('window');
  if (differs(from.insets, to.insets)) reports.push('safe area');
  if (keyboardComes || from.keyboard !== to.keyboard) reports.push('keyboard frame');
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

/** In `route.from`, the open pad with Ctrl armed, the keyboard up or down as the route starts; returns the blurs. */
async function openPadWithCtrl({ from, keyboardComes }: Route): Promise<number> {
  await renderPose(from);
  if (!keyboardComes) await keyboardComesUp();
  await matrixStep(ACTIONS.toggle);
  // Ctrl armed in the Keys layer; the same button again brings back what was there before.
  await matrixStep(ACTIONS.Keys);
  await fireEvent.press(screen.getByLabelText('CTRL'));
  await matrixStep(ACTIONS.Keys);
  expect(padNow()).toEqual({
    keyboard: !keyboardComes,
    layer: 'none',
    pad: 'open',
    ctrl: true,
    ctrlSent: expect.objectContaining({ ctrl: true, alt: false, shift: false }),
  });
  return mockNative.blurTerminal.mock.calls.length;
}

const platform = Platform.OS;
afterEach(() => {
  Platform.OS = platform;
});

describe('a change of the pose or the keyboard while the open pad is up, its reports in every order', () => {
  test.each(CASES)('$platform: $name, reported as $reports: $outcome', async (route) => {
    Platform.OS = route.platform;
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
    // Until the reports have settled, the pad is as it was (the keyboard coming up aside).
    expect(whileSettling).toEqual({ ...started, keyboard: true });
  });
});

/** The unfolded Duo in landscape with a 300 pt keyboard: the open pad fits above it, but not with the text editor. */
const DUO_TALLER_KEYBOARD: Route = {
  platform: 'ios',
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
