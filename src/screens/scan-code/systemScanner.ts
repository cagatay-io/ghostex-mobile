/**
 * iOS scans pairing codes with Apple's own scanner (VisionKit's DataScannerViewController,
 * through expo-camera's `launchScanner`) instead of the in-app camera view.
 *
 * CDXC:RemotePairing 2026-10-27 WHY:
 * User: "tried to scan this on my macbook from my phone app and it didn't work ... scanning from
 * the camera app worked tho". expo-camera's camera view uses the iPhone's wide-angle lens only.
 * Filling the 220pt scan frame with the computer's QR puts the phone about 18cm from the screen,
 * closer than a Pro iPhone's main lens can focus (about 20cm), and that view never switches to
 * the ultra-wide macro lens the Camera app moves to, so the code stayed blurred. Apple's Vision
 * detector reads the same screenshot sharp and stops reading it once blur passes half a module.
 * VisionKit's scanner runs the Camera app's lens switching, guidance and pinch-to-zoom, and it is
 * already in expo-camera, so the fix needs no native change and ships over the air. Phones
 * VisionKit does not support (iOS 15, or an A11 chip and older) and Android keep the camera view.
 */

import { isGhostexPairingPayload, readPairingCode } from '../../machines/pairingCodes';

/**
 * Whether a code Apple's scanner reports should close it and go to the scan controller: a code
 * this app pairs with, or a Ghostex code from a newer computer (the controller says to update).
 * Any other QR keeps the scanner open, since its toast would be hidden behind the scanner.
 */
export function shouldTakeSystemScan(payloads: readonly (string | undefined)[]): boolean {
  return payloads.some(
    (payload) =>
      payload !== undefined &&
      payload.length > 0 &&
      (readPairingCode(payload) !== null || isGhostexPairingPayload(payload)),
  );
}
