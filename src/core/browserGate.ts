/**
 * Bramka przeglądarki (krok 142, decyzja właściciela): gra nie wspiera Safari.
 * Rozpoznajemy tylko samo Safari (Mac, iPhone, iPad) po user-agencie. Na iPhonie każda przeglądarka
 * działa na WebKicie i udaje Safari, więc wykluczamy znaczniki innych przeglądarek — inaczej
 * odcięlibyśmy wszystkie iPhone'y, także z Firefoxem, Brave'em czy DuckDuckGo.
 */

/** Znaczniki przeglądarek, które w user-agencie wyglądają jak Safari, ale nim nie są. */
const NOT_SAFARI = [
  'Chrome', 'Chromium', 'CriOS', // Chrome (także Edge, Opera, Brave na PC i Androidzie)
  'FxiOS', 'Firefox', // Firefox na iOS i Firefox w ogóle
  'EdgiOS', 'EdgA', 'Edg/', // Edge
  'OPiOS', 'OPT/', 'OPR/', // Opera
  'Ddg/', 'DuckDuckGo', // DuckDuckGo
  'Brave', // Brave (jeśli się przedstawia)
  'YaBrowser', 'SamsungBrowser', 'Android',
  'GSA/', 'FBAN', 'FBAV', 'Instagram', 'Line/', 'Snapchat', // aplikacja Google i przeglądarki w aplikacjach
];

/** Prawdziwe Safari ma w user-agencie „Version/x.y … Safari/…” i żadnego znacznika innej przeglądarki. */
export function isPlainSafari(userAgent: string, isBrave = false): boolean {
  if (isBrave) return false;
  if (!/Version\/[\d.]+.*Safari\//.test(userAgent)) return false;
  return !NOT_SAFARI.some((marker) => userAgent.includes(marker));
}

/** Furtka w adresie: `?safari=1` pokazuje ekran blokady w każdej przeglądarce (podgląd), `?safari=0` wpuszcza mimo Safari. */
export type SafariOverride = 'show' | 'allow' | null;

export function safariOverride(search: string): SafariOverride {
  const value = new URLSearchParams(search).get('safari');
  if (value === '1') return 'show';
  if (value === '0') return 'allow';
  return null;
}

/** Czy zamiast gry pokazać ekran „Na Safari tej gry nie odpalisz”. */
export function shouldBlockBrowser(userAgent: string, search: string, isBrave = false): boolean {
  const override = safariOverride(search);
  if (override === 'show') return true;
  if (override === 'allow') return false;
  return isPlainSafari(userAgent, isBrave);
}
