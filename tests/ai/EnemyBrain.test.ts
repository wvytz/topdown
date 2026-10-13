import { describe, expect, it } from 'vitest';
import type { BrainInput } from '@/ai/EnemyBrain';
import { EnemyBrain } from '@/ai/EnemyBrain';
import { AttackPhase, EnemyState, EnemyType } from '@/core/combatTypes';
import { ENEMY_DEFINITIONS } from '@/config/combatConfig';
import type { MovementIntent } from '@/core/types';

const SELF = { x: 0, y: 0 };
const rusherDef = ENEMY_DEFINITIONS[EnemyType.Rusher];
const kiterDef = ENEMY_DEFINITIONS[EnemyType.Kiter];

const newRusher = (): EnemyBrain => new EnemyBrain(rusherDef.behaviour, rusherDef.attack.range);
const newKiter = (): EnemyBrain => new EnemyBrain(kiterDef.behaviour, kiterDef.attack.range);

const input = (target: { x: number; y: number }, overrides: Partial<BrainInput> = {}): BrainInput => ({
  self: SELF,
  target,
  canSeeTarget: true,
  attackPhase: AttackPhase.Ready,
  ...overrides,
});

/** Porównanie kierunku po składowych (toEqual odróżnia 0 od -0, a dla ruchu to bez znaczenia). */
function expectMove(move: MovementIntent, expected: MovementIntent): void {
  expect(move.x).toBeCloseTo(expected.x);
  expect(move.y).toBeCloseTo(expected.y);
}

describe('EnemyBrain — Rusher', () => {
  it('IDLE, gdy gracz jest poza zasięgiem wykrycia albo za ścianą', () => {
    const brain = newRusher();
    expect(brain.think(input({ x: rusherDef.behaviour.aggroRange + 50, y: 0 })).state).toBe(EnemyState.Idle);
    expect(brain.think(input({ x: 100, y: 0 }, { canSeeTarget: false })).state).toBe(EnemyState.Idle);
  });

  it('CHASE w stronę widocznego gracza', () => {
    const decision = newRusher().think(input({ x: 200, y: 0 }));
    expect(decision.state).toBe(EnemyState.Chase);
    expectMove(decision.move, { x: 1, y: 0 });
  });

  it('ATTACK z bliska — zaczyna atak i stoi w miejscu', () => {
    const decision = newRusher().think(input({ x: rusherDef.attack.range - 5, y: 0 }));
    expect(decision.state).toBe(EnemyState.Attack);
    expect(decision.startAttack).toBe(true);
    expectMove(decision.move, { x: 0, y: 0 });
  });

  it('nie zaczyna kolejnego ataku w trakcie odnowienia', () => {
    const decision = newRusher().think(input({ x: 10, y: 0 }, { attackPhase: AttackPhase.Recovery }));
    expect(decision.startAttack).toBe(false);
  });

  it('w trakcie zamachu (telegraf) stoi w miejscu, nawet jeśli gracz ucieka', () => {
    const brain = newRusher();
    brain.think(input({ x: 20, y: 0 }));
    const decision = brain.think(input({ x: 150, y: 0 }, { attackPhase: AttackPhase.Windup }));
    expectMove(decision.move, { x: 0, y: 0 });
    expect(decision.startAttack).toBe(false);
  });

  it('po utracie linii wzroku idzie do ostatniej znanej pozycji, potem wraca do IDLE', () => {
    const brain = newRusher();
    brain.think(input({ x: 100, y: 0 }));
    const searching = brain.think(input({ x: 100, y: 80 }, { canSeeTarget: false }));
    expect(searching.state).toBe(EnemyState.Chase);
    expectMove(searching.move, { x: 1, y: 0 });

    const arrived = brain.think(input({ x: 100, y: 80 }, { canSeeTarget: false, self: { x: 98, y: 0 } }));
    expect(arrived.state).toBe(EnemyState.Idle);
    expectMove(arrived.move, { x: 0, y: 0 });
  });

  it('raz zaalarmowany ściga gracza także poza zasięgiem wykrycia', () => {
    const brain = newRusher();
    brain.think(input({ x: 200, y: 0 }));
    const far = brain.think(input({ x: rusherDef.behaviour.aggroRange + 100, y: 0 }));
    expect(far.state).toBe(EnemyState.Chase);
  });

  it('alert() (np. po trafieniu) budzi przeciwnika i kieruje go do źródła', () => {
    const brain = newRusher();
    brain.alert({ x: 0, y: 300 });
    const decision = brain.think(input({ x: 0, y: 300 }, { canSeeTarget: false }));
    expect(decision.state).toBe(EnemyState.Chase);
    expectMove(decision.move, { x: 0, y: 1 });
  });
});

