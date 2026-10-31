import type { AudioSettings, HorrorThemeDefinition, LucentThemeDefinition, MusicThemeDefinition, SoundRecipe, SynthLayer } from '@/core/audioTypes';
import { LoopCue, MusicPreset, MusicTheme, SoundCue } from '@/core/audioTypes';
import { BiomeId } from '@/config/biomeConfig';
import type { AudioSettingsRules } from '@/systems/AudioSettings';
import type { SoundGateConfig, SoundGateRule } from '@/systems/SoundGate';
import type { SoundSpaceConfig } from '@/systems/SoundSpace';

/**
 * Dźwięk gry (krok 116). Wszystkie efekty i muzyka powstają w kodzie (synteza Web Audio), bez plików
 * z zewnątrz — źródła i licencje: `docs/AUDIO.md`. Tu są tylko liczby: przepisy efektów, limity, głośności
 * i utwory. Przepis = warstwy fal (`SynthLayer`): częstotliwość start→koniec, atak i wygasanie, filtr.
 */

/** Ustawienia na pierwsze uruchomienie i krok suwaka (10%). */
export const AUDIO_SETTINGS_RULES: AudioSettingsRules = {
  /** Krok 120 (decyzja właściciela): gra startuje wyciszona; dźwięk włącza głośnik na ekranie startowym, N albo pauza. */
  defaults: { music: 0.5, sfx: 0.7, muted: true, preset: MusicPreset.Lucent } satisfies AudioSettings,
  step: 0.1,
  /** Krok 139: zestawy muzyki — Lucent (ambient z kroku 116) i Horror (minimalny house). */
  presets: [MusicPreset.Lucent, MusicPreset.Horror],
};

/** Klucz ustawień w localStorage. */
export const AUDIO_STORAGE_KEY = 'tower-crawler.audio.v1';

/** Klawisz wyciszenia (nazwa zdarzenia Phasera `keydown-<NAZWA>`) — w grze i w menu. */
export const MUTE_KEY = 'N';

/** Muzyka ciszej na pauzie i na ekranie śmierci (mnożnik głośności kanału). */
export const MUSIC_DUCK = { pause: 0.4, fadeMs: 600 };

/** Ograniczenie hałasu: najwyżej tyle efektów w oknie czasu (co-op, fale upiorów). */
export const SOUND_GATE_CONFIG: SoundGateConfig = { maxPerWindow: 14, windowMs: 100 };

/** Przestrzeń: pełna głośność blisko środka widoku, dalej ciszej; stereo zależnie od strony ekranu. */
export const SOUND_SPACE: SoundSpaceConfig = {
  fullVolumeRadius: 220,
  fadeRadius: 560,
  minGain: 0.15,
  panWidth: 240,
  maxPan: 0.6,
};

/** Pułapki (kolce) słychać tylko, gdy bohater jest bliżej niż tyle px — pasy cyklują na całym piętrze. */
export const TRAP_HEARING_PX = 160;

/**
 * Barwa efektów (krok 116a, ocena właściciela: „zbyt wysokie i zbyt ostre”): każdy przepis gra niżej
 * (`pitchScale`) i ciemniej (filtr warstwy najwyżej `maxLowpassHz`); szyna efektów ma jeszcze łagodny
 * filtr `busLowpassHz` — ostre góry fal prostokątnych i szumu nie przechodzą.
 */
export const SFX_TONE = { pitchScale: 0.7, maxLowpassHz: 3000, busLowpassHz: 4200 };

/** Arpeggio: kolejne nuty co `step` sekund (dzwonki przedmiotu, wskrzeszenia, ukrytej komnaty). */
function arpeggio(wave: SynthLayer['wave'], freqs: readonly number[], step: number, decay: number, volume: number): SynthLayer[] {
  return freqs.map((freq, i) => ({ wave, freq, delay: i * step, attack: 0.004, decay, volume, lowpass: 6000, curve: 1.4 }));
}

