/**
 * The dot's face on the phone: packages/gx-core/src/open_dots.rs `dot_face_svg` (Open Dot's flat
 * DotOrb, viewBox `-2 -5 104 104`) drawn shape for shape with react-native-svg, so the phone, the
 * desktop sidebar and the OpenDots view draw the same character. A paused dot closes its eyes and
 * fades toward grey; a waiting dot raises its right arm. Change both files together.
 *
 * Also the dots wordmark (`dots_mark_svg`, three overlapping circles) and the small status dot.
 */

import { memo, useId } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Line, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { DOT_STATUS_COLORS } from './status';
import type { DotLook, DotStatus } from './types';

const INK = '#1c1622';

function parseHex(hex: string): [number, number, number] | null {
  if (!/^#[0-9a-fA-F]{6}$/u.test(hex)) return null;
  return [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16)) as [number, number, number];
}

/** gx-core `mix`: `hex` moved `t` of the way toward `other`, as `rgb(r,g,b)`. */
function mix(hex: string, other: string, t: number): string {
  const a = parseHex(hex);
  const b = parseHex(other);
  if (a === null || b === null) return hex;
  return `rgb(${a.map((value, index) => Math.round(value + (b[index] - value) * t)).join(',')})`;
}

function Eye({ x, eyeY, style, eyeColor }: { x: number; eyeY: number; style: string; eyeColor: string }) {
  if (style === 'happy') {
    return (
      <Path
        d={`M${x - 4.5} ${eyeY + 2} Q${x} ${eyeY - 6} ${x + 4.5} ${eyeY + 2}`}
        fill='none'
        stroke={INK}
        strokeWidth={2.8}
        strokeLinecap='round'
      />
    );
  }
  if (style === 'closed') {
    return (
      <Path
        d={`M${x - 4.5} ${eyeY} Q${x} ${eyeY + 4.5} ${x + 4.5} ${eyeY}`}
        fill='none'
        stroke={INK}
        strokeWidth={2.8}
        strokeLinecap='round'
      />
    );
  }
  const w = style === 'wide' ? 1.2 : 1;
  return (
    <G>
      <Ellipse cx={x} cy={eyeY} rx={4.8 * w} ry={8.6} fill={INK} />
      <Ellipse cx={x} cy={eyeY + 3.4} rx={3.7 * w} ry={4.6} fill={eyeColor} />
      <Ellipse cx={x} cy={eyeY - 3.6} rx={2.7 * w} ry={3.4} fill='#ffffff' />
    </G>
  );
}

