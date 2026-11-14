import { describe, expect, it } from 'vitest';
import { COMBAT_WEIGHT_CONFIG } from '@/config/combatWeightConfig';
import { AimPhase, PunishPlanner, piercingAimPhase, punishKindFor, type PunishCandidate } from '@/ai/PunishPlanner';
import { PunishKind } from '@/core/combatWeightTypes';
import { EnemyType } from '@/core/combatTypes';
import { createRng } from '@/core/random';

const { punish } = COMBAT_WEIGHT_CONFIG;
const hero = { x: 0, y: 0 };
const at = (who: string, type: EnemyType, x: number, canSee = true): PunishCandidate<string> => ({ who, type, position: { x, y: 0 }, canSee });

describe('atak kary — kto karze', () => {
  it('Kiter strzela, Rusher i Czyhacz taranują, Gniazdownik nie karze', () => {
    expect(punishKindFor(EnemyType.Kiter)).toBe(PunishKind.PiercingShot);
    expect(punishKindFor(EnemyType.Rusher)).toBe(PunishKind.Ram);
    expect(punishKindFor(EnemyType.Lurker)).toBe(PunishKind.Ram);
    expect(punishKindFor(EnemyType.Nester)).toBeNull();
  });

  it('strzelec z linią wzroku ma pierwszeństwo przed taranem', () => {
    const planner = new PunishPlanner(punish, createRng(1));
    const pick = planner.plan(0, hero, [at('rusher', EnemyType.Rusher, 100), at('kiter', EnemyType.Kiter, 200)]);
    expect(pick).toEqual({ who: 'kiter', kind: PunishKind.PiercingShot });
  });

  it('bez linii wzroku i poza zasięgiem nikt nie karze', () => {
    const planner = new PunishPlanner(punish, createRng(1));
    const far = punish.piercingShot.maxRange + 1;
    expect(planner.plan(0, hero, [at('a', EnemyType.Kiter, 100, false), at('b', EnemyType.Kiter, far), at('c', EnemyType.Rusher, 10)])).toBeNull();
  });

  it('najwyżej jeden atak kary na `cooldownMs`', () => {
    const planner = new PunishPlanner(punish, createRng(1));
    const pool = [at('r', EnemyType.Rusher, 100)];
    expect(planner.plan(0, hero, pool)).not.toBeNull();
    expect(planner.plan(punish.cooldownMs - 1, hero, pool)).toBeNull();
    expect(planner.plan(punish.cooldownMs, hero, pool)).not.toBeNull();
  });

  it('ten sam seed — ten sam wybór', () => {
    const pool = ['a', 'b', 'c', 'd'].map((who, i) => at(who, EnemyType.Rusher, 60 + i * 20));
    const picks = (seed: number): string[] => {
      const planner = new PunishPlanner(punish, createRng(seed));
      return [0, 1, 2].map((i) => planner.plan(i * punish.cooldownMs, hero, pool)!.who);
    };
    expect(picks(7)).toEqual(picks(7));
  });
});

describe('przeszywający strzał — telegraf', () => {
  it('celownik idzie za bohaterem, ostatnie `freezeMs` stoi, potem strzał', () => {
    const shot = punish.piercingShot;
    expect(piercingAimPhase(0, shot)).toBe(AimPhase.Tracking);
    expect(piercingAimPhase(shot.aimMs - shot.freezeMs, shot)).toBe(AimPhase.Frozen);
    expect(piercingAimPhase(shot.aimMs, shot)).toBe(AimPhase.Fire);
  });
});
