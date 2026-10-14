import { describe, expect, it } from 'vitest';
import { BIOMES, BiomeId } from '@/config/biomeConfig';
import { PLAYER_COMBAT } from '@/config/combatConfig';
import { PLAYER_BASE_STATS, PLAYER_SIZE } from '@/config/gameConfig';
import { CocoonPhase, CocoonState, cocoonBlastCatches } from '@/systems/Cocoons';

const CONFIG = BIOMES[BiomeId.SpiderLair].cocoons!;
const SELF = { x: 100, y: 100 };
const FRAME = 16;

describe('CocoonState — kokon budzony bliskością albo trafieniem', () => {
  it('śpi, dopóki gracz jest dalej niż triggerRadius', () => {
    const cocoon = new CocoonState(CONFIG);
    for (let now = 0; now < 10_000; now += FRAME) {
      expect(cocoon.update(SELF, { x: SELF.x + CONFIG.triggerRadius + 1, y: SELF.y }, now)).toBe(false);
    }
    expect(cocoon.currentPhase).toBe(CocoonPhase.Dormant);
  });

  it('podejście budzi kokon, a wybuch następuje raz, po fuseMs — nawet gdy gracz odejdzie', () => {
    const cocoon = new CocoonState(CONFIG);
    expect(cocoon.update(SELF, { x: SELF.x + CONFIG.triggerRadius, y: SELF.y }, 1000)).toBe(false);
    expect(cocoon.burstAt).toBe(1000 + CONFIG.fuseMs);
    const bursts: number[] = [];
    for (let now = 1000 + FRAME; now < 5000; now += FRAME) if (cocoon.update(SELF, { x: 0, y: 0 }, now)) bursts.push(now);
    expect(bursts).toHaveLength(1);
    expect(bursts[0]).toBeGreaterThanOrEqual(1000 + CONFIG.fuseMs);
    expect(cocoon.currentPhase).toBe(CocoonPhase.Burst);
  });

  it('trafienie rozrywa kokon od razu i tylko raz (także w trakcie telegrafu)', () => {
    const asleep = new CocoonState(CONFIG);
    expect(asleep.hit(50)).toBe(true);
    expect(asleep.hit(60)).toBe(false);
    expect(asleep.update(SELF, SELF, 70)).toBe(false);

    const fusing = new CocoonState(CONFIG);
    fusing.update(SELF, SELF, 0);
    expect(fusing.hit(100)).toBe(true);
    for (let now = 100; now < 2000; now += FRAME) expect(fusing.update(SELF, SELF, now)).toBe(false);
  });

  it('martwy gracz (null) nie budzi kokonu', () => {
    const cocoon = new CocoonState(CONFIG);
    expect(cocoon.update(SELF, null, 0)).toBe(false);
    expect(cocoon.currentPhase).toBe(CocoonPhase.Dormant);
  });
});

describe('Wybuch kokonu — balans', () => {
  it('strefa łapie gracza stykającego się z nią', () => {
    const r = PLAYER_SIZE / 2;
    expect(cocoonBlastCatches(SELF, CONFIG.blastRadius, { x: SELF.x + CONFIG.blastRadius + r, y: SELF.y }, r)).toBe(true);
    expect(cocoonBlastCatches(SELF, CONFIG.blastRadius, { x: SELF.x + CONFIG.blastRadius + r + 1, y: SELF.y }, r)).toBe(false);
  });

  it('kto wejdzie w kokon, nie ucieknie chodem (po reakcji ~200 ms), ale zdąży dashem', () => {
    const REACTION_MS = 200;
    const r = PLAYER_SIZE / 2;
    const escape = CONFIG.blastRadius + r - CONFIG.triggerRadius;
    const left = (CONFIG.fuseMs - REACTION_MS) / 1000;
    expect(PLAYER_BASE_STATS.moveSpeed * left).toBeLessThan(escape);
    const { speed, durationMs } = PLAYER_COMBAT.dash;
    expect(left).toBeGreaterThan(0);
    expect(speed * (durationMs / 1000)).toBeGreaterThan(escape);
  });

  it('strzał z dystansu sięga kokonu spoza strefy budzenia i wybuchu', () => {
    const { projectileSpeed, projectileLifetimeMs } = PLAYER_COMBAT.ranged;
    expect((projectileSpeed * projectileLifetimeMs) / 1000).toBeGreaterThan(CONFIG.blastRadius + PLAYER_SIZE);
  });

  it('wybuch wypuszcza pajączka i spowalnia, ale nie unieruchamia', () => {
    expect(CONFIG.spiderlings).toBeGreaterThanOrEqual(1);
    expect(CONFIG.slow.pct).toBeGreaterThan(0);
    expect(CONFIG.slow.pct).toBeLessThan(1);
  });
});
