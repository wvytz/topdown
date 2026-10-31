/**
 * Typy dźwięku (krok 116): efekty syntezowane w kodzie (przepisy w stylu jsfxr) i muzyka składana nuta po nucie.
 * Same dane — odtwarzaniem zajmuje się `audio/SoundBoard` (Web Audio), zasady są w `systems/`.
 */

/** Zdarzenie gry, które ma swój dźwięk. Nazwy = klucze przepisów w `config/audioConfig.ts`. */
export enum SoundCue {
  // Interfejs
  UiMove = 'ui-move',
  UiConfirm = 'ui-confirm',
  UiBack = 'ui-back',
  // Bohaterowie
  SwordSwing = 'sword-swing',
  OrbThrow = 'orb-throw',
  OrbSplash = 'orb-splash',
  Nova = 'nova',
  ArrowShot = 'arrow-shot',
  ArrowStrong = 'arrow-strong',
  Volley = 'volley',
  Dash = 'dash',
  Ultimate = 'ultimate',
  HeroHurt = 'hero-hurt',
  HeroDeath = 'hero-death',
  HeroRevive = 'hero-revive',
  // Wrogowie i bossowie
  EnemyHit = 'enemy-hit',
  EnemyDeath = 'enemy-death',
  EnemyShot = 'enemy-shot',
  Explosion = 'explosion',
  Impact = 'impact',
  BossHit = 'boss-hit',
  BossRoar = 'boss-roar',
  BossDeath = 'boss-death',
  ShieldBlock = 'shield-block',
  /** Gniazdownik wypluwa czerwie (krok 122). */
  Brood = 'brood',
  /** Czyhacz się budzi (krok 123): skrobanie w kryjówce — ostrzeżenie przed wyskokiem. */
  LurkWake = 'lurk-wake',
  /** Czyhacz wyskakuje: trzask drewna/kamienia. */
  LurkBurst = 'lurk-burst',
  /** Sprzątaczka krzyczy (krok 125): krótki, piskliwy okrzyk do napisu nad głową. */
  Shout = 'shout',
  /** Chlust wody z wiadra. */
  Splash = 'splash',
  /** Winda w murze areny: dzwonek i rozsuwane drzwi. */
  Elevator = 'elevator',
  /** Trzepot skrzydeł (Brudna Wiedźma, krok 137): klucz bocianów i pikujące ptaki. */
  WingFlap = 'wing-flap',
  // Świat i łupy
  Coin = 'coin',
  Heal = 'heal',
  ItemPickup = 'item-pickup',
  Shrine = 'shrine',
  Stairs = 'stairs',
  GatesSlam = 'gates-slam',
  Break = 'break',
  Spikes = 'spikes',
  Dart = 'dart',
  Ambush = 'ambush',
  Secret = 'secret',
}

/** Dźwięk ciągły (pętla), np. promień Czarodziejki — gra, dopóki ktoś go trzyma. */
export enum LoopCue {
  Beam = 'beam',
}

export type SynthWave = 'sine' | 'triangle' | 'square' | 'saw' | 'noise';

/**
 * Jedna warstwa efektu: fala, przesuw wysokości (wykładniczy), obwiednia i prosty filtr.
 * Kilka warstw naraz daje np. „świst + uderzenie”.
 */
export interface SynthLayer {
  readonly wave: SynthWave;
  /** Częstotliwość na starcie i na końcu warstwy (Hz); dla szumu — tempo zmian próbek (im wyżej, tym jaśniej). */
  readonly freq: number;
  readonly freqEnd?: number;
  /** Opóźnienie startu warstwy (s). */
  readonly delay?: number;
  readonly attack: number;
  /** Czas wygasania po ataku (s). */
  readonly decay: number;
  readonly volume: number;
  /** Wypełnienie fali prostokątnej 0..1 (domyślnie 0,5). */
  readonly duty?: number;
  /** Filtr dolnoprzepustowy (Hz) — łagodzi ostre fale. */
  readonly lowpass?: number;
  /** Vibrato: głębokość (ułamek częstotliwości) i tempo (Hz). */
  readonly vibrato?: { readonly depth: number; readonly rate: number };
  /** Kształt wygasania: >1 — szybciej gaśnie na początku (uderzenie), 1 — liniowo. */
  readonly curve?: number;
}

export interface SoundRecipe {
  readonly layers: readonly SynthLayer[];
  /** Głośność całego efektu (0..1) względem pozostałych. */
  readonly gain: number;
}

/** Ustawienia dźwięku gracza (pauza, klawisz wyciszenia). Głośności 0..1. */
export interface AudioSettings {
  readonly music: number;
  readonly sfx: number;
  readonly muted: boolean;
  /** Zestaw muzyki wybrany na pauzie (krok 139). */
  readonly preset: MusicPreset;
}

