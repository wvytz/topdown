import type { InputRecording } from '@/core/diagnosticsTypes';
import { DIAGNOSTICS } from '@/config/diagnosticsConfig';
import type { KeyValueStorage } from '@/persistence/HighscoreStorage';

const CFG = DIAGNOSTICS.inputs;

/** Lista nagrań, najwyżej `maxRecordings` ostatnich i w limicie rozmiaru (od najstarszych). */
export function trimRecordings(recordings: readonly InputRecording[], maxChars: number = CFG.maxStorageChars): InputRecording[] {
  let list = recordings.slice(-CFG.maxRecordings);
  while (list.length > 1 && JSON.stringify(list).length > maxChars) list = list.slice(1);
  return list;
}

/** Poprawne nagrania z surowego JSON-u (uszkodzony zapis → pusta lista). */
export function parseRecordings(raw: string | null): InputRecording[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (r): r is InputRecording =>
        typeof r === 'object' && r !== null && typeof (r as InputRecording).entries === 'string' && typeof (r as InputRecording).meta === 'object',
    );
  } catch {
    return [];
  }
}

/** Zapis nagrań wejść w localStorage; błędy magazynu są połykane (nagrywanie nie może psuć gry). */
export class InputRecordingStorage {
  constructor(private readonly storage: KeyValueStorage | null) {}

  load(): InputRecording[] {
    try {
      return parseRecordings(this.storage?.getItem(CFG.storageKey) ?? null);
    } catch {
      return [];
    }
  }

  save(recordings: readonly InputRecording[]): boolean {
    try {
      if (!this.storage) return false;
      this.storage.setItem(CFG.storageKey, JSON.stringify(trimRecordings(recordings)));
      return true;
    } catch {
      return false;
    }
  }
}
