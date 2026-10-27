/// <reference types="node" />
/** Run with `bun test src/chat/native/cards/dialogCancel.test.ts` from apps/mobile/app. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { phoneKeepsCancel } from './dialogCancel';

const row = (title: string) => ({ title, label: title });

describe('phone Cancel under numbered dialogs', () => {
  test('a numbered dialog with no "No" row keeps Cancel', () => {
    const notice = {
      numbered: true,
      secondaryChoice: null,
      choices: [row('Install for you (user scope)'), row('Install for all collaborators')],
      dialog: { actions: ['up', 'down', 'confirm', 'cancel'] },
    };
    assert.equal(phoneKeepsCancel(notice), true);
  });

  test('a "No" row is the way out, so no Cancel', () => {
    const codex = {
      numbered: true,
      secondaryChoice: 2,
      choices: [row('Yes, proceed'), row("Yes, and don't ask again"), row('No, and tell Codex what to do differently')],
      dialog: { actions: ['confirm', 'cancel'] },
    };
    assert.equal(phoneKeepsCancel(codex), false);
    // A y/n prompt's Yes and No rows carry no secondary choice but still have their No.
    const yesNo = {
      numbered: true,
      secondaryChoice: null,
      choices: [row('Yes'), row('No')],
      dialog: { actions: ['yes', 'no', 'cancel'] },
    };
    assert.equal(phoneKeepsCancel(yesNo), false);
  });

  test('cards that are not numbered dialogs, or offer no cancel, stay as they are', () => {
    assert.equal(
      phoneKeepsCancel({ numbered: false, choices: [row('Install')], dialog: { actions: ['cancel'] } }),
      false,
    );
    assert.equal(
      phoneKeepsCancel({
        numbered: true,
        secondaryChoice: null,
        choices: [row('Install')],
        dialog: { actions: ['confirm'] },
      }),
      false,
    );
    // A two-way chooser's alternative is what Esc answers.
    assert.equal(
      phoneKeepsCancel({
        numbered: true,
        secondaryChoice: 1,
        choices: [row('Resume'), row('Start new')],
        dialog: { actions: ['cancel'] },
      }),
      false,
    );
    assert.equal(phoneKeepsCancel(null), false);
  });
});
