import { describe, expect, it } from 'vitest';
import { PartnerBotBrain, type BotTarget, type BotWorld } from '@/ai/PartnerBotBrain';
import { PARTNER_BOT_CONFIG } from '@/config/partnerBotConfig';
import type { HeroKit } from '@/core/heroTypes';

type Overrides = {
  readonly now?: number;
  readonly self?: Partial<BotWorld['self']>;
  readonly leader?: Partial<BotWorld['leader']>;
  readonly targets?: readonly BotTarget[];
  readonly canSee?: BotWorld['canSee'];
};

/** Świat bez murów: bot w (0,0), gracz obok. */
function world(o: Overrides = {}, kit: HeroKit['kind'] = 'melee'): BotWorld {
  return {
    now: o.now ?? 0,
    self: { x: 0, y: 0, kit, downed: false, charges: 3, ultimateReady: false, ...o.self },
    leader: { x: 30, y: 0, downed: false, ...o.leader },
    targets: o.targets ?? [],
    canSee: o.canSee ?? (() => true),
    navigate: (_from, to) => to,
  };
}

const brain = () => new PartnerBotBrain(PARTNER_BOT_CONFIG);

describe('PartnerBotBrain', () => {
  it('w spokoju stoi przy graczu, a za daleko — idzie do niego', () => {
    expect(brain().decide(world()).actions.move).toEqual({ x: 0, y: 0 });
    const far = brain().decide(world({ leader: { x: 100, y: 0 } }));
    expect(far.mode).toBe('follow');
    expect(far.actions.move.x).toBeCloseTo(1);
  });

  it('powalony bot nic nie robi', () => {
    const d = brain().decide(world({ self: { downed: true }, targets: [{ x: 10, y: 0, radius: 8 }] }));
    expect(d.mode).toBe('downed');
    expect(d.actions.attack).toBe(false);
    expect(d.actions.move).toEqual({ x: 0, y: 0 });
  });

  it('powalony gracz — bot idzie go wskrzesić, nawet gdy obok są wrogowie', () => {
    const d = brain().decide(world({ leader: { x: 0, y: 80, downed: true }, targets: [{ x: -40, y: 0, radius: 8 }] }));
    expect(d.mode).toBe('revive');
    expect(d.actions.move.y).toBeCloseTo(1);
    // … i bije po drodze, co ma w zasięgu.
    const near = brain().decide(world({ leader: { x: 0, y: 80, downed: true }, targets: [{ x: -20, y: 0, radius: 8 }] }));
    expect(near.actions.attack).toBe(true);
  });

  it('stojąc na powalonym — nie odchodzi', () => {
    const d = brain().decide(world({ leader: { x: 4, y: 0, downed: true } }));
    expect(d.actions.move).toEqual({ x: 0, y: 0 });
  });

  it('wręcz: podchodzi do wroga i bije w zasięgu', () => {
    const approach = brain().decide(world({ targets: [{ x: 80, y: 0, radius: 8 }] }));
    expect(approach.mode).toBe('fight');
    expect(approach.actions.move.x).toBeCloseTo(1);
    expect(approach.actions.attack).toBe(false);
    const hit = brain().decide(world({ targets: [{ x: 20, y: 0, radius: 8 }] }));
    expect(hit.actions.attack).toBe(true);
    expect(hit.actions.aim).toEqual({ x: 20, y: 0 });
  });

  it('dystans: trzyma odstęp — cofa się od bliskiego wroga i strzela', () => {
    const d = brain().decide(world({ targets: [{ x: 40, y: 0, radius: 8 }] }, 'archery'));
    expect(d.actions.move.x).toBeLessThan(0);
    expect(d.actions.attack).toBe(true);
    const sorc = brain().decide(world({ targets: [{ x: 150, y: 0, radius: 8 }] }, 'sorcery'));
    expect(sorc.actions.attack).toBe(true);
    expect(sorc.actions.shoot).toBe(false);
  });

  it('nie goni wrogów daleko od gracza ani za murem', () => {
    const away = brain().decide(world({ leader: { x: -100, y: 0 }, targets: [{ x: 190, y: 0, radius: 8 }] }));
    expect(away.mode).not.toBe('fight');
    const hidden = brain().decide(world({ targets: [{ x: 50, y: 0, radius: 8 }], canSee: () => false }));
    expect(hidden.mode).toBe('follow');
  });

  it('gracz za daleko — przerywa walkę i wraca', () => {
    const d = brain().decide(world({ leader: { x: -200, y: 0 }, targets: [{ x: 20, y: 0, radius: 8 }] }));
    expect(d.mode).toBe('regroup');
    expect(d.actions.move.x).toBeLessThan(0);
  });

  it('ultimate przy tłumie albo bossie, tylko gdy gotowe', () => {
    const crowd = [0, 1, 2].map((i) => ({ x: 20, y: i * 10, radius: 8 }));
    expect(brain().decide(world({ self: { ultimateReady: true }, targets: crowd })).actions.ultimate).toBe(true);
    expect(brain().decide(world({ self: { ultimateReady: false }, targets: crowd })).actions.ultimate).toBe(false);
    expect(brain().decide(world({ self: { ultimateReady: true }, targets: [{ x: 20, y: 0, radius: 8 }] })).actions.ultimate).toBe(false);
    expect(brain().decide(world({ self: { ultimateReady: true }, targets: [{ x: 40, y: 0, radius: 24 }] })).actions.ultimate).toBe(true);
  });

  it('daleko w tyle przez dłuższą chwilę — prosi o teleport do gracza', () => {
    const b = brain();
    const far = { leader: { x: 400, y: 0 } };
    expect(b.decide(world({ ...far, now: 0 })).warp).toBeNull();
    expect(b.decide(world({ ...far, now: PARTNER_BOT_CONFIG.warpAfterMs - 1 })).warp).toBeNull();
    expect(b.decide(world({ ...far, now: PARTNER_BOT_CONFIG.warpAfterMs })).warp).toEqual({ x: 400, y: 0 });
  });

  it('utknięty (chce iść, a stoi) — teleport po czasie', () => {
    const b = brain();
    const at = { leader: { x: 120, y: 0 } };
    expect(b.decide(world({ ...at, now: 0 })).warp).toBeNull();
    expect(b.decide(world({ ...at, now: PARTNER_BOT_CONFIG.stuckMs })).warp).toEqual({ x: 120, y: 0 });
  });

  it('dash doganiania z odnowieniem', () => {
    const b = brain();
    const far = { leader: { x: 220, y: 0 } };
    expect(b.decide(world({ ...far, now: 0 })).actions.dash).toBe(true);
    expect(b.decide(world({ ...far, now: 100 })).actions.dash).toBe(false);
    expect(b.decide(world({ ...far, now: PARTNER_BOT_CONFIG.dashCooldownMs })).actions.dash).toBe(true);
  });
});
