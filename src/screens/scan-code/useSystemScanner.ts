/**
 * Apple's scanner for the Scan code screen on iOS (see systemScanner.ts for why). `active` is
 * false on Android, on iPhones VisionKit does not support, and after a launch failed; the screen
 * then shows the in-app camera view instead.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { CameraView } from 'expo-camera';

import { shouldTakeSystemScan } from './systemScanner';

const SUPPORTED = Platform.OS === 'ios' && CameraView.isModernBarcodeScannerAvailable;

export function useSystemScanner(onPayloads: (...payloads: (string | undefined)[]) => void) {
  const [failed, setFailed] = useState(false);
  const active = SUPPORTED && !failed;
  // Whether this screen presented the scanner and has not taken a code from it yet. VisionKit
  // reports a code on every frame it moves, so only the first one counts.
  const openRef = useRef(false);
  const onPayloadsRef = useRef(onPayloads);
  onPayloadsRef.current = onPayloads;

  useEffect(() => {
    if (!active) return;
    const subscription = CameraView.onModernBarcodeScanned((result) => {
      if (!openRef.current) return;
      const payloads = [result.raw, result.data];
      if (!shouldTakeSystemScan(payloads)) return;
      openRef.current = false;
      void CameraView.dismissScanner().catch(() => undefined);
      onPayloadsRef.current(...payloads);
    });
    return () => {
      subscription.remove();
      if (openRef.current) {
        openRef.current = false;
        void CameraView.dismissScanner().catch(() => undefined);
      }
    };
  }, [active]);

  const open = useCallback((): void => {
    if (!active) return;
    openRef.current = true;
    CameraView.launchScanner({
      barcodeTypes: ['qr'],
      isGuidanceEnabled: true,
      isHighlightingEnabled: true,
      isPinchToZoomEnabled: true,
    }).catch(() => {
      // DataScannerViewController is not supported on this iPhone: use the camera view.
      openRef.current = false;
      setFailed(true);
    });
  }, [active]);

  return { active, open };
}
