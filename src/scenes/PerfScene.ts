import Phaser from 'phaser';
import { SceneKey } from '@/core/types';
import { PERF_OVERLAY as P } from '@/config/perfConfig';
import { FrameStats } from '@/systems/FrameStats';

/**
 * Dyskretny licznik wydajności (krok 49a): średni FPS, najdłuższa klatka w ostatniej sekundzie,
 * ping do serwera gry i rodzaj renderera. Czasy klatek mierzymy sami (performance.now),
 * bo delta Phasera jest wygładzana i ukrywa pojedyncze szarpnięcia.
 */
export class PerfScene extends Phaser.Scene {
  private readonly stats = new FrameStats(P.windowMs);
  private text!: Phaser.GameObjects.Text;
  private lastFrameAt: number | null = null;
  private lastRefreshAt = 0;
  private pingMs: number | null = null;
  private pingTimer: number | null = null;

  constructor() {
    super({ key: SceneKey.Perf, active: true });
  }

  create(): void {
    this.text = this.add
      .text(this.scale.width - P.margin, P.margin, '', {
        fontFamily: 'monospace',
        fontSize: `${P.fontSize}px`,
        color: '#c8c8d8',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(1, 0)
      .setAlpha(P.alpha);
    this.measurePing();
    this.pingTimer = window.setInterval(() => this.measurePing(), P.pingIntervalMs);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.pingTimer !== null) window.clearInterval(this.pingTimer);
    });
  }

  override update(): void {
    const now = performance.now();
    if (this.lastFrameAt !== null) this.stats.add(now - this.lastFrameAt);
    this.lastFrameAt = now;
    if (now - this.lastRefreshAt < P.refreshMs) return;
    this.lastRefreshAt = now;

    const worst = this.stats.worstMs;
    const ping = this.pingMs === null ? '—' : `${Math.round(this.pingMs)} ms`;
    const renderer = this.game.renderer.type === Phaser.WEBGL ? 'WebGL' : 'Canvas';
    this.text
      .setText(`${Math.round(this.stats.fps)} FPS · max ${Math.round(worst)} ms · ping ${ping} · ${renderer}`)
      .setColor(worst > P.worstFrameWarnMs ? '#ff8a7a' : '#c8c8d8');
  }

  /** Ping = czas zapytania HEAD do serwera, z którego wczytano grę (bez pamięci podręcznej). */
  private measurePing(): void {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), P.pingTimeoutMs);
    const started = performance.now();
    fetch(window.location.href.split('#')[0]!, { method: 'HEAD', cache: 'no-store', signal: controller.signal })
      .then(() => (this.pingMs = performance.now() - started))
      .catch(() => (this.pingMs = null))
      .finally(() => window.clearTimeout(timeout));
  }
}
