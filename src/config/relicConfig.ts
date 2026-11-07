import type { RelicConfig } from '@/core/lootTypes';
import { ItemId } from '@/core/lootTypes';

/**
 * Krok 170 (uwaga testera „unikalne ulepszenia od bossów”, decyzja właściciela 4a): każdy boss kręgu ma swoją
 * relikwię. Po walce jedna z 3 kart to zawsze relikwia tego bossa (o ile bohater jeszcze jej nie ma).
 * Relikwia jest jedna (bez kopii i przemian), nie wypada z wrogów, zasadzek ani kapliczki.
 */
export const RELIC_CONFIG: RelicConfig = {
  byFloorInLoop: {
    1: ItemId.SlimeCrown,
    2: ItemId.SpiderSilk,
    3: ItemId.DevourerTooth,
    4: ItemId.HeadsmanAxe,
    5: ItemId.BaronPipe,
    6: ItemId.WetMop,
    7: ItemId.StorkFeather,
  },
  // Galaretowata skóra Króla Szlamu: co 8 s jedno trafienie o połowę słabsze.
  slimeCrown: { cooldownMs: 8000, damageMultiplier: 0.5 },
  // Jedwab duetu: lżejsze i dłuższe spowolnienie niż Lodowy odłamek (40–70% na 1,5 s), za to na każdym trafieniu.
  spiderSilk: { slowPct: 0.3, durationMs: 2000 },
  // Pożeracz zjada słabszych: 3 HP za zabitego wroga (bez czerwi gniazd i upiorów zasadzki).
  devourerTooth: { heal: 3 },
  headsmanAxe: { executeBelowPct: 0.2 },
  baronPipe: { passiveMultiplier: 2 },
  wetMop: { extraDashCharges: 1 },
};
