import { DIAGNOSTICS } from '@/config/diagnosticsConfig';
import type { KeyValueStorage } from '@/persistence/HighscoreStorage';

/** Losowy identyfikator (hex) — bez danych osobowych. */
function randomId(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Anonimowy identyfikator przeglądarki dołączany do zgłoszeń (krok 57): pozwala złożyć zgłoszenia tego samego testera
 * w całość i deduplikować ponowienia. Zapisany w localStorage; bez magazynu — nowy w każdej sesji.
 */
export function getClientId(storage: KeyValueStorage | null): string {
  try {
    const existing = storage?.getItem(DIAGNOSTICS.reports.clientIdKey);
    if (existing && /^[A-Za-z0-9-]{8,64}$/.test(existing)) return existing;
  } catch {
    // Zablokowany magazyn — losujemy nowy.
  }
  const id = randomId();
  try {
    storage?.setItem(DIAGNOSTICS.reports.clientIdKey, id);
  } catch {
    // Zostaje w pamięci tej sesji.
  }
  return id;
}
