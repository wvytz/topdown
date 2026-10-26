import { EliteAffix, EnemyType } from '@/core/combatTypes';
import type { EliteConfig } from '@/systems/Elites';

/**
 * Elity (krok 42): co kilka pokojów jeden wróg z cechą. Elita to „mini-boss pokoju”: ok. 2,5× HP,
 * mocniejsze ciosy, cecha zmieniająca walkę i wyraźnie lepszy łup. Gra ma być wymagająca — elity jej nie łagodzą.
 */
export const ELITE_CONFIG: EliteConfig = {
  // Piętro 1 — rzadko (nauka), potem co 2–3 pokoje.
  roomChanceByFloor: [0.2, 0.3, 0.4],
  minPerFloor: 1,
  hpMultiplier: 2.5,
  damageMultiplier: 1.3,
  affixes: {
    [EliteAffix.Swift]: { name: 'Szybki', hint: 'szybko biega i często bije', color: 0x5fd4ff, minFloor: 1 },
    [EliteAffix.Shielded]: { name: 'Tarczownik', hint: 'szarżuje — uskocz, wbije się w ścianę', color: 0xc9ccd6, minFloor: 1, types: [EnemyType.Rusher] },
    [EliteAffix.Vampiric]: { name: 'Wampiryczny', hint: 'leczy się, gdy cię trafi', color: 0xe0304a, minFloor: 2 },
    [EliteAffix.Volatile]: { name: 'Wybuchowy', hint: 'po śmierci wybucha, odskocz', color: 0xffd23c, minFloor: 2 },
    [EliteAffix.Fiery]: { name: 'Ognisty', hint: 'zostawia żar na podłodze', color: 0xff7a1c, minFloor: 3 },
  },
  swift: { moveSpeed: 1.35, windup: 0.8, cooldown: 0.7 },
  // Tarcza obraca się wolniej niż chodzi gracz po okręgu — obejście albo dash za plecy się opłaca.
  // Krok 99 (ocena właściciela: „antyludzki, nie da się zajść go od boku”): obrót 100 → 55°/s i stoi w miejscu
  // w trakcie szarży; zamiast doskakiwać szarżuje z telegrafem — unik wbija go w ścianę (ogłuszenie 1,8 s, plecy odsłonięte).
  // Krok 113 (ocena właściciela: „dalej broken”, za często się obraca, nie ma kiedy wyładować combo, za dużo życia):
  // obrót 55 → 35°/s, po każdym ciosie tarczą opuszcza tarczę na 1,6 s (stoi, nie obraca się, przyjmuje pełne
  // obrażenia — ok. 5 ciosów barbarzyńcy), ogłuszony po ścianie też bez tarczy; HP elity ×1,8 zamiast ×2,5.
  shield: {
    arcDeg: 140,
    frontMultiplier: 0.3,
    turnRateDegPerSec: 35,
    hpMultiplier: 1.8,
    guardDownMs: 1600,
    charge: {
      minRange: 70,
      maxRange: 220,
      windupMs: 750,
      speed: 400,
      maxDistance: 300,
      hitRadius: 14,
      damageMultiplier: 1.2,
      knockback: 320,
      wallStunMs: 1800,
      missRecoveryMs: 900,
      hitRecoveryMs: 500,
      cooldownMs: 2600,
      aimConeDeg: 60,
      wallGraceMs: 60,
    },
    bash: { range: 32, hitRange: 42 },
    // Bomba kultysty (10) albo wybuch elity rani Tarczownika podwójnie — wciągnięcie go pod bombę się opłaca.
    bombDamageMultiplier: 2,
  },
  fiery: {
    trail: { spacing: 16, radius: 9, durationMs: 2200, damage: 5 },
    deathPatch: { radius: 30, durationMs: 3500, damage: 6 },
  },
  // Krok 69: było 2 (leczenie 200% zadanych obrażeń — elita z 2,5× HP była nie do zabicia); teraz połowa zadanych.
  vampiric: { lifesteal: 0.5 },
  volatile: { radius: 52, delayMs: 900, damage: 18, knockback: 260 },
  loot: { goldMultiplier: 3, goldChance: 1, healthChanceBonus: 0.2, itemChance: 0.25 },
};

