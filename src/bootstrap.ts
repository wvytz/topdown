import Phaser from 'phaser';
import { PAUSE_CLOCK_KEY } from '@/config/pauseConfig';
import { CAMERA_CONFIG, GAME_HEIGHT, GAME_WIDTH } from '@/config/gameConfig';
import type { PlatformId } from '@/core/platform';
import { setPlatform } from '@/core/platform';
import { diag } from '@/diagnostics/DiagnosticsHub';
import { installDevTools } from '@/diagnostics/devTools';
import { installDiagnostics } from '@/diagnostics/installDiagnostics';
import { BootScene } from '@/scenes/BootScene';
import { GameScene } from '@/scenes/GameScene';
import { HeroSelectScene } from '@/scenes/HeroSelectScene';
import { CoopSelectScene } from '@/scenes/CoopSelectScene';
import { HudScene } from '@/scenes/HudScene';
import { MenuScene } from '@/scenes/MenuScene';
import { PauseScene } from '@/scenes/PauseScene';
import { RewardScene } from '@/scenes/RewardScene';
import { SplashScene } from '@/scenes/SplashScene';
import { installPageInputGuard } from '@/systems/PageInputGuard';
import { PauseClock } from '@/systems/PauseClock';
import { pixelPerfectScale } from '@/systems/pixelScale';

/** Widoczna część strony (px CSS). */
export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/**
 * Wspólny start gry (krok 96): wersja PC (`main.ts`) i mobilna (`mobile/main.mobile.ts`) różnią się tylko
 * dodatkowymi scenami (sterowanie dotykowe), skalą płótna i kilkoma ustawieniami Phasera.
 * Zasady, sceny i grafika są wspólne.
 */
export interface GameStartOptions {
  readonly platform: PlatformId;
  /** Sceny tylko tej wersji (np. gałki dotykowe nad grą) — na końcu listy, czyli nad resztą. */
  readonly extraScenes?: readonly Phaser.Types.Scenes.SceneType[];
  /** Skala CSS płótna dla widocznej części strony. */
  readonly scaleFor: (viewport: Viewport) => number;
  /** Widoczna część strony; domyślnie wymiary kontenera `#game`. */
  readonly viewport?: (parent: HTMLElement) => Viewport;
  /** Zdarzenia, po których skala liczy się od nowa (oprócz `resize` okna). */
  readonly rescaleOn?: (rescale: () => void) => void;
  /** Ustawienia Phasera tylko tej wersji (np. kilka palców naraz, centrowanie płótna przez CSS). */
  readonly phaser?: Pick<Phaser.Types.Core.GameConfig, 'input'> & { readonly autoCenter?: Phaser.Scale.CenterType };
}

/** Skala płótna: na PC piksel świata = całkowita liczba pikseli ekranu (STYLEGUIDE §2); `fractional` — wypełnia ekran (telefon). */
export function canvasScale(viewport: Viewport, fractional = false): number {
  return pixelPerfectScale({
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    gameWidth: GAME_WIDTH,
    gameHeight: GAME_HEIGHT,
    devicePixelRatio: window.devicePixelRatio || 1,
    cameraZoom: CAMERA_CONFIG.zoom,
    fractional,
  });
}

export function startGame(options: GameStartOptions): Phaser.Game {
  setPlatform(options.platform);
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: 'game',
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#1a1a1f',
    pixelArt: true,
    // Skalę płótna ustawiamy sami (scaleFor): na PC piksel świata = całkowita liczba pikseli ekranu.
    scale: {
      mode: Phaser.Scale.NONE,
      autoCenter: options.phaser?.autoCenter ?? Phaser.Scale.CENTER_BOTH,
    },
    ...(options.phaser?.input ? { input: options.phaser.input } : {}),
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: 0 }, // top-down: brak grawitacji
        debug: false,
      },
    },
    // SplashScene startuje pierwsza i sama uruchamia BootScene (ładowanie pod ekranem startowym), potem menu (krok 91).
    scene: [SplashScene, BootScene, MenuScene, HeroSelectScene, CoopSelectScene, GameScene, HudScene, RewardScene, PauseScene, ...(options.extraScenes ?? [])],
  };

  const game = new Phaser.Game(config);
  // Czas gry dla scen stoi w miejscu na pauzie (krok 70) — bez tego po wznowieniu wszystkie odnowienia by „wygasły”.
  const pauseClock = new PauseClock();
  game.registry.set(PAUSE_CLOCK_KEY, pauseClock);
  const stepWithGameTime = game.step.bind(game);
  game.step = (time: number, delta: number) => stepWithGameTime(pauseClock.shift(time), delta);
  // Dziennik błędów i niespotykanych zdarzeń (krok 55): raport pod F9; pętla gry nie zamiera po wyjątku.
  installDiagnostics(game);
  diag.note('platform', { platform: options.platform });

  // Kliknięcia poza planszą nie psują sterowania (krok 92): bez menu kontekstowego i bez „zawieszonych” klawiszy.
  const gameParent = document.getElementById('game');
  installPageInputGuard({
    window,
    document,
    isGameSurface: (target) =>
      target === window || target === document || target === document.documentElement || target === document.body ||
      (target instanceof Node && gameParent !== null && gameParent.contains(target)),
    isCanvas: (target) => target === game.canvas,
    releaseInputs: (reason) => {
      for (const scene of game.scene.getScenes(false)) scene.input?.keyboard?.resetKeys();
      diag.note('input-released', { reason });
    },
  });

  // Pad (krok 95): w dzienniku, jaki pad i czy przeglądarka zna jego układ (bez „standard” przyciski mogą być przestawione).
  window.addEventListener('gamepadconnected', (event) => {
    diag.note('gamepad-connected', { id: event.gamepad.id.slice(0, 80), mapping: event.gamepad.mapping || 'nieznany' });
  });
  window.addEventListener('gamepaddisconnected', () => diag.note('gamepad-disconnected'));

  const measure = options.viewport ?? ((parent: HTMLElement): Viewport => ({ width: parent.clientWidth, height: parent.clientHeight }));
  const rescale = (): void => {
    const parent = document.getElementById('game');
    if (parent) game.scale.setZoom(options.scaleFor(measure(parent)));
  };
  rescale();
  window.addEventListener('resize', rescale);
  options.rescaleOn?.(rescale);

  // Dostęp z konsoli przeglądarki do debugowania (tylko w trybie dev).
  if (import.meta.env.DEV) {
    (window as unknown as { __game: Phaser.Game }).__game = game;
    installDevTools(game);
  }
  return game;
}