function Accessory({
  look,
  rx,
  ry,
  cy,
  top,
  trim,
}: {
  look: DotLook;
  rx: number;
  ry: number;
  cy: number;
  top: number;
  trim: string;
}) {
  const sw = 3.4;
  switch (look.accessory) {
    case 'bow':
      return (
        <G transform={`translate(66 ${top + 8}) rotate(-20)`}>
          <Ellipse cx={-7} cy={0} rx={8} ry={5.5} fill={trim} stroke={INK} strokeWidth={2.6} />
          <Ellipse cx={7} cy={0} rx={8} ry={5.5} fill={trim} stroke={INK} strokeWidth={2.6} />
          <Circle r={3.6} fill={trim} stroke={INK} strokeWidth={2.4} />
        </G>
      );
    case 'cap': {
      const capY = cy - ry * 0.58;
      const half = rx * Math.sqrt(1 - ((capY - cy) / ry) ** 2) + 1.5;
      return (
        <G>
          <Path
            d={`M${50 - half} ${capY} A ${half} ${capY - top + 3} 0 0 1 ${50 + half} ${capY} Z`}
            fill={trim}
            stroke={INK}
            strokeWidth={sw}
            strokeLinejoin='round'
          />
          <Path
            d={`M50 ${top - 2.5} Q 60 ${top + 4} 62 ${capY}`}
            fill='none'
            stroke={INK}
            strokeOpacity={0.25}
            strokeWidth={1.4}
          />
          <Circle cx={50} cy={top - 3} r={2.8} fill={trim} stroke={INK} strokeWidth={2} />
          <Circle cx={56} cy={capY - 6} r={2.8} fill='#ffffff' stroke={INK} strokeWidth={1.5} />
          <Path
            d={`M${50 + half * 0.35} ${capY + 1} Q ${50 + half + 14} ${capY - 3} ${50 + half + 20} ${capY + 3} Q ${50 + half + 8} ${capY + 7.5} ${50 + half * 0.35} ${capY + 5} Z`}
            fill={mix(trim, '#000000', 0.18)}
            stroke={INK}
            strokeWidth={sw}
            strokeLinejoin='round'
          />
        </G>
      );
    }
    case 'antenna':
      return (
        <G>
          <Line x1={50} y1={top} x2={50} y2={top - 11} stroke={INK} strokeWidth={2.6} />
          <Circle cx={50} cy={top - 13} r={4.6} fill={trim} stroke={INK} strokeWidth={2.4} />
        </G>
      );
    case 'sprout':
      return (
        <G>
          <Line x1={50} y1={top} x2={50} y2={top - 7} stroke='#3f8f4a' strokeWidth={2.6} />
          <Ellipse
            cx={44}
            cy={top - 9}
            rx={6.5}
            ry={3.4}
            transform={`rotate(25 44 ${top - 9})`}
            fill='#62c46f'
            stroke={INK}
            strokeWidth={2.2}
          />
          <Ellipse
            cx={56}
            cy={top - 10}
            rx={6.5}
            ry={3.4}
            transform={`rotate(-25 56 ${top - 10})`}
            fill='#62c46f'
            stroke={INK}
            strokeWidth={2.2}
          />
        </G>
      );
    case 'headphones':
      return (
        <G>
          <Path
            d={`M${50 - rx + 2} ${cy - 10} A ${rx - 2} ${ry + 2} 0 0 1 ${50 + rx - 2} ${cy - 10}`}
            fill='none'
            stroke='#2a2530'
            strokeWidth={4.5}
          />
          <Rect x={50 - rx - 4} y={cy - 18} width={10} height={16} rx={4} fill={trim} stroke={INK} strokeWidth={2.6} />
          <Rect x={50 + rx - 6} y={cy - 18} width={10} height={16} rx={4} fill={trim} stroke={INK} strokeWidth={2.6} />
        </G>
      );
    default:
      return null;
  }
}

