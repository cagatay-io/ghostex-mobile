/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. The command pad's transition matrix on the real terminal screen: from every state the
 * keyboard, the text editor, a Keys or Agent layer and the pad rest in, in three poses, every event that changes one
 * of them; after each, every pad control shown stays whole, inside the safe area and above every cover.
 */
import {
  ACTIONS,
  CLOSE_EDITOR,
  CLOSE_LAYER,
  DEFAULT_LABELS,
  DUO_FOLDED,
  DUO_UNFOLDED,
  DUO_UNFOLDED_UPRIGHT,
  EDITOR,
  FRAME_FIRST,
  IPHONE_TURNED,
  IPHONE_UPRIGHT,
  RING,
  TOGGLE,
  WINDOW_FIRST,
  changePose,
  keyboardAndPadNow,
  keyboardComesUp,
  keyboardShownNow,
  layerPanel,
  matrixStep,
  numberAt,
  parentOf,
  poseNow,
  press,
  renderPose,
  requiredNumber,
  shownNow,
  translationOf,
  type Action,
  type Frame,
  type KeyboardAndPad,
  type Pose,
  type PoseReport,
  type Shown,
} from './TerminalScreen.commandPadHarness';

import { AccessibilityInfo, StyleSheet } from 'react-native';
import { screen } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

/*
 * The transition matrix. Every state the keyboard, the text editor, a Keys or Agent layer and the pad rest in, in
 * three poses, and every event that changes one of them. After each event every pad control that is shown lies
 * inside the window's safe area, above what covers the window's bottom (keyboard, text editor, layer) and inside
 * every view that cuts off what leaves it, at its full size; and an open pad is never hidden: it is drawn open, or a
 * layer that stands in for it shows its own close button. The text editor without the pen (the pad closed where the
 * open pad has no room above it) has its own close button, and only then. A turn or fold that starts with the
 * keyboard and the open pad both up also checks which of the two stays (`keyboardAndPadAfter`).
 *
 * States that cannot rest are not started from: a layer with the keyboard up (the layer takes the keyboard's place and
 * the keyboard coming back ends it), a layer with the text editor (each closes the other), a layer with the pad closed
 * (closing the pad ends its layer), the text editor with the keyboard down (it brings the keyboard up and goes with
 * it), and, where the open pad has no room above the keyboard even over the header, the open pad with the keyboard up.
 */

/**
 * The poses the matrix starts in, the pose a turn leads to and the one a window change leads to (none on an iPhone:
 * its window changes only by turning).
 */
const MATRIX_POSES: { pose: Pose; turned: Pose; resized: Pose | null }[] = [
  { pose: IPHONE_UPRIGHT, turned: IPHONE_TURNED, resized: null },
  { pose: IPHONE_TURNED, turned: IPHONE_UPRIGHT, resized: null },
  { pose: DUO_UNFOLDED, turned: DUO_UNFOLDED_UPRIGHT, resized: DUO_FOLDED },
];
type MatrixPose = (typeof MATRIX_POSES)[number];

type Start = { name: string; route: Action[]; shown: Shown };

/** The states the matrix starts from, each reached by the user's own steps after the keyboard was up once. */
function startsIn({ pose: { roomAboveKeyboard } }: MatrixPose): Start[] {
  const down = { keyboard: false, editor: false };
  const layers = (route: Action[], name: string): Start[] =>
    (['Keys', 'Agent'] as const).map((layer) => ({
      name: `${name}, ${layer} layer`,
      route: [...route, layer],
      shown: { ...down, layer, pad: roomAboveKeyboard ? 'open' : 'standing in' },
    }));
  const starts: Start[] = [
    { name: 'keyboard down, pad closed', route: ['keyboard away'], shown: { ...down, layer: 'none', pad: 'closed' } },
    {
      name: 'keyboard down, pad open',
      route: ['keyboard away', 'toggle'],
      shown: { ...down, layer: 'none', pad: 'open' },
    },
    ...layers(['keyboard away', 'toggle'], 'keyboard down, pad open'),
    {
      name: 'keyboard up, pad closed',
      route: [],
      shown: { keyboard: true, editor: false, layer: 'none', pad: 'closed' },
    },
  ];
  if (roomAboveKeyboard) {
    return [
      ...starts,
      {
        name: 'keyboard up, pad open',
        route: ['toggle'],
        shown: { keyboard: true, editor: false, layer: 'none', pad: 'open' },
      },
      {
        name: 'keyboard up, editor open, pad closed',
        route: ['toggle', 'pen', 'toggle'],
        shown: { keyboard: true, editor: true, layer: 'none', pad: 'closed' },
      },
      {
        name: 'keyboard up, editor open, pad open',
        route: ['toggle', 'pen'],
        shown: { keyboard: true, editor: true, layer: 'none', pad: 'open' },
      },
    ];
  }
  return [
    ...starts,
    { name: 'keyboard held down by the open pad', route: ['toggle'], shown: { ...down, layer: 'none', pad: 'open' } },
    ...layers(['toggle'], 'keyboard held down by the open pad'),
    {
      name: 'keyboard up, editor open, pad closed',
      route: ['toggle', 'pen'],
      shown: { keyboard: true, editor: true, layer: 'none', pad: 'closed' },
    },
  ];
}

