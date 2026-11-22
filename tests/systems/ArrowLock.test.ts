import { describe, expect, it } from 'vitest';
import { ARROW_LOCK } from '@/config/arrowLockConfig';
import { ArrowLock, type LockCandidate } from '@/systems/ArrowLock';

const origin = { x: 0, y: 0 };
const target = (x: number, y: number, extra: Partial<LockCandidate> = {}): LockCandidate => ({ x, y, radius: 10, isDead: false, active: true, ...extra });

describe('ArrowLock — blokada celu łucznika', () => {
  it('bez trafienia nie przejmuje strzału', () => {
    expect(new ArrowLock().steer(origin, { x: 1, y: 0 }, 'auto', ARROW_LOCK)).toBeNull();
  });

  it('po trafieniu strzały lecą w cel, także gdy celownik wskazuje gdzie indziej (celowanie samo)', () => {
    const lock = new ArrowLock<LockCandidate>();
    lock.hit(target(0, 200), 2);
    const dir = lock.steer(origin, { x: 1, y: 0 }, 'auto', ARROW_LOCK);
    expect(dir?.x).toBeCloseTo(0);
    expect(dir?.y).toBeCloseTo(1);
  });

  it('celowanie ręczne w stożku dociąga do celu, poza stożkiem zostaje w rękach gracza i nie zwalnia blokady', () => {
    const lock = new ArrowLock<LockCandidate>();
    lock.hit(target(200, 0), 1);
    const near = lock.steer(origin, { x: Math.cos(0.5), y: Math.sin(0.5) }, 'manual', ARROW_LOCK);
    expect(near?.y).toBeCloseTo(0);
    expect(lock.steer(origin, { x: 0, y: 1 }, 'manual', ARROW_LOCK)).toBeNull();
    expect(lock.target).not.toBeNull();
    expect(lock.steer(origin, { x: 1, y: 0.2 }, 'manual', ARROW_LOCK)).not.toBeNull();
  });

  it('martwy albo nieaktywny cel zwalnia blokadę', () => {
    const lock = new ArrowLock<LockCandidate>();
    const mob = { ...target(100, 0), isDead: false };
    lock.hit(mob, 1);
    (mob as { isDead: boolean }).isDead = true;
    expect(lock.steer(origin, { x: 1, y: 0 }, 'auto', ARROW_LOCK)).toBeNull();
    expect(lock.target).toBeNull();
  });

  it('cel dalej niż zasięg zwalnia blokadę', () => {
    const lock = new ArrowLock<LockCandidate>();
    lock.hit(target(ARROW_LOCK.releaseRange + 5, 0), 2);
    expect(lock.steer(origin, { x: 1, y: 0 }, 'auto', ARROW_LOCK)).toBeNull();
    expect(lock.target).toBeNull();
  });

  it('elita nie odbiera blokady bossowi, ale boss odbiera elicie; ta sama ranga nie przełącza', () => {
    const lock = new ArrowLock<LockCandidate>();
    const elite = target(100, 0);
    const otherElite = target(0, 100);
    const boss = target(-100, 0);
    lock.hit(elite, 1);
    lock.hit(otherElite, 1);
    expect(lock.target).toBe(elite);
    lock.hit(boss, 2);
    expect(lock.target).toBe(boss);
    lock.hit(elite, 1);
    expect(lock.target).toBe(boss);
  });
});
