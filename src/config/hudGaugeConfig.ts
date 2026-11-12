import { SORCERY_COLORS } from '@/config/heroColorConfig';

/**
 * Żywe wskaźniki bohatera pod paskiem zdrowia (krok U7e, prośba właściciela: „przetwórz te charge dasha i strzały
 * na coś żywego — w przypadku barby krwistego, czarki magicznego, a łucznika naciągniętej cięciwy”).
 * Barbarzyńca: dash = żyła z krwią bijącą jak serce, ładunki strzału = krople krwi.
 * Czarodziejka: dash i promień = strumień magii z iskrami, kule = kule na orbicie.
 * Łucznik: dash = cięciwa (luźna, gdy się ładuje; napięta i drgająca, gdy gotowa), ładunki = łuki z naciąganą cięciwą.
 */
/**
 * Piksele ramienia łuku wysokości `height`: parabola od `inner` (środek, rękojeść) do `inner + bend` (końce),
 * środek pogrubiony do 2 px, a na końcach piksel wygięty na zewnątrz. Pierwszy i ostatni element to końce,
 * do których przywiązana jest cięciwa.
 */
function bowLimb(height: number, inner: number, bend: number): readonly (readonly [number, number])[] {
  const c = (height - 1) / 2;
  const top: [number, number][] = [];
  const rest: [number, number][] = [];
  for (let y = 0; y < height; y++) {
    const x = Math.round(inner + bend * ((y - c) / c) ** 2);
    rest.push([x, y]);
    if (Math.abs(y - c) <= c - 2) rest.push([x + 1, y]);
  }
  const tipTop: [number, number] = [inner + bend + 1, 0];
  const tipBottom: [number, number] = [inner + bend + 1, height - 1];
  top.push(tipTop);
  return [...top, ...rest, tipBottom];
}

export type GaugeTheme = 'blood' | 'arcane' | 'bowstring';

export interface GaugePalette {
  /** Tło pustej rurki. */
  readonly dark: number;
  readonly deep: number;
  readonly base: number;
  readonly bright: number;
  /** Błysk: iskra, odblask kropli, grot. */
  readonly glint: number;
}

export const HUD_GAUGES = {
  byKit: { melee: 'blood', sorcery: 'arcane', archery: 'bowstring' } as const satisfies Record<string, GaugeTheme>,
  palettes: {
    blood: { dark: 0x22060a, deep: 0x5e0d14, base: 0xa5161f, bright: 0xe0303a, glint: 0xffa08e },
    arcane: { dark: 0x170c2a, deep: SORCERY_COLORS.deep, base: SORCERY_COLORS.base, bright: SORCERY_COLORS.light, glint: SORCERY_COLORS.core },
    /** Drewno łuku, kremowa cięciwa, zielony akcent łucznika. */
    bowstring: { dark: 0x1e1610, deep: 0x5a3a1e, base: 0x93653a, bright: 0xece0bc, glint: 0x9be0b8 },
  } as const satisfies Record<GaugeTheme, GaugePalette>,
  /** Pasek dasha i promienia (px płótna). */
  bar: { height: 4, gap: 3 },
  /** Bicie serca żyły (barbarzyńca): okres i dwa uderzenia (ułamki okresu: początek, koniec). */
  heartbeat: { periodMs: 1100, beats: [[0, 0.1], [0.18, 0.28]] as const, glow: 0.45 },
  /** Krew płynąca żyłą, gdy dash się ładuje: jaśniejszy odcinek. */
  flow: { lengthPx: 6, speedPxPerSec: 60 },
  /** Iskry w strumieniu magii. */
  sparkles: { count: 4, speedPxPerSec: 70 },
  /** Cięciwa: największe ugięcie luźnej struny i drganie po napięciu. */
  string: { sagPx: 3, twangMs: 450, twangPeriodMs: 90 },
  /** Ikony ładunków: skala pikseli i odstęp między ikonami (w pikselach ikony). */
  icons: { unit: 2, gap: 2 },
  /** Kropla krwi i kula (wzory pikseli, „#” = piksel); wypełniają się od dołu. */
  drop: ['...#...', '..###..', '..###..', '.#####.', '#######', '#######', '#######', '.#####.', '..###..'],
  orb: ['..###..', '.#####.', '#######', '#######', '#######', '.#####.', '..###..'],
  /**
   * Łuk: ramię „(” w lewo, cięciwa od końców ramion do punktu naciągu; naciąg rośnie z ładowaniem,
   * gotowy łuk jest w pełni naciągnięty ze strzałą.
   */
  bow: {
    width: 12,
    height: 13,
    /** Ramię „(” od górnego do dolnego końca, w środku 2 px grubości; końce wygięte w prawo (refleks). */
    limb: bowLimb(13, 3, 4),
    /** Owijka rękojeści po stronie łucznika. */
    grip: [[2, 5], [2, 6], [2, 7]] as const,
    nockY: 6,
    maxPull: 3,
  },
} as const;
