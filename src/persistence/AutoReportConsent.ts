import { DIAGNOSTICS } from '@/config/diagnosticsConfig';
import type { KeyValueStorage } from '@/persistence/HighscoreStorage';
import type { AutoReportConsent } from '@/systems/AutoReport';

/** Zgoda gracza na automatyczne wysyłanie raportów o awariach (krok 58); brak magazynu = pamięć sesji, nic nie wysyłamy bez zgody. */
export class AutoReportConsentStore {
  private memory: AutoReportConsent = null;

  constructor(private readonly storage: KeyValueStorage | null) {}

  load(): AutoReportConsent {
    try {
      const raw = this.storage?.getItem(DIAGNOSTICS.autoReport.consentKey);
      if (raw === 'yes' || raw === 'no') return raw;
    } catch {
      // Zablokowany magazyn — zostaje pamięć sesji.
    }
    return this.memory;
  }

  save(consent: 'yes' | 'no'): void {
    this.memory = consent;
    try {
      this.storage?.setItem(DIAGNOSTICS.autoReport.consentKey, consent);
    } catch {
      // Zostaje w pamięci tej sesji.
    }
  }
}
