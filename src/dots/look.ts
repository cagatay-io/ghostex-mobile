/**
 * A dot's look on the phone: the palettes, starters and `normalizeLook` rule of
 * packages/gx-core/src/open_dots.rs (ported from Open Dot's `lib/look.ts`), so a look the phone
 * builds is one gxserver accepts unchanged and a stored look draws the same face everywhere.
 *
 * This file must not import anything from the app: src/contract/mobileSummary.ts uses it to read
 * the `dotLook` on project rows.
 */

import type { DotAccessory, DotEyes, DotLook, DotMaterial, DotShape } from './types';

const SHAPES: readonly DotShape[] = ['round', 'chubby', 'tall'];
const MATERIALS: readonly DotMaterial[] = ['soft', 'glossy', 'velvet', 'toon'];
const EYES: readonly DotEyes[] = ['classic', 'happy', 'wide', 'wink'];
const ACCESSORIES: readonly DotAccessory[] = ['none', 'bow', 'cap', 'antenna', 'halo', 'sprout', 'headphones'];

/** Body colors: soft pastels (gx-core DOT_COLORS). */
export const DOT_COLORS = [
  '#ffa7c4',
  '#ffb8a1',
  '#ffd98a',
  '#c8ec8f',
  '#97e0b8',
  '#8fdcd6',
  '#9fcbff',
  '#b9b3ff',
  '#dcb4f5',
  '#f4efe6',
  '#c9c3bb',
  '#6e6a78',
] as const;

/** Feet colors, paired by index with the body colors (gx-core DOT_FEET_COLORS). */
export const DOT_FEET_COLORS = [
  '#d8195f',
  '#e0492d',
  '#d98a00',
  '#4f9a2f',
  '#1f8f5f',
  '#138a8a',
  '#2a6fdb',
  '#5b46d6',
  '#9b3cc4',
  '#3b3842',
  '#8a5a3c',
  '#f4f4f4',
] as const;

export const DOT_EYE_COLORS = ['#2b5fd9', '#1f8f5f', '#8a4bd6', '#c2410c', '#3b3842'] as const;

export const DEFAULT_DOT_LOOK: DotLook = {
  shape: 'round',
  color: '#ffa7c4',
  accent: '#d8195f',
  eyeColor: '#2b5fd9',
  material: 'soft',
  eyes: 'classic',
  accessory: 'none',
};

export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/u.test(value);
}

/** Feet color that goes with a body color (same index in the paired palettes). */
export function feetFor(body: string): string {
  const index = DOT_COLORS.findIndex((color) => color.toLowerCase() === body.toLowerCase());
  return index >= 0 ? DOT_FEET_COLORS[index] : '#d8195f';
}

function text(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value.trim() : undefined;
}

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return value !== undefined && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** gx-core `DotLook::from_value`: any stored or wire value becomes a valid look. */
export function normalizeLook(value: unknown): DotLook {
  const record =
    typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const rawColor = text(record, 'color');
  const color = rawColor !== undefined && isHexColor(rawColor) ? rawColor : DEFAULT_DOT_LOOK.color;
  const rawAccent = text(record, 'accent');
  const accent =
    rawAccent !== undefined && (DOT_FEET_COLORS as readonly string[]).includes(rawAccent) ? rawAccent : feetFor(color);
  const rawEyeColor = text(record, 'eyeColor');
  return {
    shape: oneOf(text(record, 'shape'), SHAPES, DEFAULT_DOT_LOOK.shape),
    color,
    accent,
    eyeColor: rawEyeColor !== undefined && isHexColor(rawEyeColor) ? rawEyeColor : DEFAULT_DOT_LOOK.eyeColor,
    material: oneOf(text(record, 'material'), MATERIALS, DEFAULT_DOT_LOOK.material),
    eyes: oneOf(text(record, 'eyes'), EYES, DEFAULT_DOT_LOOK.eyes),
    accessory: oneOf(text(record, 'accessory'), ACCESSORIES, DEFAULT_DOT_LOOK.accessory),
  };
}

function pick<T>(values: readonly T[]): T {
  return values[Math.floor(Math.random() * values.length)];
}

/** Open Dot's `randomLook` (the Shuffle button): no toon finish and no wink, like Open Dot. */
export function randomLook(): DotLook {
  const color = pick(DOT_COLORS);
  return {
    shape: pick(SHAPES),
    color,
    accent: feetFor(color),
    eyeColor: pick(DOT_EYE_COLORS),
    material: pick(MATERIALS.filter((material) => material !== 'toon')),
    eyes: pick(EYES.filter((eyes) => eyes !== 'wink')),
    accessory: pick(ACCESSORIES),
  };
}

export function looksEqual(left: DotLook, right: DotLook): boolean {
  return (
    left.shape === right.shape &&
    left.color === right.color &&
    left.accent === right.accent &&
    left.eyeColor === right.eyeColor &&
    left.material === right.material &&
    left.eyes === right.eyes &&
    left.accessory === right.accessory
  );
}

export const DOT_LOOK_OPTIONS = {
  shapes: SHAPES,
  materials: MATERIALS,
  eyes: EYES,
  accessories: ACCESSORIES,
} as const;

/** Starting points on the New dot screen (gx-core DOT_STARTERS). */
export const DOT_STARTERS: readonly { name: string; purpose: string; look: DotLook }[] = [
  {
    name: 'Scout',
    purpose: 'Research anything I ask and deliver clear, sourced briefs',
    look: { ...DEFAULT_DOT_LOOK, color: '#9fcbff', accent: '#2a6fdb', accessory: 'antenna' },
  },
  {
    name: 'Juniper',
    purpose: 'Keep an eye on my inbox and draft replies in my voice',
    look: {
      ...DEFAULT_DOT_LOOK,
      color: '#97e0b8',
      accent: '#1f8f5f',
      eyeColor: '#1f8f5f',
      accessory: 'sprout',
      shape: 'chubby',
    },
  },
  {
    name: 'Atlas',
    purpose: 'Plan trips and track prices for flights and hotels',
    look: {
      ...DEFAULT_DOT_LOOK,
      color: '#ffd98a',
      accent: '#e0492d',
      eyeColor: '#c2410c',
      accessory: 'cap',
      eyes: 'wide',
    },
  },
  {
    name: 'Bix',
    purpose: 'Write and run code and scripts on its computer',
    look: {
      ...DEFAULT_DOT_LOOK,
      color: '#b9b3ff',
      accent: '#5b46d6',
      eyeColor: '#8a4bd6',
      accessory: 'headphones',
      material: 'glossy',
    },
  },
];

/** Name ideas for the New dot placeholder (gx-core DOT_NAME_IDEAS). */
export const DOT_NAME_IDEAS = [
  'Pixel',
  'Mochi',
  'Juniper',
  'Atlas',
  'Nova',
  'Pebble',
  'Scout',
  'Echo',
  'Clove',
  'Orbit',
  'Sprout',
  'Bix',
] as const;
