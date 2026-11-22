/**
 * Optional dimmed static artwork or static Live tint gradient rendered behind the phone's header/top bar
 * (100% JS/TS OTA-safe). Supports all 32 desktop artworks via on-demand cache (`artworks.ts`) for both
 * dark (`windowArt`) and light (`windowArtLight`) appearances.
 *
 * Place as the first child inside a header container with `overflow: 'hidden'` and `position: 'relative'`.
 */

import { useId } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useShallow } from 'zustand/react/shallow';

import { useSettingsStore } from '../settings/store';
import { isKnownArtworkId, useArtworkSource } from './artworks';
import { liveGradientForStyle } from './themeLooks';
import { useAppearance } from './useAppearance';

export type HeaderBackdropProps = {
  /** Solid surface colour the bottom edge fades into (defaults to current header/sidebar background). */
  baseColor?: string;
  /** Override for previews (defaults to store settings). */
  artId?: string;
  /** Override for previews (defaults to store settings). */
  liveStyle?: string;
  /** Override for previews (defaults to store settings). */
  dimPercent?: number;
  /** Override for previews (defaults to store settings). */
  enabled?: boolean;
};

export function HeaderBackdrop({
  baseColor,
  artId: artIdProp,
  liveStyle: liveStyleProp,
  dimPercent: dimPercentProp,
  enabled: enabledProp,
}: HeaderBackdropProps) {
  const appearance = useAppearance();
  const stored = useSettingsStore(
    useShallow(({ settings }) => ({
      show: settings.showHeaderArtworkBackdrop,
      art: appearance.light ? settings.windowArtLight : settings.windowArt,
      dim: settings.windowArtDim,
      live: settings.windowLiveStyle,
    })),
  );
  const gradId = useId().replace(/[^a-zA-Z0-9_-]/gu, '');
  const enabled = enabledProp ?? stored.show;
  const artId = artIdProp ?? stored.art;
  const activeArtId = enabled && isKnownArtworkId(artId) ? artId : null;
  const artSource = useArtworkSource(activeArtId);

  if (!enabled) return null;

  const base = baseColor ?? appearance.background;
  const dim = Math.max(0, Math.min(100, dimPercentProp ?? stored.dim));
  const liveStyle = liveStyleProp ?? stored.live;

  if (activeArtId !== null && artSource !== null) {
    const imageOpacity = Math.max(0.14, Math.min(0.62, ((100 - dim) / 100) * 0.76));
    const topScrimOpacity = appearance.light ? 0.5 : 0.42;
    const bottomScrimOpacity = 0.92;
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Image
          source={artSource}
          resizeMode="cover"
          style={[StyleSheet.absoluteFill, { opacity: imageOpacity }]}
        />
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id={`art-scrim-${gradId}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={base} stopOpacity={topScrimOpacity} />
              <Stop offset="100%" stopColor={base} stopOpacity={bottomScrimOpacity} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#art-scrim-${gradId})`} />
        </Svg>
      </View>
    );
  }

  const live = liveGradientForStyle(liveStyle, base, appearance.accent);
  if (live !== null && !appearance.light) {
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id={`live-grad-${gradId}`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor={live.stops[0]} stopOpacity={0.95} />
              <Stop offset="55%" stopColor={live.stops[1]} stopOpacity={0.95} />
              <Stop offset="100%" stopColor={live.stops[2]} stopOpacity={0.95} />
            </LinearGradient>
            <LinearGradient id={`live-fade-${gradId}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={base} stopOpacity={0.12} />
              <Stop offset="100%" stopColor={base} stopOpacity={0.92} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#live-grad-${gradId})`} />
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#live-fade-${gradId})`} />
        </Svg>
      </View>
    );
  }

  return null;
}
