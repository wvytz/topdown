import { describe, expect, it } from 'vitest';
import { EliteAffix, EnemyAttackKind, EnemyType, EnemyVariant } from '@/core/combatTypes';
import { ENEMY_DEFINITIONS, ENEMY_VARIANTS } from '@/config/combatConfig';
import { ELITE_CONFIG } from '@/config/eliteConfig';
import { applyElite, bombDamageToShielded } from '@/systems/Elites';
import { enemyDefinitionFor } from '@/systems/EnemyVariants';
import { ChargeOutcome, ChargePhase, ShieldCharge } from '@/systems/ShieldCharge';

const CFG = ELITE_CONFIG.shield.charge;
const SELF = { x: 0, y: 0 };
const EAST = 0;
const TARGET = { x: (CFG.minRange + CFG.maxRange) / 2, y: 0 };

/** Szarża wystartowana w chwili 0 na cel na wschodzie; zwraca chwilę początku biegu. */
function started(): { charge: ShieldCharge; runAt: number } {
  const charge = new ShieldCharge(CFG);
  expect(charge.canStart(0, SELF, TARGET, true, EAST)).toBe(true);
  charge.start(0, SELF, TARGET);
  return { charge, runAt: CFG.windupMs };
}

describe('szarża Tarczownika (krok 99)', () => {
  it('rusza tylko na widocznego gracza w zasięgu i przed tarczą', () => {
    const charge = new ShieldCharge(CFG);
    expect(charge.canStart(0, SELF, TARGET, false, EAST)).toBe(false);
    expect(charge.canStart(0, SELF, { x: CFG.minRange - 10, y: 0 }, true, EAST)).toBe(false); // za blisko — zwykły cios
    expect(charge.canStart(0, SELF, { x: CFG.maxRange + 10, y: 0 }, true, EAST)).toBe(false);
    // Gracz z boku/za plecami: najpierw powolny obrót tarczy, bez szarży od razu.
    expect(charge.canStart(0, SELF, { x: 0, y: 120 }, true, EAST)).toBe(false);
    expect(charge.canStart(0, SELF, { x: -120, y: 0 }, true, EAST)).toBe(false);
  });

  it('zamach (telegraf) stoi przez windupMs, potem bieg po zapamiętanym kierunku', () => {
    const { charge, runAt } = started();
    expect(charge.phase(runAt - 1)).toBe(ChargePhase.Windup);
    expect(charge.isBusy(runAt - 1)).toBe(true);
    expect(charge.phase(runAt)).toBe(ChargePhase.Charging);
    expect(charge.direction.x).toBeCloseTo(1);
    const lane = charge.lane(SELF);
    expect(lane.to.x).toBeCloseTo(CFG.maxDistance);
  });

  it('unik: ściana po okresie łaski ogłusza na wallStunMs, potem przerwa', () => {
    const { charge, runAt } = started();
    charge.phase(runAt);
    // Tuż po starcie ściana się nie liczy (odklejanie od przeszkody).
    expect(charge.advance(runAt + CFG.wallGraceMs - 1, { x: 5, y: 0 }, true)).toBe(ChargeOutcome.Continue);
    const hitAt = runAt + 300;
    expect(charge.advance(hitAt, { x: 100, y: 0 }, true)).toBe(ChargeOutcome.Wall);
    expect(charge.phase(hitAt + CFG.wallStunMs - 1)).toBe(ChargePhase.Stunned);
    expect(charge.phase(hitAt + CFG.wallStunMs)).toBe(ChargePhase.Ready);
    // Odnowienie liczy się od końca ogłuszenia.
    const later = hitAt + CFG.wallStunMs + CFG.cooldownMs;
    expect(charge.canStart(later - 1, SELF, TARGET, true, EAST)).toBe(false);
    expect(charge.canStart(later, SELF, TARGET, true, EAST)).toBe(true);
  });

  it('wybieg bez ściany kończy się postojem (krótszym niż ogłuszenie)', () => {
    const { charge, runAt } = started();
    charge.phase(runAt);
    expect(charge.advance(runAt + 100, { x: CFG.maxDistance, y: 0 }, false)).toBe(ChargeOutcome.Spent);
    expect(charge.phase(runAt + 100)).toBe(ChargePhase.Recovering);
    expect(CFG.missRecoveryMs).toBeLessThan(CFG.wallStunMs);
  });

  it('zablokowany bez ściany (np. przez innego wroga) nie biegnie w nieskończoność', () => {
    const { charge, runAt } = started();
    charge.phase(runAt);
    const maxMs = (CFG.maxDistance / CFG.speed) * 1000 * 1.5;
    expect(charge.advance(runAt + maxMs - 1, { x: 10, y: 0 }, false)).toBe(ChargeOutcome.Continue);
    expect(charge.advance(runAt + maxMs, { x: 10, y: 0 }, false)).toBe(ChargeOutcome.Spent);
  });

  it('trafienie gracza kończy szarżę krótkim postojem', () => {
    const { charge, runAt } = started();
    charge.phase(runAt);
    charge.registerHit(runAt + 100);
    expect(charge.hasHit).toBe(true);
    expect(charge.phase(runAt + 100)).toBe(ChargePhase.Recovering);
    expect(charge.phase(runAt + 100 + CFG.hitRecoveryMs)).toBe(ChargePhase.Ready);
  });

  it('balans: szarża daje się ominąć, a tarcza obraca się wolniej niż gracz obiega z bliska', () => {
    expect(CFG.windupMs).toBeGreaterThanOrEqual(600);
    expect(CFG.wallStunMs).toBeGreaterThan(CFG.windupMs);
    // Gracz (ok. 160 px/s) obiega go w odległości 60 px szybciej (ok. 150°/s), niż obraca się tarcza.
    expect(ELITE_CONFIG.shield.turnRateDegPerSec).toBeLessThan(((160 / 60) * 180) / Math.PI / 2);
  });
});

describe('Tarczownik — definicja i bomby (krok 99)', () => {
  it('ogar z tarczą nie skacze — dostaje zwykły cios', () => {
    const hound = enemyDefinitionFor(ENEMY_DEFINITIONS[EnemyType.Rusher], EnemyVariant.Hellhound, ENEMY_VARIANTS);
    expect(hound.attack.kind).toBe(EnemyAttackKind.Pounce);
    const shielded = applyElite(hound, [EliteAffix.Shielded], ELITE_CONFIG);
    expect(shielded.attack.kind).toBe(EnemyAttackKind.Melee);
    expect(shielded.attack.damage).toBe(Math.round(hound.attack.damage * ELITE_CONFIG.damageMultiplier));
    // Inne cechy nie ruszają skoku.
    expect(applyElite(hound, [EliteAffix.Swift], ELITE_CONFIG).attack.kind).toBe(EnemyAttackKind.Pounce);
  });

  it('bomba rani Tarczownika z mnożnikiem, co najmniej 1', () => {
    expect(bombDamageToShielded(10, ELITE_CONFIG)).toBe(Math.round(10 * ELITE_CONFIG.shield.bombDamageMultiplier));
    expect(bombDamageToShielded(0, ELITE_CONFIG)).toBe(1);
  });
});
