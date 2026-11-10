import Phaser from 'phaser';
import { GlowGroup } from '@/core/displayTypes';
import type { RenderProfile, RenderQuality } from '@/core/displayTypes';
import { currentPlatform } from '@/core/platform';
import { RENDER_QUALITY_CONFIG } from '@/config/renderQualityConfig';
import { display } from '@/input/DisplayControls';
import { qualityFromSearch, renderProfile, resolveQuality, scaledParticleCount } from '@/systems/RenderQuality';

/** Obiekt, który może dostać poświatę (preFX istnieje tylko w WebGL). */
type GlowTarget = Phaser.GameObjects.Sprite | Phaser.GameObjects.Image;

/** Opcje drżenia kamery. */
interface ShakeOptions {
  /** Nie przerywaj trwającego drżenia (kolejne wstrząsy się nie sumują, STYLEGUIDE §13.5). */
  readonly ifIdle?: boolean;
  /** Przerwij trwające drżenie i zacznij od nowa (jak trzeci argument `camera.shake`). */
  readonly force?: boolean;
}

/**
 * Jeden moduł efektów ekranowych (krok U1, etap „Fundament renderu”). Każde drżenie kamery, błysk pełnoekranowy,
 * migotanie świateł i poświata idą tędy, żeby poziom jakości i „mniej błysków” działały w całej grze naraz.
 * Profil liczy czysta warstwa (`systems/RenderQuality.ts`); tu tylko Phaser. Efekty nie dotykają logiki,
 * hitboxów, czasu gry ani strumieni RNG — zmieniają wyłącznie obraz.
 * Kolejne etapy upgradu (U2 hitstop i błysk trafienia, U3 światło) dopisują się tutaj, a nie do `GameScene.ts`.
 */
class ScreenFxHub {
  private webgl = true;
  private readonly forced = typeof window === 'undefined' ? null : qualityFromSearch(window.location.search);
  private cached: RenderProfile | null = null;
  private readonly glowing = new Map<GlowTarget, GlowGroup>();
  private readonly watchers = new Set<() => void>();

  constructor() {
    display.watch(() => {
      this.cached = null;
      this.refreshGlow();
      for (const watcher of this.watchers) watcher();
    });
  }

  /** Wołane raz po starcie gry: bez WebGL (Canvas) obowiązuje Niska. */
  bindRenderer(game: Phaser.Game): void {
    this.webgl = game.renderer.type === Phaser.WEBGL;
    this.cached = null;
  }

  /** Poziom wymuszony adresem `?gfx=` (null — brak). */
  get forcedQuality(): RenderQuality | null {
    return this.webgl ? this.forced : null;
  }

  get quality(): RenderQuality {
    return this.profile.quality;
  }

  get profile(): RenderProfile {
    if (!this.cached) {
      const settings = display.settings;
      const quality = resolveQuality(settings.quality, currentPlatform(), this.webgl, this.forced);
      this.cached = renderProfile(quality, settings.reduceFlashes);
    }
    return this.cached;
  }

  /** Obserwator zmiany profilu (np. pyłki dobierające liczbę cząstek); zwraca funkcję odpinającą. */
  watch(watcher: () => void): () => void {
    this.watchers.add(watcher);
    return () => this.watchers.delete(watcher);
  }

  /** Drżenie kamery; przy „mniej błysków” — nic. Zwraca, czy ruszyło. */
  shake(camera: Phaser.Cameras.Scene2D.Camera, durationMs: number, intensity: number, options: ShakeOptions = {}): boolean {
    const scale = this.profile.shakeScale;
    if (scale <= 0 || durationMs <= 0 || intensity <= 0) return false;
    if (options.ifIdle && camera.shakeEffect.isRunning) return false;
    camera.shake(durationMs, intensity * scale, options.force ?? false);
    return true;
  }

  /** Błysk pełnoekranowy; przy „mniej błysków” — nic. */
  flash(camera: Phaser.Cameras.Scene2D.Camera, durationMs: number, red: number, green: number, blue: number): boolean {
    if (!this.profile.screenFlash) return false;
    camera.flash(durationMs, red, green, blue);
    return true;
  }

  /** Czy światła mogą migotać (pochodnie, ogień, paleniska); false — stała jasność. */
  get flicker(): boolean {
    return this.profile.lightFlicker;
  }

  /** Liczba ozdobnych cząstek na bieżącym poziomie (Niska — tyle, ile przed upgradem). */
  particles(base: number): number {
    return scaledParticleCount(base, this.profile);
  }

  /**
   * Poświata dla rzeczy, która naprawdę świeci (STYLEGUIDE §13.6). Włącza się, gdy poziom jakości ma tę grupę,
   * i wyłącza po zmianie poziomu w pauzie. Obiekt wypada z rejestru po zniszczeniu.
   */
  glow(target: GlowTarget, group: GlowGroup): void {
    if (this.glowing.has(target)) return;
    this.glowing.set(target, group);
    target.once(Phaser.GameObjects.Events.DESTROY, () => this.glowing.delete(target));
    this.applyGlow(target, group);
  }

  private refreshGlow(): void {
    for (const [target, group] of this.glowing) this.applyGlow(target, group);
  }

  private applyGlow(target: GlowTarget, group: GlowGroup): void {
    const fx = target.preFX;
    if (!fx) return;
    const want = this.profile.glow.has(group);
    const has = fx.list.length > 0;
    if (want === has) return;
    if (!want) {
      fx.clear();
      return;
    }
    const g = RENDER_QUALITY_CONFIG.glow[group];
    fx.setPadding(g.distance);
    fx.addGlow(g.color, g.outerStrength, g.innerStrength, false, g.quality, g.distance);
  }
}

export const screenFx = new ScreenFxHub();
export { GlowGroup };
