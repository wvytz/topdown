import { canvasScale, startGame } from '@/bootstrap';
import { showSafariGateIfNeeded } from '@/browser/SafariGate';
import { display } from '@/input/DisplayControls';

// Wersja PC (index.html): mysz, klawiatura i pad; skala w całkowitych krotnościach albo — po wybraniu „Wypełnij okno” — ułamkowa (krok 118).
// Na Safari zamiast gry ekran z innymi przeglądarkami (krok 142).
if (!showSafariGateIfNeeded()) {
  display.install(window);
  startGame({
    platform: 'pc',
    scaleFor: (viewport) => canvasScale(viewport, display.settings.fillWindow),
    rescaleOn: (rescale) => display.watch(rescale),
  });
}
