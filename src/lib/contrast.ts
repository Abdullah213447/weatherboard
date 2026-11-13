/** WCAG 2.x contrast maths. Pure, so the token test and the UI preview share it. */

function channel(value: number): number {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance of a `#rrggbb` colour. */
export function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!match) {
    throw new Error(`Expected a #rrggbb colour, received "${hex}".`);
  }
  const [r, g, b] = match.slice(1).map((part) => channel(parseInt(part, 16)));
  // The regex guarantees three captured groups, so these are always numbers.
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

/** Contrast ratio between two `#rrggbb` colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

/** Converts a computed `rgb(r, g, b)` / `rgb(r g b)` string to `#rrggbb`. */
export function rgbToHex(rgb: string): string | null {
  const parts = rgb.match(/\d+(\.\d+)?/g);
  if (!parts || parts.length < 3) return null;
  return `#${parts
    .slice(0, 3)
    .map((part) => Math.round(Number(part)).toString(16).padStart(2, '0'))
    .join('')}`;
}
