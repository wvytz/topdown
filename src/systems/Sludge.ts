import type { AreaStrike, BossAttackPlan, SludgeCreepDefinition, SludgeDefinition, WebShot } from '@/core/bossTypes';
import { BossAttackKind } from '@/core/bossTypes';
import type { Vector2 } from '@/core/types';
import { heroGroundPoint } from '@/systems/Hurtbox';

/**
 * Szlam Króla Szlamu (krok 153, `#krol-szlamu`): kałuże po pluciu i szlam pełznący od ścian areny.
 * Czyste funkcje — warstwa Phasera rysuje dokładnie to, co tu liczy się jako zasięg.
 */

/** Kałuża szlamu w miejscu `center`, rozlana w chwili `at` (ten sam mechanizm co sieci i kałuże sprzątaczek). */
export function sludgePuddle(center: Vector2, radius: number, at: number, sludge: SludgeDefinition): WebShot {
  const { puddle } = sludge;
  return {
    from: center,
    to: center,
    telegraphStartAt: at,
    launchAt: at,
    landAt: at,
    startRadius: radius * puddle.startScale,
    maxRadius: radius,
    spreadMs: puddle.spreadMs,
    expiresAt: at + puddle.durationMs,
    slow: puddle.slow,
    look: 'sludge',
  };
}

/**
 * Dokłada do planu kałuże szlamu: w każdej strefie ataku, który ma promień w `puddleRadius` (rozbryzg wokół bossa,
 * skok, flegma). Ryk wściekłości nie pluje. Bez `sludge` — plan bez zmian.
 */
export function withSludgePuddles(plan: BossAttackPlan, sludge: SludgeDefinition | undefined): BossAttackPlan {
  if (!sludge || plan.kind === BossAttackKind.Roar) return plan;
  const radius = sludge.puddleRadius[plan.kind];
  if (radius === undefined || plan.strikes.length === 0) return plan;
  const puddles = plan.strikes.map((strike: AreaStrike) => sludgePuddle(strike.center, radius, strike.impactAt, sludge));
  return { ...plan, webs: [...plan.webs, ...puddles] };
}

/** Prostokąt podłogi areny w px (lewy, górny, prawy, dolny brzeg). */
export interface ArenaRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * Docelowa głębokość szlamu od ścian (px): większy z postępów — czas walki i utracone HP bossa — razy `maxDepthPx`.
 */
export function creepTargetDepth(elapsedMs: number, hpRatio: number, creep: SludgeCreepDefinition): number {
  const byTime = creep.fullAfterMs > 0 ? Math.max(0, elapsedMs) / creep.fullAfterMs : 1;
  const byHp = creep.hpLostForFull > 0 ? (1 - Math.max(0, Math.min(1, hpRatio))) / creep.hpLostForFull : 1;
  return Math.min(1, Math.max(byTime, byHp)) * creep.maxDepthPx;
}

/** Widoczna głębokość dogania cel najwyżej `growPxPerSec` (szlam pełznie, nie skacze); nigdy się nie cofa. */
export function stepCreepDepth(current: number, target: number, dtMs: number, creep: SludgeCreepDefinition): number {
  if (target <= current) return current;
  return Math.min(target, current + (creep.growPxPerSec * Math.max(0, dtMs)) / 1000);
}

/** Fala brzegu (-1..1) w punkcie `s` px wzdłuż ściany; `phase` różni cztery ściany, by nie były identyczne. */
function wave(s: number, wavelength: number, phase: number): number {
  const k = (Math.PI * 2) / Math.max(1, wavelength);
  return 0.6 * Math.sin(s * k + phase) + 0.4 * Math.sin(s * k * 2.7 + phase * 1.9 + 1.7);
}

/** Zasięg szlamu od jednej ściany w punkcie `s` wzdłuż niej: od (1 − amp)·depth do depth — nigdy więcej niż depth. */
export function creepReach(depth: number, s: number, phase: number, creep: SludgeCreepDefinition): number {
  if (depth <= 0) return 0;
  const { amp, wavelengthPx } = creep.wobble;
  return depth * (1 - amp * (0.5 + 0.5 * wave(s, wavelengthPx, phase)));
}

/** Fazy fal czterech ścian: górna, prawa, dolna, lewa. */
const EDGE_PHASES = [0.3, 2.1, 4.4, 5.6] as const;

