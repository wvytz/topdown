import type { LurkConfig } from '@/systems/Lurk';

/**
 * Czyhacz (krok 123, pomysł właściciela): wróg w kryjówce przy ścianie, rzadszy od Gniazdownika.
 * Subtelny znak (decyzja właściciela): kryjówka co kilka sekund drgnie i błysną w niej ślepia — uważny gracz
 * ją wypatrzy, a nieuważny dostaje 0,6 s ostrzeżenia i czerwoną strefę doskoku.
 */
export const LURKER_CONFIG: LurkConfig = {
  // 3 kafle (32 px).
  triggerRange: 96,
  warnMs: 600,
  tell: { intervalMs: 2600, durationMs: 380 },
  leap: { maxDistance: 120, speed: 420, radius: 26, damageMultiplier: 1.3, knockback: 200 },
  provokedStunMs: 1000,
};
