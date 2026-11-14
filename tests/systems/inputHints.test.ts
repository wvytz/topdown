import { describe, expect, it } from 'vitest';
import { INPUT_HINTS, PAD_ACTIVITY_THRESHOLD } from '@/config/inputHintConfig';
import { hintDevice, hintFor, padActive } from '@/systems/inputHints';

describe('podpowiedzi zależne od urządzenia (krok U9c)', () => {
  it('pad liczy się, gdy przycisk albo gałka przekroczy próg', () => {
    expect(padActive(null, PAD_ACTIVITY_THRESHOLD)).toBe(false);
    expect(padActive({ buttons: [0, 0.1], axes: [0.2, -0.3] }, PAD_ACTIVITY_THRESHOLD)).toBe(false);
    expect(padActive({ buttons: [1], axes: [] }, PAD_ACTIVITY_THRESHOLD)).toBe(true);
    expect(padActive({ buttons: [], axes: [0, -0.9] }, PAD_ACTIVITY_THRESHOLD)).toBe(true);
  });

  it('telefon zawsze dotyk, PC — ostatnio użyte urządzenie', () => {
    expect(hintDevice(true, 'pad')).toBe('touch');
    expect(hintDevice(false, 'pad')).toBe('pad');
    expect(hintDevice(false, 'keyboard')).toBe('keyboard');
  });

  it('każdy napis ma wersję dla klawiatury, pada i dotyku', () => {
    expect(hintFor(INPUT_HINTS.menuMain, 'pad')).toContain('A — OK');
    expect(hintFor(INPUT_HINTS.pressInteract, 'touch')).toBe('Stuknij E');
    for (const text of [INPUT_HINTS.menuMain, INPUT_HINTS.menuSub, INPUT_HINTS.menuFloor, INPUT_HINTS.heroSelect, INPUT_HINTS.slotDelete]) {
      for (const device of ['keyboard', 'pad', 'touch'] as const) expect(text[device].length).toBeGreaterThan(0);
    }
  });
});
