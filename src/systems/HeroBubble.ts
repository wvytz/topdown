import type { Vector2 } from '@/core/types';

/** Liczby „żelowego” odpychania bohaterów (krok 152) — w `config/coopConfig.ts`. */
export interface HeroBubbleConfig {
  /** Bańka bohatera jest o tyle px większa od ciała — odpychanie zaczyna się tuż przed zetknięciem. */
  readonly paddingPx: number;
  /** Siła sprężyny: prędkość odpychania (px/s) za każdy px nachodzenia. */
  readonly stiffness: number;
  /** Najwyższa prędkość odpychania (px/s) — mniejsza od chodu, więc da się przecisnąć obok partnera. */
  readonly maxPushSpeed: number;
  /** Najkrótsza przerwa między „plumknięciami” (dźwięk, kółko na wodzie), ms. */
  readonly bounceGapMs: number;
}

export interface BubbleBody {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export interface BubblePush {
  /** Dodatek do prędkości pierwszego bohatera (px/s); drugi dostaje przeciwny. */
  readonly push: Vector2;
  /** Ile px bańki na siebie nachodzą (0 — nie stykają się). */
  readonly overlap: number;
}

/**
 * Bohaterowie jak bańki żelu (krok 152, pomysł właściciela): zamiast twardej kolizji mogą lekko na siebie najść,
 * a sprężyna łagodnie ich rozpycha. Odpychanie rośnie z nachodzeniem, ale ma limit poniżej prędkości chodu —
 * w wąskim korytarzu jeden przeciśnie się obok drugiego, czując opór. Czysta logika.
 */
export function bubblePush(a: BubbleBody, b: BubbleBody, config: HeroBubbleConfig): BubblePush {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dist = Math.hypot(dx, dy);
  const overlap = a.radius + b.radius + config.paddingPx * 2 - dist;
  if (overlap <= 0) return { push: { x: 0, y: 0 }, overlap: 0 };
  // Dokładnie w jednym miejscu: rozsuwamy w poziomie.
  const nx = dist > 0.001 ? dx / dist : 1;
  const ny = dist > 0.001 ? dy / dist : 0;
  const speed = Math.min(config.maxPushSpeed, overlap * config.stiffness);
  return { push: { x: nx * speed, y: ny * speed }, overlap };
}

/**
 * Pamięta, czy bańki się stykały — „plumknięcie” (dźwięk, kółko) tylko przy nowym zetknięciu i nie częściej
 * niż co `bounceGapMs`.
 */
export class BubbleContact {
  private touching = false;
  private lastBounceAt = Number.NEGATIVE_INFINITY;

  /** Zwraca true, gdy właśnie doszło do nowego zetknięcia, które ma „plumknąć”. */
  update(overlap: number, now: number, config: HeroBubbleConfig): boolean {
    const touching = overlap > 0;
    const started = touching && !this.touching;
    this.touching = touching;
    if (!started || now - this.lastBounceAt < config.bounceGapMs) return false;
    this.lastBounceAt = now;
    return true;
  }
}
