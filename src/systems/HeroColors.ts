import type { HeroId } from '@/core/heroTypes';
import type { ColorRole } from '@/config/heroColorConfig';
import { COLOR_ROLE_STYLE, HERO_COLOR_DIM, HERO_HUES, HERO_PICK_COUNTS } from '@/config/heroColorConfig';

export interface HeroColor {
  readonly role: ColorRole;
  /** Udział w wyborach (0..1). */
  readonly share: number;
  readonly hex: number;
  readonly css: string;
  /** Wersja przygaszona — nieaktywna karta. */
  readonly dimCss: string;
}

const ROLES: readonly ColorRole[] = ['dominant', 'secondary', 'accent'];

/** HSL (h w stopniach, s i l 0..1) → 0xRRGGBB. */
export function hslToHex(h: number, s: number, l: number): number {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  const byte = (v: number): number => Math.round((v + m) * 255);
  return (byte(r) << 16) | (byte(g) << 8) | byte(b);
}

export const toCss = (hex: number): string => `#${hex.toString(16).padStart(6, '0')}`;

/** Role 60-30-10 wg udziału w wyborach: najczęstsza — dominanta, potem uzupełniająca, reszta — akcent. Remis: kolejność kluczy. */
export function colorRoles(counts: Readonly<Record<HeroId, number>>): Record<HeroId, ColorRole> {
  const order = (Object.keys(counts) as HeroId[]).sort((a, b) => counts[b] - counts[a]);
  return Object.fromEntries(order.map((hero, i) => [hero, ROLES[Math.min(i, ROLES.length - 1)]])) as Record<HeroId, ColorRole>;
}

/** Barwy klas: odcień z triady, nasycenie i jasność z roli. */
export function heroColors(
  counts: Readonly<Record<HeroId, number>>,
  hues: Readonly<Record<HeroId, number>>,
  styles: Readonly<Record<ColorRole, { readonly saturation: number; readonly lightness: number }>>,
  dim: number,
): Record<HeroId, HeroColor> {
  const roles = colorRoles(counts);
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return Object.fromEntries(
    (Object.keys(counts) as HeroId[]).map((hero) => {
      const { saturation, lightness } = styles[roles[hero]];
      const hex = hslToHex(hues[hero], saturation, lightness);
      return [hero, { role: roles[hero], share: total > 0 ? counts[hero] / total : 0, hex, css: toCss(hex), dimCss: toCss(hslToHex(hues[hero], saturation * dim, lightness * dim)) }];
    }),
  ) as Record<HeroId, HeroColor>;
}

/** Barwy klas na dziś (krok 181): ramka i imię na kartach wyboru. */
export const HERO_COLORS: Readonly<Record<HeroId, HeroColor>> = heroColors(HERO_PICK_COUNTS, HERO_HUES, COLOR_ROLE_STYLE, HERO_COLOR_DIM);
