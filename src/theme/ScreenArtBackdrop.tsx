/**
 * Still artwork backdrop rendered behind the phone's main screens (Sessions list, Chat, and the
 * Settings > Themes live preview).
 *
 * Paints the active appearance's still artwork (`windowArt` in dark mode, `windowArtLight` in light mode),
 * downloaded on demand from `ghostex-components` and cached locally, fading in smoothly once ready.
 * Over the image sits a dimming wash (`windowArtDim`) plus a surface tint veil in `baseColor` so text,
 * badges and rows stay crisp and readable in both dark and light modes. Offline or while downloading,
 * renders nothing so the screen stays solid in the theme's colour.
 */

import { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { useSettingsStore } from '../settings/store';
import { isKnownArtworkId, useArtworkSource } from './artworks';
import { useAppearanceIsLight } from './useAppearance';

export type ScreenArtArea = 'sidebar' | 'chat' | 'preview';

export type ScreenArtBackdropProps = {
  /** Solid background colour of the screen or area behind the content. */
  baseColor: string;
  /** Which area is being painted, to choose the right tint veil for readability. */
  area: ScreenArtArea;
  /** Override whether the screen is in light mode (e.g. Chat's own `theme.light`). */
  lightOverride?: boolean;
  /** Override artwork id (for previews). */
  artIdOverride?: string;
  /** Override dimming percent (for previews). */
  dimPercentOverride?: number;
  /** Override whether artwork backdrops are shown (for previews). */
  enabledOverride?: boolean;
};

/** How strongly the theme's own colour veils the dimmed artwork so text stays effortless to read. */
const SURFACE_TINT_ALPHA: Readonly<Record<ScreenArtArea, { dark: number; light: number }>> = {
  sidebar: { dark: 0.6, light: 0.68 },
  chat: { dark: 0.54, light: 0.64 },
  preview: { dark: 0.46, light: 0.56 },
};

const FADE_IN_MS = 320;

/** Whether a still artwork backdrop is active for the given appearance (`lightOverride` defaults to app appearance). */
export function useHasScreenArtBackdrop(lightOverride?: boolean): boolean {
  const appLight = useAppearanceIsLight();
  const light = lightOverride ?? appLight;
  return useSettingsStore((state) => {
    if (!state.settings.showHeaderArtworkBackdrop) return false;
    const artId = light ? state.settings.windowArtLight : state.settings.windowArt;
    return isKnownArtworkId(artId);
  });
}

export function ScreenArtBackdrop({
  baseColor,
  area,
  lightOverride,
  artIdOverride,
  dimPercentOverride,
  enabledOverride,
}: ScreenArtBackdropProps) {
  const appLight = useAppearanceIsLight();
  const light = lightOverride ?? appLight;
  const stored = useSettingsStore(
    useShallow(({ settings }) => ({
      enabled: settings.showHeaderArtworkBackdrop,
      artId: light ? settings.windowArtLight : settings.windowArt,
      dim: settings.windowArtDim,
    })),
  );

  const enabled = enabledOverride ?? stored.enabled;
  const artId = artIdOverride ?? stored.artId;
  const activeArtId = enabled && isKnownArtworkId(artId) ? artId : null;
  const source = useArtworkSource(activeArtId);

  const opacity = useRef(new Animated.Value(source !== null ? 1 : 0)).current;
  const lastShownKey = useRef<string | null>(null);

  useEffect(() => {
    if (activeArtId === null || source === null) {
      lastShownKey.current = null;
      opacity.setValue(0);
      return;
    }
    const key = `${activeArtId}:${light ? 'light' : 'dark'}`;
    if (lastShownKey.current === key) {
      opacity.setValue(1);
      return;
    }
    lastShownKey.current = key;
    opacity.setValue(0);
    const anim = Animated.timing(opacity, {
      toValue: 1,
      duration: FADE_IN_MS,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [activeArtId, source, light, opacity]);

  if (activeArtId === null || source === null) return null;

  const dim = Math.max(0, Math.min(90, dimPercentOverride ?? stored.dim));
  const dimAlpha = dim / 100;
  const tintAlpha = light ? SURFACE_TINT_ALPHA[area].light : SURFACE_TINT_ALPHA[area].dark;

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]}>
      <Image source={source} resizeMode="cover" style={StyleSheet.absoluteFill} />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: light ? '#ffffff' : '#000000',
            opacity: dimAlpha,
          },
        ]}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: baseColor,
            opacity: tintAlpha,
          },
        ]}
      />
    </Animated.View>
  );
}
