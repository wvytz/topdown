import type { EnemyAttackDefinition, EnemyDefinition, EnemyType, FirePatchDefinition } from '@/core/combatTypes';
import { EliteAffix, EnemyAttackKind } from '@/core/combatTypes';
import type { ShieldChargeConfig } from '@/systems/ShieldCharge';
import type { LootTable } from '@/core/lootTypes';
import type { Rng } from '@/core/random';

/**
 * Elity (krok 42): co kilka pokojów jeden zwykły wróg dostaje cechę (albo kilka w kolejnych kręgach wieży).
 * Elita ma więcej HP i mocniejsze ciosy, a cecha zmienia sposób walki z nią. Za elitę wypada więcej łupu.
 * Czysta logika: losowanie elit, statystyki i łupy. Wykonuje EnemyManager.
 */

export interface EliteAffixDefinition {
  /** Nazwa nad głową elity (wielkimi literami w grze). */
  readonly name: string;
  /** Kolor aury i nazwy. */
  readonly color: number;
  /** Najniższe piętro, na którym cecha się pojawia. */
  readonly minFloor: number;
  /** Podpowiedź w komunikacie przy pierwszym spotkaniu elity (krok 44). */
  readonly hint: string;
  /** Archetypy, które mogą ją dostać; brak = każdy. */
  readonly types?: readonly EnemyType[];
}

export interface EliteConfig {
  /** Szansa na elitę w pokoju z wrogami, wg piętra (indeks 0 = piętro 1; dalej ostatnia wartość). */
  readonly roomChanceByFloor: readonly number[];
  /** Najmniej elit na piętrze (krok 44: właściciel nie trafił na żadną) — dolosowane w pokojach bez elity. */
  readonly minPerFloor: number;
  readonly hpMultiplier: number;
  readonly damageMultiplier: number;
  readonly affixes: Readonly<Record<EliteAffix, EliteAffixDefinition>>;
  readonly swift: { readonly moveSpeed: number; readonly windup: number; readonly cooldown: number };
  readonly shield: {
    readonly arcDeg: number;
    /** Mnożnik obrażeń przyjętych od frontu. */
    readonly frontMultiplier: number;
    readonly turnRateDegPerSec: number;
    /** HP Tarczownika zamiast ogólnego `hpMultiplier` elit (krok 113: tarcza i tak mnoży jego wytrzymałość). */
    readonly hpMultiplier: number;
    /** Po ciosie tarczą opuszcza ją na tyle ms: stoi, nie obraca się, przyjmuje pełne obrażenia (krok 113). */
    readonly guardDownMs: number;
    /** Szarża zamiast skoku (krok 99). */
    readonly charge: ShieldChargeConfig;
    /** Wróg ze skokiem (ogar) dostaje z tarczą zwykły cios z tym zasięgiem — skacze tylko szarżą. */
    readonly bash: { readonly range: number; readonly hitRange: number };
    /** Mnożnik obrażeń od bomb wrogów (kultysta, wybuch elity) — tarcza nie chroni przed wybuchem z góry. */
    readonly bombDamageMultiplier: number;
  };
  readonly fiery: {
    readonly trail: FirePatchDefinition & { readonly spacing: number };
    readonly deathPatch: FirePatchDefinition;
  };
  /** Ułamek zadanych obrażeń, który leczy elitę. */
  readonly vampiric: { readonly lifesteal: number };
  readonly volatile: { readonly radius: number; readonly delayMs: number; readonly damage: number; readonly knockback: number };
  readonly loot: { readonly goldMultiplier: number; readonly goldChance: number; readonly healthChanceBonus: number; readonly itemChance: number };
}

/** Spawn wroga z miejscem w pokoju — elitę losujemy po jednej na pokój. */
export interface RoomSpawn {
  readonly type: EnemyType;
  readonly room: number;
}

export function eliteRoomChance(config: EliteConfig, floor: number): number {
  const table = config.roomChanceByFloor;
  return table[Math.min(table.length - 1, Math.max(0, floor - 1))] ?? 0;
}

/** Cechy dostępne dla archetypu na piętrze (kolejność jak w konfiguracji — stabilna dla RNG). */
export function availableAffixes(config: EliteConfig, type: EnemyType, floor: number): EliteAffix[] {
  return (Object.keys(config.affixes) as EliteAffix[]).filter((affix) => {
    const def = config.affixes[affix];
    return floor >= def.minFloor && (!def.types || def.types.includes(type));
  });
}

/**
 * Wybiera elity: w każdym pokoju z wrogami z szansą piętra jeden wróg dostaje `affixCount` różnych cech
 * (mniej, jeśli tyle nie ma); na piętrze jest co najmniej `minPerFloor` elit (o ile starczy pokojów). Zwraca cechy dla każdego spawnu (pusto = zwykły wróg), w kolejności spawnów.
 * Losuje zawsze tyle samo razy na pokój — elity w jednym pokoju nie zależą od reszty piętra.
 */
