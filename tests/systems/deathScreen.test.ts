import { describe, expect, it } from 'vitest';
import { DEATH_LAYOUT, DEATH_TIMING as T, DEATH_TITLE_FLOW } from '@/config/deathScreenConfig';
import { pixelText } from '@/core/pixelArt';
import { deathFrame, flowGroupOf, stepParticle, titleFlowIndex } from '@/systems/deathScreen';

const ROWS = 5;
const frame = (t: number) => deathFrame(t, ROWS);
const title = pixelText('POLEGŁEŚ', DEATH_LAYOUT.title.gap);

describe('POLEGŁEŚ w foncie pikselowym', () => {
  it('ma polskie litery, akcent Ś nad linią i mieści się na ekranie także po urośnięciu', () => {
    expect(title.top).toBeLessThan(0);
    expect(title.cells.filter((c) => c.y < 0)).toHaveLength(2);
    expect(title.width * DEATH_LAYOUT.title.unit * T.titleToScale).toBeLessThan(960);
  });
});

describe('deathFrame — powolny ekran śmierci', () => {
  it('gra tonie w ciemności płynnie, bez skoku; nie znika całkiem', () => {
    expect(frame(0).dimAlpha).toBe(0);
    expect(frame(T.dimDuration / 2).dimAlpha).toBeCloseTo(T.dimAlpha / 2);
    expect(frame(T.dimDuration).dimAlpha).toBeCloseTo(T.dimAlpha);
    expect(frame(60_000).dimAlpha).toBeLessThan(0.9);
    let prev = 0;
    for (let t = 0; t <= T.dimDuration; t += 50) {
      expect(frame(t).dimAlpha - prev).toBeLessThan(0.06);
      prev = frame(t).dimAlpha;
    }
  });

  it('napis wyłania się powoli, bez uderzenia', () => {
    expect(frame(T.titleAt).titleAlpha).toBe(0);
    expect(frame(T.titleAt + T.titleFadeDuration / 2).titleAlpha).toBeCloseTo(0.5);
    expect(frame(T.titleAt + T.titleFadeDuration).titleAlpha).toBe(1);
    expect(T.titleFadeDuration).toBeGreaterThanOrEqual(1000);
  });

  it('napis bardzo wolno rośnie i staje — nigdy nie zmniejsza się', () => {
    expect(frame(0).titleScale).toBe(T.titleFromScale);
    let prev = 0;
    for (let t = 0; t < T.titleAt + T.titleGrowDuration + 1000; t += 97) {
      const s = frame(t).titleScale;
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
    expect(frame(T.titleAt + T.titleGrowDuration).titleScale).toBeCloseTo(T.titleToScale);
  });

  it('pas pojawia się razem z ciemnością, przed napisem', () => {
    expect(frame(T.bandAt).bandAlpha).toBe(0);
    expect(frame(T.bandAt + T.bandDuration).bandAlpha).toBe(1);
    expect(T.bandAt).toBeLessThan(T.titleAt);
  });

  it('wynik i tablica dopiero po napisie; wiersze po kolei', () => {
    expect(T.scoreAt).toBeGreaterThanOrEqual(T.titleAt + T.titleFadeDuration);
    expect(frame(T.scoreAt).scoreAlpha).toBe(0);
    expect(frame(T.scoreAt + T.scoreFadeDuration).scoreAlpha).toBe(1);
    const mid = frame(T.rowsAt + T.rowInterval + T.rowFadeDuration);
    expect(mid.rowAlphas).toHaveLength(ROWS);
    expect(mid.rowAlphas[0]).toBe(1);
    expect(mid.rowAlphas[1]).toBe(1);
    expect(mid.rowAlphas[ROWS - 1]).toBeLessThan(1);
  });

  it('komunikat pulsuje między promptMinAlpha a pełną jasnością', () => {
    expect(frame(T.promptAt - 1).promptAlpha).toBe(0);
    expect(frame(T.promptAt + T.promptPulsePeriod / 2).promptAlpha).toBeCloseTo(T.promptMinAlpha);
    expect(frame(T.promptAt + T.promptPulsePeriod).promptAlpha).toBeCloseTo(1);
  });
});

describe('stepParticle', () => {
  it('grawitacja przyspiesza spadanie', () => {
    let p = { x: 0, y: 0, vx: 0.1, vy: 0 };
    p = stepParticle(p, 100, 0.001);
    expect(p.vy).toBeCloseTo(0.1);
    expect(p.x).toBeCloseTo(10);
    const next = stepParticle(p, 100, 0.001);
    expect(next.y - p.y).toBeGreaterThan(p.y);
  });
});

describe('titleFlowIndex — czerwień spływająca przez litery', () => {
  const F = DEATH_TITLE_FLOW;
  const cycle = F.ramp.length * F.bandPx;

  it('zwraca poprawny indeks rampy także dla ujemnych przesunięć', () => {
    for (let t = 0; t < 20_000; t += 333) {
      for (let y = -24; y < 80; y += 2) {
        const i = titleFlowIndex(y, t);
        expect(Number.isInteger(i)).toBe(true);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(F.ramp.length);
      }
    }
  });

  it('wzór przesuwa się w dół: to, co było na y, po chwili jest niżej', () => {
    const dt = 500;
    const dy = (dt / 1000) * F.speedPxPerSec;
    for (let y = 0; y < 56; y += 2) expect(titleFlowIndex(y + dy, 1000 + dt)).toBe(titleFlowIndex(y, 1000));
  });

  it('pętla bez szwu: wzór powtarza się co cykl w przestrzeni i w czasie', () => {
    const period = (cycle / F.speedPxPerSec) * 1000;
    for (let y = 0; y < 56; y += 2) {
      expect(titleFlowIndex(y + cycle, 700)).toBe(titleFlowIndex(y, 700));
      expect(titleFlowIndex(y, 700 + period)).toBe(titleFlowIndex(y, 700));
    }
  });

  it('w literze widać kilka tonów naraz (gradient, nie jednolita barwa)', () => {
    const tones = new Set(Array.from({ length: 28 }, (_, i) => titleFlowIndex(i * 2, 1234)));
    expect(tones.size).toBeGreaterThanOrEqual(4);
  });
});

describe('flowGroupOf — grupy liter spływające w swoim tempie', () => {
  const F = DEATH_TITLE_FLOW;

  it('grupy pokrywają cały napis po 2–3 litery', () => {
    expect(F.groups.reduce((sum, g) => sum + g.letters, 0)).toBe([...'POLEGŁEŚ'].length);
    for (const g of F.groups) expect(g.letters === 2 || g.letters === 3).toBe(true);
  });

  it('PO | LEG | ŁEŚ — litery trafiają do swoich grup', () => {
    const [po, leg, les] = F.groups;
    expect(flowGroupOf(0)).toBe(po);
    expect(flowGroupOf(1)).toBe(po);
    expect(flowGroupOf(2)).toBe(leg);
    expect(flowGroupOf(4)).toBe(leg);
    expect(flowGroupOf(5)).toBe(les);
    expect(flowGroupOf(7)).toBe(les);
  });

  it('grupy różnią się tempem, więc po chwili mają inny wzór', () => {
    expect(new Set(F.groups.map((g) => g.speedPxPerSec)).size).toBe(F.groups.length);
    const pattern = (g: (typeof F.groups)[number]) =>
      Array.from({ length: 28 }, (_, i) => titleFlowIndex(i * 2, 5000, F, g.speedPxPerSec, g.offsetPx)).join();
    expect(new Set(F.groups.map(pattern)).size).toBe(F.groups.length);
  });
});