/**
 * Jak głęboko punkt leży w szlamie (px, > 0 = w szlamie): największa nadwyżka zasięgu nad odległością od ściany
 * spośród czterech ścian. Poza prostokątem areny — `-Infinity` (tam szlamu nie liczymy). Warstwa Phasera rysuje
 * szlam w każdym pikselu z wartością > 0, więc rysunek to dokładny zasięg spowolnienia.
 */
export function creepCoverage(point: Vector2, arena: ArenaRect, depth: number, creep: SludgeCreepDefinition): number {
  const { x, y } = point;
  if (x < arena.left || x > arena.right || y < arena.top || y > arena.bottom || depth <= 0) return -Infinity;
  const top = creepReach(depth, x - arena.left, EDGE_PHASES[0], creep) - (y - arena.top);
  const right = creepReach(depth, y - arena.top, EDGE_PHASES[1], creep) - (arena.right - x);
  const bottom = creepReach(depth, x - arena.left, EDGE_PHASES[2], creep) - (arena.bottom - y);
  const left = creepReach(depth, y - arena.top, EDGE_PHASES[3], creep) - (x - arena.left);
  return Math.max(top, right, bottom, left);
}

/** Czy bohater stoi w szlamie przy ścianie (ślad stóp, jak strefy na ziemi z kroku 110). */
export function isHeroInCreep(hero: Vector2, arena: ArenaRect, depth: number, creep: SludgeCreepDefinition): boolean {
  return creepCoverage(heroGroundPoint(hero), arena, depth, creep) > 0;
}

/** Kałuże ponad limit: najstarsze (z początku listy) do usunięcia. */
export function puddlesOverLimit<T>(puddles: readonly T[], max: number): T[] {
  return puddles.slice(0, Math.max(0, puddles.length - Math.max(0, max)));
}

/**
 * Arkusz i całkowita skala rozbryzgu dla strefy `radius`: największa średnica rozmiar × skala (skala 1–4), która nie
 * przekracza średnicy strefy o więcej niż `slackPx`; strefa mniejsza od najmniejszego arkusza — najmniejszy, skala 1.
 */
export function splashSpriteFor(radius: number, sizes: readonly number[], slackPx: number): { readonly size: number; readonly scale: number } {
  const limit = radius * 2 + slackPx;
  let best: { size: number; scale: number } | null = null;
  for (const size of sizes) {
    for (let scale = 1; scale <= 4; scale++) {
      const d = size * scale;
      if (d > limit) break;
      if (!best || d > best.size * best.scale || (d === best.size * best.scale && scale < best.scale)) best = { size, scale };
    }
  }
  return best ?? { size: Math.min(...sizes), scale: 1 };
}

/**
 * Głębokość, od której punkt leży w szlamie (px): najmniejsze d/f po czterech ścianach, gdzie d — odległość od ściany,
 * f — kształt fali brzegu (zasięg przy głębokości 1). `creepCoverage(p, depth) > 0` ⇔ `depth > creepThreshold(p)`.
 * Warstwa Phasera liczy ją raz na piksel i przy wzroście szlamu tylko porównuje. Poza areną — `Infinity`.
 * `wallFactor` — współczynnik f ściany, która wyznaczyła próg (grubość warstwy szlamu ≈ f·(depth − próg)).
 */
export function creepThreshold(point: Vector2, arena: ArenaRect, creep: SludgeCreepDefinition): { readonly depth: number; readonly wallFactor: number } {
  const { x, y } = point;
  if (x < arena.left || x > arena.right || y < arena.top || y > arena.bottom) return { depth: Infinity, wallFactor: 1 };
  const edges: ReadonlyArray<readonly [number, number, number]> = [
    [y - arena.top, x - arena.left, EDGE_PHASES[0]],
    [arena.right - x, y - arena.top, EDGE_PHASES[1]],
    [arena.bottom - y, x - arena.left, EDGE_PHASES[2]],
    [x - arena.left, y - arena.top, EDGE_PHASES[3]],
  ];
  let depth = Infinity;
  let wallFactor = 1;
  for (const [d, s, phase] of edges) {
    const f = creepReach(1, s, phase, creep);
    const t = d / f;
    if (t < depth) {
      depth = t;
      wallFactor = f;
    }
  }
  return { depth, wallFactor };
}
