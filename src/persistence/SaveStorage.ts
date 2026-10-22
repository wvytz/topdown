import { SAVE_CONFIG } from '@/config/saveConfig';
import type { SaveData, SaveRecord } from '@/systems/SaveGame';
import { parseSaveRecord, toSaveRecord } from '@/systems/SaveGame';

/** Magazyn zapisów — w grze localStorage, w testach atrapa. */
export type SaveKeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Gdzie leży zapis: autozapis albo ręczny slot 1..slotCount. */
export type SaveSlot = 'auto' | number;

/**
 * Zapisy gry (krok 91): autozapis przy wejściu na piętro i ręczne sloty.
 * Zablokowany magazyn nie przerywa gry — zapis trzyma się wtedy w pamięci do końca sesji.
 */
export class SaveStorage {
  private readonly memory = new Map<string, string>();

  constructor(
    private readonly storage: SaveKeyValueStorage | null,
    private readonly slotCount: number = SAVE_CONFIG.slotCount,
  ) {}

  static browserStorage(): SaveKeyValueStorage | null {
    try {
      return typeof window !== 'undefined' ? window.localStorage : null;
    } catch {
      return null;
    }
  }

  /** Numery ręcznych slotów (1..slotCount). */
  get slots(): number[] {
    return Array.from({ length: this.slotCount }, (_, i) => i + 1);
  }

  load(slot: SaveSlot): SaveRecord | null {
    const key = this.key(slot);
    if (key === null) return null;
    return parseSaveRecord(this.read(key));
  }

  /** Zapisuje stan; false, gdy magazyn odmówił (zapis został tylko w pamięci). */
  save(slot: SaveSlot, data: SaveData, savedAt: number): boolean {
    const key = this.key(slot);
    if (key === null) return false;
    const raw = JSON.stringify(toSaveRecord(data, savedAt));
    this.memory.set(key, raw);
    if (!this.storage) return false;
    try {
      this.storage.setItem(key, raw);
      return true;
    } catch {
      return false;
    }
  }

  remove(slot: SaveSlot): void {
    const key = this.key(slot);
    if (key === null) return;
    this.memory.delete(key);
    try {
      this.storage?.removeItem(key);
    } catch {
      // Zablokowany magazyn — nie ma czego usuwać.
    }
  }

  private read(key: string): string | null {
    if (!this.storage) return this.memory.get(key) ?? null;
    try {
      return this.storage.getItem(key) ?? this.memory.get(key) ?? null;
    } catch {
      return this.memory.get(key) ?? null;
    }
  }

  private key(slot: SaveSlot): string | null {
    if (slot === 'auto') return SAVE_CONFIG.autosaveKey;
    if (!Number.isInteger(slot) || slot < 1 || slot > this.slotCount) return null;
    return `${SAVE_CONFIG.slotKeyPrefix}${slot}${SAVE_CONFIG.slotKeySuffix}`;
  }
}