/** The text editor's height with one line: what it covers above the keyboard. */
const EDITOR_HEIGHT = 56;
/** The ring's buttons other than the keyboard one, whose name the round keyboard button shares. */
const RING_ONLY: string[] = ['Keys', 'Agent hotkeys', 'Text editor'];

async function enterStart(entry: MatrixPose, start: Start): Promise<void> {
  await renderPose(entry.pose);
  await keyboardComesUp();
  for (const action of start.route) await matrixStep(ACTIONS[action]);
}

/** A view's explicit frame in its parent (left, top, width and height in its style), or null. */
function explicitFrame(instance: TestInstance): Frame | null {
  const style = StyleSheet.flatten(instance.props.style);
  const [left, top, width, height] = ['left', 'top', 'width', 'height'].map((key) => numberAt(style, key));
  if (left === undefined || top === undefined || width === undefined || height === undefined) return null;
  return { left, top, right: left + width, bottom: top + height };
}

/** The pad's own room (the view over the terminal area and the header that holds it), in window points. */
function padRoomOf(instance: TestInstance): Frame {
  for (let node = instance.parent; node !== null; node = node.parent) {
    const frame = explicitFrame(node);
    if (frame !== null) return frame;
  }
  throw new Error('the pad has no measured room');
}

/** Where a control `width` x `height` that its style places in the pad's room is drawn in the window. */
function placedInRoom(instance: TestInstance, width: number, height: number): Frame {
  const room = padRoomOf(instance);
  const style = StyleSheet.flatten(instance.props.style);
  const offset = translationOf(instance);
  const left = room.left + (numberAt(style, 'left') ?? room.right - room.left - requiredNumber(style, 'right') - width);
  const bottom = room.bottom - requiredNumber(style, 'bottom') + offset.y;
  return { left: left + offset.x, top: bottom - height, right: left + offset.x + width, bottom };
}

function ownFrame(instance: TestInstance): Frame {
  const style = StyleSheet.flatten(instance.props.style);
  return placedInRoom(instance, requiredNumber(style, 'width'), requiredNumber(style, 'height'));
}

/** The nine keys in their field, row by row, in the window. */
function keyFrames(): { name: string; instance: TestInstance; frame: Frame }[] {
  const field = parentOf(screen.getByLabelText(DEFAULT_LABELS[0]));
  const fieldStyle = StyleSheet.flatten(field.props.style);
  const keys = field.children.filter((child): child is TestInstance => typeof child !== 'string');
  const keyStyle = StyleSheet.flatten(keys[0].props.style);
  const size = { width: requiredNumber(keyStyle, 'width'), height: requiredNumber(keyStyle, 'height') };
  const gap = numberAt(fieldStyle, 'gap') ?? 0;
  const fieldWidth = requiredNumber(fieldStyle, 'width');
  const perRow = Math.floor((fieldWidth + gap) / (size.width + gap));
  const rows = Math.ceil(keys.length / perRow);
  const at = placedInRoom(field, fieldWidth, rows * size.height + (rows - 1) * gap);
  return keys.map((instance, index) => {
    const left = at.left + (index % perRow) * (size.width + gap);
    const top = at.top + Math.floor(index / perRow) * (size.height + gap);
    const frame = { left, top, right: left + size.width, bottom: top + size.height };
    return { name: String(instance.props.accessibilityLabel), instance, frame };
  });
}

/** The scale everything that carries `instance` is drawn at (1: full size). */
function scaleOf(instance: TestInstance): number {
  let scale = 1;
  for (let node: TestInstance | null = instance; node !== null; node = node.parent) {
    const transform: unknown = StyleSheet.flatten(node.props.style)?.transform;
    if (Array.isArray(transform)) for (const entry of transform) scale *= numberAt(entry, 'scale') ?? 1;
  }
  return scale;
}

/** Every view that cuts off what leaves it and carries `instance`, in window points; one of unknown place fails. */
function clipsOf(instance: TestInstance): Frame[] {
  const clips: Frame[] = [];
  for (let node = instance.parent; node !== null; node = node.parent) {
    if (StyleSheet.flatten(node.props.style)?.overflow !== 'hidden') continue;
    const frame = explicitFrame(node);
    if (frame === null) throw new Error('a view of unknown place cuts off a pad control');
    clips.push(frame);
  }
  return clips;
}

