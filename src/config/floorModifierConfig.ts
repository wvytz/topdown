import type { FloorModifierConfig, FloorModifierDefinition } from '@/core/floorModifierTypes';
import { FloorModifierId } from '@/core/floorModifierTypes';

export const FLOOR_MODIFIER_CONFIG: FloorModifierConfig = {
  firstFloor: 2,
};

/** Pula modyfikatorów pięter. Jeden losowy na piętro, nigdy ten sam dwa piętra z rzędu. */
export const FLOOR_MODIFIERS: Readonly<Record<FloorModifierId, FloorModifierDefinition>> = {
  [FloorModifierId.Fever]: {
    id: FloorModifierId.Fever,
    name: 'Gorączka',
    description: 'wrogowie szybsi o 20%',
    effects: { enemySpeedMultiplier: 1.2 },
  },
  [FloorModifierId.ToughSkin]: {
    id: FloorModifierId.ToughSkin,
    name: 'Twarda skóra',
    description: 'wrogowie mają +30% HP',
    effects: { enemyHpMultiplier: 1.3 },
  },
  [FloorModifierId.GoldVein]: {
    id: FloorModifierId.GoldVein,
    name: 'Złota żyła',
    description: '+50% złota z wrogów, ale zadają +15% obrażeń',
    effects: { enemyGoldMultiplier: 1.5, enemyDamageMultiplier: 1.15 },
  },
  [FloorModifierId.Darkness]: {
    id: FloorModifierId.Darkness,
    name: 'Mrok',
    description: 'widać tylko najbliższe otoczenie',
    // px świata; przy zoomie 2,0 (krok 18) 112 px zajmuje na ekranie tyle, ile 150 px przy zoomie 1,5.
    effects: { visionRadius: 112 },
  },
  [FloorModifierId.Exhaustion]: {
    id: FloorModifierId.Exhaustion,
    name: 'Wyczerpanie',
    description: 'dash i strzały odnawiają się o 30% wolniej',
    effects: { playerRechargeMultiplier: 1.3 },
  },
  [FloorModifierId.ShrineGrace]: {
    id: FloorModifierId.ShrineGrace,
    name: 'Kapliczka łaski',
    description: 'ofiara w kapliczce kosztuje o połowę mniej',
    effects: { shrineCostMultiplier: 0.5 },
  },
};

export const FLOOR_MODIFIER_POOL: readonly FloorModifierDefinition[] = Object.values(FLOOR_MODIFIERS);
