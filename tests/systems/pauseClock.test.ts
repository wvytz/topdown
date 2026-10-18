import { describe, expect, it } from 'vitest';
import { PauseClock, autoPauseEnabled } from '@/systems/PauseClock';

describe('PauseClock', () => {
  it('bez pauzy przepuszcza czas bez zmian', () => {
    const clock = new PauseClock();
    expect(clock.shift(1000)).toBe(1000);
    expect(clock.shift(1016)).toBe(1016);
  });

  it('w pauzie czas stoi, po wznowieniu płynie od miejsca zatrzymania', () => {
    const clock = new PauseClock();
    clock.shift(1000);
    clock.begin();
    expect(clock.isPaused).toBe(true);
    expect(clock.shift(1500)).toBe(1000);
    expect(clock.shift(9000)).toBe(1000);
    clock.end();
    expect(clock.isPaused).toBe(false);
    // następna klatka ~16 ms po ostatniej klatce pauzy
    expect(clock.shift(9016)).toBe(1016);
    expect(clock.shift(9032)).toBe(1032);
  });

  it('kolejne pauzy sumują przesunięcie', () => {
    const clock = new PauseClock();
    clock.shift(100);
    clock.begin();
    clock.shift(600);
    clock.end();
    expect(clock.shift(616)).toBe(116);
    clock.begin();
    clock.shift(2000);
    clock.end();
    expect(clock.shift(2016)).toBe(132);
  });

  it('podwójne begin / end bez pauzy nic nie psują', () => {
    const clock = new PauseClock();
    clock.shift(100);
    clock.end();
    expect(clock.shift(116)).toBe(116);
    clock.begin();
    clock.begin();
    clock.shift(300);
    clock.end();
    clock.end();
    expect(clock.shift(316)).toBe(132);
  });
});

describe('autoPauseEnabled', () => {
  const base = { search: '', dev: false, webdriver: false };
  it('domyślnie włączona w grze, wyłączona w dev i dla bota', () => {
    expect(autoPauseEnabled(base, 'autopause')).toBe(true);
    expect(autoPauseEnabled({ ...base, dev: true }, 'autopause')).toBe(false);
    expect(autoPauseEnabled({ ...base, webdriver: true }, 'autopause')).toBe(false);
  });
  it('parametr adresu ma pierwszeństwo', () => {
    expect(autoPauseEnabled({ ...base, search: '?autopause=0' }, 'autopause')).toBe(false);
    expect(autoPauseEnabled({ ...base, dev: true, search: '?x=1&autopause=1' }, 'autopause')).toBe(true);
  });
});
