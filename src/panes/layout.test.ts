/// <reference types="node" />
/**
 * Run with `bun test src/panes/layout.test.ts`. The stored pane layout (version 1): per window shape the pane type of
 * each slot, the session a session pane shows (`machineId:sessionId`) and the divider position (0.25 to 0.75). A
 * stored value that is not exactly that is discarded and one pane is shown. The documents below are the layout
 * contract's own valid and invalid examples, written out.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { paneLayoutSummary, parsePaneLayoutDocument, SINGLE_PANE_DOCUMENT } from './layout';

const VALID = {
  schemaVersion: 1,
  layouts: {
    stacked: {
      first: { paneType: 'session', sessionKey: 'm1:s1' },
      second: { paneType: 'browser' },
      dividerRatio: 0.6,
    },
  },
} as const;

/** A session pane without the session it shows. */
const SESSION_WITHOUT_KEY = {
  schemaVersion: 1,
  layouts: { stacked: { first: { paneType: 'session' }, second: { paneType: 'browser' }, dividerRatio: 0.6 } },
};
/** An unknown pane type and a divider beyond the container. */
const UNKNOWN_TYPE = {
  schemaVersion: 1,
  layouts: {
    stacked: {
      first: { paneType: 'session', sessionKey: 'm1:s1' },
      second: { paneType: 'terminal' },
      dividerRatio: 1.2,
    },
  },
};
/** A divider below a quarter. */
const RATIO_BELOW_QUARTER = {
  schemaVersion: 1,
  layouts: { stacked: { first: { paneType: 'browser' }, second: { paneType: 'files' }, dividerRatio: 0.1 } },
};
/** The chat pane, which does not exist. */
const CHAT_PANE = {
  schemaVersion: 1,
  layouts: {
    stacked: {
      first: { paneType: 'chat', sessionKey: 'm1:s1' },
      second: { paneType: 'browser' },
      dividerRatio: 0.5,
    },
  },
};

const TWO_SESSIONS = {
  schemaVersion: 1,
  layouts: {
    stacked: {
      first: { paneType: 'session', sessionKey: 'm1:s1' },
      second: { paneType: 'session', sessionKey: 'm1:s2' },
      dividerRatio: 0.5,
    },
    sideBySide: {
      first: { paneType: 'session', sessionKey: 'm1:s2' },
      second: { paneType: 'session', sessionKey: 'm2:s9' },
      dividerRatio: 0.25,
    },
  },
} as const;

describe('reading the stored pane layout', () => {
  test('the valid example is kept as stored', () => {
    assert.deepEqual(parsePaneLayoutDocument(VALID), VALID);
  });

  test('both window shapes are kept, each with its own slots and divider', () => {
    assert.deepEqual(parsePaneLayoutDocument(TWO_SESSIONS), TWO_SESSIONS);
  });

  test('nothing stored is one pane in every window shape', () => {
    assert.deepEqual(parsePaneLayoutDocument(null), SINGLE_PANE_DOCUMENT);
    assert.deepEqual(SINGLE_PANE_DOCUMENT, { schemaVersion: 1, layouts: {} });
  });

  for (const [name, document] of [
    ['a session pane without its session', SESSION_WITHOUT_KEY],
    ['an unknown pane type and a divider beyond the container', UNKNOWN_TYPE],
    ['a divider below a quarter', RATIO_BELOW_QUARTER],
    ['the chat pane, which does not exist', CHAT_PANE],
  ] as const) {
    test(`${name} is discarded: one pane`, () => {
      assert.deepEqual(parsePaneLayoutDocument(document), SINGLE_PANE_DOCUMENT);
    });
  }

  test('an unknown version is discarded: one pane', () => {
    assert.deepEqual(parsePaneLayoutDocument({ ...VALID, schemaVersion: 2 }), SINGLE_PANE_DOCUMENT);
  });

  test('a field the contract does not know is discarded: one pane', () => {
    assert.deepEqual(parsePaneLayoutDocument({ ...VALID, extra: true }), SINGLE_PANE_DOCUMENT);
    assert.deepEqual(
      parsePaneLayoutDocument({ schemaVersion: 1, layouts: { landscape: VALID.layouts.stacked } }),
      SINGLE_PANE_DOCUMENT,
    );
    assert.deepEqual(
      parsePaneLayoutDocument({
        schemaVersion: 1,
        layouts: { stacked: { ...VALID.layouts.stacked, active: 1 } },
      }),
      SINGLE_PANE_DOCUMENT,
    );
  });

  test('a session key that is not computer and session is discarded: one pane', () => {
    for (const sessionKey of ['m1', 'm1:tab:abc', ':s1', 'm1:', '']) {
      const document = {
        schemaVersion: 1,
        layouts: { stacked: { ...VALID.layouts.stacked, first: { paneType: 'session', sessionKey } } },
      };
      assert.deepEqual(parsePaneLayoutDocument(document), SINGLE_PANE_DOCUMENT, sessionKey);
    }
  });

  test('both slots on one session is discarded: one session cannot show in two panes', () => {
    const document = {
      schemaVersion: 1,
      layouts: {
        stacked: {
          first: { paneType: 'session', sessionKey: 'm1:s1' },
          second: { paneType: 'session', sessionKey: 'm1:s1' },
          dividerRatio: 0.5,
        },
      },
    };
    assert.deepEqual(parsePaneLayoutDocument(document), SINGLE_PANE_DOCUMENT);
  });

  test('a divider that is no number is discarded: one pane', () => {
    const document = { schemaVersion: 1, layouts: { stacked: { ...VALID.layouts.stacked, dividerRatio: '0.5' } } };
    assert.deepEqual(parsePaneLayoutDocument(document), SINGLE_PANE_DOCUMENT);
  });
});

describe('the stored layout as the development build shows it', () => {
  test('one pane when nothing is stored for the window shape', () => {
    assert.equal(paneLayoutSummary(undefined), 'One pane');
  });

  test('each slot with its type and session, then the divider in percent', () => {
    assert.equal(paneLayoutSummary(TWO_SESSIONS.layouts.stacked), 'session m1:s1 | session m1:s2 | 50 %');
    assert.equal(paneLayoutSummary(VALID.layouts.stacked), 'session m1:s1 | browser | 60 %');
  });
});
