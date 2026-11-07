import { HeroId } from '@/core/heroTypes';

/**
 * Barwy klas (krok 181, prośba właściciela: „kolory podstawowych klas względem teorii kolorów na podstawie procentu
 * wybierania”). Odcienie tworzą triadę (co 120°), a udział w wyborach przydziela rolę z reguły 60-30-10:
 * najczęściej wybierana klasa — barwa dominująca (spokojna), druga — uzupełniająca, najrzadsza — akcent (najżywszy).
 */

/** Ile razy klasa trafiła na tablice wyników (wspinaczka, areny, co-op z partnerem) — stan z 7.11.2026, 29 wpisów. */
export const HERO_PICK_COUNTS: Readonly<Record<HeroId, number>> = {
  [HeroId.Barbarian]: 15,
  [HeroId.Sorceress]: 10,
  [HeroId.Archer]: 4,
};

/** Triada odcieni (stopnie HSL): bursztyn barbarzyńcy, zieleń łucznika, fiolet Czarodziejki (jej „wyrwa w świecie”). */
export const HERO_HUES: Readonly<Record<HeroId, number>> = {
  [HeroId.Barbarian]: 38,
  [HeroId.Archer]: 158,
  [HeroId.Sorceress]: 278,
};

export type ColorRole = 'dominant' | 'secondary' | 'accent';

/** Nasycenie i jasność roli (0..1): dominanta przygaszona, akcent najbardziej nasycony. */
export const COLOR_ROLE_STYLE: Readonly<Record<ColorRole, { readonly saturation: number; readonly lightness: number }>> = {
  dominant: { saturation: 0.5, lightness: 0.56 },
  secondary: { saturation: 0.68, lightness: 0.64 },
  accent: { saturation: 0.86, lightness: 0.58 },
};

/** Przygaszenie barwy na nieaktywnej karcie (mnożnik jasności). */
export const HERO_COLOR_DIM = 0.55;

/**
 * Energia Czarodziejki w jej fiolecie (krok 181): promień-Wyrwa, rozprysk, fala, teleport. Od ciemnego do białego jądra.
 * Sprite'y (sukienka, kryształ, kula) i kursor dostają tę samą rampę w generatorach w `tools/`.
 */
export const SORCERY_COLORS = {
  deep: 0x4a1f8c,
  base: 0x8a4fe0,
  light: 0xc79bff,
  core: 0xf6eaff,
} as const;
