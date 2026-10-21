import { requireNativeView } from 'expo';
import * as React from 'react';
import { Platform } from 'react-native';

import type { GhostexSelectionMenuViewProps } from './GhostexNative.types';

/** Android only: iOS has no such view (see `messageSelection.tsx` in the chat). */
let NativeView: React.ComponentType<GhostexSelectionMenuViewProps> | null = null;

export default function GhostexSelectionMenuView(props: GhostexSelectionMenuViewProps) {
  if (Platform.OS !== 'android') throw new Error('GhostexSelectionMenuView is Android only');
  NativeView ??= requireNativeView('GhostexNative', 'GhostexSelectionMenuView');
  return <NativeView {...props} />;
}
