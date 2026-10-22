import { describe, expect, it } from 'vitest';
import { installPageInputGuard, type InputReleaseReason } from '@/systems/PageInputGuard';

/** Atrapa strony: zdarzenia lecą na `window`, a cel „udaje” tło, płótno albo nakładkę F9. */
function setup() {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { hidden: false });
  let target: 'surface' | 'canvas' | 'overlay' = 'surface';
  const released: InputReleaseReason[] = [];
  const uninstall = installPageInputGuard({
    window: win,
    document: doc,
    isGameSurface: () => target !== 'overlay',
    isCanvas: () => target === 'canvas',
    releaseInputs: (reason) => released.push(reason),
  });
  const fire = (type: string, on: 'surface' | 'canvas' | 'overlay'): Event => {
    target = on;
    const event = new Event(type, { cancelable: true });
    win.dispatchEvent(event);
    return event;
  };
  return { win, doc, fire, released, uninstall };
}

describe('PageInputGuard', () => {
  it('blokuje menu kontekstowe nad grą i obok płótna, bez puszczania klawiszy (PPM = strzał)', () => {
    const { fire, released } = setup();
    expect(fire('contextmenu', 'surface').defaultPrevented).toBe(true);
    expect(fire('contextmenu', 'canvas').defaultPrevented).toBe(true);
    expect(released).toEqual([]);
  });

  it('nad nakładką menu się otwiera, więc wciśnięte klawisze są puszczane', () => {
    const { fire, released } = setup();
    expect(fire('contextmenu', 'overlay').defaultPrevented).toBe(false);
    expect(released).toEqual(['contextmenu']);
  });

  it('klik poza płótnem nie trafia do gry, klik na płótnie i w nakładkę — tak', () => {
    const { fire } = setup();
    expect(fire('mousedown', 'surface').defaultPrevented).toBe(true);
    expect(fire('mousedown', 'canvas').defaultPrevented).toBe(false);
    expect(fire('mousedown', 'overlay').defaultPrevented).toBe(false);
  });

  it('ukrycie karty puszcza klawisze, powrót — nie', () => {
    const { doc, released } = setup();
    doc.hidden = true;
    doc.dispatchEvent(new Event('visibilitychange'));
    doc.hidden = false;
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(released).toEqual(['hidden']);
  });

  it('zdjęty strażnik niczego nie blokuje', () => {
    const { fire, released, uninstall } = setup();
    uninstall();
    expect(fire('contextmenu', 'surface').defaultPrevented).toBe(false);
    expect(fire('mousedown', 'surface').defaultPrevented).toBe(false);
    expect(released).toEqual([]);
  });
});
