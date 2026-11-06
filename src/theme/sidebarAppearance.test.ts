/// <reference types="node" />
/**
 * Run with `bun test src/theme/sidebarAppearance.test.ts`. Expected values come from the desktop's own tests and
 * functions (apps/desktop/src/app/helpers/titlebar/chrome_tints.rs `full_colour_tests`,
 * settings_modal/tabs/theme/colours.rs tests, packages/settings-catalog/src/dark_chrome.rs tests) and the
 * Colourfulness rule the desktop handoff states, not from this module's output.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { THEME_PRESETS, themePresetPatch } from './presets';
import {
  appearanceIsLight,
  areaColourfulnessPatch,
  colourfulnessPatch,
  readableSecondaryText,
  relativeLuminance,
  resolveThemeAreas,
  sidebarAppearanceFor,
  type ThemeColourSettings,
} from './sidebarAppearance';

const DARK_SQUARES = [
  ['gray', '#808080'],
  ['black', '#000000'],
  ['slate', '#4a6a8a'],
  ['midnight', '#1f3a8a'],
  ['blue', '#336699'],
  ['indigo', '#4b4fa6'],
  ['teal', '#2f7f7f'],
  ['green', '#3f7a5f'],
  ['forest', '#2e6a3a'],
  ['olive', '#6b6b35'],
  ['amber', '#8a6a2a'],
  ['orange', '#8a5330'],
  ['red', '#884444'],
  ['rose', '#8a4a5c'],
  ['pink', '#854f7a'],
  ['purple', '#6c4f8f'],
] as const;
/** The light squares: the dark ones with White in Black's place. */
const LIGHT_SQUARES: ReadonlyArray<readonly [ThemeColourSettings['lightThemePreset'], string]> = [
  ['white', '#ffffff'],
  ...DARK_SQUARES.flatMap(([id, tint]) => (id === 'black' ? [] : [[id, tint] as const])),
];

const BASE: ThemeColourSettings = {
  darkThemePreset: 'gray',
  lightThemePreset: 'gray',
  customSidebarTitlebarBackgroundTintColor: '#808080',
  customSidebarTitlebarLightBackgroundTintColor: '#808080',
  customSidebarTitlebarBackgroundDarknessPercent: 96,
  customSidebarTitlebarLightBackgroundLightnessPercent: 96,
  themeSidebarContrast: 0,
  themeWorkAreaContrast: 0,
};

/** The desktop test helper `settings(preset, tint, darkness, points)`. */
function dark(preset: ThemeColourSettings['darkThemePreset'], tint: string, depth: number, points: number) {
  return resolveThemeAreas(
    {
      ...BASE,
      darkThemePreset: preset,
      customSidebarTitlebarBackgroundTintColor: tint,
      customSidebarTitlebarBackgroundDarknessPercent: depth,
      themeSidebarContrast: points,
      themeWorkAreaContrast: points,
    },
    false,
  );
}

/** The desktop test helper `light_settings(preset, tint, lightness, points)`. */
function light(preset: ThemeColourSettings['lightThemePreset'], tint: string, depth: number, points: number) {
  return resolveThemeAreas(
    {
      ...BASE,
      lightThemePreset: preset,
      customSidebarTitlebarLightBackgroundTintColor: tint,
      customSidebarTitlebarLightBackgroundLightnessPercent: depth,
      themeSidebarContrast: points,
      themeWorkAreaContrast: points,
    },
    true,
  );
}

const rgb = (hex: string): number[] => [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));