/** Przepisy efektów — nazwane po polsku w komentarzach, żeby łatwo stroić „na ucho”. */
export const SOUND_RECIPES: Readonly<Record<SoundCue, SoundRecipe>> = {
  // Interfejs: krótkie, czyste piknięcia.
  [SoundCue.UiMove]: { gain: 0.3, layers: [{ wave: 'square', freq: 880, attack: 0.002, decay: 0.05, volume: 0.5, duty: 0.25, lowpass: 3500 }] },
  [SoundCue.UiConfirm]: {
    gain: 0.35,
    layers: [
      { wave: 'square', freq: 660, attack: 0.002, decay: 0.07, volume: 0.5, duty: 0.25, lowpass: 3500 },
      { wave: 'square', freq: 990, delay: 0.06, attack: 0.002, decay: 0.12, volume: 0.5, duty: 0.25, lowpass: 3500 },
    ],
  },
  [SoundCue.UiBack]: { gain: 0.3, layers: [{ wave: 'square', freq: 520, freqEnd: 330, attack: 0.002, decay: 0.1, volume: 0.5, duty: 0.25, lowpass: 3000 }] },

  // Bohaterowie.
  /** Świst miecza: szum z opadającym filtrem i krótki niski „wuf”. */
  [SoundCue.SwordSwing]: {
    gain: 0.45,
    layers: [
      { wave: 'noise', freq: 9000, freqEnd: 2500, attack: 0.02, decay: 0.13, volume: 0.7, lowpass: 3200, curve: 1.5 },
      { wave: 'sine', freq: 300, freqEnd: 120, attack: 0.005, decay: 0.08, volume: 0.2 },
    ],
  },
  /** Rzut kuli energii: rosnący, drżący ton. */
  [SoundCue.OrbThrow]: {
    gain: 0.3,
    layers: [
      { wave: 'sine', freq: 500, freqEnd: 900, attack: 0.005, decay: 0.17, volume: 0.6, vibrato: { depth: 0.05, rate: 25 } },
      { wave: 'triangle', freq: 1000, freqEnd: 1800, attack: 0.005, decay: 0.11, volume: 0.2 },
    ],
  },
  [SoundCue.OrbSplash]: {
    gain: 0.25,
    layers: [
      { wave: 'noise', freq: 6000, freqEnd: 1500, attack: 0.002, decay: 0.12, volume: 0.5, lowpass: 2500, curve: 1.5 },
      { wave: 'sine', freq: 700, freqEnd: 300, attack: 0.002, decay: 0.1, volume: 0.3 },
    ],
  },
  /** Fala uderzeniowa / Supernowa: głębokie tąpnięcie i rozchodzący się szum. */
  [SoundCue.Nova]: {
    gain: 0.6,
    layers: [
      { wave: 'sine', freq: 120, freqEnd: 40, attack: 0.005, decay: 0.5, volume: 0.8, curve: 1.5 },
      { wave: 'noise', freq: 8000, freqEnd: 1000, attack: 0.01, decay: 0.45, volume: 0.5, lowpass: 2000, curve: 1.3 },
      { wave: 'triangle', freq: 600, freqEnd: 1200, attack: 0.01, decay: 0.3, volume: 0.2 },
    ],
  },
  /** Strzała: syk lotu i krótkie brzęknięcie cięciwy. */
  [SoundCue.ArrowShot]: {
    gain: 0.3,
    layers: [
      { wave: 'noise', freq: 20000, freqEnd: 6000, attack: 0.003, decay: 0.07, volume: 0.5, lowpass: 6000, curve: 1.5 },
      { wave: 'triangle', freq: 900, freqEnd: 500, attack: 0.002, decay: 0.05, volume: 0.3 },
    ],
  },
  /** Mocna strzała (co 3.): niższe brzęknięcie i dłuższy syk. */
  [SoundCue.ArrowStrong]: {
    gain: 0.4,
    layers: [
      { wave: 'square', freq: 220, freqEnd: 110, attack: 0.002, decay: 0.12, volume: 0.35, duty: 0.3, lowpass: 1500 },
      { wave: 'noise', freq: 20000, freqEnd: 4000, attack: 0.003, decay: 0.13, volume: 0.5, lowpass: 6000, curve: 1.3 },
    ],
  },
  /** Salwa: trzy syki jeden po drugim. */
  [SoundCue.Volley]: {
    gain: 0.4,
    layers: [0, 0.03, 0.06].map((delay) => ({ wave: 'noise', freq: 20000, freqEnd: 5000, delay, attack: 0.003, decay: 0.08, volume: 0.45, lowpass: 6000, curve: 1.5 }) satisfies SynthLayer),
  },
  /** Dash: szybki, rosnący podmuch. */
  [SoundCue.Dash]: { gain: 0.35, layers: [{ wave: 'noise', freq: 3000, freqEnd: 12000, attack: 0.03, decay: 0.14, volume: 0.6, lowpass: 4000 }] },
  /** Ultimate: narastający, mocny akord z szumem. */
  [SoundCue.Ultimate]: {
    gain: 0.55,
    layers: [
      { wave: 'saw', freq: 110, freqEnd: 220, attack: 0.05, decay: 0.7, volume: 0.5, lowpass: 1200, vibrato: { depth: 0.02, rate: 6 } },
      { wave: 'square', freq: 220, freqEnd: 440, delay: 0.1, attack: 0.02, decay: 0.5, volume: 0.3, duty: 0.3, lowpass: 2000 },
      { wave: 'noise', freq: 6000, attack: 0.02, decay: 0.6, volume: 0.3, lowpass: 1500 },
    ],
  },
  /** Bohater trafiony: tępe, opadające uderzenie. */
  [SoundCue.HeroHurt]: {
    gain: 0.5,
    layers: [
      { wave: 'square', freq: 300, freqEnd: 120, attack: 0.002, decay: 0.18, volume: 0.6, lowpass: 1800, curve: 1.3 },
      { wave: 'noise', freq: 4000, attack: 0.002, decay: 0.08, volume: 0.4, curve: 2 },
    ],
  },
  [SoundCue.HeroDeath]: {
    gain: 0.6,
    layers: [
      { wave: 'saw', freq: 300, freqEnd: 50, attack: 0.01, decay: 1.2, volume: 0.6, lowpass: 900 },
      { wave: 'noise', freq: 1600, freqEnd: 400, attack: 0.01, decay: 0.8, volume: 0.4, lowpass: 600 },
    ],
  },
  /** Wskrzeszenie w co-opie: jasne arpeggio C-dur w górę. */
  [SoundCue.HeroRevive]: { gain: 0.4, layers: arpeggio('triangle', [523, 659, 784, 1047], 0.08, 0.25, 0.6) },

  // Wrogowie i bossowie.
  [SoundCue.EnemyHit]: {
    gain: 0.35,
    layers: [
      { wave: 'noise', freq: 6000, freqEnd: 1600, attack: 0.001, decay: 0.06, volume: 0.6, curve: 2 },
      { wave: 'sine', freq: 200, freqEnd: 90, attack: 0.001, decay: 0.07, volume: 0.5 },
    ],
  },
  [SoundCue.EnemyDeath]: {
    gain: 0.4,
    layers: [
      { wave: 'noise', freq: 3000, freqEnd: 600, attack: 0.002, decay: 0.25, volume: 0.6, lowpass: 1500, curve: 1.3 },
      { wave: 'square', freq: 180, freqEnd: 60, attack: 0.002, decay: 0.2, volume: 0.3, lowpass: 1000 },
    ],
  },
  /** Wylęg Gniazdownika (krok 122): mokre, niskie „blurp” i chlupot — słychać, że coś się wykluło. */
  [SoundCue.Brood]: {
    gain: 0.4,
    layers: [
      { wave: 'sine', freq: 140, freqEnd: 320, attack: 0.01, decay: 0.18, volume: 0.7, curve: 1.5 },
      { wave: 'noise', freq: 1800, freqEnd: 500, delay: 0.06, attack: 0.004, decay: 0.2, volume: 0.45, lowpass: 900, curve: 1.5 },
    ],
  },
  /** Czyhacz się budzi (krok 123): suche skrobanie pazurów od środka kryjówki — szum z drgającym filtrem. */
  [SoundCue.LurkWake]: {
    gain: 0.35,
    layers: [
      { wave: 'noise', freq: 2400, freqEnd: 1400, attack: 0.01, decay: 0.12, volume: 0.5, lowpass: 3000, curve: 1.2 },
      { wave: 'noise', freq: 2600, freqEnd: 1200, delay: 0.16, attack: 0.01, decay: 0.12, volume: 0.5, lowpass: 3000, curve: 1.2 },
      { wave: 'noise', freq: 2800, freqEnd: 1000, delay: 0.32, attack: 0.01, decay: 0.16, volume: 0.6, lowpass: 3200, curve: 1.2 },
    ],
  },
  /** Czyhacz wyskakuje: trzask pękającej kryjówki i niski łomot. */
  [SoundCue.LurkBurst]: {
    gain: 0.45,
    layers: [
      { wave: 'noise', freq: 3000, freqEnd: 400, attack: 0.002, decay: 0.22, volume: 0.7, lowpass: 2600, curve: 1.6 },
      { wave: 'square', freq: 120, freqEnd: 50, attack: 0.002, decay: 0.2, volume: 0.35, lowpass: 900 },
    ],
  },
  /** Pocisk wroga (mag, łucznik szkieletów): ciche „pfiu”, żeby ostrzał nie zagłuszał walki. */
  [SoundCue.EnemyShot]: { gain: 0.18, layers: [{ wave: 'square', freq: 700, freqEnd: 400, attack: 0.002, decay: 0.08, volume: 0.5, duty: 0.25, lowpass: 2500 }] },
  /** Wybuch (bomby, elita Wybuchowa, ataki bossów): szum z opadającym filtrem i głęboki bas. */
  [SoundCue.Explosion]: {
    gain: 0.65,
    layers: [
      { wave: 'noise', freq: 2400, freqEnd: 200, attack: 0.004, decay: 0.7, volume: 0.9, lowpass: 1500, curve: 2 },
      { wave: 'sine', freq: 90, freqEnd: 30, attack: 0.004, decay: 0.5, volume: 0.8, curve: 1.5 },
    ],
  },
  /** Ciężkie tąpnięcie (lądowanie, uderzenie strefy, zawalenie). */
  [SoundCue.Impact]: {
    gain: 0.5,
    layers: [
      { wave: 'sine', freq: 120, freqEnd: 40, attack: 0.002, decay: 0.25, volume: 0.9, curve: 2 },
      { wave: 'noise', freq: 1600, freqEnd: 400, attack: 0.002, decay: 0.15, volume: 0.4, lowpass: 800 },
    ],
  },
  [SoundCue.BossHit]: {
    gain: 0.4,
    layers: [
      { wave: 'noise', freq: 5000, freqEnd: 1200, attack: 0.001, decay: 0.1, volume: 0.6, curve: 2 },
      { wave: 'square', freq: 140, freqEnd: 70, attack: 0.001, decay: 0.12, volume: 0.4, lowpass: 900 },
    ],
  },
  /** Ryk bossa: niski, drżący warkot. */
  [SoundCue.BossRoar]: {
    gain: 0.7,
    layers: [
      { wave: 'saw', freq: 90, freqEnd: 60, attack: 0.08, decay: 1.0, volume: 0.7, lowpass: 700, vibrato: { depth: 0.08, rate: 9 } },
      { wave: 'noise', freq: 1200, freqEnd: 600, attack: 0.1, decay: 0.9, volume: 0.5, lowpass: 900 },
      { wave: 'square', freq: 45, freqEnd: 40, attack: 0.05, decay: 1.0, volume: 0.4, duty: 0.3, lowpass: 300 },
    ],
  },
  [SoundCue.BossDeath]: {
    gain: 0.75,
    layers: [
      { wave: 'noise', freq: 2000, freqEnd: 150, attack: 0.005, decay: 1.6, volume: 0.9, lowpass: 1400, curve: 1.6 },
      { wave: 'sine', freq: 80, freqEnd: 25, attack: 0.005, decay: 1.2, volume: 0.8, curve: 1.3 },
      { wave: 'saw', freq: 200, freqEnd: 30, attack: 0.05, decay: 1.5, volume: 0.4, lowpass: 800 },
    ],
  },
  /** Cios w tarczę (Tarczownik, bossowie z tarczą): metaliczny brzęk. */
  [SoundCue.ShieldBlock]: {
    gain: 0.35,
    layers: [
      { wave: 'square', freq: 1200, freqEnd: 1100, attack: 0.001, decay: 0.15, volume: 0.3, lowpass: 5000 },
      { wave: 'triangle', freq: 2400, attack: 0.001, decay: 0.2, volume: 0.25, vibrato: { depth: 0.01, rate: 30 } },
      { wave: 'noise', freq: 15000, attack: 0.001, decay: 0.04, volume: 0.3 },
    ],
  },

  // Świat i łupy.
  /** Złoto: klasyczne „dzyń-dzyń” (H5 → E6). */
  [SoundCue.Coin]: {
    gain: 0.3,
    layers: [
      { wave: 'square', freq: 988, attack: 0.002, decay: 0.06, volume: 0.4, lowpass: 5000 },
      { wave: 'square', freq: 1319, delay: 0.06, attack: 0.002, decay: 0.2, volume: 0.4, lowpass: 5000 },
    ],
  },
  [SoundCue.Heal]: {
    gain: 0.35,
    layers: [
      { wave: 'sine', freq: 523, freqEnd: 1047, attack: 0.02, decay: 0.35, volume: 0.5, vibrato: { depth: 0.02, rate: 8 } },
      { wave: 'triangle', freq: 784, freqEnd: 1568, delay: 0.08, attack: 0.02, decay: 0.3, volume: 0.3 },
    ],
  },
  /** Przedmiot: fanfara G-C-E-G i dzwonek. */
  [SoundCue.ItemPickup]: {
    gain: 0.45,
    layers: [...arpeggio('triangle', [392, 523, 659, 784], 0.07, 0.3, 0.6), { wave: 'sine', freq: 1568, delay: 0.28, attack: 0.005, decay: 0.5, volume: 0.25 }],
  },
  /** Kapliczka: cichy chór (akord C) i dzwon. */
  [SoundCue.Shrine]: {
    gain: 0.45,
    layers: [
      ...[262, 330, 392].map((freq) => ({ wave: 'sine', freq, attack: 0.2, decay: 1.0, volume: 0.35, vibrato: { depth: 0.01, rate: 5 } }) satisfies SynthLayer),
      { wave: 'sine', freq: 1047, delay: 0.1, attack: 0.005, decay: 0.8, volume: 0.25, curve: 1.5 },
    ],
  },
  /** Schody: kroki i wznoszący się ton. */
  [SoundCue.Stairs]: {
    gain: 0.45,
    layers: [
      ...[0, 0.12, 0.24, 0.36].map((delay) => ({ wave: 'noise', freq: 1800, delay, attack: 0.002, decay: 0.07, volume: 0.6, lowpass: 900, curve: 2 }) satisfies SynthLayer),
      { wave: 'triangle', freq: 330, freqEnd: 660, delay: 0.3, attack: 0.1, decay: 0.5, volume: 0.3 },
    ],
  },
  /** Kraty areny i zasadzki opadają: łoskot żelaza. */
  [SoundCue.GatesSlam]: {
    gain: 0.65,
    layers: [
      { wave: 'noise', freq: 1400, freqEnd: 300, attack: 0.002, decay: 0.5, volume: 0.8, lowpass: 900, curve: 1.5 },
      { wave: 'square', freq: 80, freqEnd: 50, attack: 0.002, decay: 0.4, volume: 0.6, lowpass: 400 },
      { wave: 'triangle', freq: 600, attack: 0.002, decay: 0.3, volume: 0.15, vibrato: { depth: 0.03, rate: 12 } },
    ],
  },
  /** Rozbita urna, skrzynia, kokon. */
  [SoundCue.Break]: {
    gain: 0.45,
    layers: [
      { wave: 'noise', freq: 10000, freqEnd: 3000, attack: 0.001, decay: 0.2, volume: 0.6, curve: 2 },
      { wave: 'noise', freq: 4000, freqEnd: 1200, delay: 0.05, attack: 0.001, decay: 0.2, volume: 0.4, lowpass: 2500, curve: 1.5 },
      { wave: 'triangle', freq: 1800, freqEnd: 1200, attack: 0.001, decay: 0.1, volume: 0.2 },
    ],
  },
  /** Kolce wysuwają się z podłogi. */
  [SoundCue.Spikes]: {
    gain: 0.4,
    layers: [
      { wave: 'noise', freq: 14000, attack: 0.001, decay: 0.08, volume: 0.5, curve: 2 },
      { wave: 'square', freq: 1500, freqEnd: 900, attack: 0.001, decay: 0.1, volume: 0.25, duty: 0.2, lowpass: 4000 },
    ],
  },
  [SoundCue.Dart]: { gain: 0.3, layers: [{ wave: 'noise', freq: 16000, freqEnd: 6000, attack: 0.01, decay: 0.1, volume: 0.5, lowpass: 7000 }] },
  /** Zasadzka: ponury, narastający pomruk i wysoki, upiorny ton. */
  [SoundCue.Ambush]: {
    gain: 0.6,
    layers: [
      { wave: 'saw', freq: 55, freqEnd: 52, attack: 0.3, decay: 1.2, volume: 0.6, lowpass: 400, vibrato: { depth: 0.02, rate: 3 } },
      { wave: 'sine', freq: 880, freqEnd: 870, attack: 0.4, decay: 1.0, volume: 0.15, vibrato: { depth: 0.03, rate: 6 } },
      { wave: 'noise', freq: 800, attack: 0.5, decay: 1.0, volume: 0.3, lowpass: 300 },
    ],
  },
  [SoundCue.Secret]: { gain: 0.4, layers: arpeggio('triangle', [659, 784, 988, 1319], 0.1, 0.4, 0.55) },
  /** Okrzyk sprzątaczki (krok 125): dwa piskliwe „hej!” z drżeniem — nie mowa, tylko barwa głosu pod napisem. */
  [SoundCue.Shout]: {
    gain: 0.3,
    layers: [
      { wave: 'square', freq: 820, freqEnd: 1180, attack: 0.01, decay: 0.12, volume: 0.45, duty: 0.35, lowpass: 2600, vibrato: { depth: 0.04, rate: 22 } },
      { wave: 'square', freq: 1100, freqEnd: 760, delay: 0.13, attack: 0.01, decay: 0.18, volume: 0.45, duty: 0.35, lowpass: 2400, vibrato: { depth: 0.05, rate: 18 } },
    ],
  },
  /** Chlust wody: szum opadający od jasnego do ciemnego i krótki bulgot. */
  [SoundCue.Splash]: {
    gain: 0.4,
    layers: [
      { wave: 'noise', freq: 5000, freqEnd: 900, attack: 0.005, decay: 0.35, volume: 0.6, lowpass: 4000, curve: 1.3 },
      { wave: 'sine', freq: 260, freqEnd: 520, delay: 0.05, attack: 0.01, decay: 0.12, volume: 0.25, vibrato: { depth: 0.2, rate: 30 } },
    ],
  },
  /** Rozbryzg szlamu (krok 153): ciężkie mlaśnięcie (ciemny szum) i niski bulgot z vibrato. */
  [SoundCue.SludgeSplat]: {
    gain: 0.42,
    layers: [
      { wave: 'noise', freq: 1800, freqEnd: 300, attack: 0.004, decay: 0.26, volume: 0.6, lowpass: 1600, curve: 1.6 },
      { wave: 'sine', freq: 150, freqEnd: 70, attack: 0.005, decay: 0.2, volume: 0.45 },
      { wave: 'sine', freq: 220, freqEnd: 360, delay: 0.08, attack: 0.01, decay: 0.14, volume: 0.22, vibrato: { depth: 0.3, rate: 26 } },
    ],
  },
  /** Winda: dzwonek „dzyń” i szum rozsuwanych drzwi. */
  [SoundCue.Elevator]: {
    gain: 0.35,
    layers: [
      { wave: 'sine', freq: 1318, attack: 0.005, decay: 0.6, volume: 0.45 },
      { wave: 'sine', freq: 988, delay: 0.18, attack: 0.005, decay: 0.8, volume: 0.45 },
      { wave: 'noise', freq: 900, freqEnd: 500, delay: 0.3, attack: 0.1, decay: 0.5, volume: 0.25, lowpass: 1200 },
    ],
  },
  /** Trzepot skrzydeł (krok 137): trzy szybkie, miękkie uderzenia szumu i klekot dzioba. */
  [SoundCue.WingFlap]: {
    gain: 0.35,
    layers: [
      { wave: 'noise', freq: 1400, freqEnd: 600, attack: 0.01, decay: 0.09, volume: 0.5, lowpass: 1800 },
      { wave: 'noise', freq: 1300, freqEnd: 550, delay: 0.11, attack: 0.01, decay: 0.09, volume: 0.45, lowpass: 1700 },
      { wave: 'noise', freq: 1200, freqEnd: 500, delay: 0.22, attack: 0.01, decay: 0.1, volume: 0.4, lowpass: 1600 },
      { wave: 'square', freq: 820, delay: 0.05, attack: 0.002, decay: 0.03, volume: 0.12, lowpass: 2400 },
    ],
  },
};

