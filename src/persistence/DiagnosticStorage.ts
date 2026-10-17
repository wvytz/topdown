import { DIAGNOSTICS } from '@/config/diagnosticsConfig';
import type { KeyValueStorage } from '@/persistence/HighscoreStorage';
import type { DiagSession } from '@/systems/Diagnostics';
import { parseSessions, trimSessions } from '@/systems/Diagnostics';

/** Zapis dziennika diagnostycznego w localStorage; każdy błąd magazynu (pełny, zablokowany) jest połykany — dziennik nie może psuć gry. */
export class DiagnosticStorage {
  constructor(private readonly storage: KeyValueStorage | null) {}

  load(): DiagSession[] {
    try {
      return parseSessions(this.storage?.getItem(DIAGNOSTICS.storageKey) ?? null);
    } catch {
      return [];
    }
  }

  /** Zapisuje `previous` (starsze sesje) + bieżącą; zwraca false, gdy się nie udało. */
  save(previous: readonly DiagSession[], current: DiagSession): boolean {
    try {
      if (!this.storage) return false;
      this.storage.setItem(DIAGNOSTICS.storageKey, JSON.stringify(trimSessions([...previous, current])));
      return true;
    } catch {
      return false;
    }
  }
}
