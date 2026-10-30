import Phaser from 'phaser';
import type { StatusApplication } from '@/core/combatTypes';
import { TextureKey } from '@/core/types';
import type { HomingConfig } from '@/systems/Homing';

/** Pocisk — dane trafienia przenosi ze sobą; ruch i kolizje obsługuje ProjectileManager / PlayerShotManager. */
export class Projectile extends Phaser.Physics.Arcade.Sprite {
  damage = 0;
  knockback = 0;
  expiresAt = 0;

  /** Miejsce wystrzału (pociski gracza — trafiony wróg „słyszy” strzelca stamtąd). */
  origin = { x: 0, y: 0 };
  /** Pociski gracza: statusy z przedmiotów. */
  status: StatusApplication = {};
  /** Pociski gracza: ilu jeszcze wrogów może przebić (Szuriken). */
  pierceLeft = 0;
  /** Pociski gracza: cele już trafione — przebity wróg nie dostaje drugi raz. */
  readonly hitTargets = new Set<object>();
  /** Kula Czarodziejki: trafienie leczy jak cios z Wampirzym kłem. */
  vampiric = false;
  /** Magia Czarodziejki — trafia też bezcielesnych (krok 49b). */
  magic = false;
  /** Strzał barbarzyńcy skręca do celu (krok 137); null — leci prosto. */
  homing: HomingConfig | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string = TextureKey.Projectile) {
    super(scene, x, y, texture);
    this.origin = { x, y };
  }
}
