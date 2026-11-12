import { describe, expect, it } from 'vitest';
import { bossPhase, bossPhaseMarks, bossPortrait, introCardDuration, introCardFrame } from '@/systems/BossPresentation';
import { BOSS_VISUALS, SPRITE_SHEETS } from '@/config/spriteConfig';
import { BOSS_INTRO_CARD, BOSS_PHASE_MARKS } from '@/config/bossPresentationConfig';
import { BOSS_BY_FLOOR, BOSS_DUETS, bossById } from '@/config/bossConfig';

const TIMING = { inMs: 100, holdMs: 200, outMs: 100, revealAt: 1 };

describe('karta wejścia bossa (krok U6)', () => {
  it('przed startem i po końcu ukryta', () => {
    expect(introCardFrame(-1, TIMING).visible).toBe(false);
    expect(introCardFrame(introCardDuration(TIMING), TIMING).visible).toBe(false);
    expect(introCardFrame(Number.NaN, TIMING).visible).toBe(false);
  });

  it('wjazd: pas rośnie od zera, treść z lewej, sylwetka do końca wjazdu', () => {
    const start = introCardFrame(0, TIMING);
    expect(start).toMatchObject({ visible: true, band: 0, slide: -1, revealed: false });
    const mid = introCardFrame(50, TIMING);
    expect(mid.band).toBeGreaterThan(0.5);
    expect(mid.band).toBeLessThan(1);
    expect(mid.revealed).toBe(false);
  });

  it('postój: pełny pas, portret odsłonięty, treść w miejscu', () => {
    expect(introCardFrame(150, TIMING)).toEqual({ visible: true, band: 1, alpha: 1, slide: 0, revealed: true });
  });

  it('zjazd: treść gaśnie i odjeżdża w prawo', () => {
    const out = introCardFrame(350, TIMING);
    expect(out.alpha).toBeCloseTo(0.5);
    expect(out.slide).toBeGreaterThan(0);
    expect(out.band).toBeLessThan(1);
  });

  it('karta znika szybko — walka w tym czasie trwa', () => {
    expect(introCardDuration(BOSS_INTRO_CARD)).toBeLessThanOrEqual(3000);
  });
});

describe('fazy bossa na pasku HP (krok U6)', () => {
  it('progi malejąco, bez powtórzeń i bez krańców paska', () => {
    expect(bossPhaseMarks({ enrageAt: 0.5, extra: [2 / 3, 0.5, 1, 0] })).toEqual([2 / 3, 0.5]);
  });

  it('progi poniżej ucieczki windą odpadają (blondynka ucieka, zanim się wścieknie)', () => {
    expect(bossPhaseMarks({ enrageAt: 0.6, escapeAt: 2 / 3 })).toEqual([2 / 3]);
  });

  it('bliskie progi scalone w jedną kreskę', () => {
    expect(bossPhaseMarks({ enrageAt: 0.5, extra: [0.52] }, 0.04)).toEqual([0.52]);
  });

  it('numer fazy: próg osiągnięty to już następna faza (jak wściekłość w BossBrain)', () => {
    const marks = [2 / 3, 0.5];
    expect(bossPhase(1, marks)).toBe(1);
    expect(bossPhase(0.7, marks)).toBe(1);
    expect(bossPhase(2 / 3, marks)).toBe(2);
    expect(bossPhase(0.5, marks)).toBe(3);
    expect(bossPhase(0.01, marks)).toBe(3);
  });

  it('każdy boss wspinaczki ma co najmniej dwie widoczne fazy', () => {
    for (const boss of Object.values(BOSS_BY_FLOOR)) {
      const marks = bossPhaseMarks({ enrageAt: boss.enrage.hpThreshold, escapeAt: boss.escape?.hpRatio }, BOSS_PHASE_MARKS.minGap);
      expect(marks.length, boss.name).toBeGreaterThanOrEqual(1);
    }
    for (const duet of BOSS_DUETS) expect(bossById(duet.partner).enrage.hpThreshold).toBeGreaterThan(0);
  });
});

describe('portret na karcie (krok U6)', () => {
  it('pierwsza klatka chodu w wierszu S arkusza 8-kierunkowego', () => {
    const sheet = { key: 'k', frameWidth: 96, sheetWidth: 960, directions: 8, animations: { walk: { frames: [2, 3] } } };
    expect(bossPortrait(sheet, 'walk')).toEqual({ texture: 'k', frame: 4 * 10 + 2 });
    expect(bossPortrait(sheet, 'brak').frame).toBe(40);
  });

  it('każdy boss wspinaczki ma arkusz z klatką portretu', () => {
    for (const boss of Object.values(BOSS_BY_FLOOR)) {
      const visual = BOSS_VISUALS[boss.id];
      const sheet = SPRITE_SHEETS[visual.sheet];
      const { frame } = bossPortrait(sheet, visual.move);
      expect(frame, boss.name).toBeLessThan((sheet.sheetWidth / sheet.frameWidth) * (sheet.sheetHeight / sheet.frameHeight));
    }
  });
});

describe('śmierć bossów wspinaczki (krok U6)', () => {
  it('każdy boss wspinaczki i partner duetu ma animację śmierci', () => {
    const ids = [...Object.values(BOSS_BY_FLOOR).map((b) => b.id), ...BOSS_DUETS.map((d) => d.partner)];
    for (const id of ids) expect(BOSS_VISUALS[id].death, id).toBeDefined();
  });
});