/**
 * Pętle: bufor gra w kółko, dopóki ktoś go trzyma (promień Czarodziejki). Częstotliwości i vibrato
 * mają całkowitą liczbę okresów w długości pętli — szew jest niesłyszalny.
 */
export const LOOP_RECIPES: Readonly<Record<LoopCue, SoundRecipe>> = {
  [LoopCue.Beam]: {
    gain: 0.25,
    layers: [
      { wave: 'saw', freq: 110, attack: 0.001, decay: 1, volume: 0.4, lowpass: 900, vibrato: { depth: 0.01, rate: 5 }, curve: 0 },
      { wave: 'sine', freq: 440, attack: 0.001, decay: 1, volume: 0.3, vibrato: { depth: 0.02, rate: 7 }, curve: 0 },
    ],
  },
};

/** Narastanie i wygasanie pętli (s) — bez trzasków przy włączaniu promienia. */
export const LOOP_FADE_S = 0.06;

/** Limity powtórzeń — m.in. dwa ciosy w co-opie w tej samej chwili brzmią jak jeden. */
export const SOUND_GATE_RULES: Readonly<Record<SoundCue, SoundGateRule>> = {
  [SoundCue.UiMove]: { minGapMs: 30 },
  [SoundCue.UiConfirm]: { minGapMs: 60 },
  [SoundCue.UiBack]: { minGapMs: 60 },
  [SoundCue.SwordSwing]: { minGapMs: 60 },
  [SoundCue.OrbThrow]: { minGapMs: 50 },
  [SoundCue.OrbSplash]: { minGapMs: 60 },
  [SoundCue.Nova]: { minGapMs: 100 },
  [SoundCue.ArrowShot]: { minGapMs: 50 },
  [SoundCue.ArrowStrong]: { minGapMs: 60 },
  [SoundCue.Volley]: { minGapMs: 80 },
  [SoundCue.Dash]: { minGapMs: 80 },
  [SoundCue.Ultimate]: { minGapMs: 300 },
  [SoundCue.HeroHurt]: { minGapMs: 120 },
  [SoundCue.HeroDeath]: { minGapMs: 500 },
  [SoundCue.HeroRevive]: { minGapMs: 300 },
  [SoundCue.EnemyHit]: { minGapMs: 45 },
  [SoundCue.EnemyDeath]: { minGapMs: 60 },
  [SoundCue.EnemyShot]: { minGapMs: 90 },
  [SoundCue.Brood]: { minGapMs: 150 },
  [SoundCue.LurkWake]: { minGapMs: 300 },
  [SoundCue.LurkBurst]: { minGapMs: 150 },
  [SoundCue.Explosion]: { minGapMs: 70 },
  [SoundCue.Impact]: { minGapMs: 70 },
  [SoundCue.BossHit]: { minGapMs: 80 },
  [SoundCue.BossRoar]: { minGapMs: 800 },
  [SoundCue.BossDeath]: { minGapMs: 1000 },
  [SoundCue.ShieldBlock]: { minGapMs: 90 },
  [SoundCue.Coin]: { minGapMs: 40 },
  [SoundCue.Heal]: { minGapMs: 100 },
  [SoundCue.ItemPickup]: { minGapMs: 200 },
  [SoundCue.Shrine]: { minGapMs: 500 },
  [SoundCue.Stairs]: { minGapMs: 500 },
  [SoundCue.GatesSlam]: { minGapMs: 400 },
  [SoundCue.Break]: { minGapMs: 60 },
  [SoundCue.Spikes]: { minGapMs: 100 },
  [SoundCue.Dart]: { minGapMs: 80 },
  [SoundCue.Ambush]: { minGapMs: 1000 },
  [SoundCue.Secret]: { minGapMs: 1000 },
  [SoundCue.Shout]: { minGapMs: 600 },
  [SoundCue.Splash]: { minGapMs: 120 },
  [SoundCue.Elevator]: { minGapMs: 800 },
  [SoundCue.SludgeSplat]: { minGapMs: 110 },
  [SoundCue.WingFlap]: { minGapMs: 150 },
};

