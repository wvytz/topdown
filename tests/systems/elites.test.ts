import { describe, expect, it } from 'vitest';
import { EliteAffix, EnemyType } from '@/core/combatTypes';
import { createRng } from '@/core/random';
import { ENEMY_DEFINITIONS } from '@/config/combatConfig';
import { ELITE_CONFIG } from '@/config/eliteConfig';
import { ENEMY_LOOT } from '@/config/lootConfig';
import { getEncounterConfigForFloor } from '@/config/combatConfig';
import { planEncounters } from '@/dungeon/EncounterPlanner';
import {
  applyElite,
  availableAffixes,
  eliteAnnouncement,
  eliteLoot,
  eliteRoomChance,
  eliteTitle,
  isElite,
  lifestealHeal,
  rollElites,
} from '@/systems/Elites';
import { sampleFloors } from '../helpers/floors';

const RUSHER = ENEMY_DEFINITIONS[EnemyType.Rusher];

describe('elity — losowanie (krok 42)', () => {
  it('najwyżej jedna elita na pokój; elita ma tyle cech, ile chcemy, bez powtórzeń', () => {
    const floors = sampleFloors([4], 20);
    let elites = 0;
    let rooms = 0;
    floors.forEach((floor, i) => {
      const spawns = planEncounters(floor, getEncounterConfigForFloor(4), createRng(i));
      const affixes = rollElites(spawns, ELITE_CONFIG, 4, 2, createRng(100 + i));
      expect(affixes).toHaveLength(spawns.length);
      const byRoom = new Map<number, number>();
      spawns.forEach((s, j) => {
        if (affixes[j]!.length === 0) return;
        elites++;
        expect(affixes[j]).toHaveLength(2);
        expect(new Set(affixes[j]).size).toBe(2);
        byRoom.set(s.room, (byRoom.get(s.room) ?? 0) + 1);
      });
      for (const count of byRoom.values()) expect(count).toBe(1);
      rooms += new Set(spawns.map((s) => s.room)).size;
    });
    // Szansa 40% na pokój — w próbce wyraźnie więcej niż 20%, mniej niż 60%.
    expect(elites / rooms).toBeGreaterThan(0.2);
    expect(elites / rooms).toBeLessThan(0.6);
  });

  it('deterministycznie z RNG; piętro 1 rzadziej niż dalsze', () => {
    const spawns = [
      { type: EnemyType.Rusher, room: 1 },
      { type: EnemyType.Kiter, room: 1 },
      { type: EnemyType.Rusher, room: 2 },
    ];
    expect(rollElites(spawns, ELITE_CONFIG, 3, 1, createRng(5))).toEqual(rollElites(spawns, ELITE_CONFIG, 3, 1, createRng(5)));
    expect(eliteRoomChance(ELITE_CONFIG, 1)).toBeLessThan(eliteRoomChance(ELITE_CONFIG, 3));
    expect(eliteRoomChance(ELITE_CONFIG, 40)).toBe(eliteRoomChance(ELITE_CONFIG, 3));
  });

  it('co najmniej jedna elita na piętrze (krok 44), także przy szansie 0', () => {
    const spawns = [
      { type: EnemyType.Rusher, room: 1 },
      { type: EnemyType.Kiter, room: 2 },
      { type: EnemyType.Rusher, room: 3 },
    ];
    for (let seed = 0; seed < 20; seed++) {
      const none = rollElites(spawns, { ...ELITE_CONFIG, roomChanceByFloor: [0] }, 1, 1, createRng(seed));
      expect(none.filter((a) => a.length > 0)).toHaveLength(ELITE_CONFIG.minPerFloor);
    }
    expect(ELITE_CONFIG.minPerFloor).toBeGreaterThanOrEqual(1);
    expect(rollElites([], ELITE_CONFIG, 1, 1, createRng(1))).toEqual([]);
  });

  it('cechy odblokowują się z piętrem', () => {
    const first = availableAffixes(ELITE_CONFIG, EnemyType.Rusher, 1);
    expect(first).toContain(EliteAffix.Swift);
    expect(first).not.toContain(EliteAffix.Fiery);
    expect(availableAffixes(ELITE_CONFIG, EnemyType.Kiter, 3)).toHaveLength(5);
  });

  it('więcej cech niż dostępnych — tyle, ile jest', () => {
    const affixes = rollElites([{ type: EnemyType.Rusher, room: 0 }], { ...ELITE_CONFIG, roomChanceByFloor: [1] }, 1, 5, createRng(1));
    expect(affixes[0]).toHaveLength(availableAffixes(ELITE_CONFIG, EnemyType.Rusher, 1).length);
  });
});

describe('elity — statystyki i łupy', () => {
  it('bez cech — ten sam wróg', () => {
    expect(applyElite(RUSHER, [], ELITE_CONFIG)).toBe(RUSHER);
    expect(isElite(RUSHER)).toBe(false);
  });

  it('elita: więcej HP i obrażeń; Szybki szybciej chodzi i atakuje', () => {
    const tank = applyElite(RUSHER, [EliteAffix.Shielded], ELITE_CONFIG);
    expect(isElite(tank)).toBe(true);
    expect(tank.maxHp).toBeGreaterThan(RUSHER.maxHp * 2);
    expect(tank.attack.damage).toBeGreaterThan(RUSHER.attack.damage);
    expect(tank.moveSpeed).toBe(RUSHER.moveSpeed);
    const swift = applyElite(RUSHER, [EliteAffix.Swift], ELITE_CONFIG);
    expect(swift.moveSpeed).toBeGreaterThan(RUSHER.moveSpeed);
    expect(swift.attack.cooldownMs).toBeLessThan(RUSHER.attack.cooldownMs);
    expect(swift.attack.windupMs).toBeLessThan(RUSHER.attack.windupMs);
  });

  it('łup elity: pewne i większe złoto, częściej mikstura i przedmiot', () => {
    const base = ENEMY_LOOT[EnemyType.Rusher];
    const loot = eliteLoot(base, ELITE_CONFIG);
    expect(loot.goldChance).toBe(1);
    expect(loot.gold.min).toBeGreaterThan(base.gold.min);
    expect(loot.healthChance).toBeGreaterThan(base.healthChance);
    expect(loot.itemChance).toBeGreaterThan(base.itemChance);
  });

  it('wampir leczy się z trafienia; napis z nazw cech', () => {
    expect(lifestealHeal(10, ELITE_CONFIG)).toBe(Math.round(10 * ELITE_CONFIG.vampiric.lifesteal));
    expect(lifestealHeal(0, ELITE_CONFIG)).toBe(0);
    expect(eliteTitle([EliteAffix.Swift, EliteAffix.Fiery], ELITE_CONFIG)).toBe('SZYBKI · OGNISTY');
    expect(eliteAnnouncement([EliteAffix.Shielded], ELITE_CONFIG)).toBe(`Elita! Tarczownik — ${ELITE_CONFIG.affixes.shielded.hint}`);
  });
});
