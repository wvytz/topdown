import { describe, expect, it } from 'vitest';
import { HeroId } from '@/core/heroTypes';
import { RunMode } from '@/core/runMode';
import type { FloorSceneData } from '@/core/types';
import { HERO_ORDER, parseHeroId } from '@/config/heroConfig';
import { newRun } from '@/systems/RunState';
import { isBotCoop, parseBotParam, withPartnerBot } from '@/systems/PartnerBot';
import { DEFAULT_COOP_DEVICES, SOLO_DEVICES } from '@/systems/coopDevices';

const solo = (mode = RunMode.Tower): FloorSceneData => ({ runSeed: 1, floor: 1, run: newRun(HeroId.Barbarian, false, mode) });

describe('parseBotParam', () => {
  it('bez parametru albo z 0 — tryb wyłączony', () => {
    expect(parseBotParam('', 'bot', parseHeroId)).toBeNull();
    expect(parseBotParam('?bot=0', 'bot', parseHeroId)).toBeNull();
  });

  it('?bot=1 — bohater dobrany sam, ?bot=archer — wybrany', () => {
    expect(parseBotParam('?bot=1', 'bot', parseHeroId)).toEqual({ hero: null });
    expect(parseBotParam('?hero=sorceress&bot=archer', 'bot', parseHeroId)).toEqual({ hero: HeroId.Archer });
  });
});

describe('withPartnerBot', () => {
  it('dokłada bota jako P2 — innym bohaterem, gracz na wszystkich urządzeniach, run testowy', () => {
    const data = withPartnerBot(solo(), { hero: null }, HERO_ORDER);
    expect(isBotCoop(data)).toBe(true);
    expect(data.coop?.partner.hero).toBe(HeroId.Sorceress);
    expect(data.coop?.devices[0]).toEqual(SOLO_DEVICES);
    expect(data.run.practice).toBe(true);
  });

  it('ten sam bohater co gracz — bot bierze następnego', () => {
    expect(withPartnerBot(solo(), { hero: HeroId.Barbarian }, HERO_ORDER).coop?.partner.hero).toBe(HeroId.Sorceress);
    expect(withPartnerBot(solo(), { hero: HeroId.Archer }, HERO_ORDER).coop?.partner.hero).toBe(HeroId.Archer);
  });

  it('partner z zapisu przechodzi pod bota z przedmiotami', () => {
    const data: FloorSceneData = { ...solo(), coop: { partner: { hero: HeroId.Archer, items: [], hp: 30 }, devices: DEFAULT_COOP_DEVICES } };
    const bot = withPartnerBot(data, { hero: null }, HERO_ORDER);
    expect(bot.coop?.partner).toEqual(data.coop?.partner);
    expect(isBotCoop(bot)).toBe(true);
  });

  it('bez parametru i poza wspinaczką — bez zmian', () => {
    const data = solo();
    expect(withPartnerBot(data, null, HERO_ORDER)).toBe(data);
    const arenas = solo(RunMode.BossRush);
    expect(withPartnerBot(arenas, { hero: null }, HERO_ORDER)).toBe(arenas);
    expect(isBotCoop(data)).toBe(false);
  });
});
