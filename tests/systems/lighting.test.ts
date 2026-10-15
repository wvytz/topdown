import { describe, expect, it } from 'vitest';
import { FUNGAL_FOG, LIGHTING } from '@/config/lightingConfig';
import { ENEMY_VARIANTS } from '@/config/combatConfig';
import { FLOOR_MODIFIERS } from '@/config/floorModifierConfig';
import { FloorModifierId } from '@/core/floorModifierTypes';
import {
  actorVisibility,
  ambientDarkness,
  buildLightStamp,
  darknessModifierProfile,
  flickerRadius,
  lightTouchesView,
  pixelEllipse,
  playerLightStrength,
  overlayOrigin,
  pointLightStrength,
  smoothFalloff,
} from '@/systems/lighting';
import { CAMERA_CONFIG, GAME_HEIGHT, GAME_WIDTH } from '@/config/gameConfig';

const AMBIENT = LIGHTING.ambient;

describe('smoothFalloff — płynne przejście (krok 28a, bez pasm)', () => {
  it('0 → 0, 1 → 1, połowa → połowa, poza zakresem przycięte; łagodne końce', () => {
    expect(smoothFalloff(0)).toBe(0);
    expect(smoothFalloff(1)).toBe(1);
    expect(smoothFalloff(0.5)).toBeCloseTo(0.5);
    expect(smoothFalloff(-2)).toBe(0);
    expect(smoothFalloff(7)).toBe(1);
    expect(smoothFalloff(0.05)).toBeLessThan(0.05);
    expect(smoothFalloff(0.95)).toBeGreaterThan(0.95);
  });
});

describe('ambientDarkness — mrok wokół gracza', () => {
  const samples = Array.from({ length: 400 }, (_, i) => i);

  it('pełne światło do promienia gracza, potem nie maleje i nie przekracza limitu 30%', () => {
    let previous = 0;
    for (const d of samples) {
      const dark = ambientDarkness(d, AMBIENT);
      if (d <= AMBIENT.fullLightRadius) expect(dark).toBe(0);
      expect(dark).toBeGreaterThanOrEqual(previous);
      expect(dark).toBeLessThanOrEqual(AMBIENT.maxDarkness);
      previous = dark;
    }
    expect(ambientDarkness(AMBIENT.edgeRadius, AMBIENT)).toBeCloseTo(AMBIENT.maxDarkness);
  });

  it('płynnie, bez „kręgów”: sąsiednie piksele różnią się o ułamek procenta, a poziomów są setki', () => {
    const range = AMBIENT.edgeRadius - AMBIENT.fullLightRadius;
    // Największa stromość smoothstep to 1,5 × średnia — skok na 1 px nie większy niż to.
    const maxStep = (1.5 * AMBIENT.maxDarkness) / range + 1e-9;
    for (let d = 1; d < 400; d++) {
      expect(Math.abs(ambientDarkness(d, AMBIENT) - ambientDarkness(d - 1, AMBIENT))).toBeLessThanOrEqual(maxStep);
    }
    const levels = new Set(samples.map((d) => ambientDarkness(d, AMBIENT).toFixed(4)));
    expect(levels.size).toBeGreaterThan(range * 0.9);
  });

  it('siła światła gracza odwraca mrok: maxDarkness × (1 − siła) = mrok', () => {
    for (const d of samples) {
      expect(AMBIENT.maxDarkness * (1 - playerLightStrength(d, AMBIENT))).toBeCloseTo(ambientDarkness(d, AMBIENT));
    }
  });

  it('profil „Mroku”: pełne światło do (1 − softEdge) promienia, pełny mrok od promienia', () => {
    const profile = darknessModifierProfile(112, LIGHTING.darknessModifier);
    expect(ambientDarkness(112 * (1 - LIGHTING.darknessModifier.softEdge), profile)).toBe(0);
    expect(ambientDarkness(112, profile)).toBeCloseTo(LIGHTING.darknessModifier.maxDarkness);
    expect(ambientDarkness(500, profile)).toBeCloseTo(LIGHTING.darknessModifier.maxDarkness);
  });
});

describe('światło punktowe i stemple', () => {
  it('pochodnia: 1 w środku, płynnie maleje, 0 od promienia', () => {
    const { radius } = LIGHTING.torch;
    expect(pointLightStrength(0, radius)).toBe(1);
    expect(pointLightStrength(radius, radius)).toBe(0);
    expect(pointLightStrength(radius + 5, radius)).toBe(0);
    for (let d = 1; d < radius; d++) expect(pointLightStrength(d, radius)).toBeLessThanOrEqual(pointLightStrength(d - 1, radius));
    const levels = new Set(Array.from({ length: radius }, (_, d) => pointLightStrength(d, radius).toFixed(6)));
    expect(levels.size).toBe(radius);
  });

  it('stempel: kwadrat 2r, środek prawie w pełni kryjący, rogi puste, wiele poziomów alfy (gradient)', () => {
    const stamp = buildLightStamp(72, (d) => pointLightStrength(d, 72));
    expect(stamp.size).toBe(144);
    expect(stamp.alpha[72 * 144 + 72]).toBeGreaterThanOrEqual(254);
    expect(stamp.alpha[0]).toBe(0);
    expect(new Set(stamp.alpha).size).toBeGreaterThan(100);
  });

  it('migotanie: promień skacze tylko o wartości z konfiguracji', () => {
    const { radius, flickerOffsets } = LIGHTING.torch;
    const allowed = new Set(flickerOffsets.map((o) => radius + o));
    for (const roll of [0, 0.2, 0.49, 0.5, 0.75, 0.999]) expect(allowed.has(flickerRadius(radius, flickerOffsets, roll))).toBe(true);
    expect(flickerRadius(radius, flickerOffsets, 0)).toBe(radius + flickerOffsets[0]!);
    expect(flickerRadius(radius, [], 0.7)).toBe(radius);
  });

  it('pomijanie świateł poza kadrem', () => {
    const view = { x: 100, y: 100, width: 480, height: 270 };
    expect(lightTouchesView({ x: 300, y: 200 }, 72, view)).toBe(true);
    expect(lightTouchesView({ x: 50, y: 200 }, 72, view)).toBe(true); // poza kadrem, ale światło sięga
    expect(lightTouchesView({ x: 20, y: 200 }, 72, view)).toBe(false);
    expect(lightTouchesView({ x: 300, y: 450 }, 72, view)).toBe(false);
  });
});

