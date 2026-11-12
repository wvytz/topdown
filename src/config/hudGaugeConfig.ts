import { SORCERY_COLORS } from '@/config/heroColorConfig';

/**
 * Żywe wskaźniki bohatera pod paskiem zdrowia (krok U7e, prośba właściciela: „przetwórz te charge dasha i strzały
 * na coś żywego — w przypadku barby krwistego, czarki magicznego, a łucznika naciągniętej cięciwy”).
 * Barbarzyńca: dash = żyła z krwią bijącą jak serce. Czarodziejka: dash i promień = strumień magii z iskrami.
 * Łucznik: dash = cięciwa (luźna, gdy się ładuje; napięta i drgająca, gdy gotowa).
 * Krok U7f: ikony ładunków strzału (krople, kule, łuki) usunięte — właściciel: „nie daje to żadnej informacji,
 * a wprowadza dezinformację”.
 */
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
} as const;
