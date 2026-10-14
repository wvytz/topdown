import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EnemyVariant } from '@/core/combatTypes';
import { BOSS_VISUALS, ENEMY_VISUALS, PLAYER_VISUAL, SPIDERLING_VISUAL, SPRITE_SHEETS, animationKey } from '@/config/spriteConfig';
import type { SpriteSheetId } from '@/config/spriteConfig';
import { BossId } from '@/core/bossTypes';
import type { SpriteSheetDef } from '@/config/spriteConfig';
import { facingDirection, sheetFrameIndex } from '@/systems/Facing';

const PUBLIC = fileURLToPath(new URL('../../public/', import.meta.url));

/** Szerokość i wysokość z nagłówka PNG (chunk IHDR). */
function pngSize(path: string): { width: number; height: number } {
  const data = readFileSync(path);
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

describe('facingDirection (wiersz arkusza)', () => {
  it('8 głównych kierunków: 0 = góra, zgodnie z zegarem', () => {
    expect(facingDirection({ x: 0, y: -1 })).toBe(0); // N
    expect(facingDirection({ x: 1, y: -1 })).toBe(1); // NE
    expect(facingDirection({ x: 1, y: 0 })).toBe(2); // E
    expect(facingDirection({ x: 1, y: 1 })).toBe(3); // SE
    expect(facingDirection({ x: 0, y: 1 })).toBe(4); // S
    expect(facingDirection({ x: -1, y: 1 })).toBe(5); // SW
    expect(facingDirection({ x: -1, y: 0 })).toBe(6); // W
    expect(facingDirection({ x: -1, y: -1 })).toBe(7); // NW
  });

  it('zaokrągla do najbliższego kierunku', () => {
    const at = (deg: number) => {
      const rad = (deg * Math.PI) / 180;
      return facingDirection({ x: Math.sin(rad), y: -Math.cos(rad) });
    };
    expect(at(20)).toBe(0);
    expect(at(25)).toBe(1);
    expect(at(350)).toBe(0);
    expect(at(-30)).toBe(7);
  });

  it('wektor zerowy = brak zmiany kierunku', () => {
    expect(facingDirection({ x: 0, y: 0 })).toBeNull();
  });

  it('indeks klatki: wiersz kierunku × kolumny + kolumna', () => {
    expect(sheetFrameIndex(0, 0, 4)).toBe(0);
    expect(sheetFrameIndex(2, 3, 4)).toBe(11);
    expect(sheetFrameIndex(7, 7, 8)).toBe(63);
  });
});

describe('arkusze sprite’ów', () => {
  const sheets: Array<[string, SpriteSheetDef]> = Object.entries(SPRITE_SHEETS);

  it.each(sheets)('%s: plik istnieje i ma wymiary z konfiguracji', (_id, sheet) => {
    expect(pngSize(PUBLIC + sheet.url)).toEqual({ width: sheet.sheetWidth, height: sheet.sheetHeight });
  });

  it.each(sheets)('%s: wiersze = kierunki, klatki animacji mieszczą się w wierszu', (_id, sheet) => {
    const columns = sheet.sheetWidth / sheet.frameWidth;
    expect(Number.isInteger(columns)).toBe(true);
    expect(sheet.sheetHeight / sheet.frameHeight).toBe(sheet.directions);
    for (const animation of Object.values(sheet.animations)) {
      for (const frame of animation.frames) {
        expect(frame).toBeGreaterThanOrEqual(0);
        expect(frame).toBeLessThan(columns);
      }
    }
  });

  it('gracz, każdy wróg i boss używają istniejących animacji', () => {
    const visuals = [PLAYER_VISUAL, ...Object.values(EnemyVariant).map((variant) => ENEMY_VISUALS[variant])];
    const expectAnimations = (sheet: SpriteSheetId, names: readonly (string | undefined)[]) => {
      const animations: Readonly<Record<string, unknown>> = SPRITE_SHEETS[sheet].animations;
      for (const name of names) if (name !== undefined) expect(animations, `${sheet}.${name}`).toHaveProperty(name);
    };
    for (const visual of visuals) {
      expectAnimations(visual.sheet, [visual.move, 'idle' in visual ? visual.idle : undefined, 'attack' in visual ? visual.attack : undefined]);
    }
    // Bossowie: ruch i animacja każdego ataku z `attacks`.
    for (const id of Object.values(BossId)) {
      const boss = BOSS_VISUALS[id];
      expectAnimations(boss.sheet, [boss.move, ...Object.values(boss.attacks)]);
    }
  });

  it('cień od silnika mają tylko postacie chodzące (mag ma własny cień, boss kałużę)', () => {
    expect(PLAYER_VISUAL.groundShadow).toBeDefined();
    expect(ENEMY_VISUALS[EnemyVariant.TrashcanMan].groundShadow).toBeDefined();
    expect(ENEMY_VISUALS[EnemyVariant.DemonMage].groundShadow).toBeUndefined();
    expect(ENEMY_VISUALS[EnemyVariant.CaveSpider].groundShadow).toBeDefined();
    for (const id of Object.values(BossId)) expect(BOSS_VISUALS[id].groundShadow).toBeUndefined();
    expect(SPIDERLING_VISUAL.groundShadow).toBeDefined();
  });

  it('pajączek: zapłon i wybuch to istniejące animacje', () => {
    const own: Readonly<Record<string, unknown>> = SPRITE_SHEETS[SPIDERLING_VISUAL.sheet].animations;
    expect(own).toHaveProperty(SPIDERLING_VISUAL.move);
    expect(own).toHaveProperty(SPIDERLING_VISUAL.prime);
    const burst: Readonly<Record<string, unknown>> = SPRITE_SHEETS[SPIDERLING_VISUAL.burst.sheet].animations;
    expect(burst).toHaveProperty(SPIDERLING_VISUAL.burst.animation);
  });

  it('animacja śmierci bossa: kierunkowa (zachowuje kierunek), jednorazowa, ok. 1 s', () => {
    const queen = BOSS_VISUALS[BossId.SpiderQueen].death;
    expect(queen).toBeDefined();
    for (const id of Object.values(BossId)) {
      const death = BOSS_VISUALS[id].death;
      if (!death) continue;
      const sheet: SpriteSheetDef = SPRITE_SHEETS[death.sheet];
      expect(sheet.directions).toBe(8);
      const animation = sheet.animations[death.animation]!;
      expect(animation.loop).toBe(false);
      const durationMs = (animation.frames.length * 1000) / (animation.fps ?? sheet.fps);
      // Nagroda czeka na koniec animacji — ma być wyraźna, ale nie dłuższa niż ok. 1,5 s.
      expect(durationMs).toBeGreaterThanOrEqual(600);
      expect(durationMs).toBeLessThanOrEqual(1500);
    }
  });

  it('klucze animacji są unikalne dla arkusza, animacji i kierunku', () => {
    expect(animationKey('barbarian', 'walk', 2)).not.toBe(animationKey('barbarian', 'walk', 3));
    expect(animationKey('barbarian', 'walk', 2)).not.toBe(animationKey('trashcanMan', 'walk', 2));
  });
});
