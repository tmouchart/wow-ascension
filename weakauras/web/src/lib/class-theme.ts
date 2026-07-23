import type { CSSProperties } from 'react';
import COLORS from '../../../registry/class-colors.json';

export type ClassColor = {
  classId: number;
  name: string;
  slug: string;
  rgb: number[];
  hex: string;
  /** Hand-adjusted UI variant for colors too dull/gray as an app primary (see registry _note). */
  ui?: string;
};

export const CLASS_COLORS = (COLORS as { classes: ClassColor[] }).classes;

const hexToRgb = (hex: string): number[] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
const shade = ([r, g, b]: number[], f: number) =>
  `rgb(${Math.min(255, Math.round(r * f))}, ${Math.min(255, Math.round(g * f))}, ${Math.min(255, Math.round(b * f))})`;
const luminance = ([r, g, b]: number[]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/** The theme-token overrides for a class-colored primary — the same var set index.css defines. */
export function classVars(c: ClassColor): CSSProperties {
  const hex = c.ui ?? c.hex;
  const rgb = hexToRgb(hex);
  return {
    '--primary': hex,
    '--primary-foreground': luminance(rgb) > 0.55 ? '#0b0d10' : '#fbf9f4',
    '--ring': hex,
    '--grad-primary': `linear-gradient(135deg, ${shade(rgb, 1)} 0%, ${shade(rgb, 0.6)} 100%)`,
    '--grad-primary-hover': `linear-gradient(135deg, ${shade(rgb, 1.15)} 0%, ${shade(rgb, 0.7)} 100%)`,
  } as CSSProperties;
}

/** Apply (or clear, for an unknown slug) the class-colored primary on the whole app. */
export function applyClassTheme(slug: string) {
  const c = CLASS_COLORS.find((k) => k.slug === slug);
  const root = document.documentElement;
  const vars = c ? (classVars(c) as Record<string, string>) : {};
  for (const k of ['--primary', '--primary-foreground', '--ring', '--grad-primary', '--grad-primary-hover'])
    if (vars[k]) root.style.setProperty(k, vars[k]);
    else root.style.removeProperty(k);
}
