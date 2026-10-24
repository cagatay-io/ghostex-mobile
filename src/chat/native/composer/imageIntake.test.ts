/// <reference types="node" />
/** Run with `bun test src/chat/native/composer/imageIntake.test.ts` from apps/mobile/app. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { PickedFile } from './attachments';
import { attachIntakeImages, imagesFromIntake, intakeFailureMessage, intakeImageName } from './imageIntake';

const CACHE = 'file:///data/user/0/dev.ghostex.app/cache/chat-image-intake';

describe('intakeImageName', () => {
  test('keeps a name that already ends in an image extension', () => {
    assert.equal(intakeImageName('Screenshot_20261024.png', 'image/png', 0), 'Screenshot_20261024.png');
    assert.equal(intakeImageName('photo.JPEG', 'image/jpeg', 0), 'photo.JPEG');
  });

  test('gives a keyboard image the extension of its type', () => {
    assert.equal(intakeImageName('gboard_sticker', 'image/webp', 0), 'gboard_sticker.webp');
    assert.equal(intakeImageName('clip.bin', 'image/gif', 0), 'clip.gif');
    assert.equal(intakeImageName('', 'image/jpeg', 2), 'pasted-image-3.jpg');
  });

  test('falls back to png for a type it does not know, and drops any folder', () => {
    assert.equal(intakeImageName('/sdcard/x', 'image/x-unknown', 0), 'x.png');
  });
});

describe('imagesFromIntake', () => {
  test('reads the copies the native view reported', () => {
    const intake = imagesFromIntake({
      via: 'keyboard',
      failed: 0,
      files: [
        { uri: `${CACHE}/1-0-sticker`, name: 'sticker', mimeType: 'image/webp' },
        { uri: `${CACHE}/1-1-shot.png`, name: 'shot.png', mimeType: 'image/png' },
      ],
    });
    assert.deepEqual(intake, {
      files: [
        { uri: `${CACHE}/1-0-sticker`, name: 'sticker.webp' },
        { uri: `${CACHE}/1-1-shot.png`, name: 'shot.png' },
      ],
      failed: 0,
    });
  });

  test('skips anything that is not a local image copy, and repeats', () => {
    const intake = imagesFromIntake({
      files: [
        { uri: 'content://com.google.android.inputmethod.latin/x', name: 'x.png', mimeType: 'image/png' },
        { uri: `${CACHE}/2-0-doc.pdf`, name: 'doc.pdf', mimeType: 'application/pdf' },
        { uri: `${CACHE}/2-1-a.png`, name: 'a.png', mimeType: 'image/png' },
        { uri: `${CACHE}/2-1-a.png`, name: 'a.png', mimeType: 'image/png' },
        { name: 'no-uri.png' },
        'junk',
      ],
      failed: 1,
    });
    assert.deepEqual(intake.files, [{ uri: `${CACHE}/2-1-a.png`, name: 'a.png' }]);
    assert.equal(intake.failed, 1);
  });

  test('reads a malformed event as nothing', () => {
    assert.deepEqual(imagesFromIntake(null), { files: [], failed: 0 });
    assert.deepEqual(imagesFromIntake({ files: 'x', failed: -2 }), { files: [], failed: 0 });
  });
});

describe('intakeFailureMessage', () => {
  test('speaks only when nothing could be read', () => {
    assert.equal(intakeFailureMessage({ files: [], failed: 0 }), null);
    assert.equal(intakeFailureMessage({ files: [{ uri: `${CACHE}/a.png` }], failed: 2 }), null);
    assert.equal(intakeFailureMessage({ files: [], failed: 1 }), 'The image could not be read.');
    assert.equal(intakeFailureMessage({ files: [], failed: 3 }), 'The images could not be read.');
  });
});

describe('attachIntakeImages', () => {
  function fakeChat() {
    const attached: PickedFile[][] = [];
    return { attached, chat: { attachFiles: async (files: readonly PickedFile[]) => void attached.push([...files]) } };
  }

  test('hands the images to attachFiles, the attach button path, in one call', () => {
    const { attached, chat } = fakeChat();
    const failures: string[] = [];
    attachIntakeImages(
      chat,
      {
        via: 'drop',
        failed: 0,
        files: [
          { uri: `${CACHE}/3-0-a.png`, name: 'a.png', mimeType: 'image/png' },
          { uri: `${CACHE}/3-1-b`, name: 'b', mimeType: 'image/jpeg' },
        ],
      },
      (message) => failures.push(message),
    );
    assert.deepEqual(attached, [
      [
        { uri: `${CACHE}/3-0-a.png`, name: 'a.png' },
        { uri: `${CACHE}/3-1-b`, name: 'b.jpg' },
      ],
    ]);
    assert.deepEqual(failures, []);
  });

  test('says so when the image could not be read, and attaches nothing', () => {
    const { attached, chat } = fakeChat();
    const failures: string[] = [];
    attachIntakeImages(chat, { via: 'paste', failed: 1, files: [] }, (message) => failures.push(message));
    assert.deepEqual(attached, []);
    assert.deepEqual(failures, ['The image could not be read.']);
  });
});
