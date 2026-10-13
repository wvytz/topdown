/**
 * Dekorowanie piętra (FloorDressing): gęstości detali i nazwy kafli z arkusza.
 * Czysto wizualne — nie wpływa na kolizje, linię wzroku ani zasady gry.
 */

export interface FloorDressingConfig {
  /** Szansa na wzór podłogi 2×2 w każdym wolnym bloku 2×2 (przełamuje siatkę 32 px). */
  readonly macroChance: number;
  /** Szansa na odbicie w poziomie kafla, który na to pozwala. */
  readonly flipChance: number;
  /** Szansa na zwykłą nakładkę (pęknięcie, plama…) na kaflu podłogi. */
  readonly decalChance: number;
  /** Wagi grup nakładek 1×1 przy losowaniu zwykłej nakładki. */
  readonly decalGroupWeights: Readonly<Record<string, number>>;
  /** Szansa na długie pęknięcie (2×1 lub 1×2) zaczynające się na kaflu. */
  readonly longCrackChance: number;
  readonly longCrackGroup: string;
  /** Kurz nawiany pod ścianę po danej stronie kafla. */
  readonly dust: {
    readonly north: { readonly chance: number; readonly group: string };
    readonly west: { readonly chance: number; readonly group: string };
    readonly east: { readonly chance: number; readonly group: string };
  };
  /** Promień (Czebyszewa, w kaflach) wokół spawnu, schodów i krat bez nakładek. */
  readonly clearRadius: number;
  readonly floorGroup: string;
  readonly floorMacroGroup: string;
  readonly stairsTiles: { readonly locked: string; readonly open: string };
  readonly gateTiles: Readonly<Record<'h' | 'v', Readonly<Record<'open' | 'half' | 'closed', string>>>>;
}

export const FLOOR_DRESSING: FloorDressingConfig = {
  macroChance: 0.04,
  flipChance: 0.5,
  decalChance: 0.1,
  decalGroupWeights: {
    'decal.crack': 4,
    'decal.debris': 2,
    'decal.stain': 1.5,
    'decal.broken': 1,
    'decal.rubble': 0.5,
  },
  longCrackChance: 0.012,
  longCrackGroup: 'decal.crackLong',
  dust: {
    north: { chance: 0.35, group: 'decal.dustN' },
    west: { chance: 0.25, group: 'decal.dustW' },
    east: { chance: 0.25, group: 'decal.dustE' },
  },
  clearRadius: 1,
  floorGroup: 'floor',
  floorMacroGroup: 'floorMacro',
  stairsTiles: { locked: 'stairs_sealed_2x2', open: 'stairs_open_2x2' },
  gateTiles: {
    h: { open: 'gate_h_open', half: 'gate_h_half', closed: 'gate_h_closed' },
    v: { open: 'gate_v_open', half: 'gate_v_half', closed: 'gate_v_closed' },
  },
};