export function rollElites(
  spawns: readonly RoomSpawn[],
  config: EliteConfig,
  floor: number,
  affixCount: number,
  rng: Rng,
): EliteAffix[][] {
  const result: EliteAffix[][] = spawns.map(() => []);
  const rooms = [...new Set(spawns.map((s) => s.room))];
  const chance = eliteRoomChance(config, floor);
  const picks = rooms.map((room) => {
    const members = spawns.flatMap((s, i) => (s.room === room ? [i] : []));
    const roll = rng.next();
    return { pick: members[Math.floor(rng.next() * members.length)]!, elite: roll < chance };
  });
  // Za mało elit: dolosowujemy pokoje spośród tych bez elity.
  const spare = picks.filter((p) => !p.elite);
  while (picks.filter((p) => p.elite).length < config.minPerFloor && spare.length > 0) {
    spare.splice(Math.floor(rng.next() * spare.length), 1)[0]!.elite = true;
  }
  for (const { pick, elite } of picks) {
    if (!elite) continue;
    const pool = availableAffixes(config, spawns[pick]!.type, floor);
    const chosen: EliteAffix[] = [];
    while (chosen.length < affixCount && pool.length > 0) {
      chosen.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]!);
    }
    result[pick] = chosen;
  }
  return result;
}

/** Definicja elity: więcej HP i obrażeń, cechy zapisane w definicji; Szybki skraca też rytm ataku. */
export function applyElite(definition: EnemyDefinition, affixes: readonly EliteAffix[], config: EliteConfig): EnemyDefinition {
  if (affixes.length === 0) return definition;
  const swift = affixes.includes(EliteAffix.Swift);
  const shielded = affixes.includes(EliteAffix.Shielded);
  const attack = shielded ? shieldBash(definition.attack, config) : definition.attack;
  return {
    ...definition,
    affixes: [...affixes],
    maxHp: Math.round(definition.maxHp * (shielded ? config.shield.hpMultiplier : config.hpMultiplier)),
    moveSpeed: Math.round(definition.moveSpeed * (swift ? config.swift.moveSpeed : 1)),
    attack: {
      ...attack,
      damage: Math.round(attack.damage * config.damageMultiplier),
      ...(swift && {
        windupMs: Math.round(attack.windupMs * config.swift.windup),
        cooldownMs: Math.round(attack.cooldownMs * config.swift.cooldown),
      }),
    },
  };
}

/** Tarczownik (krok 99) nie skacze — skok ogara zamienia się w zwykły cios z bliska (dystans skraca szarża). */
function shieldBash(attack: EnemyAttackDefinition, config: EliteConfig): EnemyAttackDefinition {
  if (attack.kind !== EnemyAttackKind.Pounce) return attack;
  const { damage, windupMs, cooldownMs, knockback, status } = attack;
  return { kind: EnemyAttackKind.Melee, damage, windupMs, cooldownMs, knockback, ...config.shield.bash, ...(status && { status }) };
}

/** Obrażenia bomby wroga zadane Tarczownikowi (krok 99: bomby kultystów ranią też jego). */
export function bombDamageToShielded(damage: number, config: EliteConfig): number {
  return Math.max(1, Math.round(damage * config.shield.bombDamageMultiplier));
}

export function isElite(definition: EnemyDefinition): boolean {
  return (definition.affixes?.length ?? 0) > 0;
}

/** Łupy elity: więcej złota (pewniej), częściej mikstura, spora szansa na przedmiot. */
export function eliteLoot(table: LootTable, config: EliteConfig): LootTable {
  const { loot } = config;
  return {
    ...table,
    gold: { min: Math.round(table.gold.min * loot.goldMultiplier), max: Math.round(table.gold.max * loot.goldMultiplier) },
    goldChance: Math.max(table.goldChance, loot.goldChance),
    healthChance: Math.min(1, table.healthChance + loot.healthChanceBonus),
    itemChance: Math.max(table.itemChance, loot.itemChance),
  };
}

/** Leczenie wampirycznej elity za zadane obrażenia (co najmniej 1, gdy coś zadała). */
export function lifestealHeal(damageDealt: number, config: EliteConfig): number {
  return damageDealt > 0 ? Math.max(1, Math.round(damageDealt * config.vampiric.lifesteal)) : 0;
}

/** Komunikat przy pierwszym spotkaniu: nazwy cech i podpowiedź do każdej. */
export function eliteAnnouncement(affixes: readonly EliteAffix[], config: EliteConfig): string {
  return `Elita! ${affixes.map((a) => `${config.affixes[a].name} — ${config.affixes[a].hint}`).join(' · ')}`;
}

/** Napis nad elitą: nazwy cech po kolei. */
export function eliteTitle(affixes: readonly EliteAffix[], config: EliteConfig): string {
  return affixes.map((a) => config.affixes[a].name.toUpperCase()).join(' · ');
}
