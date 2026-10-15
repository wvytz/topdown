import { describe, expect, it } from 'vitest';
import { AIM_ASSIST, TOUCH_AUTO_AIM_RANGE, TOUCH_STICK } from '@/config/inputConfig';
import { PLAYER_COMBAT } from '@/config/combatConfig';
import { assistAimDirection, keyboardAimDirection, stickState, stickToMovement, touchAimDirection, autoAimDirection } from '@/systems/Aim';

const ORIGIN = { x: 100, y: 100 };
const RIGHT = { x: 1, y: 0 };
const angleOf = (v: { x: number; y: number }): number => (Math.atan2(v.y, v.x) * 180) / Math.PI;
/** Cel w odległości `dist` pod kątem `deg` od gracza. */
const targetAt = (deg: number, dist: number, radius = 10) => ({
  x: ORIGIN.x + Math.cos((deg * Math.PI) / 180) * dist,
  y: ORIGIN.y + Math.sin((deg * Math.PI) / 180) * dist,
  radius,
});

describe('stickState — gałka dotykowa', () => {
  it('martwa strefa: drobny ruch kciuka nic nie robi', () => {
    expect(stickState(5, 5, 56, 0.25).strength).toBe(0);
    expect(stickToMovement(stickState(5, 5, 56, 0.25))).toEqual({ x: 0, y: 0 });
  });

  it('za martwą strefą kierunek jednostkowy, siła rośnie do 1 na brzegu i dalej się nie zwiększa', () => {
    const half = stickState(0, 56 * 0.625, 56, 0.25);
    expect(half.direction.x).toBeCloseTo(0);
    expect(half.direction.y).toBeCloseTo(1);
    expect(half.strength).toBeCloseTo(0.5);
    expect(stickState(-200, 0, 56, 0.25)).toEqual({ direction: { x: -1, y: 0 }, strength: 1 });
  });

  it('gałka ruchu daje pełny kąt, nie tylko 8 kierunków', () => {
    const move = stickToMovement(stickState(30, 10, TOUCH_STICK.radius, TOUCH_STICK.deadzone));
    expect(angleOf(move)).toBeCloseTo(18.43, 1);
  });
});

describe('keyboardAimDirection — celowanie samą klawiaturą', () => {
  it('celuje w kierunku ruchu (także po skosie)', () => {
    expect(keyboardAimDirection({ x: 0, y: -1 }, false, RIGHT)).toEqual({ x: 0, y: -1 });
    expect(angleOf(keyboardAimDirection({ x: 1, y: 1 }, false, RIGHT))).toBeCloseTo(45);
  });

  it('postój zostawia poprzedni kierunek', () => {
    expect(keyboardAimDirection({ x: 0, y: 0 }, false, RIGHT)).toBe(RIGHT);
  });

  it('blokada kierunku: można się cofać i atakować do przodu', () => {
    expect(keyboardAimDirection({ x: -1, y: 0 }, true, RIGHT)).toBe(RIGHT);
  });
});

describe('assistAimDirection — wspomaganie celowania', () => {
  const keyboard = AIM_ASSIST.keyboard;

  it('mysz nie dostaje wspomagania', () => {
    expect(assistAimDirection(ORIGIN, RIGHT, [targetAt(10, 100)], AIM_ASSIST.mouse)).toBe(RIGHT);
  });

  it('wróg w stożku: kierunek dociąga do jego środka', () => {
    expect(angleOf(assistAimDirection(ORIGIN, RIGHT, [targetAt(15, 150)], keyboard))).toBeCloseTo(15);
  });

  it('wróg poza stożkiem albo poza zasięgiem: kierunek bez zmian', () => {
    expect(assistAimDirection(ORIGIN, RIGHT, [targetAt(60, 150)], keyboard)).toBe(RIGHT);
    expect(assistAimDirection(ORIGIN, RIGHT, [targetAt(5, keyboard.range + 1)], keyboard)).toBe(RIGHT);
    expect(assistAimDirection(ORIGIN, RIGHT, [targetAt(180, 100)], keyboard)).toBe(RIGHT);
  });

  it('wybiera cel najbliżej osi celowania, nie najbliższy odległością', () => {
    const near = targetAt(-18, 60);
    const onAxis = targetAt(4, 250);
    expect(angleOf(assistAimDirection(ORIGIN, RIGHT, [near, onAxis], keyboard))).toBeCloseTo(4);
  });

  it('duży cel łapie się wcześniej (liczy się jego brzeg, nie środek)', () => {
    const small = targetAt(30, 100, 5);
    const big = targetAt(30, 100, 40);
    expect(assistAimDirection(ORIGIN, RIGHT, [small], keyboard)).toBe(RIGHT);
    expect(angleOf(assistAimDirection(ORIGIN, RIGHT, [big], keyboard))).toBeCloseTo(30);
  });

  it('działa przez granicę ±180° (cel z lewej, celowanie w lewo)', () => {
    const left = { x: -1, y: 0 };
    expect(angleOf(assistAimDirection(ORIGIN, left, [targetAt(-170, 120)], keyboard))).toBeCloseTo(-170);
  });

  it('cios wręcz trafia i bez wspomagania: błąd 8 kierunków (22,5°) mieści się w łuku miecza', () => {
    expect(PLAYER_COMBAT.meleeArcDeg / 2).toBeGreaterThan(22.5);
  });
});

describe('touchAimDirection — celowanie gałkami dotykowymi', () => {
  const LEFT = { x: -1, y: 0 };
  const UP = { x: 0, y: -1 };

  it('gałka strzału ma pierwszeństwo: obrót o 180° i salwa jednym kciukiem', () => {
    expect(touchAimDirection(LEFT, RIGHT, { x: 1, y: 0 }, RIGHT)).toBe(LEFT);
  });

  it('bez gałki strzału celuje gałka ataku', () => {
    expect(touchAimDirection(null, UP, { x: 1, y: 0 }, RIGHT)).toBe(UP);
  });

  it('bez gałek: kierunek ruchu, a na postoju poprzedni kierunek', () => {
    expect(touchAimDirection(null, null, { x: 0, y: 1 }, RIGHT)).toEqual({ x: 0, y: 1 });
    expect(touchAimDirection(null, null, { x: 0, y: 0 }, LEFT)).toBe(LEFT);
  });
});

describe('autoAimDirection — stuknięcie celuje samo (jak w Brawl Stars)', () => {
  it('celuje w najbliższy cel w dowolnym kierunku, także za plecami', () => {
    const behind = targetAt(180, 80);
    const ahead = targetAt(0, 200);
    expect(angleOf(autoAimDirection(ORIGIN, [ahead, behind], TOUCH_AUTO_AIM_RANGE)!)).toBeCloseTo(180);
  });

  it('nikogo w zasięgu — null (atak w bieżącym kierunku)', () => {
    expect(autoAimDirection(ORIGIN, [targetAt(30, TOUCH_AUTO_AIM_RANGE + 50)], TOUCH_AUTO_AIM_RANGE)).toBeNull();
    expect(autoAimDirection(ORIGIN, [], TOUCH_AUTO_AIM_RANGE)).toBeNull();
  });

  it('liczy się brzeg celu: duży boss dalej, ale bliżej brzegiem, wygrywa', () => {
    const boss = targetAt(90, 120, 50);
    const spider = targetAt(-90, 90, 5);
    expect(angleOf(autoAimDirection(ORIGIN, [spider, boss], TOUCH_AUTO_AIM_RANGE)!)).toBeCloseTo(90);
  });
});
