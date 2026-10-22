import Phaser from 'phaser';
import { PAUSE_CLOCK_KEY } from '@/config/pauseConfig';
import { CAMERA_CONFIG, GAME_HEIGHT, GAME_WIDTH } from '@/config/gameConfig';
import { installDevTools } from '@/diagnostics/devTools';
import { installDiagnostics } from '@/diagnostics/installDiagnostics';
import { BootScene } from '@/scenes/BootScene';
import { GameScene } from '@/scenes/GameScene';
import { HeroSelectScene } from '@/scenes/HeroSelectScene';
import { HudScene } from '@/scenes/HudScene';
import { MenuScene } from '@/scenes/MenuScene';
import { PauseScene } from '@/scenes/PauseScene';
import { RewardScene } from '@/scenes/RewardScene';
import { SplashScene } from '@/scenes/SplashScene';
import { PauseClock } from '@/systems/PauseClock';
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
  // SplashScene startuje pierwsza i sama uruchamia BootScene (ładowanie pod ekranem startowym), potem menu (krok 91).
  scene: [SplashScene, BootScene, MenuScene, HeroSelectScene, GameScene, HudScene, RewardScene, PauseScene],
};

const game = new Phaser.Game(config);
// Czas gry dla scen stoi w miejscu na pauzie (krok 70) — bez tego po wznowieniu wszystkie odnowienia by „wygasły”.
const pauseClock = new PauseClock();
game.registry.set(PAUSE_CLOCK_KEY, pauseClock);
const stepWithGameTime = game.step.bind(game);
game.step = (time: number, delta: number) => stepWithGameTime(pauseClock.shift(time), delta);
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
  installDevTools(game);
}
