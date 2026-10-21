import { requireNativeView } from 'expo';
import * as React from 'react';

import type { GhostexSelectionMenuViewProps } from './GhostexNative.types';

/** Required on first use, so a screen that never draws a message does not load it. */
let NativeView: React.ComponentType<GhostexSelectionMenuViewProps> | null = null;

export default function GhostexSelectionMenuView(props: GhostexSelectionMenuViewProps) {
  NativeView ??= requireNativeView('GhostexNative', 'GhostexSelectionMenuView');
  return <NativeView {...props} />;
}
