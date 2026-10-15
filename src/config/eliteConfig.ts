import { EliteAffix } from '@/core/combatTypes';
import type { EliteConfig } from '@/systems/Elites';

/**
 * Elity (krok 42): co kilka pokojów jeden wróg z cechą. Elita to „mini-boss pokoju”: ok. 2,5× HP,
 * mocniejsze ciosy, cecha zmieniająca walkę i wyraźnie lepszy łup. Gra ma być wymagająca — elity jej nie łagodzą.
 */
export const ELITE_CONFIG: EliteConfig = {
  // Piętro 1 — rzadko (nauka), potem co 2–3 pokoje.
  roomChanceByFloor: [0.2, 0.3, 0.4],
  hpMultiplier: 2.5,
  damageMultiplier: 1.3,
  affixes: {
    [EliteAffix.Swift]: { name: 'Szybki', color: 0x5fd4ff, minFloor: 1 },
    [EliteAffix.Shielded]: { name: 'Tarczownik', color: 0xc9ccd6, minFloor: 1 },
    [EliteAffix.Vampiric]: { name: 'Wampiryczny', color: 0xe0304a, minFloor: 2 },
    [EliteAffix.Volatile]: { name: 'Wybuchowy', color: 0xffd23c, minFloor: 2 },
    [EliteAffix.Fiery]: { name: 'Ognisty', color: 0xff7a1c, minFloor: 3 },
  },
  swift: { moveSpeed: 1.35, windup: 0.8, cooldown: 0.7 },
  // Tarcza obraca się wolniej niż chodzi gracz po okręgu — obejście albo dash za plecy się opłaca.
  shield: { arcDeg: 140, frontMultiplier: 0.3, turnRateDegPerSec: 100 },
  fiery: {
    trail: { spacing: 16, radius: 9, durationMs: 2200, damage: 5 },
    deathPatch: { radius: 30, durationMs: 3500, damage: 6 },
  },
  vampiric: { lifesteal: 2 },
  volatile: { radius: 52, delayMs: 900, damage: 18, knockback: 260 },
  loot: { goldMultiplier: 3, goldChance: 1, healthChanceBonus: 0.2, itemChance: 0.25 },
};

