import { describe, expect, it } from 'vitest';
import { ResumeCountdown } from '@/systems/ResumeCountdown';
import { PAUSE_CONFIG } from '@/config/pauseConfig';

const config = { steps: 3, stepMs: 1000, maxFrameMs: 100 };

function run(countdown: ResumeCountdown, ms: number, frame = 16): void {
  for (let t = 0; t < ms; t += frame) countdown.advance(Math.min(frame, ms - t));
}

describe('ResumeCountdown', () => {
  it('liczy 3, 2, 1 i kończy się po 3 s', () => {
    const countdown = new ResumeCountdown(config);
    expect(countdown.value).toBe(3);
    run(countdown, 999);
    expect(countdown.value).toBe(3);
    run(countdown, 1);
    expect(countdown.value).toBe(2);
    run(countdown, 1000);
    expect(countdown.value).toBe(1);
    expect(countdown.done).toBe(false);
    run(countdown, 1000);
    expect(countdown.done).toBe(true);
    expect(countdown.value).toBe(0);
  });

  it('zgłasza zmianę liczby tylko raz na krok', () => {
    const countdown = new ResumeCountdown(config);
    let changes = 0;
    for (let i = 0; i < 400; i += 1) if (countdown.advance(10)) changes += 1;
    expect(changes).toBe(3); // 3→2, 2→1, 1→koniec
    expect(countdown.advance(10)).toBe(false);
  });

  it('długa klatka (zacięcie, powrót do karty) nie przeskakuje odliczania', () => {
    const countdown = new ResumeCountdown(config);
    countdown.advance(60_000);
    expect(countdown.value).toBe(3);
    expect(countdown.stepProgress).toBeCloseTo(0.1);
  });

  it('ujemny czas klatki nic nie robi', () => {
    const countdown = new ResumeCountdown(config);
    countdown.advance(-500);
    expect(countdown.value).toBe(3);
    expect(countdown.stepProgress).toBe(0);
  });

  it('domyślne odliczanie trwa ok. 3 s (prośba testera)', () => {
    const countdown = new ResumeCountdown(PAUSE_CONFIG.countdown);
    expect(countdown.value).toBe(3);
    expect(countdown.total).toBe(3000);
  });
});
