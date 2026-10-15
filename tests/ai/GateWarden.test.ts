import { describe, expect, it } from 'vitest';
import { BossAttackKind, BossId } from '@/core/bossTypes';
import { GATE_WARDEN, bossForFloor } from '@/config/bossConfig';
import { BOSS_VISUALS, SPRITE_SHEETS } from '@/config/spriteConfig';

describe('Strażnik Bram (krok 41e)', () => {
  it('kończy piętro 5 (Piekło); piętro 6 do czasu Kata ma Strażnika Piętra', () => {
    expect(bossForFloor(5).id).toBe(BossId.GateWarden);
    expect(bossForFloor(6).id).toBe(BossId.FloorGuardian);
  });

  it('ma tarczę z przodu: stożek węższy niż pół okręgu (da się go obejść), obraca się wolniej niż gracz go okrąża', () => {
    const shield = GATE_WARDEN.shield;
    expect(shield.arcDeg).toBeGreaterThan(60);
    expect(shield.arcDeg).toBeLessThan(180);
    // Gracz (200 px/s) okrążający bossa w odległości ok. 80 px obiega go szybciej, niż tarcza się obraca.
    const playerDegPerSec = ((200 / 80) * 180) / Math.PI;
    expect(shield.turnRateDegPerSec).toBeLessThan(playerDegPerSec);
    expect(shield.frontMeleeMultiplier).toBeLessThan(1);
  });

  it('wzór: wirujący łańcuch dookoła (karze stanie za plecami) i uderzenie tarczą przed sobą', () => {
    expect(GATE_WARDEN.pattern).toEqual(expect.arrayContaining([BossAttackKind.Slam, BossAttackKind.Cleave]));
    expect(GATE_WARDEN.slam.radius).toBeGreaterThan(GATE_WARDEN.radius * 2);
  });

  it('wygląd: animacje ataków istnieją w arkuszu', () => {
    const visual = BOSS_VISUALS[BossId.GateWarden];
    const animations: Readonly<Record<string, unknown>> = SPRITE_SHEETS[visual.sheet].animations;
    for (const name of Object.values(visual.attacks)) expect(animations).toHaveProperty(name!);
  });
});