describe('dark chrome', () => {
  test('Vivid values below the limit are still cut to 85', () => {
    assert.equal(dark('teal', '#808080', 96, -12).sidebar, dark('custom', '#2f7f7f', 85, 0).sidebar);
    for (const stored of [84, 82, 0, 85]) assert.equal(dark('custom', '#273136', stored, -12).sidebar, '#00141f');
    assert.equal(dark('gray', '#808080', 96, 0).sidebar, '#0b0b0b');
  });

  test('Full is the picked colour exactly, with the chat and menu steps toward white', () => {
    const full = dark('custom', '#273136', 85, -24);
    assert.equal(full.sidebar, '#273136');
    assert.equal(full.workChrome, '#273136');
    assert.equal(full.workArea, '#293338');
    assert.equal(full.menu, '#323b40');
  });

  test('every step past Vivid keeps its red and moves straight toward the pick', () => {
    let previous = rgb(dark('custom', '#273136', 85, -12).sidebar)[0]!;
    for (let step = 1; step <= 24; step += 1) {
      const [red, green, blue] = rgb(dark('custom', '#273136', 85, -12 - step * 0.5).sidebar);
      assert.ok(red! > 0 && red! <= 39 && red! >= previous, `${step}`);
      assert.ok(green! >= 20 && green! <= 49 && blue! >= 31 && blue! <= 54, `${step}`);
      previous = red!;
    }
  });

  test('squares at Full reach their own tint kept readable; Black stays black', () => {
    for (const [square, tint] of DARK_SQUARES) {
      const chrome = rgb(dark(square, '#808080', 96, -24).sidebar);
      assert.ok(relativeLuminance(chrome) <= 0.04 + 0.002, square);
      const picked = rgb(tint);
      for (const [a, b] of [
        [0, 1],
        [1, 2],
        [0, 2],
      ] as const) {
        if (Math.abs(picked[a]! - picked[b]!) >= 8)
          assert.equal(picked[a]! > picked[b]!, chrome[a]! > chrome[b]!, square);
      }
    }
    assert.equal(dark('black', '#808080', 96, -24).sidebar, '#000000');
  });

  test('a custom neutral grey draws like Graphite; calibrated colours keep their base', () => {
    for (const grey of ['#777777', '#7f7f7f', '#808080', '#3a3a3a']) {
      assert.equal(dark('custom', grey, 96, 0).sidebar, '#0b0b0b', grey);
    }
    assert.equal(dark('custom', '#000000', 96, 0).sidebar, '#000000');
    assert.equal(dark('custom', '#336699', 96, 0).sidebar, '#0a0b0e');
    const [red, green, blue] = rgb(dark('custom', '#884455', 96, 0).sidebar);
    assert.ok(red! > blue! && blue! > green!);
  });

  test('a square work area starts from the unclamped sidebar depth', () => {
    assert.equal(dark('gray', '#808080', 96, 0).workArea, '#0d0d0d');
    const apart = resolveThemeAreas({ ...BASE, themeSidebarContrast: -12, themeWorkAreaContrast: 0 }, false);
    assert.equal(apart.workArea, '#0d0d0d');
    assert.equal(apart.sidebar, dark('custom', '#808080', 85, 0).sidebar);
  });
});

describe('light chrome', () => {
  test('Full is the pale pick itself, the work area a quarter toward white', () => {
    const lotus = light('custom', '#eee6a6', 84, -24);
    assert.equal(lotus.sidebar, '#eee6a6');
    assert.equal(lotus.workChrome, '#eee6a6');
    assert.equal(lotus.workArea, '#f2ecbc');
    const halfway = light('custom', '#eee6a6', 84, -18).sidebar;
    assert.notEqual(halfway, light('custom', '#eee6a6', 84, -12).sidebar);
    assert.notEqual(halfway, '#eee6a6');
    assert.equal(light('custom', '#fffae4', 84, -24).sidebar, '#fffae4');
  });

  test('Graphite at Full is lifted to the first painted grey at the 0.62 limit', () => {
    assert.equal(light('gray', '#808080', 96, -24).sidebar, '#cfcfcf');
    assert.ok(Math.abs(relativeLuminance(rgb('#cfcfcf')) - 0.623960392) < 1e-9);
  });

  test('darker squares are lifted only as far as the dark text needs', () => {
    for (const [square, tint] of LIGHT_SQUARES) {
      const luminance = relativeLuminance(rgb(light(square, '#808080', 96, -24).sidebar));
      assert.ok(luminance >= 0.62 - 0.002, square);
      assert.ok(luminance <= 0.62 + 0.01 || tint === '#ffffff', square);
    }
  });

  test('a dark pick is lightened to exactly the least painted step that holds, keeping its hue', () => {
    const painted = rgb(light('custom', '#1f3a8a', 84, -24).sidebar);
    assert.ok(relativeLuminance(painted) >= 0.62);
    assert.ok(relativeLuminance(painted.map((value) => value - 1)) < 0.62);
    assert.ok(painted[2]! > painted[1]! && painted[1]! > painted[0]!);
  });

  test('a custom light colour draws one point deeper and its work area moves from the unclamped depth', () => {
    const areas = resolveThemeAreas(
      {
        ...BASE,
        lightThemePreset: 'custom',
        customSidebarTitlebarLightBackgroundTintColor: '#336699',
        customSidebarTitlebarLightBackgroundLightnessPercent: 60,
        themeSidebarContrast: -4,
        themeWorkAreaContrast: 0,
      },
      true,
    );
    assert.equal(areas.sidebar, light('custom', '#336699', 61, 0).sidebar);
    assert.equal(areas.workChrome, light('custom', '#336699', 64, 0).sidebar);
  });
});

