import { canvasScale, startGame } from '@/bootstrap';

// Wersja PC (index.html): mysz, klawiatura i pad; skala tylko w całkowitych krotnościach.
startGame({ platform: 'pc', scaleFor: (viewport) => canvasScale(viewport) });
