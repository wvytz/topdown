import Phaser from 'phaser';
import { canvasScale, startGame } from '@/bootstrap';
import { showSafariGateIfNeeded } from '@/browser/SafariGate';
import { setPlayerInputFactory } from '@/input/playerInput';
import { TouchInput } from '@/mobile/TouchInput';
import { TouchScene } from '@/mobile/TouchScene';

/**
 * Wersja mobilna (mobile.html, krok 96): ta sama gra co na PC, inne sterowanie i skala.
 * - dotyk: gałki i przyciski (TouchScene), stuknięcie celuje samo (jak w Brawl Stars);
 * - skala ułamkowa: płótno wypełnia ekran telefonu (wyjątek od STYLEGUIDE §2 tylko w tej wersji);
 * - własna, lokalna tablica wyników (persistence/highscoreBoards.ts).
 */
setPlayerInputFactory((scene) => new TouchInput(scene));

/** Widoczna część strony: na telefonie pasek adresu i klawiatura zabierają miejsce, którego clientHeight nie widzi. */
function visibleViewport(parent: HTMLElement): { width: number; height: number } {
  const visible = window.visualViewport;
  return {
    width: Math.min(parent.clientWidth, visible?.width ?? window.innerWidth),
    height: Math.min(parent.clientHeight, visible?.height ?? window.innerHeight),
  };
}

// Na Safari (iPhone, iPad) zamiast gry ekran z innymi przeglądarkami (krok 142).
const blocked = showSafariGateIfNeeded();
if (!blocked) {
  startGame({
    platform: 'mobile',
    extraScenes: [TouchScene],
    scaleFor: (viewport) => canvasScale(viewport, true),
    viewport: visibleViewport,
    // Po obrocie telefonu i wejściu w pełny ekran wymiary dochodzą z opóźnieniem — liczymy od razu i jeszcze raz chwilę później.
    rescaleOn: (rescale) => {
      const soon = (): void => {
        rescale();
        window.setTimeout(rescale, 300);
      };
      window.addEventListener('orientationchange', soon);
      document.addEventListener('fullscreenchange', soon);
      // Powrót z innej aplikacji (krok U12c): przeglądarka wychodzi z pełnego ekranu i wymiary dochodzą z opóźnieniem.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') soon();
      });
      window.visualViewport?.addEventListener('resize', soon);
    },
    phaser: {
      // Dotyk w menu: kilka palców naraz. Gałki w grze słuchają dotyku same, na całej stronie (TouchScene).
      input: { activePointers: 4 },
      // Płótno centruje CSS (#game: flex) — wyliczenia Phasera po obrocie telefonu potrafiły przesunąć płótno poza ekran.
      autoCenter: Phaser.Scale.NO_CENTER,
    },
  });
}

/**
 * Dotyk prosi o pełny ekran w poziomie — bez paska przeglądarki gra jest większa. Krok U12c (tester: po przełączeniu
 * aplikacji na dole zostaje pasek adresu): przeglądarka wychodzi z pełnego ekranu, gdy gra traci widoczność,
 * a o wejście można poprosić tylko w odpowiedzi na dotyk — więc nasłuch zostaje na stałe i pierwszy dotyk
 * po powrocie wchodzi w pełny ekran ponownie (kciuk i tak dotyka przycisku gry, więc nic nie trzeba robić dodatkowo).
 * iPhone (Safari) pełnego ekranu stron nie obsługuje; wtedy nic się nie dzieje.
 */
function enterFullscreenOnTouch(): void {
  const root = document.documentElement;
  if (document.fullscreenElement || !root.requestFullscreen) return;
  root
    .requestFullscreen({ navigationUI: 'hide' })
    .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
    .catch(() => undefined);
}
if (!blocked) window.addEventListener('touchend', enterFullscreenOnTouch);