describe('Colourfulness', () => {
  test('every one of the 57 positions writes the desktop patch', () => {
    // The desktop rule: p = 4 - i/2 for both contrasts; depths 96 + q to the half point, q = p held to -12..4,
    // dark 85..100 and light 60..100.
    for (let position = 0; position <= 56; position += 1) {
      const points = 4 - position / 2;
      const step = Math.min(4, Math.max(-12, points));
      assert.deepEqual(
        colourfulnessPatch(position),
        {
          themeSidebarContrast: points,
          themeWorkAreaContrast: points,
          customSidebarTitlebarBackgroundDarknessPercent: Math.min(100, Math.max(85, 96 + step)),
          customSidebarTitlebarLightBackgroundLightnessPercent: Math.min(100, Math.max(60, 96 + step)),
        },
        `${position}`,
      );
    }
    assert.deepEqual(colourfulnessPatch(56), {
      themeSidebarContrast: -24,
      themeWorkAreaContrast: -24,
      customSidebarTitlebarBackgroundDarknessPercent: 85,
      customSidebarTitlebarLightBackgroundLightnessPercent: 84,
    });
  });

  test('the separate sliders write their own keys and move only their own area of a custom colour', () => {
    assert.deepEqual(Object.keys(areaColourfulnessPatch('themeSidebarContrast', 16)).sort(), [
      'customSidebarTitlebarBackgroundDarknessPercent',
      'customSidebarTitlebarLightBackgroundLightnessPercent',
      'themeSidebarContrast',
    ]);
    assert.deepEqual(Object.keys(areaColourfulnessPatch('themeWorkAreaContrast', 16)), ['themeWorkAreaContrast']);
    assert.equal(Object.keys(colourfulnessPatch(16)).length, 4);

    const start: ThemeColourSettings = {
      ...BASE,
      darkThemePreset: 'custom',
      customSidebarTitlebarBackgroundTintColor: '#336699',
      ...colourfulnessPatch(8),
    };
    const before = resolveThemeAreas(start, false);
    const sidebarMoved = resolveThemeAreas({ ...start, ...areaColourfulnessPatch('themeSidebarContrast', 24) }, false);
    assert.notEqual(sidebarMoved.sidebar, before.sidebar);
    assert.equal(sidebarMoved.workArea, before.workArea);
    const workMoved = resolveThemeAreas({ ...start, ...areaColourfulnessPatch('themeWorkAreaContrast', 24) }, false);
    assert.equal(workMoved.sidebar, before.sidebar);
    assert.notEqual(workMoved.workArea, before.workArea);
  });
});

test('System follows the device; Light and Dark do not', () => {
  assert.equal(appearanceIsLight('system', true), true);
  assert.equal(appearanceIsLight('system', false), false);
  assert.equal(appearanceIsLight('plain-light', false), true);
  assert.equal(appearanceIsLight('dark-2', true), false);
});