/**
 * Zestaw muzyki (krok 139, pomysł właściciela): Lucent — spokojny ambient z kroku 116 (pad, bas, dzwonki),
 * Horror — zapętlony minimalny house w klimacie horroru. Gracz przełącza go na pauzie.
 */
export enum MusicPreset {
  Lucent = 'lucent',
  Horror = 'horror',
}

/** Klimat muzyki: wieża (piętra 1–3) i zaświaty (cmentarzysko, piekło, palarnia). */
export enum MusicTheme {
  Tower = 'tower',
  Underworld = 'underworld',
}

/** Instrumenty muzyki — każdy to inny głos w `audio/MusicPlayer`. Lucent: pad, bas, dzwonek i bęben-serce. */
export type LucentVoice = 'pad' | 'bass' | 'bell' | 'drum';
/** Horror (krok 139): stopa, hi-haty, klask, bas, krótki akord-„stab”, buczący dron i rzadki „ping” w pogłosie. */
export type HorrorVoice = 'kick' | 'hat' | 'openHat' | 'clap' | 'bass' | 'stab' | 'drone' | 'ping';
export type MusicVoice = LucentVoice | HorrorVoice;

/** Nuta utworu: czas względem początku taktu (s), wysokość (MIDI), długość (s), głośność. */
export interface MusicNote {
  readonly voice: MusicVoice;
  readonly at: number;
  readonly midi: number;
  readonly duration: number;
  readonly velocity: number;
}

/** Wspólne pola utworów: tempo, tonacja i progresja akordów. */
interface MusicThemeBase {
  readonly bpm: number;
  /** Prima tonacji (MIDI), np. 50 = D3. */
  readonly root: number;
  /** Stopnie skali w półtonach od primy. */
  readonly scale: readonly number[];
  /** Progresja: każdy takt stoi na akordzie zbudowanym na danym stopniu skali (indeks w `scale`). */
  readonly progression: readonly number[];
  /** Takty na akord. */
  readonly barsPerChord: number;
  /** Seed wariacji — ten sam utwór przy każdym odsłuchu. */
  readonly seed: number;
}

/** Lucent (krok 116): akordy padu i basu, nad nimi rzadkie dzwonki, puls bębna. */
export interface LucentThemeDefinition extends MusicThemeBase {
  readonly preset: MusicPreset.Lucent;
  /** Szansa nuty dzwonka na każdą ósemkę (0..1). */
  readonly bellDensity: number;
  /** O ile półtonów nad akordem grają dzwonki (krok 116a: oktawa niżej niż dotąd — mniej przenikliwie). */
  readonly bellTranspose: number;
  /** Oddech melodii: w każdych `every` taktach ostatnie `rest` są bez dzwonków — ucho odpoczywa. */
  readonly bellRest: { readonly every: number; readonly rest: number };
  /** Bęben (puls serca) w każdym takcie: ćwierćnuty z uderzeniem. */
  readonly drumBeats: readonly number[];
  /** Bęben gra zawsze (zaświaty) albo tylko w walce z bossem. */
  readonly drumAlways: boolean;
}

/**
 * Horror (krok 139): pętla 4/4 w 16 krokach (szesnastkach) na takt,
 * z akordem z progresji, frazami zakończonymi przełamaniem i wstępem bez klasku.
 */
export interface HorrorThemeDefinition extends MusicThemeBase {
  readonly preset: MusicPreset.Horror;
  /** Bas: 16 kroków taktu — przesunięcie w stopniach skali od akordu albo `null` (pauza). */
  readonly bassSteps: readonly (number | null)[];
  /** Kroki z otwartym hi-hatem (na „i” — offbeat house'u). */
  readonly openHatSteps: readonly number[];
  /** Kroki z klaskiem (zwykle 2 i 4 miara). */
  readonly clapSteps: readonly number[];
  /** Kroki z akordem-stabem (gra co drugi takt, w walce z bossem — w każdym). */
  readonly stabSteps: readonly number[];
  /** Interwał grozy w dronie (półtony nad primą akordu): 1 — mała sekunda, 6 — tryton. */
  readonly droneTension: number;
  /** Szansa „pingu” w takcie (0..1) i jego wysokość nad akordem (półtony). */
  readonly pingChance: number;
  readonly pingTranspose: number;
  /** Fraza ma `phraseBars` taktów; ostatnie `breakBars` to przełamanie bez stopy, basu i klasku. */
  readonly phraseBars: number;
  readonly breakBars: number;
  /** Pierwsze takty utworu: sama stopa, hi-haty i bas — klask i stab dochodzą później. */
  readonly introBars: number;
}

export type MusicThemeDefinition = LucentThemeDefinition | HorrorThemeDefinition;
