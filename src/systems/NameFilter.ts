import type { NameFilterConfig } from '@/config/nameFilterConfig';

/**
 * Filtr wulgaryzmów w imieniu gracza (krok U9b) — czysta logika. Imię sprowadzamy do „szkieletu”:
 * małe litery bez ogonków, cyfry i znaki jak litery (0 → o, 4 → a…), bez spacji, „_”, „-” i bez powtórzeń liter.
 * Imię jest zakazane, gdy szkielet zawiera szkielet któregoś rdzenia.
 */
export function nameSkeleton(raw: string, config: NameFilterConfig): string {
  const lower = raw.toLowerCase().replace(/ł/g, 'l');
  const plain = lower.normalize('NFD').replace(/\p{M}/gu, '');
  const mapped = [...plain].map((char) => config.lookalikes[char] ?? char).join('');
  const letters = mapped.replace(/[^a-z]/g, '');
  return letters.replace(/(.)\1+/g, '$1');
}

export function isNameAllowed(name: string, config: NameFilterConfig): boolean {
  const skeleton = nameSkeleton(name, config);
  if (skeleton === '') return true;
  return !config.blockedRoots.some((root) => skeleton.includes(nameSkeleton(root, config)));
}