describe('secondary text reads on the surfaces it is drawn on', () => {
  // WCAG 2.x normal-size text: 4.5:1. Luminance and contrast are computed here, not with the module's helpers.
  const luminance = (hex: string): number =>
    rgb(hex)
      .map((value) => value / 255)
      .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
      .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0);
  const contrast = (a: string, b: string): number => {
    const [x, y] = [luminance(a), luminance(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  /** `top` painted `percent` over `base`, channel by channel as React Native composites a translucent fill. */
  const over = (top: string, base: string, percent: number): string =>
    `#${rgb(top)
      .map((value, index) => Math.round(value * (percent / 100) + rgb(base)[index]! * (1 - percent / 100)))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')}`;
  /**
   * The page, a card, a pressed card and a text field: the drawer's tokens and the Settings field (`useAppearance`
   * `input`, 3% of the text colour over the page), where captions, descriptions, values and placeholders sit.
   */
  const surfaces = (background: string) => {
    const appearance = sidebarAppearanceFor(background);
    return {
      page: appearance.background,
      card: appearance.card,
      pressedCard: appearance.cardActive,
      field: over(appearance.foreground, appearance.background, 3),
    };
  };
  const reads = (color: string, background: string): boolean =>
    Object.values(surfaces(background)).every((surface) => contrast(color, surface) >= 4.5);
  const presetSidebar = (id: string, light: boolean): string =>
    resolveThemeAreas({ ...BASE, ...themePresetPatch(id, false) } as ThemeColourSettings, light).sidebar;

  test('all twenty presets: captions, descriptions, values and placeholders keep 4.5:1', () => {
    assert.equal(THEME_PRESETS.length, 20);
    const failures: string[] = [];
    for (const preset of THEME_PRESETS) {
      const background = presetSidebar(preset.id, preset.mode === 'light');
      const { muted } = sidebarAppearanceFor(background);
      for (const [name, surface] of Object.entries(surfaces(background))) {
        const ratio = contrast(muted, surface);
        if (ratio < 4.5) failures.push(`${preset.id} ${muted} on ${name} ${surface}: ${ratio.toFixed(2)}`);
      }
    }
    assert.deepEqual(failures, []);
  });

  test('every square in both appearances at every Colourfulness position keeps 4.5:1 too', () => {
    const failures: string[] = [];
    for (const [isLight, squares] of [
      [false, DARK_SQUARES],
      [true, LIGHT_SQUARES],
    ] as const) {
      for (const [id] of squares) {
        for (let position = 0; position <= 56; position += 1) {
          const settings: ThemeColourSettings = {
            ...BASE,
            ...(isLight
              ? { lightThemePreset: id as ThemeColourSettings['lightThemePreset'] }
              : { darkThemePreset: id as ThemeColourSettings['darkThemePreset'] }),
            ...colourfulnessPatch(position),
          };
          const background = resolveThemeAreas(settings, isLight).sidebar;
          if (!reads(sidebarAppearanceFor(background).muted, background)) {
            failures.push(`${isLight ? 'light' : 'dark'} ${id} at ${position}`);
          }
        }
      }
    }
    assert.deepEqual(failures, []);
  });

  test('marks keep the designed muted ink; text moves toward the foreground only as far as 4.5:1 takes', () => {
    for (const preset of THEME_PRESETS) {
      const background = presetSidebar(preset.id, preset.mode === 'light');
      const appearance = sidebarAppearanceFor(background);
      // The designed ink: 56% of the text colour over the page.
      assert.equal(appearance.mutedGlyph, over(appearance.foreground, background, 56), preset.id);
      const steps = Array.from({ length: 100 }, (_, toward) =>
        over(appearance.foreground, appearance.mutedGlyph, toward),
      );
      const step = steps.indexOf(appearance.muted);
      assert.ok(step > 0, `${preset.id}: ${appearance.muted} is a step from ${appearance.mutedGlyph} toward the text`);
      assert.equal(reads(steps[step - 1]!, background), false, `${preset.id}: one step less already reads`);
    }
  });

  test('a colour that already reads is kept; one that cannot get there takes the foreground', () => {
    assert.equal(readableSecondaryText('#595959', '#262626', ['#ffffff', '#f5f5f5']), '#595959');
    assert.equal(readableSecondaryText('#d0d0d0', '#e0e0e0', ['#ffffff']), '#e0e0e0');
    const moved = readableSecondaryText('#9a9a9a', '#262626', ['#ffffff']);
    const least = Array.from({ length: 100 }, (_, toward) => over('#262626', '#9a9a9a', toward)).find(
      (color) => contrast(color, '#ffffff') >= 4.5,
    );
    assert.equal(moved, least);
  });
});
