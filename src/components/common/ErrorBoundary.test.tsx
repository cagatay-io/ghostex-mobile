/// <reference types="node" />
/**
 * Run with `bun test src/components/common/ErrorBoundary.test.tsx` from apps/mobile/app.
 *
 * The app has no React renderer in its test setup (no react-test-renderer or react-dom), so these
 * tests drive the boundary the way React does: a child's throw reaches getDerivedStateFromError and
 * componentDidCatch, then `render()` is read back after each state change. "Remounts" is checked
 * through the Fragment key `render()` puts on the children: a new key makes React unmount the old
 * children and mount fresh ones.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { Fragment, isValidElement, type ErrorInfo, type ReactElement, type ReactNode } from 'react';

import ErrorBoundary, { errorBoundaryMessage, type ErrorBoundaryFallbackProps } from './ErrorBoundary';

const child = <span>section</span>;

function mount(renderFallback: (props: ErrorBoundaryFallbackProps) => ReactNode = () => 'fallback') {
  const boundary = new ErrorBoundary({ name: 'test:section', renderFallback, children: child });
  // Outside a renderer setState has nothing to schedule: apply it right away, as React would.
  boundary.setState = ((update: unknown) => {
    const next = typeof update === 'function' ? update(boundary.state, boundary.props) : update;
    boundary.state = { ...boundary.state, ...next };
  }) as typeof boundary.setState;
  return boundary;
}

/** What React does when a child throws while rendering. */
function throwIn(boundary: ErrorBoundary, error: unknown): void {
  boundary.state = { ...boundary.state, ...ErrorBoundary.getDerivedStateFromError(error) };
  boundary.componentDidCatch(error, { componentStack: '\n    at Broken\n' } as ErrorInfo);
}

function renderedChildren(boundary: ErrorBoundary): ReactElement<{ children: ReactNode }> {
  const output = boundary.render();
  assert.ok(isValidElement<{ children: ReactNode }>(output), 'renders an element');
  assert.equal(output.type, Fragment);
  return output;
}

let warnings: unknown[][] = [];
const realWarn = console.warn;
beforeEach(() => {
  warnings = [];
  console.warn = (...args: unknown[]) => void warnings.push(args);
});
afterEach(() => {
  console.warn = realWarn;
});

describe('ErrorBoundary', () => {
  test('renders its children while nothing throws', () => {
    const boundary = mount();
    assert.equal(renderedChildren(boundary).props.children, child);
    assert.equal(warnings.length, 0);
  });

  test('shows the fallback with the error when a child throws', () => {
    const seen: unknown[] = [];
    const boundary = mount(({ error }) => {
      seen.push(error);
      return 'fallback card';
    });
    const error = new Error('Cannot read property message of null');
    throwIn(boundary, error);
    assert.equal(boundary.render(), 'fallback card');
    assert.deepEqual(seen, [error]);
  });

  test('a thrown null or undefined still shows the fallback', () => {
    const boundary = mount();
    throwIn(boundary, null);
    assert.equal(boundary.render(), 'fallback');
  });

  test('logs the failure with the boundary name, the message and the component stack', () => {
    const boundary = mount();
    throwIn(boundary, new Error('boom'));
    assert.equal(warnings.length, 1);
    assert.match(String(warnings[0]?.[0]), /test:section failed to render: boom/);
    assert.match(String(warnings[0]?.[2]), /at Broken/);
  });

  test('Try Again clears the error and mounts the children fresh', () => {
    let retry: (() => void) | undefined;
    const boundary = mount((props) => {
      retry = props.retry;
      return 'fallback';
    });
    const firstKey = renderedChildren(boundary).key;
    throwIn(boundary, new Error('boom'));
    assert.equal(boundary.render(), 'fallback');

    retry?.();
    const remounted = renderedChildren(boundary);
    assert.equal(remounted.props.children, child);
    assert.notEqual(remounted.key, firstKey, 'a new key makes React remount the children');
  });

  test('a section that throws again after Try Again shows the fallback again', () => {
    let retry: (() => void) | undefined;
    const boundary = mount((props) => {
      retry = props.retry;
      return 'fallback';
    });
    throwIn(boundary, new Error('first'));
    boundary.render();
    retry?.();
    renderedChildren(boundary);
    throwIn(boundary, new Error('second'));
    assert.equal(boundary.render(), 'fallback');
    assert.equal(warnings.length, 2);
  });
});

describe('errorBoundaryMessage', () => {
  test('reads Error, { message } objects and strings, and never throws on null', () => {
    assert.equal(errorBoundaryMessage(new Error('boom')), 'boom');
    assert.equal(errorBoundaryMessage({ message: 'offline' }), 'offline');
    assert.equal(errorBoundaryMessage('plain'), 'plain');
    assert.equal(errorBoundaryMessage(null), 'Unknown error');
    assert.equal(errorBoundaryMessage(undefined), 'Unknown error');
    assert.equal(errorBoundaryMessage(new TypeError('')), 'TypeError');
  });
});
