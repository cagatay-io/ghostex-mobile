/**
 * The app's share sheet for Share…: the app's own native module shows the iOS share sheet with the
 * copy's file address (`GhostexNative.shareFile`) and answers once the share is over, however it ended (a cancelled
 * sheet answers quietly; a share that failed, could not open or was interrupted answers with an error code, told to
 * the person by category); each share's copy sits in a
 * folder of its own in the app's cache, the temporary storage iOS may also clear. No new dependency. React Native's
 * `Share` is not used here: it ignores the sheet's completion when the person cancels an activity they picked
 * (react-native 0.88 RCTActionSheetManager.mm:288-295), so its answer could stay out for good, keeping the copy and
 * the one-share lock.
 */

import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { GhostexNative } from '../../modules/ghostex-native/src';
import { DocsCopy } from '../copy';
import type { ShareSheet } from './share';

/**
 * Whether this phone can hand a file to the share sheet: iOS. The app's module shows it there only, and a
 * file-sharing module for Android would be a new dependency, which needs approval first.
 */
export const canShareFiles = Platform.OS === 'ios';

const SHARE_FOLDER = 'files-share';

/** Copies kept now (their sheets not closed yet), and a counter that names each copy's folder apart. */
let keptCopies = 0;
let copyCount = 0;

export const appShareSheet: ShareSheet = {
  async keepCopy(name, base64) {
    const root = new Directory(Paths.cache, SHARE_FOLDER);
    // A copy an earlier run left behind (the app closed while its sheet was open) goes first, never one in use.
    if (keptCopies === 0 && root.exists) root.delete();
    copyCount += 1;
    const folder = new Directory(root, `${Date.now().toString(36)}-${copyCount}`);
    folder.create({ intermediates: true });
    keptCopies += 1;
    let dropped = false;
    const drop = () => {
      if (dropped) return;
      dropped = true;
      keptCopies -= 1;
      if (folder.exists) folder.delete();
    };
    try {
      const file = new File(folder, name);
      file.create();
      await file.write(base64, { encoding: 'base64' });
      return { uri: file.uri, drop };
    } catch (failure) {
      drop();
      throw failure;
    }
  },
  async open(uri) {
    // Settles once the share is over (GhostexShareSheetEnd), shared or cancelled, never while the sheet is on screen.
    try {
      await GhostexNative.shareFile(uri);
    } catch (failure) {
      throw new Error(shareSheetFailure(failure));
    }
  },
};

/**
 * The notice for a share that failed, could not open or was interrupted, by the module's error code (a plain cancel
 * shows nothing): the activity's own message varies with the app and the system language, so the person is told
 * which of the three things happened. Any other failure counts as the sheet ending early.
 */
function shareSheetFailure(failure: unknown): string {
  const code = (failure as { code?: unknown } | null)?.code;
  switch (code) {
    case 'E_SHARE_UNAVAILABLE':
      return DocsCopy.shareSheetUnavailable;
    case 'E_SHARE_FAILED':
      return DocsCopy.shareActivityFailed;
    default:
      return DocsCopy.shareSheetInterrupted;
  }
}
