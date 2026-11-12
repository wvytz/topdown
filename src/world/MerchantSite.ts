import Phaser from 'phaser';
import type { TilePoint } from '@/core/dungeonTypes';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { MERCHANT_CONFIG, MERCHANT_TEXT } from '@/config/descentConfig';
import { DungeonView } from '@/dungeon/DungeonView';
import type { Party } from '@/entities/Party';
import type { Player } from '@/entities/Player';
import { distance } from '@/systems/CombatMath';

/** Barwy tymczasowej figury kupca (do czasu arkusza z generatora): płaszcz z popiołu i latarnia z żarem. */
const LOOK = { robe: 0x3a2a26, robeDark: 0x241816, hood: 0x1a1010, face: 0x0a0606, eyes: 0xffb040, lantern: 0xffc060, glow: 0xff8a30 } as const;

export interface MerchantSiteDeps {
  readonly scene: Phaser.Scene;
  readonly tile: TilePoint;
  readonly party: Party;
  /** E przy kupcu — scena otwiera ladę dla tego bohatera. */
  readonly onOpen: (hero: Player) => void;
}

/**
 * Kupiec Zejścia (krok Z4) w pokoju startowym odbicia: figura z latarnią, podpowiedź w pobliżu i E — lada.
 * Zasady towaru i cen są w `systems/DescentGates.ts`.
 */
export class MerchantSite {
  private readonly position: { readonly x: number; readonly y: number };
  private readonly prompt: Phaser.GameObjects.Text;
  private readonly lanternGlow: Phaser.GameObjects.Arc;
  private near = false;

  constructor(private readonly deps: MerchantSiteDeps) {
    const { scene } = deps;
    this.position = DungeonView.tileToWorldCenter(deps.tile);
    const { x, y } = this.position;
    const g = scene.add.graphics().setDepth(RENDER_DEPTH.shrine);
    g.fillStyle(0x000000, 0.4).fillEllipse(x, y + 7, 18, 6);
    g.fillStyle(LOOK.robeDark, 1).fillTriangle(x - 8, y + 7, x + 8, y + 7, x, y - 9);
    g.fillStyle(LOOK.robe, 1).fillTriangle(x - 6, y + 7, x + 6, y + 7, x, y - 7);
    g.fillStyle(LOOK.hood, 1).fillCircle(x, y - 9, 5);
    g.fillStyle(LOOK.face, 1).fillCircle(x, y - 8, 3);
    g.fillStyle(LOOK.eyes, 1).fillRect(x - 2, y - 9, 1, 1).fillRect(x + 1, y - 9, 1, 1);
    // Latarnia na kiju.
    g.fillStyle(LOOK.robeDark, 1).fillRect(x + 8, y - 10, 1, 17);
    g.fillStyle(LOOK.lantern, 1).fillRect(x + 6, y - 12, 5, 4);
    this.lanternGlow = scene.add.circle(x + 8, y - 10, 9, LOOK.glow, 0.25).setDepth(RENDER_DEPTH.shrine).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({ targets: this.lanternGlow, alpha: 0.1, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    scene.add
      .text(x, y + 9, MERCHANT_TEXT.name, { fontFamily: 'monospace', fontSize: '8px', color: '#c8a070', stroke: '#000000', strokeThickness: 2 })
      .setOrigin(0.5, 0)
      .setDepth(RENDER_DEPTH.worldText)
      .setAlpha(0.8);
    this.prompt = scene.add
      .text(x, y - 18, MERCHANT_TEXT.prompt, { fontFamily: 'monospace', fontSize: '10px', color: '#ffe08a', stroke: '#000000', strokeThickness: 3, align: 'center' })
      .setOrigin(0.5, 1)
      .setDepth(RENDER_DEPTH.worldText)
      .setVisible(false);
  }

  /** Kafel kupca (minimapa). */
  get tile(): TilePoint {
    return this.deps.tile;
  }

  /** Bohater stoi przy kupcu — E zadziała (przycisk E na dotyku). */
  get canInteract(): boolean {
    return this.near;
  }

  update(interactPressed: (hero: Player) => boolean): void {
    const hero = this.deps.party.nearestLiving(this.position);
    this.near = hero !== null && hero !== undefined && distance(hero, this.position) <= MERCHANT_CONFIG.interactRadius;
    this.prompt.setVisible(this.near);
    if (this.near && hero && interactPressed(hero)) this.deps.onOpen(hero);
  }
}
