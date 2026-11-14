import { describe, expect, it } from 'vitest';
import { NAME_FILTER_CONFIG } from '@/config/nameFilterConfig';
import { isNameAllowed, nameSkeleton } from '@/systems/NameFilter';

const ok = (name: string) => isNameAllowed(name, NAME_FILTER_CONFIG);

describe('filtr imienia (krok U9b)', () => {
  it('szkielet: bez ogonków, cyfry jak litery, bez separatorów i powtórzeń', () => {
    expect(nameSkeleton('ĆHUJ', NAME_FILTER_CONFIG)).toBe('chuj');
    expect(nameSkeleton('k_u-r r w 4', NAME_FILTER_CONFIG)).toBe('kurwa');
    expect(nameSkeleton('Łucja', NAME_FILTER_CONFIG)).toBe('lucja');
  });

  it('odrzuca wulgaryzmy także zamaskowane', () => {
    for (const bad of ['kurwa', 'KuRRw4', 'chuj123', 'f_u_c_k', 'sh1t', 'h1tler', 'Pierdolec', 'zjeb', 'jebac']) expect(ok(bad), bad).toBe(false);
  });

  it('przepuszcza zwykłe imiona i ksywki', () => {
    for (const good of ['Wicio', 'Łukasz', 'Zuzanna', 'Kasia_99', 'Hubert', 'Scipio', 'Sukces', 'Michał', 'Ania-K', 'Grzegorz', 'Nigel', 'Kuba', '']) {
      expect(ok(good), good).toBe(true);
    }
  });
});
