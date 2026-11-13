import { CONDITION_KINDS } from '@/domain/weather';
import { contrastRatio } from '@/lib/contrast';
import css from './tokens.css?raw';

type Palette = Record<string, string>;

function parseBlock(pattern: RegExp): Palette {
  const body = pattern.exec(css)?.[1];
  if (body === undefined) throw new Error(`Theme block not found: ${String(pattern)}`);
  return Object.fromEntries(
    [...body.matchAll(/--wb-([a-z-]+):\s*(#[0-9a-f]{6});/g)].map((m) => [m[1], m[2]]),
  ) as Palette;
}

const themes: Record<'light' | 'dark', Palette> = {
  light: parseBlock(/\[data-theme='light'\]\s*{([^}]*)}/),
  dark: parseBlock(/\n\[data-theme='dark'\]\s*{([^}]*)}/),
};

const AA_TEXT = 4.5;
const AA_UI = 3;

/** [foreground, background, minimum ratio] */
const pairs: [string, string, number][] = [
  ...['canvas', 'surface', 'raised', 'hover'].flatMap((bg): [string, string, number][] => [
    ['ink', bg, AA_TEXT],
    ['muted', bg, AA_TEXT],
  ]),
  ...['canvas', 'surface', 'raised'].map((bg): [string, string, number] => ['subtle', bg, AA_TEXT]),
  ['accent', 'canvas', AA_TEXT],
  ['accent', 'surface', AA_TEXT],
  ['on-accent', 'accent', AA_TEXT],
  ['on-accent', 'accent-hover', AA_TEXT],
  ['on-danger', 'danger-solid', AA_TEXT],
  ['on-danger', 'danger-solid-hover', AA_TEXT],
  ...['success', 'warning', 'danger', 'info'].flatMap((tone): [string, string, number][] => [
    [tone, 'surface', AA_TEXT],
    [tone, `${tone}-soft`, AA_TEXT],
    ['ink', `${tone}-soft`, AA_TEXT],
    ['muted', `${tone}-soft`, AA_TEXT],
  ]),
  ['control', 'surface', AA_UI],
  ['control', 'canvas', AA_UI],
];

const skyKeys = CONDITION_KINDS.flatMap((kind) => [`sky-${kind}-day`, `sky-${kind}-night`]);

describe.each(['light', 'dark'] as const)('%s theme tokens', (name) => {
  const palette = themes[name];
  const color = (token: string): string => {
    const value = palette[token];
    if (value === undefined) throw new Error(`Missing token --wb-${token} in the ${name} theme.`);
    return value;
  };

  it.each(pairs)('%s on %s meets %d:1', (fg, bg, minimum) => {
    expect(contrastRatio(color(fg), color(bg))).toBeGreaterThanOrEqual(minimum);
  });

  it.each(skyKeys)('%s keeps ink, muted text and the accent readable', (key) => {
    expect(contrastRatio(color('ink'), color(key))).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(color('muted'), color(key))).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(color('accent'), color(key))).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

it('defines the same tokens in both themes', () => {
  expect(Object.keys(themes.dark).sort()).toEqual(Object.keys(themes.light).sort());
});
