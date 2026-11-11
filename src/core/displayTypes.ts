/** Poziom jakości obrazu (krok U1, STYLEGUIDE §13.3). „Niska” = wygląd sprzed upgradu. */
export enum RenderQuality {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
}

/** Wybór gracza: konkretny poziom albo automat (PC — wyżej, telefon — niżej, bez WebGL — Niska). */
export type QualityChoice = RenderQuality | 'auto';

/** Ustawienia obrazu (krok 118; jakość i „mniej błysków” — krok U1). */
export interface DisplaySettings {
  /** true — płótno wypełnia okno (skala ułamkowa); false — tylko całkowite krotności pikseli. */
  readonly fillWindow: boolean;
  /** Jakość efektów ekranowych; 'auto' wybiera wg platformy. */
  readonly quality: QualityChoice;
  /** „Mniej błysków” (STYLEGUIDE §13.4): bez drżenia kamery, błysków pełnoekranowych i migotania świateł. */
  readonly reduceFlashes: boolean;
}

/**
 * Co wolno efektom ekranowym na danym poziomie jakości i przy „mniej błysków”. Liczy to `systems/RenderQuality.ts`,
 * a wykonuje `effects/ScreenFx.ts`. Profil zmienia tylko obraz — logika, hitboxy i czas gry są takie same.
 */
export interface RenderProfile {
  readonly quality: RenderQuality;
  /** Drżenie kamery: mnożnik siły (0 — wyłączone). */
  readonly shakeScale: number;
  /** Błyski pełnoekranowe (camera.flash). */
  readonly screenFlash: boolean;
  /** Migotanie pochodni, ognia i palenisk; false — stała jasność. */
  readonly lightFlicker: boolean;
  /** Poświata (preFX glow) na rzeczach, które świecą — grupy włączone na tym poziomie. */
  readonly glow: ReadonlySet<GlowGroup>;
  /** Mnożnik liczby ozdobnych cząstek (pyłki, obłoczki mgły). */
  readonly ambientParticles: number;
}

/** Grupy rzeczy z poświatą (STYLEGUIDE §13.6: tylko to, co naprawdę świeci). */
export enum GlowGroup {
  /** Płomienie pochodni na murach. */
  Torch = 'torch',
  /** Ogień walki (plamy ognia, stos płomieni). */
  Fire = 'fire',
}
