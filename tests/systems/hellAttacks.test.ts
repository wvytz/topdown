import { describe, expect, it } from 'vitest';
import { EnemyAttackKind, EnemyType, EnemyVariant } from '@/core/combatTypes';
import { BIOMES, BiomeId } from '@/config/biomeConfig';
import { ENEMY_DEFINITIONS, ENEMY_VARIANTS } from '@/config/combatConfig';
import { enemyDefinitionFor } from '@/systems/EnemyVariants';
import { FirePatchField, lobPosition, pounceDurationMs, pounceLanding, trailPoints } from '@/systems/HellAttacks';

const hound = enemyDefinitionFor(ENEMY_DEFINITIONS[EnemyType.Rusher], EnemyVariant.Hellhound, ENEMY_VARIANTS);
const cultist = enemyDefinitionFor(ENEMY_DEFINITIONS[EnemyType.Kiter], EnemyVariant.Cultist, ENEMY_VARIANTS);

describe('wrogowie Piekła (krok 41d)', () => {
  it('Piekło: ogar to Rusher, kultysta to Kiter', () => {
    const hell = BIOMES[BiomeId.Infernal];
    expect(hell.enemyVariants[EnemyType.Rusher]).toBe(EnemyVariant.Hellhound);
    expect(hell.enemyVariants[EnemyType.Kiter]).toBe(EnemyVariant.Cultist);
  });

  it('ogar szybszy od zwykłego Rushera, skacze; kultysta rzuca łukiem', () => {
    expect(hound.moveSpeed).toBeGreaterThan(ENEMY_DEFINITIONS[EnemyType.Rusher].moveSpeed);
    expect(hound.attack.kind).toBe(EnemyAttackKind.Pounce);
    expect(cultist.attack.kind).toBe(EnemyAttackKind.Lob);
  });

  it('telegrafy dają czas na reakcję: zamach skoku i lot bomby', () => {
    expect(hound.attack.windupMs).toBeGreaterThanOrEqual(400);
    if (cultist.attack.kind === EnemyAttackKind.Lob) expect(cultist.attack.windupMs + cultist.attack.flightMs).toBeGreaterThanOrEqual(1000);
  });
});

describe('skok ogara', () => {
  it('ląduje w celu, a dalej niż zasięg — w zasięgu, po prostej', () => {
    expect(pounceLanding({ x: 0, y: 0 }, { x: 50, y: 0 }, 140)).toEqual({ x: 50, y: 0 });
    const far = pounceLanding({ x: 0, y: 0 }, { x: 300, y: 400 }, 100);
    expect(Math.hypot(far.x, far.y)).toBeCloseTo(100);
    expect(far.y / far.x).toBeCloseTo(400 / 300);
  });

  it('czas skoku z długości i prędkości', () => {
    expect(pounceDurationMs({ x: 0, y: 0 }, { x: 460, y: 0 }, 460)).toBeCloseTo(1000);
    expect(pounceDurationMs({ x: 0, y: 0 }, { x: 0, y: 0 }, 460)).toBe(16);
  });

  it('smuga: punkty co ok. `spacing` wzdłuż toru, z końcem', () => {
    const pts = trailPoints({ x: 0, y: 0 }, { x: 70, y: 0 }, 14);
    expect(pts).toHaveLength(5);
    expect(pts.at(-1)).toEqual({ x: 70, y: 0 });
  });
});

describe('rzut łukiem', () => {
  it('start i koniec na podłodze, najwyżej w połowie lotu', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 100, y: 0 };
    expect(lobPosition(from, to, 0, 28).height).toBe(0);
    expect(lobPosition(from, to, 1, 28)).toMatchObject({ x: 100, y: 0, height: 0 });
    expect(lobPosition(from, to, 0.5, 28).height).toBeCloseTo(28);
  });
});

describe('płonące ślady', () => {
  it('parzą gracza w środku, wygasają po czasie; najmocniejszy ślad wygrywa', () => {
    const field = new FirePatchField();
    field.add({ x: 0, y: 0 }, { radius: 10, durationMs: 1000, damage: 4 }, 0);
    field.add({ x: 5, y: 0 }, { radius: 10, durationMs: 500, damage: 6 }, 0);
    expect(field.update({ x: 3, y: 0 }, 100)).toBe(6);
    expect(field.update({ x: 30, y: 0 }, 100)).toBe(0);
    expect(field.update({ x: 0, y: 0 }, 600)).toBe(4);
    expect(field.update({ x: 0, y: 0 }, 1000)).toBe(0);
    expect(field.patches).toHaveLength(0);
    expect(field.update(null, 0)).toBe(0);
  });
});
