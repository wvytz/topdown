import Phaser from 'phaser';
import { CAMERA_CONFIG, GAME_HEIGHT, GAME_WIDTH } from '@/config/gameConfig';
import { BootScene } from '@/scenes/BootScene';
import { GameScene } from '@/scenes/GameScene';
import { HeroSelectScene } from '@/scenes/HeroSelectScene';
import { HudScene } from '@/scenes/HudScene';
import { RewardScene } from '@/scenes/RewardScene';
import { SplashScene } from '@/scenes/SplashScene';
import { TouchScene } from '@/scenes/TouchScene';
import { PerfScene } from '@/scenes/PerfScene';
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
    // Centruje CSS (#game: flex) — wyliczenia Phasera po obrocie telefonu potrafiły przesunąć płótno poza ekran.
    autoCenter: Phaser.Scale.NO_CENTER,
  },
  // Dotyk (krok 49): dwa kciuki na gałkach i trzeci palec na przycisku.
  input: { activePointers: 4 },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 }, // top-down: brak grawitacji
      debug: false,
    },
  },
  // SplashScene startuje pierwsza i sama uruchamia BootScene (ładowanie pod ekranem startowym).
  // TouchScene na końcu: rysuje gałki nad grą, HUD-em i wyborem nagrody.
  scene: [SplashScene, BootScene, HeroSelectScene, GameScene, HudScene, RewardScene, TouchScene, PerfScene],
};

const game = new Phaser.Game(config);

function applyPixelPerfectScale(): void {
  const parent = document.getElementById('game');
  if (!parent) return;
  // Widoczna część strony: na telefonie pasek adresu i klawiatura zabierają miejsce, którego clientHeight nie widzi.
  const visible = window.visualViewport;
  game.scale.setZoom(
    pixelPerfectScale({
      viewportWidth: Math.min(parent.clientWidth, visible?.width ?? window.innerWidth),
      viewportHeight: Math.min(parent.clientHeight, visible?.height ?? window.innerHeight),
      gameWidth: GAME_WIDTH,
      gameHeight: GAME_HEIGHT,
      devicePixelRatio: window.devicePixelRatio || 1,
      cameraZoom: CAMERA_CONFIG.zoom,
    }),
  );
}
applyPixelPerfectScale();
/** Po obrocie telefonu i wejściu w pełny ekran wymiary dochodzą z opóźnieniem — liczymy od razu i jeszcze raz chwilę później. */
function rescaleSoon(): void {
  applyPixelPerfectScale();
  window.setTimeout(applyPixelPerfectScale, 300);
}
window.addEventListener('resize', rescaleSoon);
window.addEventListener('orientationchange', rescaleSoon);
document.addEventListener('fullscreenchange', rescaleSoon);
window.visualViewport?.addEventListener('resize', rescaleSoon);

/**
 * Telefon (krok 49): pierwszy dotyk prosi o pełny ekran w poziomie — bez paska przeglądarki gra jest większa.
 * iPhone (Safari) pełnego ekranu stron nie obsługuje; wtedy nic się nie dzieje.
 */
function enterFullscreenOnTouch(): void {
  window.removeEventListener('touchend', enterFullscreenOnTouch);
  const root = document.documentElement;
  if (document.fullscreenElement || !root.requestFullscreen) return;
  root
    .requestFullscreen({ navigationUI: 'hide' })
    .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
    .catch(() => undefined);
}
window.addEventListener('touchend', enterFullscreenOnTouch);

// Dostęp z konsoli przeglądarki do debugowania (tylko w trybie dev).
if (import.meta.env.DEV) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
}
