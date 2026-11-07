/// <reference types="jest" />
/**
 * Run with `bun run test:jest`. The real `ComposerInput` bound to the real `ComposerModel`, with a
 * stand-in for the core's `composerReferences`: a pasted image shows as one chip, the caret steps
 * over it, typing beside it stays put, Backspace takes all of it, and Send sends the markdown.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useCallback, useReducer, useState } from 'react';

import type { UserAction } from '../../rust/actions';
import { ComposerModel, type SubmitMode } from '../../rust/composer';
import { ComposerInput } from './ComposerInput';
import { createDraftReferenceParser } from './references';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const IMAGE = '[Image #1](/Users/me/.ghostex/pasted/shot.png)';
const CHIP = '  Image #1  ';

/** What the core answers for `composerReferences` (image pills only). */
function coreReferences(draft: string): unknown[] {
  return [...draft.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/gu)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    kind: 'image',
    label: match[1],
    path: match[2],
    pill: `     ${match[1]!.replace(/ /gu, ' ')} `,
  }));
}

function setup(initial: string) {
  const sent: UserAction[] = [];
  let rerender: () => void = () => undefined;
  const model = new ComposerModel({
    dispatch: (action) => sent.push(action),
    document: () => null,
    onChange: () => rerender(),
    onSendBlocked: () => undefined,
    onFocusRequested: () => undefined,
  });
  model.init({ clientId: 'phone', entry: { text: initial } }, 'session');
  const input = {
    edited: jest.fn((text: string, selection?: { start: number; end: number }) => model.edited(text, selection)),
    selected: jest.fn((selection: { start: number; end: number }) => model.selected(selection)),
    focused: () => model.focused(),
    blurred: () => model.blurred(),
    submit: (mode: SubmitMode) => model.submit(mode),
    replace: (text: string) => model.replace(text, null, false),
  };

  function Harness() {
    const [, bump] = useReducer((value: number) => value + 1, 0);
    rerender = bump;
    const [text, setText] = useState(model.state.text);
    const [parser] = useState(createDraftReferenceParser);
    const parse = useCallback((draft: string) => parser(draft, coreReferences(draft)), [parser]);
    return (
      <ComposerInput
        model={model.state}
        input={input}
        references={parse(text)}
        parsedFor={text}
        parse={parse}
        placeholder="Message"
        collapsed={false}
        maxHeight={200}
        onTextChange={setText}
        onCaret={() => undefined}
        onImages={() => undefined}
      />
    );
  }
  return { model, input, sent, Harness };
}

const field = () => screen.getByLabelText('Message composer');

/** The text the field shows: its `value`, or its styled children joined. */
function shown(): string {
  const props = field().props as { value?: string; children?: unknown };
  if (typeof props.value === 'string') return props.value;
  const flat = (node: unknown): string =>
    typeof node === 'string'
      ? node
      : Array.isArray(node)
        ? node.map(flat).join('')
        : node !== null && typeof node === 'object' && 'props' in node
          ? flat((node as { props: { children?: unknown } }).props.children)
          : '';
  return flat(props.children);
}

const select = (start: number, end = start) =>
  act(() => {
    fireEvent(field(), 'selectionChange', { nativeEvent: { selection: { start, end } } });
  });

const type = (next: string) =>
  act(() => {
    fireEvent.changeText(field(), next);
  });

test('a pasted image shows as one chip, never its path', async () => {
  const { Harness } = setup(`look ${IMAGE} here`);
  await render(<Harness />);
  expect(shown()).toBe(`look ${CHIP} here`);
  expect(screen.getByText(' Image #1 ')).toBeTruthy();
});

test('Left from after the chip steps over it, and the draft caret stands before the reference', async () => {
  const { Harness, model } = setup(`${IMAGE} hi`);
  await render(<Harness />);
  await select(CHIP.length);
  await select(CHIP.length - 1);
  expect(field().props.selection).toEqual({ start: 0, end: 0 });
  expect(model.state.selection).toEqual({ start: 0, end: 0 });
});

test('typing before the chip stays before it, and Send sends the markdown', async () => {
  const { Harness, model, sent, input } = setup(`${IMAGE} is this right?`);
  await render(<Harness />);
  await select(0);
  await type(`L${CHIP} is this right?`);
  await type(`Lo${CHIP} is this right?`);
  expect(field().props.selection).toBeUndefined();
  expect(shown()).toBe(`Lo${CHIP} is this right?`);
  expect(input.edited).toHaveBeenLastCalledWith(`Lo${IMAGE} is this right?`, { start: 2, end: 2 });
  await act(() => {
    input.submit('send');
  });
  expect(sent.find((action) => action.type === 'send')).toMatchObject({ text: `Lo${IMAGE} is this right?` });
  expect(model.state.text).toBe('');
});

test('Backspace right after the chip deletes the whole reference', async () => {
  const { Harness, model } = setup(`see ${IMAGE} now`);
  await render(<Harness />);
  const end = 4 + CHIP.length;
  await select(end);
  await type(`see ${CHIP.slice(0, -1)} now`);
  expect(model.state.text).toBe('see  now');
  expect(shown()).toBe('see  now');
  expect(field().props.selection).toEqual({ start: 4, end: 4 });
});

test('a letter typed inside the chip lands after it', async () => {
  const { Harness, model } = setup(`${IMAGE}`);
  await render(<Harness />);
  await type(`${CHIP.slice(0, 3)}x${CHIP.slice(3)}`);
  expect(model.state.text).toBe(`${IMAGE}x`);
  expect(shown()).toBe(`${CHIP}x`);
  expect(field().props.selection).toEqual({ start: CHIP.length + 1, end: CHIP.length + 1 });
});
