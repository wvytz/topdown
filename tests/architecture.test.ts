import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Strażnik architektury: warstwa czysta (zasady, AI, generowanie, konfiguracja)
 * nie może zależeć od Phasera ani od warstwy silnika — także pośrednio, przez import innego modułu.
 */
const SRC = fileURLToPath(new URL('../src', import.meta.url));

/** Ścieżki (względem src/, z „/”) należące do warstwy czystej. */
const PURE_PREFIXES = ['core/', 'systems/', 'ai/', 'config/'];
const PURE_FILES = [
  'dungeon/DungeonGenerator.ts',
  'dungeon/EncounterPlanner.ts',
  'dungeon/lineOfSight.ts',
  'dungeon/rooms.ts',
  'dungeon/ShrinePlanner.ts',
  'dungeon/arenaGates.ts',
  'dungeon/stairs.ts',
  'dungeon/FloorDressing.ts',
  'dungeon/LightPlanner.ts',
  'dungeon/CocoonPlanner.ts',
  'dungeon/StickyWebPlanner.ts',
  'dungeon/LarderPlanner.ts',
  'dungeon/ThronePlanner.ts',
  'dungeon/BrazierPlanner.ts',
  'dungeon/ArenaGalleries.ts',
  'dungeon/bossRoomRule.ts',
  'dungeon/SecretRoom.ts',
  'dungeon/TrapPlanner.ts',
  'dungeon/AmbushPlanner.ts',
  'dungeon/WallDogPlanner.ts',
  'dungeon/ElevatorPlanner.ts',
  'dungeon/BossSpawnPlanner.ts',
];

const isPure = (path: string): boolean =>
  PURE_PREFIXES.some((prefix) => path.startsWith(prefix)) || PURE_FILES.includes(path);

function listTsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return listTsFiles(full);
    return name.endsWith('.ts') ? [full] : [];
  });
}

function importsOf(source: string): string[] {
  const specifiers: string[] = [];
  const pattern = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const match of source.matchAll(pattern)) specifiers.push(match[1] ?? match[2] ?? '');
  return specifiers;
}

/** Zamienia specyfikator importu na ścieżkę względem src/ (lub null dla paczek zewnętrznych). */
function resolveToSrc(specifier: string): string | null {
  if (!specifier.startsWith('@/')) return null;
  const path = specifier.slice(2);
  return path.endsWith('.ts') ? path : `${path}.ts`;
}

const pureFiles = listTsFiles(SRC)
  .map((file) => relative(SRC, file).split(sep).join('/'))
  .filter(isPure);

describe('architektura: izolacja od silnika', () => {
  it('warstwa czysta zawiera moduły (sanity check)', () => {
    expect(pureFiles.length).toBeGreaterThan(10);
  });

  it.each(pureFiles)('%s nie importuje Phasera ani warstwy silnika', (file) => {
    const source = readFileSync(join(SRC, file), 'utf8');
    for (const specifier of importsOf(source)) {
      expect(specifier, `${file} importuje Phasera`).not.toBe('phaser');
      if (specifier.startsWith('.')) {
        throw new Error(`${file}: używaj aliasu @/ zamiast ścieżek względnych (${specifier})`);
      }
      const target = resolveToSrc(specifier);
      if (target !== null) {
        expect(isPure(target), `${file} importuje moduł silnika: ${specifier}`).toBe(true);
      } else if (!specifier.startsWith('node:')) {
        throw new Error(`${file}: nieoczekiwana zależność zewnętrzna „${specifier}”`);
      }
    }
  });
});

/**
 * Wersja mobilna (krok 96) to osobne wejście (`mobile.html` → `mobile/main.mobile.ts`): gra PC nie może
 * zależeć od kodu telefonu — inaczej zmiana dotyku mogłaby zepsuć wersję PC.
 */
describe('architektura: wersja mobilna osobno', () => {
  const allFiles = listTsFiles(SRC).map((file) => relative(SRC, file).split(sep).join('/'));
  const outsideMobile = allFiles.filter((file) => !file.startsWith('mobile/'));

  it('kod mobilny istnieje (sanity check)', () => {
    expect(allFiles.some((file) => file.startsWith('mobile/'))).toBe(true);
  });

  it.each(outsideMobile)('%s nie importuje z src/mobile', (file) => {
    const source = readFileSync(join(SRC, file), 'utf8');
    for (const specifier of importsOf(source)) {
      expect(specifier.startsWith('@/mobile/'), `${file} importuje kod mobilny: ${specifier}`).toBe(false);
    }
  });
});
