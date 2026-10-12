import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '@/config/gameConfig';
import { BootScene } from '@/scenes/BootScene';
import { GameScene } from '@/scenes/GameScene';
import { HudScene } from '@/scenes/HudScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#1a1a1f',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 }, // top-down: brak grawitacji
      debug: false,
    },
  },
  scene: [BootScene, GameScene, HudScene],
};

const game = new Phaser.Game(config);

// Dostęp z konsoli przeglądarki do debugowania (tylko w trybie dev).
if (import.meta.env.DEV) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
}