/**
 * Muzyka w dwóch zestawach (krok 139, pomysł właściciela), oba składane w locie (`systems/MusicComposer`),
 * każdy w dwóch klimatach: wieża (piętra 1–3 i menu) i zaświaty. Zestaw gracz wybiera na pauzie.
 *
 * Lucent (krok 116): wieża — d-moll dorycki, spokojny, tajemniczy; zaświaty — e frygijski, niżej, wolniej,
 * z pulsem serca. W walce z bossem oba dostają bęben, gęstsze dzwonki i drugi ton basu.
 */
const LUCENT_THEMES: Readonly<Record<MusicTheme, LucentThemeDefinition>> = {
  [MusicTheme.Tower]: {
    preset: MusicPreset.Lucent,
    bpm: 72,
    root: 50,
    scale: [0, 2, 3, 5, 7, 9, 10],
    progression: [0, 5, 3, 4],
    barsPerChord: 2,
    bellDensity: 0.16,
    bellTranspose: 12,
    bellRest: { every: 8, rest: 2 },
    drumBeats: [0, 2],
    drumAlways: false,
    seed: 116,
  },
  [MusicTheme.Underworld]: {
    preset: MusicPreset.Lucent,
    bpm: 60,
    root: 40,
    scale: [0, 1, 3, 5, 7, 8, 10],
    progression: [0, 1, 5, 0, 3, 1],
    barsPerChord: 2,
    bellDensity: 0.1,
    bellTranspose: 12,
    bellRest: { every: 8, rest: 3 },
    drumBeats: [0, 0.4, 2],
    drumAlways: true,
    seed: 666,
  },
};

