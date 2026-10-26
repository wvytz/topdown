import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BossAttackKind, BossId } from '@/core/bossTypes';
import { BOSS_VISUALS, SPRITE_SHEETS } from '@/config/spriteConfig';
import { readPng } from '../helpers/png';

/** Rewizja Strażnika „Sludge King” (krok 110, tools/sludge_king_sprites.py): arkusz, animacje ataków, bez barw zarezerwowanych. */
const PUBLIC = fileURLToPath(new URL('../../public/', import.meta.url));
const RESERVED = ['#000000', '#ffffff', '#9cff57'];

describe('Sludge King: rewizja arkusza', () => {
  const sheet = SPRITE_SHEETS.sludgeKing;

  it('wymiary PNG zgadzają się z konfiguracją i kolumny z animacjami', () => {
    const img = readPng(PUBLIC + sheet.url);
    expect([img.width, img.height]).toEqual([sheet.sheetWidth, sheet.sheetHeight]);
    expect(sheet.sheetWidth / sheet.frameWidth).toBe(16);
    expect(sheet.sheetHeight / sheet.frameHeight).toBe(8);
    for (const [name, animation] of Object.entries<{ readonly frames: readonly number[] }>(sheet.animations)) {
      for (const column of animation.frames) {
        expect(column, `${name} poza arkuszem`).toBeLessThan(sheet.sheetWidth / sheet.frameWidth);
      }
    }
  });

  it('każda animacja ataku ma swoją kolumnę (bez współdzielenia z chodem)', () => {
    const cols = (name: keyof typeof sheet.animations) => sheet.animations[name].frames;
    expect(cols('move')).toEqual([0, 1, 2, 3]);
    expect(cols('spit')).toEqual([4, 5, 6, 7]);
    expect(cols('slam')).toEqual([8, 9, 10, 11]);
    expect(cols('leap')).toEqual([12, 13, 14, 15]);
  });

  it('bez barw zarezerwowanych i bez półprzezroczystych pikseli', () => {
    const img = readPng(PUBLIC + sheet.url);
    const hexOf = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    const colors = new Set<string>();
    let translucent = 0;
    for (let i = 0; i < img.data.length; i += 4) {
      const a = img.data[i + 3]!;
      if (a !== 0 && a !== 255) translucent++;
      if (a === 255) colors.add(hexOf(img.data[i]!, img.data[i + 1]!, img.data[i + 2]!));
    }
    expect(translucent).toBe(0);
    for (const c of RESERVED) expect(colors.has(c), c).toBe(false);
  });

  it('Slam i Leap mają animacje w wyglądzie bossa (brakujące animacje ataków uzupełnione)', () => {
    const visual = BOSS_VISUALS[BossId.FloorGuardian];
    expect(visual.sheet).toBe('sludgeKing');
    expect(visual.attacks[BossAttackKind.Slam]).toBe('slam');
    expect(visual.attacks[BossAttackKind.Leap]).toBe('leap');
    for (const name of Object.values(visual.attacks)) expect(sheet.animations).toHaveProperty([name!]);
  });
});
