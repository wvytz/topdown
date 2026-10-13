import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EnemyType } from '@/core/combatTypes';
import { BOSS_VISUAL, ENEMY_VISUALS, PLAYER_VISUAL, SPRITE_SHEETS, animationKey } from '@/config/spriteConfig';
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
    const visuals = [PLAYER_VISUAL, BOSS_VISUAL, ...Object.values(EnemyType).map((type) => ENEMY_VISUALS[type])];
    for (const visual of visuals) {
      const animations: Readonly<Record<string, unknown>> = SPRITE_SHEETS[visual.sheet].animations;
      for (const name of [visual.move, 'idle' in visual ? visual.idle : undefined, 'attack' in visual ? visual.attack : undefined]) {
        if (name !== undefined) expect(animations, `${visual.sheet}.${name}`).toHaveProperty(name);
      }
    }
  });

  it('cień od silnika mają tylko postacie chodzące (mag ma własny cień, boss kałużę)', () => {
    expect(PLAYER_VISUAL.groundShadow).toBeDefined();
    expect(ENEMY_VISUALS[EnemyType.Rusher].groundShadow).toBeDefined();
    expect(ENEMY_VISUALS[EnemyType.Kiter].groundShadow).toBeUndefined();
    expect('groundShadow' in BOSS_VISUAL).toBe(false);
  });

  it('klucze animacji są unikalne dla arkusza, animacji i kierunku', () => {
    expect(animationKey('barbarian', 'walk', 2)).not.toBe(animationKey('barbarian', 'walk', 3));
    expect(animationKey('barbarian', 'walk', 2)).not.toBe(animationKey('trashcanMan', 'walk', 2));
  });
});
