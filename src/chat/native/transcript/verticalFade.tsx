/**
 * One colour fading from top to bottom over its whole box, which `style` places: the tone cards'
 * wash (`cards/ToneCard.tsx`) and the page card's fade over its picture (`PageCard.tsx`).
 *
 * The fade is drawn in a 1×1 viewBox stretched to the box. react-native-svg keeps a shape's path
 * once it has drawn it and does not compute it again when its view resizes, so a rect sized in
 * percent kept its first width: after the phone rotated to landscape, a notice's wash stopped where
 * the portrait card had ended. The stretch is computed on every draw, so the unit rect always
 * fills the box.
 */

import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

export function VerticalFade({
  id,
  color,
  from,
  to,
  style,
}: {
  /** The gradient's id inside this drawing. */
  id: string;
  /** Opaque: react-native-svg replaces a stop colour's own alpha with its stop opacity (`from`, `to`). */
  color: string;
  /** The colour's opacity at the top and at the bottom. */
  from: number;
  to: number;
  /** Positions and sizes the box; give it a size, since the drawing has none of its own. */
  style: StyleProp<ViewStyle>;
}) {
  return (
    <Svg style={style} viewBox="0 0 1 1" preserveAspectRatio="none" pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={from} />
          <Stop offset="1" stopColor={color} stopOpacity={to} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="1" height="1" fill={`url(#${id})`} />
    </Svg>
  );
}
