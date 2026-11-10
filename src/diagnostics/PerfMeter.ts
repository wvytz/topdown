import type Phaser from 'phaser';
import { PERF_CONFIG } from '@/config/perfConfig';
import { FrameStats } from '@/systems/FrameStats';
import type { FrameSummary } from '@/systems/FrameStats';

/** Scena gry z licznikiem wrogów (bez importu `GameScene`, żeby licznik nie ciągnął całej gry). */
interface SceneWithEnemies {
  readonly enemies?: { readonly aliveCount?: number };
}

export interface PerfSnapshot extends FrameSummary {
  readonly enemies: number;
  readonly objects: number;
}

/**
 * Licznik wydajności `?perf=1` (krok U0): mały napis w rogu — FPS, 95. percentyl odstępu klatek, praca gry w klatce,
 * żywi wrogowie i obiekty sceny. Działa też w wersji produkcyjnej (podgląd na telefonie właściciela).
 * Skrypt `npm run perf` czyta te same liczby przez `window.__perf()`.
 */
export function installPerfMeter(game: Phaser.Game): void {
  const stats = new FrameStats();
  // Odstęp = od początku poprzedniej klatki do początku tej; praca = od początku kroku do końca rysowania.
  let stepStart = 0;
  let prevStart = -1;
  game.events.on('prestep', () => {
    stepStart = performance.now();
  });
  game.events.on('postrender', () => {
    const now = performance.now();
    if (prevStart >= 0) stats.push(stepStart - prevStart, now - stepStart);
    prevStart = stepStart;
  });

  const snapshot = (): PerfSnapshot => {
    let enemies = 0;
    let objects = 0;
    for (const scene of game.scene.getScenes(true)) {
      objects += scene.children?.length ?? 0;
      enemies += (scene as unknown as SceneWithEnemies).enemies?.aliveCount ?? 0;
    }
    return { ...stats.summary(), enemies, objects };
  };
  (window as unknown as { __perf: () => PerfSnapshot; __perfReset: () => void }).__perf = snapshot;
  (window as unknown as { __perfReset: () => void }).__perfReset = () => stats.reset();

  const box = document.createElement('div');
  box.setAttribute('aria-hidden', 'true');
  Object.assign(box.style, {
    position: 'fixed',
    left: '4px',
    bottom: '4px',
    zIndex: '50',
    padding: '2px 6px',
    background: 'rgba(0,0,0,0.6)',
    color: '#d6f5c8',
    font: '11px/1.3 monospace',
    pointerEvents: 'none',
    whiteSpace: 'pre',
  });
  document.body.appendChild(box);
  window.setInterval(() => {
    const s = snapshot();
    box.textContent =
      `${s.fps} FPS  p95 ${s.intervalP95} ms  maks ${s.intervalMax} ms\n` +
      `praca ${s.workP50}/${s.workP95} ms  <30FPS ${Math.round(s.jankShare * 100)}%  wrogów ${s.enemies}  obiektów ${s.objects}`;
  }, PERF_CONFIG.refreshMs);
}