/** The top of what covers the window's bottom: the keyboard, the text editor on it, a layer in its place. */
function coverTop(): number {
  const pose = poseNow();
  const { window } = pose;
  const tops = [window.height];
  if (keyboardShownNow()) tops.push(window.height - pose.keyboard);
  const editor = screen.queryByLabelText(EDITOR);
  if (editor !== null) {
    let dock: TestInstance | null = editor;
    while (dock !== null && numberAt(StyleSheet.flatten(dock.props.style), 'bottom') === undefined) dock = dock.parent;
    tops.push(window.height - requiredNumber(StyleSheet.flatten(dock?.props.style), 'bottom') - EDITOR_HEIGHT);
  }
  const panel = layerPanel();
  if (panel !== null) {
    tops.push(window.height - (numberAt(StyleSheet.flatten(panel.props.style), 'height') ?? pose.keyboard));
  }
  return Math.min(...tops);
}

/** The invariant, after `moment`: every problem found is listed, so a failure names all of them. */
function expectPadWhole(moment: string): void {
  const problems: string[] = [];
  const toggle = screen.getByLabelText(TOGGLE);
  const open = toggle.props.accessibilityState?.expanded === true;
  const shown = (label: string | RegExp) => screen.queryByLabelText(label) !== null;
  const whole = [...DEFAULT_LABELS, ...RING].every(shown);
  if (open && !whole) problems.push('the pad is open, but not all of it is shown');
  // The round keyboard button beside the closed pad shares the ring's keyboard name, so only the others tell.
  if (!open && [...DEFAULT_LABELS, ...RING_ONLY].some(shown)) problems.push('a closed pad shows keys');
  if (open && shown(CLOSE_LAYER)) problems.push('a layer stands in for a pad drawn open');
  // The pen is out of reach exactly while the editor is open, the pad closed and the open pad without room.
  const editorAlone = shown(EDITOR) && !open && !poseNow().roomAboveKeyboard;
  if (editorAlone && !shown(CLOSE_EDITOR)) problems.push('the editor without the pen has no close button of its own');
  if (!editorAlone && shown(CLOSE_EDITOR)) {
    problems.push("the editor's own close button is shown where the pen is in reach");
  }
  for (let node: TestInstance | null = toggle; node !== null; node = node.parent) {
    if (StyleSheet.flatten(node.props.style)?.opacity === 0) problems.push('the pad is not seen');
  }

  const controls = [{ name: TOGGLE, instance: toggle, frame: ownFrame(toggle) }];
  if (open && whole) {
    for (const label of RING) {
      const instance = screen.getByLabelText(label);
      controls.push({ name: String(label), instance, frame: ownFrame(instance) });
    }
    controls.push(...keyFrames());
  }
  const { window, insets } = poseNow();
  const safe = {
    left: insets.left,
    top: insets.top,
    right: window.width - insets.right,
    bottom: window.height - insets.bottom,
  };
  const cover = coverTop();
  const outside = (frame: Frame, room: Frame) =>
    frame.left < room.left || frame.top < room.top || frame.right > room.right || frame.bottom > room.bottom;
  for (const { name, instance, frame } of controls) {
    const at = JSON.stringify(frame);
    if (outside(frame, safe)) problems.push(`${name} at ${at} leaves the safe area ${JSON.stringify(safe)}`);
    if (frame.bottom > cover) problems.push(`${name} at ${at} lies under the cover from ${cover}`);
    for (const clip of clipsOf(instance)) {
      if (outside(frame, clip)) problems.push(`${name} at ${at} is cut off by ${JSON.stringify(clip)}`);
    }
    const style = StyleSheet.flatten(instance.props.style);
    const full = (numberAt(style, 'width') ?? 0) >= 44 && (numberAt(style, 'height') ?? 0) >= 44;
    if (!full || scaleOf(instance) !== 1) problems.push(`${name} is not at its full size`);
  }
  expect({ moment, problems }).toEqual({ moment, problems: [] });
}

type MatrixEvent = {
  name: string;
  applies: (start: Start, entry: MatrixPose) => boolean;
  run: (entry: MatrixPose) => Promise<void>;
  /** The pose a turn or fold leads to (on the way there and back, the one it passes through). */
  away?: (entry: MatrixPose) => Pose;
};

const ringShownIn = (start: Start) => start.shown.pad === 'open';

/** A pose change there and back, each half checked. */
async function changeAndBack(away: Pose, home: Pose, order: readonly PoseReport[]): Promise<void> {
  await matrixStep(() => changePose(away, order));
  expectPadWhole(`in ${away.name}`);
  await matrixStep(() => changePose(home, order));
}

