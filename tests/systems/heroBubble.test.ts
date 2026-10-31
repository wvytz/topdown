import { describe, expect, it } from 'vitest';
import { COOP_CONFIG } from '@/config/coopConfig';
import { HERO_DEFINITIONS } from '@/config/heroConfig';
import { BubbleContact, bubblePush } from '@/systems/HeroBubble';

const config = COOP_CONFIG.bubble;
const R = 12;

describe('żelowe bańki bohaterów (krok 152)', () => {
  it('daleko od siebie — bez odpychania', () => {
    expect(bubblePush({ x: 0, y: 0, radius: R }, { x: 100, y: 0, radius: R }, config)).toEqual({ push: { x: 0, y: 0 }, overlap: 0 });
  });

  it('nachodzą — rozpycha w przeciwne strony, mocniej przy większym nachodzeniu', () => {
    const light = bubblePush({ x: 0, y: 0, radius: R }, { x: 24, y: 0, radius: R }, config);
    const deep = bubblePush({ x: 0, y: 0, radius: R }, { x: 12, y: 0, radius: R }, config);
    expect(light.push.x).toBeLessThan(0);
    expect(deep.push.x).toBeLessThan(light.push.x);
    expect(light.push.y).toBe(0);
  });

  it('odpychanie ma limit poniżej chodu każdego bohatera — da się przecisnąć obok partnera', () => {
    const same = bubblePush({ x: 10, y: 10, radius: R }, { x: 10, y: 10, radius: R }, config);
    expect(Math.hypot(same.push.x, same.push.y)).toBe(config.maxPushSpeed);
    for (const hero of Object.values(HERO_DEFINITIONS)) expect(config.maxPushSpeed).toBeLessThan(hero.stats.moveSpeed);
  });

  it('„plumknięcie” tylko przy nowym zetknięciu i nie częściej niż co przerwę', () => {
    const contact = new BubbleContact();
    expect(contact.update(3, 0, config)).toBe(true);
    expect(contact.update(3, 16, config)).toBe(false);
    expect(contact.update(0, 32, config)).toBe(false);
    expect(contact.update(2, 100, config)).toBe(false);
    expect(contact.update(0, 200, config)).toBe(false);
    expect(contact.update(2, 100 + config.bounceGapMs, config)).toBe(true);
  });
});