describe('EnemyBrain — Kiter', () => {
  const kiting = kiterDef.behaviour.kiting!;

  it('ucieka, gdy gracz jest za blisko, i jednocześnie strzela', () => {
    const decision = newKiter().think(input({ x: kiting.retreatRange - 10, y: 0 }));
    expect(decision.state).toBe(EnemyState.Attack);
    expectMove(decision.move, { x: -1, y: 0 });
    expect(decision.startAttack).toBe(true);
  });

  it('podchodzi, gdy jest dalej niż preferowany dystans', () => {
    const decision = newKiter().think(input({ x: kiting.preferredRange + 20, y: 0 }));
    expectMove(decision.move, { x: 1, y: 0 });
  });

  it('stoi w preferowanej strefie', () => {
    const between = (kiting.retreatRange + kiting.preferredRange) / 2;
    expectMove(newKiter().think(input({ x: between, y: 0 })).move, { x: 0, y: 0 });
  });
});

describe('EnemyBrain — reguła widoku (zoom 2,0)', () => {
  const view = { halfX: 210, halfY: 112.5, margin: 16, retreatSlack: 8 };
  const viewKiter = (): EnemyBrain => new EnemyBrain(kiterDef.behaviour, kiterDef.attack.range, view);

  it('Kiter w zasięgu strzału, ale poza ekranem (pionowo) nie strzela, tylko podchodzi', () => {
    const decision = viewKiter().think(input({ x: 0, y: 150 }));
    expect(150).toBeLessThan(kiterDef.attack.range);
    expect(decision.state).toBe(EnemyState.Chase);
    expect(decision.startAttack).toBe(false);
    expectMove(decision.move, { x: 0, y: 1 });
  });

  it('w widocznym prostokącie strzela jak dotąd (poziomo widać dalej niż pionowo)', () => {
    const decision = viewKiter().think(input({ x: 180, y: 0 }));
    expect(decision.state).toBe(EnemyState.Attack);
    expect(decision.startAttack).toBe(true);
  });

  it('bez reguły widoku zachowanie bez zmian (strzał spoza ekranu możliwy)', () => {
    expect(newKiter().think(input({ x: 0, y: 150 })).state).toBe(EnemyState.Attack);
  });

  it('ucieczka nie wyprowadza poza ekran: składowa ku krawędzi jest zerowana', () => {
    // Gracz 90 px nad wrogiem (granica pionowa 112,5 − 16 − 8 = 88,5): ucieczka w dół zablokowana.
    const atEdge = viewKiter().think(input({ x: 0, y: -90 }));
    expect(atEdge.state).toBe(EnemyState.Attack);
    expectMove(atEdge.move, { x: 0, y: 0 });
    // Daleko od krawędzi ucieka normalnie, od gracza.
    const free = viewKiter().think(input({ x: 60, y: 0 }));
    expectMove(free.move, { x: -1, y: 0 });
  });

  it('ucieczka po skosie przy krawędzi zachowuje składową, która nie wychodzi poza ekran', () => {
    const decision = viewKiter().think(input({ x: 50, y: -95 }));
    expect(decision.move.y).toBe(0);
    expect(decision.move.x).toBeLessThan(0);
  });
});