const EVENTS: MatrixEvent[] = [
  { name: 'toggle tap', applies: () => true, run: () => matrixStep(() => press(TOGGLE)) },
  { name: 'ring keyboard button', applies: ringShownIn, run: () => matrixStep(() => press(RING[3])) },
  // The terminal takes the focus itself: the app sees only the keyboard coming up.
  {
    name: 'terminal tap',
    applies: () => true,
    run: () => matrixStep(async () => (keyboardShownNow() ? undefined : keyboardComesUp())),
  },
  { name: 'pen', applies: ringShownIn, run: () => matrixStep(() => press('Text editor')) },
  { name: 'Keys ring button', applies: ringShownIn, run: () => matrixStep(() => press('Keys')) },
  { name: 'Agent ring button', applies: ringShownIn, run: () => matrixStep(() => press('Agent hotkeys')) },
  {
    name: 'layer close button',
    applies: (start) => start.shown.pad === 'standing in',
    run: () => matrixStep(() => press(CLOSE_LAYER)),
  },
  {
    name: 'editor close button',
    applies: (start, entry) => start.shown.editor && start.shown.pad === 'closed' && !entry.pose.roomAboveKeyboard,
    run: () => matrixStep(() => press(CLOSE_EDITOR)),
  },
  {
    name: 'turn, window first',
    applies: () => true,
    run: (entry) => matrixStep(() => changePose(entry.turned, WINDOW_FIRST)),
    away: (entry) => entry.turned,
  },
  {
    name: 'turn, keyboard frame first',
    applies: (start) => start.shown.keyboard,
    run: (entry) => matrixStep(() => changePose(entry.turned, FRAME_FIRST)),
    away: (entry) => entry.turned,
  },
  {
    name: 'turn and back, window first',
    applies: () => true,
    run: (entry) => changeAndBack(entry.turned, entry.pose, WINDOW_FIRST),
    away: (entry) => entry.turned,
  },
  {
    name: 'turn and back, keyboard frame first',
    applies: (start) => start.shown.keyboard,
    run: (entry) => changeAndBack(entry.turned, entry.pose, FRAME_FIRST),
    away: (entry) => entry.turned,
  },
  {
    name: 'fold and unfold, window first',
    applies: (_start, entry) => entry.resized !== null,
    run: (entry) => changeAndBack(entry.resized ?? entry.pose, entry.pose, WINDOW_FIRST),
    away: (entry) => entry.resized ?? entry.pose,
  },
  {
    name: 'fold and unfold, keyboard frame first',
    applies: (start, entry) => entry.resized !== null && start.shown.keyboard,
    run: (entry) => changeAndBack(entry.resized ?? entry.pose, entry.pose, FRAME_FIRST),
    away: (entry) => entry.resized ?? entry.pose,
  },
];

const MATRIX = MATRIX_POSES.flatMap((entry) =>
  startsIn(entry).flatMap((start) =>
    EVENTS.filter((event) => event.applies(start, entry)).map((event) => ({
      key: `${entry.pose.name} | ${start.name} | ${event.name}`,
      entry,
      start,
      event,
    })),
  ),
);

/**
 * After a turn or fold that starts with the keyboard and the open pad both up: where the pose it leads to leaves the
 * open pad no room above the keyboard, even over the header, the pad closes and the keyboard stays, and turning back
 * does not open the pad again (it opens only when the person opens it); where there is room, both stay. The same
 * whichever of the window's new size and the keyboard's new frame arrives first. Null for every other transition.
 */
function keyboardAndPadAfter(event: MatrixEvent, entry: MatrixPose, start: Start): KeyboardAndPad | null {
  const away = event.away?.(entry);
  if (away === undefined || !start.shown.keyboard || start.shown.pad !== 'open') return null;
  return { keyboard: true, layer: 'none', pad: away.roomAboveKeyboard ? 'open' : 'closed' };
}

describe('the transition matrix: every pad control shown stays whole, inside the safe area and above every cover', () => {
  // Every frame is read at rest: with Reduce Motion on the pad stands at its end state at once (the native-driven
  // opening motion does not run in this renderer). The motions themselves are tested in the pad's other screen tests.
  beforeEach(() => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => Promise.resolve(true));
  });

  test.each(MATRIX)('$key', async ({ entry, start, event }) => {
    await enterStart(entry, start);
    expect(shownNow()).toEqual(start.shown);
    expectPadWhole(start.name);
    await event.run(entry);
    expectPadWhole(event.name);
    const expected = keyboardAndPadAfter(event, entry, start);
    expect(expected === null ? null : keyboardAndPadNow()).toEqual(expected);
  });
});