/**
 * Horror (krok 139, prośba właściciela: „prosty house'owy bit z kategorii horror minimal tech”): ta sama pętla 4/4
 * w dwóch klimatach — wieża: a-moll, 122 BPM, dron z małą sekundą; zaświaty: e frygijski, 118 BPM, dron z trytonem,
 * gęstsze pingi. W walce z bossem: szesnastkowe hi-haty, stab w każdym takcie, bez przełamań.
 */
const HORROR_THEMES: Readonly<Record<MusicTheme, HorrorThemeDefinition>> = {
  [MusicTheme.Tower]: {
    preset: MusicPreset.Horror,
    bpm: 122,
    root: 45,
    scale: [0, 2, 3, 5, 7, 8, 10],
    progression: [0, 0, 5, 3],
    barsPerChord: 4,
    bassSteps: [null, null, 0, null, null, null, 0, null, null, null, 0, null, null, null, 0, 7],
    openHatSteps: [2, 6, 10, 14],
    clapSteps: [4, 12],
    stabSteps: [3, 10],
    droneTension: 1,
    pingChance: 0.3,
    pingTranspose: 24,
    phraseBars: 16,
    breakBars: 2,
    introBars: 4,
    seed: 139,
  },
  [MusicTheme.Underworld]: {
    preset: MusicPreset.Horror,
    bpm: 118,
    root: 40,
    scale: [0, 1, 3, 5, 7, 8, 10],
    progression: [0, 0, 1, 0],
    barsPerChord: 4,
    bassSteps: [null, null, 0, null, null, 0, null, 1, null, null, 0, null, null, 0, null, null],
    openHatSteps: [2, 6, 10, 14],
    clapSteps: [4, 12],
    stabSteps: [6, 14],
    droneTension: 6,
    pingChance: 0.45,
    pingTranspose: 24,
    phraseBars: 16,
    breakBars: 2,
    introBars: 4,
    seed: 666,
  },
};

