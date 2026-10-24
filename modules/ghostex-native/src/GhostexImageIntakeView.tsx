import { requireNativeView } from 'expo';
import * as React from 'react';
import { Platform, View } from 'react-native';

import type { GhostexImageIntakeViewProps } from './GhostexNative.types';

/** Required on first use; iOS has no intake view yet, so it draws a plain view. */
let NativeView: React.ComponentType<GhostexImageIntakeViewProps> | null = null;

export default function GhostexImageIntakeView(props: GhostexImageIntakeViewProps) {
  if (Platform.OS !== 'android') {
    const { dropTarget: _dropTarget, onImages: _onImages, onDropActive: _onDropActive, ...viewProps } = props;
    return <View {...viewProps} />;
  }
  NativeView ??= requireNativeView('GhostexNative', 'GhostexImageIntakeView');
  return <NativeView {...props} />;
}
