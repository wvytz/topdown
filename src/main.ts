import { canvasScale, startGame } from '@/bootstrap';
import { display } from '@/input/DisplayControls';

// Wersja PC (index.html): mysz, klawiatura i pad; skala w całkowitych krotnościach albo — po wybraniu „Wypełnij okno” — ułamkowa (krok 118).
display.install(window);
startGame({
  platform: 'pc',
  scaleFor: (viewport) => canvasScale(viewport, display.settings.fillWindow),
  rescaleOn: (rescale) => display.watch(rescale),
});