/** One dot, `size` points square. */
function DotFaceInner({ look, status = 'idle', size = 36 }: { look: DotLook; status?: DotStatus; size?: number }) {
  const gradientId = `dotbody${useId().replace(/[^a-zA-Z0-9]/gu, '')}`;
  const [rx, ry] = look.shape === 'chubby' ? [39.5, 33.5] : look.shape === 'tall' ? [33.5, 39] : [36, 36];
  const sleeping = status === 'paused';
  const waiting = status === 'waiting';
  const cy = 52;
  const top = cy - ry;
  const eyeY = cy - 9;
  const trim = look.accent.toLowerCase() === '#f4f4f4' ? '#d8195f' : look.accent;
  const eyeStyle = sleeping ? 'closed' : look.eyes;
  const sw = 3.4;
  const body = sleeping ? mix(look.color, '#9a9aa2', 0.45) : look.color;
  const bodyHex = parseHex(look.color) !== null ? look.color : '#ffa7c4';
  const light = mix(bodyHex, '#ffffff', 0.45);
  const dark = mix(bodyHex, '#000000', 0.12);
  const gloss = look.material === 'glossy';
  const feetY = cy + ry - 3;
  const leftArmX = 50 - rx + 1;
  const leftArmY = cy + 4;
  const rightArmX = 50 + rx - 1;
  const rightArmY = waiting ? cy - 16 : cy - 5;
  const rightArmRotation = waiting ? 45 : 35;
  const [leftEye, rightEye] = eyeStyle === 'wink' ? ['classic', 'closed'] : [eyeStyle, eyeStyle];
  const blush = mix(bodyHex, '#ff4f8b', 0.55);
  const glossX = 50 - rx * 0.45;
  const glossY = cy - ry * 0.55;

  return (
    <Svg width={size} height={size} viewBox='-2 -5 104 104'>
      <Defs>
        <RadialGradient id={gradientId} cx='0.36' cy='0.3' r='0.8'>
          <Stop offset='0' stopColor={sleeping ? body : light} />
          <Stop offset='0.55' stopColor={body} />
          <Stop offset='1' stopColor={sleeping ? body : dark} />
        </RadialGradient>
      </Defs>
      {look.accessory === 'halo' ? (
        <Ellipse cx={50} cy={top - 8} rx={20} ry={5} fill='none' stroke='#f5c518' strokeWidth={3.5} />
      ) : null}
      <Ellipse
        cx={33}
        cy={feetY}
        rx={17}
        ry={10}
        transform={`rotate(-10 33 ${feetY})`}
        fill={look.accent}
        stroke={INK}
        strokeWidth={sw}
      />
      <Ellipse
        cx={67}
        cy={feetY}
        rx={17}
        ry={10}
        transform={`rotate(10 67 ${feetY})`}
        fill={look.accent}
        stroke={INK}
        strokeWidth={sw}
      />
      <Ellipse
        cx={leftArmX}
        cy={leftArmY}
        rx={9.5}
        ry={7.5}
        transform={`rotate(-25 ${leftArmX} ${leftArmY})`}
        fill={body}
        stroke={INK}
        strokeWidth={sw}
      />
      <Ellipse
        cx={rightArmX}
        cy={rightArmY}
        rx={9.5}
        ry={7.5}
        transform={`rotate(${rightArmRotation} ${rightArmX} ${rightArmY})`}
        fill={body}
        stroke={INK}
        strokeWidth={sw}
      />
      <Ellipse cx={50} cy={cy} rx={rx} ry={ry} fill={`url(#${gradientId})`} stroke={INK} strokeWidth={sw} />
      {gloss && !sleeping ? (
        <Ellipse
          cx={glossX}
          cy={glossY}
          rx={7}
          ry={4.5}
          transform={`rotate(-30 ${glossX} ${glossY})`}
          fill='#ffffff'
          opacity={0.55}
        />
      ) : null}
      <Eye x={42.5} eyeY={eyeY} style={leftEye} eyeColor={look.eyeColor} />
      <Eye x={57.5} eyeY={eyeY} style={rightEye} eyeColor={look.eyeColor} />
      <Ellipse cx={32} cy={cy + 3} rx={6} ry={3.2} fill={blush} opacity={0.6} />
      <Ellipse cx={68} cy={cy + 3} rx={6} ry={3.2} fill={blush} opacity={0.6} />
      <Path
        d={`M46.5 ${cy + 2.5} Q50 ${cy + 6.5} 53.5 ${cy + 2.5}`}
        fill='none'
        stroke={INK}
        strokeWidth={2.4}
        strokeLinecap='round'
      />
      <Accessory look={look} rx={rx} ry={ry} cy={cy} top={top} trim={trim} />
    </Svg>
  );
}

export const DotFace = memo(DotFaceInner);

/** The dots wordmark (gx-core `dots_mark_svg`): three overlapping circles in `color`. */
export function DotsMark({ size = 16, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox='0 0 24 24'>
      <Circle cx={7} cy={12} r={4.2} fill={color} />
      <Circle cx={12} cy={12} r={4.2} fill={color} fillOpacity={0.7} />
      <Circle cx={17} cy={12} r={4.2} fill={color} fillOpacity={0.45} />
    </Svg>
  );
}

/** The small status dot beside a dot's name (working blue, waiting amber, paused grey, idle green). */
export function DotStatusDot({ status, size = 7 }: { status: DotStatus; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: DOT_STATUS_COLORS[status] }} />
  );
}
