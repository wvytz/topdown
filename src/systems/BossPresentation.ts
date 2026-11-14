/**
 * Oprawa walki z bossem (krok U6) — czysta logika: przebieg karty wejścia w czasie i fazy na pasku HP.
 * Rysuje `effects/BossIntroCard.ts`.
 */

/** Czasy karty wejścia (podzbiór `BOSS_INTRO_CARD`). */
export interface IntroCardTiming {
  readonly inMs: number;
  readonly holdMs: number;
  readonly outMs: number;
  readonly revealAt: number;
}

/** Stan karty w chwili `elapsed` od startu. */
export interface IntroCardFrame {
  readonly visible: boolean;
  /** Szerokość pasa: 0 → 1 przy wjeździe, 1 → 0 przy zjeździe. */
  readonly band: number;
  /** Krycie treści (imię, tytuł, portret). */
  readonly alpha: number;
  /** Przesunięcie treści: −1 (z lewej, wjazd) … 0 … +1 (w prawo, zjazd). */
  readonly slide: number;
  /** Czy portret już odsłonięty (przed tym — sylwetka). */
  readonly revealed: boolean;
}

const HIDDEN: IntroCardFrame = { visible: false, band: 0, alpha: 0, slide: 0, revealed: false };

/** Wygładzenie wjazdu: szybko na początku, miękko na końcu. */
function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function introCardDuration(timing: IntroCardTiming): number {
  return timing.inMs + timing.holdMs + timing.outMs;
}

export function introCardFrame(elapsed: number, timing: IntroCardTiming): IntroCardFrame {
  const { inMs, holdMs, outMs } = timing;
  if (!(elapsed >= 0) || elapsed >= inMs + holdMs + outMs) return HIDDEN;
  if (elapsed < inMs) {
    const t = easeOut(elapsed / inMs);
    return { visible: true, band: t, alpha: t, slide: t - 1, revealed: elapsed / inMs >= timing.revealAt };
  }
  if (elapsed < inMs + holdMs) return { visible: true, band: 1, alpha: 1, slide: 0, revealed: true };
  const t = (elapsed - inMs - holdMs) / outMs;
  const eased = t * t;
  return { visible: true, band: 1 - eased, alpha: 1 - t, slide: eased, revealed: true };
}

/** Skąd biorą się progi faz bossa. */
export interface BossPhaseSources {
  /** Próg wściekłości (ułamek HP). */
  readonly enrageAt?: number | undefined;
  /** Ucieczka windą (blondynka). */
  readonly escapeAt?: number | undefined;
  /** Inne progi walki (np. przy połowie HP brunetki wraca blondynka). */
  readonly extra?: readonly number[] | undefined;
}

/**
 * Progi faz, malejąco (od pierwszego, który gracz przekroczy). Pomija progi poza (minGap, 1 − minGap)
 * i scala progi bliższe niż `minGap` — dwie kreski obok siebie wyglądałyby jak jedna gruba. Progi poniżej
 * ucieczki windą odpadają — boss ich nie dożyje.
 */
export function bossPhaseMarks(sources: BossPhaseSources, minGap = 0): number[] {
  const raw = [sources.enrageAt, sources.escapeAt, ...(sources.extra ?? [])].filter(
    (v): v is number => v !== undefined && Number.isFinite(v) && v > minGap && v < 1 - minGap,
  );
  // Boss uciekający windą nie dożywa progów poniżej ucieczki (blondynka ucieka przy 2/3, zanim się wścieknie).
  const escape = sources.escapeAt;
  const reachable = escape === undefined ? raw : raw.filter((v) => v >= escape);
  const sorted = [...new Set(reachable)].sort((a, b) => b - a);
  const marks: number[] = [];
  for (const mark of sorted) if (marks.every((m) => Math.abs(m - mark) > minGap)) marks.push(mark);
  return marks;
}

/** Numer bieżącej fazy (od 1): ile progów HP już spadło do albo poniżej. */
export function bossPhase(hpRatio: number, marks: readonly number[]): number {
  return 1 + marks.filter((mark) => hpRatio <= mark).length;
}

/** Arkusz bossa widziany przez portret (podzbiór `SpriteSheetDef`). */
export interface PortraitSheet {
  readonly key: string;
  readonly frameWidth: number;
  readonly sheetWidth: number;
  readonly directions: number;
  readonly animations: Readonly<Record<string, { readonly frames: readonly number[] }>>;
}

/** Wiersz arkusza „przodem do gracza” (S) w arkuszach 8-kierunkowych (`systems/Facing.ts`). */
const FACING_CAMERA_ROW = 4;

/** Portret na karcie wejścia: pierwsza klatka animacji `pose` (spoczynek albo chód), wiersz S. */
export function bossPortrait(sheet: PortraitSheet, pose: string): { readonly texture: string; readonly frame: number } {
  const columns = Math.max(1, Math.round(sheet.sheetWidth / sheet.frameWidth));
  const column = sheet.animations[pose]?.frames[0] ?? 0;
  const row = sheet.directions === 8 ? FACING_CAMERA_ROW : 0;
  return { texture: sheet.key, frame: row * columns + column };
}
