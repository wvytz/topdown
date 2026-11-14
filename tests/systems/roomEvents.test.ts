import { describe, expect, it } from 'vitest';
import { ROOM_EVENT_CONFIG } from '@/config/roomEventConfig';
import { createRng } from '@/core/random';
import {
  RoomEventKind,
  TorchOutcome,
  TorchRace,
  eventGold,
  planRoomEvents,
  purseCaughtBy,
  purseHeading,
  purseSpawnPoint,
  roomBounds,
  stepPurse,
  torchLightRadius,
} from '@/systems/RoomEvents';
import { RoomKind } from '@/core/dungeonTypes';

const hordeRooms = (n: number) => Array.from({ length: n }, (_, i) => ({ roomId: i + 1, waves: [5, 5] }));

describe('Wydarzenia w pokojach — plan (krok U8a)', () => {
  it('co najmniej jeden pokój nawały zostaje zwykły, limit wg piętra', () => {
    for (let seed = 0; seed < 50; seed++) {
      expect(planRoomEvents(hordeRooms(1), 3, ROOM_EVENT_CONFIG, createRng(seed))).toHaveLength(0);
      const plans = planRoomEvents(hordeRooms(6), 1, ROOM_EVENT_CONFIG, createRng(seed));
      expect(plans.length).toBeLessThanOrEqual(1);
      const later = planRoomEvents(hordeRooms(6), 7, ROOM_EVENT_CONFIG, createRng(seed));
      expect(later.length).toBeLessThanOrEqual(3);
      expect(new Set(later.map((p) => p.kind)).size).toBe(later.length);
      expect(new Set(later.map((p) => p.roomId)).size).toBe(later.length);
    }
  });

  it('deterministyczny i różny między seedami — dwa runy różnią się przebiegiem', () => {
    const a = planRoomEvents(hordeRooms(6), 4, ROOM_EVENT_CONFIG, createRng(7));
    expect(planRoomEvents(hordeRooms(6), 4, ROOM_EVENT_CONFIG, createRng(7))).toEqual(a);
    const variants = new Set(Array.from({ length: 20 }, (_, s) => JSON.stringify(planRoomEvents(hordeRooms(6), 4, ROOM_EVENT_CONFIG, createRng(s)))));
    expect(variants.size).toBeGreaterThan(5);
  });

  it('wyłącznik i wymuszenie z adresu', () => {
    expect(planRoomEvents(hordeRooms(6), 4, { ...ROOM_EVENT_CONFIG, enabled: false }, createRng(1))).toEqual([]);
    const forced = planRoomEvents(hordeRooms(3), 1, ROOM_EVENT_CONFIG, createRng(1), RoomEventKind.Dark);
    expect(forced.map((p) => p.kind)).toEqual([RoomEventKind.Dark, RoomEventKind.Dark, RoomEventKind.Dark]);
    expect(forced[0]!.waves).toBe(2);
  });

  it('złoto rośnie z piętrem', () => {
    expect(eventGold({ base: 10, perFloor: 5 }, 1)).toBe(10);
    expect(eventGold({ base: 10, perFloor: 5 }, 3)).toBe(20);
  });
});

describe('Pochodnia', () => {
  it('wygrana przed zgaśnięciem, wynik zapada raz', () => {
    const race = TorchRace.forWaves(ROOM_EVENT_CONFIG.torch, 2);
    expect(race.durationMs).toBe(ROOM_EVENT_CONFIG.torch.baseMs + 2 * ROOM_EVENT_CONFIG.torch.perWaveMs);
    expect(race.update(0, true)).toBe(TorchOutcome.Burning); // przed startem nic
    race.start(1000);
    expect(race.update(2000, false)).toBe(TorchOutcome.Burning);
    expect(race.update(3000, true)).toBe(TorchOutcome.Won);
    expect(race.update(999_999, false)).toBe(TorchOutcome.Won);
  });

  it('gaśnie po czasie; światło maleje z ogniem', () => {
    const race = new TorchRace(1000);
    race.start(0);
    expect(race.remaining(500)).toBeCloseTo(0.5);
    expect(race.update(1000, false)).toBe(TorchOutcome.BurntOut);
    expect(race.update(1100, true)).toBe(TorchOutcome.BurntOut);
    const cfg = ROOM_EVENT_CONFIG.torch;
    expect(torchLightRadius(cfg, 1)).toBe(cfg.lightRadius.full);
    expect(torchLightRadius(cfg, 0)).toBe(cfg.lightRadius.end);
  });
});

describe('Sakiewka', () => {
  const room = { id: 1, x: 0, y: 0, width: 10, height: 8, kind: RoomKind.Normal };
  const bounds = roomBounds(room, 32, 16);
  const cfg = ROOM_EVENT_CONFIG.purse;

  it('ucieka od bliskiego bohatera pełną prędkością', () => {
    const at = { x: 160, y: 128 };
    const h = purseHeading(at, [{ x: 120, y: 128 }], bounds, cfg, at);
    expect(h.x).toBeGreaterThan(0.9);
    expect(h.speed).toBe(cfg.speed);
    const next = stepPurse(at, h, bounds, 100);
    expect(next.x).toBeGreaterThan(at.x);
  });

  it('bez bohatera w pobliżu błądzi wolniej w stronę celu', () => {
    const at = { x: 160, y: 128 };
    const h = purseHeading(at, [{ x: 1000, y: 1000 }], bounds, cfg, { x: 160, y: 60 });
    expect(h.y).toBeLessThan(0);
    expect(h.speed).toBe(cfg.wanderSpeed);
  });

  it('przy murze ślizga się wzdłuż niego i nie wychodzi z pokoju', () => {
    const at = { x: bounds.right - 2, y: 128 };
    const h = purseHeading(at, [{ x: bounds.right - 40, y: 128 }], bounds, cfg, at);
    const next = stepPurse(at, h, bounds, 1000);
    expect(next.x).toBeLessThanOrEqual(bounds.right);
  });

  it('złapanie dotykiem i start z dala od bohatera', () => {
    expect(purseCaughtBy({ x: 0, y: 0 }, [{ x: 10, y: 10 }], cfg.catchRadius)).not.toBeNull();
    expect(purseCaughtBy({ x: 0, y: 0 }, [{ x: 30, y: 0 }], cfg.catchRadius)).toBeNull();
    const spawn = purseSpawnPoint(bounds, [{ x: bounds.left, y: bounds.top }]);
    expect(spawn.x).toBeGreaterThan((bounds.left + bounds.right) / 2);
    expect(spawn.y).toBeGreaterThan((bounds.top + bounds.bottom) / 2);
  });
});
