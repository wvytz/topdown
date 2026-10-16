import Phaser from 'phaser';
import { CAMERA_CONFIG, GAME_HEIGHT, GAME_WIDTH } from '@/config/gameConfig';
import { installDiagnostics } from '@/diagnostics/installDiagnostics';
import { BootScene } from '@/scenes/BootScene';
import { GameScene } from '@/scenes/GameScene';
import { HeroSelectScene } from '@/scenes/HeroSelectScene';
import { HudScene } from '@/scenes/HudScene';
import { RewardScene } from '@/scenes/RewardScene';
import { SplashScene } from '@/scenes/SplashScene';
import { pixelPerfectScale } from '@/systems/pixelScale';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#1a1a1f',
  pixelArt: true,
  // Skalę płótna ustawiamy sami (pixelPerfectScale): piksel świata = całkowita liczba pikseli ekranu.
  scale: {
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 }, // top-down: brak grawitacji
      debug: false,
    },
  },
  // SplashScene startuje pierwsza i sama uruchamia BootScene (ładowanie pod ekranem startowym).
  scene: [SplashScene, BootScene, HeroSelectScene, GameScene, HudScene, RewardScene],
};

const game = new Phaser.Game(config);
// Dziennik błędów i niespotykanych zdarzeń (krok 55): raport pod F9; pętla gry nie zamiera po wyjątku.
installDiagnostics(game);

function applyPixelPerfectScale(): void {
  const parent = document.getElementById('game');
  if (!parent) return;
  game.scale.setZoom(
    pixelPerfectScale({
      viewportWidth: parent.clientWidth,
      viewportHeight: parent.clientHeight,
      gameWidth: GAME_WIDTH,
      gameHeight: GAME_HEIGHT,
      devicePixelRatio: window.devicePixelRatio || 1,
      cameraZoom: CAMERA_CONFIG.zoom,
    }),
  );
}
applyPixelPerfectScale();
window.addEventListener('resize', applyPixelPerfectScale);

// Dostęp z konsoli przeglądarki do debugowania (tylko w trybie dev).
if (import.meta.env.DEV) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
}