export const MUSIC_PRESETS: Readonly<Record<MusicPreset, Readonly<Record<MusicTheme, MusicThemeDefinition>>>> = {
  [MusicPreset.Lucent]: LUCENT_THEMES,
  [MusicPreset.Horror]: HORROR_THEMES,
};

/** Nazwy zestawów na pauzie (kolejność przełączania — `AUDIO_SETTINGS_RULES.presets`). */
export const MUSIC_PRESET_NAMES: Readonly<Record<MusicPreset, string>> = {
  [MusicPreset.Lucent]: 'LUCENT',
  [MusicPreset.Horror]: 'HORROR',
};

/** Klimat muzyki biomu: piętra 1–3 to wieża, cmentarzysko, piekło i palarnia i Lustrzana komnata — zaświaty. */
export const MUSIC_BY_BIOME: Readonly<Record<BiomeId, MusicTheme>> = {
  [BiomeId.TowerRuins]: MusicTheme.Tower,
  [BiomeId.SpiderLair]: MusicTheme.Tower,
  [BiomeId.FungalGrove]: MusicTheme.Tower,
  [BiomeId.Graveyard]: MusicTheme.Underworld,
  [BiomeId.Infernal]: MusicTheme.Underworld,
  [BiomeId.SmokeDen]: MusicTheme.Underworld,
  [BiomeId.MirrorHall]: MusicTheme.Underworld,
  [BiomeId.StorkGarden]: MusicTheme.Underworld,
};

