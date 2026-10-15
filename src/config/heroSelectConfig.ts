import { GAME_WIDTH } from '@/config/gameConfig';
import { SPLASH_PALETTE } from '@/config/splashConfig';

/**
 * Ekran wyboru bohatera (krok 38): układ i kolory.
 * Paleta ekranu startowego (system „Matka Pająków”), żeby oba ekrany wyglądały jak jedna całość.
 */
export const HERO_SELECT_PALETTE = {
  background: SPLASH_PALETTE.chitin0,
  card: SPLASH_PALETTE.chitin1,
  cardSelected: SPLASH_PALETTE.chitin2,
  border: SPLASH_PALETTE.chitin3,
  borderSelected: SPLASH_PALETTE.egg2,
  /** Tekst (CSS): tytuł, imię, opis, podpowiedź. */
  title: '#e7b140',
  name: '#f1e2a9',
  nameDim: '#9c8f74',
  text: '#d8ccb0',
  textDim: '#7a6e5c',
  input: '#e7b140',
  hint: '#9c8f74',
} as const;

export const HERO_SELECT_LAYOUT = {
  centerX: GAME_WIDTH / 2,
  title: { y: 44, fontSize: 30, letterSpacing: 6 },
  card: { width: 300, height: 340, gap: 48, top: 104, borderWidth: 3 },
  /** Postać na karcie: skala całkowita (pixel-perfect), środek względem górnej krawędzi karty. */
  sprite: { scale: 3, offsetY: 104 },
  name: { offsetY: 186, fontSize: 24, letterSpacing: 3 },
  tagline: { offsetY: 220, fontSize: 13 },
  stats: { offsetY: 246, fontSize: 13 },
  attacks: { offsetY: 276, step: 22, fontSize: 13 },
  hint: { y: 478, fontSize: 14, letterSpacing: 3 },
  /** Kierunek, w którym patrzą postacie na kartach (wiersz arkusza: 4 = S, przodem do gracza). */
  facing: 4,
  /** Wejście ekranu z czerni i wyjście do gry (ms). */
  fadeMs: 250,
} as const;