describe('overlayOrigin — warstwa mroku pokrywa cały kadr (krok 28)', () => {
  const viewW = GAME_WIDTH / CAMERA_CONFIG.zoom;
  const viewH = GAME_HEIGHT / CAMERA_CONFIG.zoom;
  const margin = 24; // jak MARGIN w LightingOverlay
  const half = { x: Math.ceil(viewW / 2) + margin, y: Math.ceil(viewH / 2) + margin };
  const world = { width: 2400, height: 1600 };
  // Kadr kamery o środku (cx, cy), przycięty do granic świata.
  const viewAt = (cx: number, cy: number) => {
    const x = Math.max(0, Math.min(world.width - viewW, cx - viewW / 2));
    const y = Math.max(0, Math.min(world.height - viewH, cy - viewH / 2));
    return { x, y, cx: x + viewW / 2, cy: y + viewH / 2 };
  };

  it('kadr po ruchu kamery o mniej niż zapas leży w całości pod warstwą — także przy brzegach i w narożnikach', () => {
    for (const cx of [0, 100, 300, 1200, 2200, 2400]) {
      for (const cy of [0, 120, 800, 1500, 1600]) {
        const before = viewAt(cx, cy);
        const o = overlayOrigin({ x: before.cx, y: before.cy }, half, world);
        for (const [dx, dy] of [[0, 0], [20, 20], [-20, -20], [20, -20], [-20, 20]] as const) {
          const after = viewAt(before.cx + dx, before.cy + dy);
          expect(o.x).toBeLessThanOrEqual(after.x);
          expect(o.y).toBeLessThanOrEqual(after.y);
          expect(o.x + half.x * 2).toBeGreaterThanOrEqual(after.x + viewW);
          expect(o.y + half.y * 2).toBeGreaterThanOrEqual(after.y + viewH);
        }
      }
    }
  });

  it('w środku mapy warstwa jest wyśrodkowana na kadrze', () => {
    expect(overlayOrigin({ x: 1200, y: 800 }, half, world)).toEqual({ x: 1200 - half.x, y: 800 - half.y });
  });
});

describe('pixelEllipse — cień pod postacią', () => {
  it('symetryczna, wypełniony środek, puste rogi', () => {
    const w = 22;
    const h = 12;
    const mask = pixelEllipse(w, h);
    expect(mask[Math.floor(h / 2) * w + Math.floor(w / 2)]).toBe(1);
    expect(mask[0]).toBe(0);
    expect(mask[w - 1]).toBe(0);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) expect(mask[y * w + x]).toBe(mask[y * w + (w - 1 - x)]);
    }
  });
});

describe('actorVisibility — wrogowie widoczni dopiero w świetle (krok 30)', () => {
  const { revealStrength } = LIGHTING.enemyReveal;
  const vision = FLOOR_MODIFIERS[FloorModifierId.Darkness].effects.visionRadius!;
  const DARK = darknessModifierProfile(vision, LIGHTING.darknessModifier);
  const FOG = FUNGAL_FOG.profile;
  const P = { x: 0, y: 0 };
  const at = (d: number) => ({ x: d, y: 0 });

  it('w „Mroku”: w pełni widoczny w pełnym świetle, niewidoczny od krawędzi widzenia', () => {
    expect(actorVisibility(at(0), P, DARK, [], revealStrength)).toBe(1);
    expect(actorVisibility(at(DARK.fullLightRadius), P, DARK, [], revealStrength)).toBe(1);
    expect(actorVisibility(at(vision), P, DARK, [], revealStrength)).toBe(0);
    expect(actorVisibility(at(vision * 3), P, DARK, [], revealStrength)).toBe(0);
  });

  it('znika płynnie (bez skoku), im dalej, tym słabiej', () => {
    for (const profile of [DARK, FOG]) {
      let prev = 1;
      for (let d = 0; d <= profile.edgeRadius; d++) {
        const v = actorVisibility(at(d), P, profile, [], revealStrength);
        expect(v).toBeLessThanOrEqual(prev);
        expect(prev - v).toBeLessThan(0.1);
        prev = v;
      }
    }
  });

  it('w mgle latarnia odsłania wroga z dala od bohatera; bez latarni — niewidoczny', () => {
    const lantern = { x: 400, y: 0, radius: LIGHTING.torch.radius };
    expect(actorVisibility(at(400), P, FOG, [], revealStrength)).toBe(0);
    expect(actorVisibility(at(400), P, FOG, [lantern], revealStrength)).toBe(1);
    expect(actorVisibility(at(400 + lantern.radius), P, FOG, [lantern], revealStrength)).toBe(0);
  });

  it('balans: wróg atakujący wręcz jest zawsze w pełni widoczny („Mrok” i mgła)', () => {
    const reach = Math.max(...Object.values(ENEMY_VARIANTS).map((v) => (v.attack && 'hitRange' in v.attack ? v.attack.hitRange : 0)));
    expect(reach).toBeGreaterThan(0);
    for (const profile of [DARK, FOG]) expect(actorVisibility(at(reach), P, profile, [], revealStrength)).toBe(1);
  });
});