/** Głośność głosów muzyki i ich barwa (odtwarzacz Web Audio). */
export const MUSIC_MIX = {
  master: 0.5,
  lucent: {
    // Krok 116a (ocena: „po 20 minutach lekki dyskomfort”): ciemniejszy pad, słabsze dudnienie rozstrojenia.
    pad: { gain: 0.12, attack: 1.2, release: 1.5, lowpass: 700, detuneCents: 5 },
    bass: { gain: 0.22, attack: 0.05, release: 0.4, lowpass: 400 },
    /** Dzwonek: alikwot harmoniczny (2×, cicho) zamiast metalicznego 2,76× — mniej kłuje w uszy. */
    bell: { gain: 0.07, attack: 0.01, release: 1.4, overtoneRatio: 2, overtoneLevel: 0.15, lowpass: 2500 },
    drum: { gain: 0.5, pitchFrom: 110, pitchTo: 40, decay: 0.35 },
  },
  horror: {
    // Krok 139: zestaw minimalnego house'u. Hi-haty ciche i krótkie — po kroku 116a pamiętamy o zmęczeniu ucha.
    kick: { gain: 0.55, pitchFrom: 140, pitchTo: 45, pitchS: 0.09, decay: 0.32 },
    hat: { gain: 0.05, highpass: 8000, decay: 0.035 },
    openHat: { gain: 0.045, highpass: 7000, decay: 0.16 },
    clap: { gain: 0.14, bandpass: 1300, q: 1.2, decay: 0.14, bursts: 3, burstGapS: 0.011 },
    /** Bas: piła za filtrem, który zamyka się po każdym uderzeniu („pluck”). */
    bass: { gain: 0.15, attack: 0.005, release: 0.08, filterFrom: 900, filterTo: 180, filterS: 0.12 },
    /** Stab: dwie rozstrojone piły, krótko, ciemno, z echem. */
    stab: { gain: 0.035, attack: 0.004, release: 0.18, lowpass: 1100, detuneCents: 9, echoSend: 0.6 },
    /** Dron: dwa sinusy z lekkim rozstrojeniem — powolne dudnienie niepokoju. */
    drone: { gain: 0.05, attack: 2.5, release: 2, lowpass: 500, detuneCents: 6 },
    ping: { gain: 0.04, decay: 0.7, echoSend: 0.9 },
    /** Echo staba i pingów: kropkowana ósemka (w ćwierćnutach), ze sprzężeniem i przyciemnieniem. */
    echo: { beats: 0.75, feedback: 0.4, lowpass: 1600 },
  },
  /** Ile sekund naprzód planujemy nuty (odtwarzacz budzi się co `tickMs`). */
  lookaheadS: 0.6,
  tickMs: 150,
  /** Przenikanie przy zmianie utworu (s). */
  crossfadeS: 1.5,
};

/** Teksty dźwięku na ekranie pauzy. */
export const AUDIO_TEXT = {
  music: 'Muzyka',
  /** Wybór zestawu muzyki (krok 139). */
  preset: (name: string) => `Styl muzyki: ${name}`,
  sfx: 'Efekty',
};

/**
 * Głośnik w rogu ekranu startowego (krok 120): kliknięcie albo stuknięcie włącza i wycisza dźwięk
 * (to samo ustawienie co N i pauza, zapamiętane w przeglądarce). Pozycja od prawego górnego rogu płótna.
 */
export const SPEAKER_BUTTON = {
  marginX: 30,
  marginY: 30,
  radius: 18,
  colors: { fill: 0x0c0c16, fillAlpha: 0.7, border: 0x8a7440, icon: 0xf0d27a, muted: 0xff7a6a, hover: 0xffffff },
  label: { on: 'DŹWIĘK', off: 'BEZ DŹWIĘKU' },
} as const;
