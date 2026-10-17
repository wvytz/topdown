import { describe, expect, it } from 'vitest';
import type { RecordingMeta } from '@/core/diagnosticsTypes';
import { DiagnosticStorage } from '@/persistence/DiagnosticStorage';
import { InputRecordingStorage, parseRecordings, trimRecordings } from '@/persistence/InputRecordingStorage';
import { DiagnosticsHub } from '@/diagnostics/DiagnosticsHub';
import type { InputSample } from '@/systems/InputRecorder';
import { InputRecorder, InputReplay, canReplay } from '@/systems/InputRecorder';

const META: RecordingMeta = { runSeed: 42, floor: 3, hero: 'barbarian', gold: 10, items: ['blade'], hp: 80, practice: false, startedAt: 1000 };
const idle = (over: Partial<InputSample> = {}): InputSample => ({ move: { x: 0, y: 0 }, aim: { x: 100, y: 100 }, attack: false, dash: false, shoot: false, interact: false, ...over });
const CFG = { maxEntries: 50, aimStepPx: 24 };

describe('nagrywanie wejść (krok 56)', () => {
  it('zapisuje tylko zmiany: ruch, przyciski, jednorazowe dash/E i celowanie o co najmniej próg', () => {
    const r = new InputRecorder(CFG);
    r.start(META, 0);
    r.sample(idle(), 0);
    r.sample(idle(), 16); // bez zmian
    r.sample(idle({ aim: { x: 110, y: 100 } }), 32); // < 24 px
    r.sample(idle({ move: { x: 1, y: 0 } }), 48);
    r.sample(idle({ move: { x: 1, y: 0 }, attack: true }), 64);
    r.sample(idle({ move: { x: 1, y: 0 }, attack: true, dash: true }), 80); // jednorazowy dash
    r.sample(idle({ move: { x: 1, y: 0 }, attack: true }), 96); // dash minął, stan ten sam
    r.sample(idle({ move: { x: 1, y: 0 }, attack: true, aim: { x: 160, y: 100 } }), 112); // celowanie
    const snap = r.snapshot()!;
    expect(snap.count).toBe(5);
    expect(snap.durationMs).toBe(112);
    expect(snap.truncated).toBe(false);
    expect(snap.meta).toEqual(META);
  });

  it('bez start nic nie nagrywa; limit wpisów odrzuca najstarsze i oznacza przycięcie', () => {
    const r = new InputRecorder({ maxEntries: 5, aimStepPx: 1 });
    r.sample(idle(), 0);
    expect(r.snapshot()).toBeNull();
    r.start(META, 0);
    for (let i = 0; i < 20; i++) r.sample(idle({ move: { x: i % 2 === 0 ? 1 : -1, y: 0 } }), i * 10);
    const snap = r.snapshot()!;
    expect(snap.count).toBe(5);
    expect(snap.truncated).toBe(true);
    expect(canReplay(snap)).toBe(false);
  });

  it('odtwarzanie: te same wejścia w tych samych chwilach, dash i E tylko w klatce wpisu', () => {
    const r = new InputRecorder(CFG);
    r.start(META, 1000);
    r.sample(idle(), 1000);
    r.sample(idle({ move: { x: 0, y: -1 } }), 1100);
    r.sample(idle({ move: { x: 0, y: -1 }, attack: true, dash: true }), 1300);
    r.sample(idle({ move: { x: 0, y: -1 }, attack: true }), 1500);
    r.sample(idle({ move: { x: 0, y: 0 }, aim: { x: 300, y: 50 }, shoot: true, interact: true }), 1700);
    const rec = r.snapshot()!;
    expect(canReplay(rec)).toBe(true);
    const replay = new InputReplay(rec);
    expect(replay.actionsAt(50)).toMatchObject({ move: { x: 0, y: 0 }, attack: false });
    expect(replay.actionsAt(150)).toMatchObject({ move: { x: 0, y: -1 }, attack: false, dash: false });
    const dashFrame = replay.actionsAt(320);
    expect(dashFrame).toMatchObject({ attack: true, dash: true });
    expect(replay.actionsAt(340).dash).toBe(false); // jednorazowy
    expect(replay.actionsAt(400)).toMatchObject({ attack: true, dash: false });
    expect(replay.finished).toBe(false);
    const last = replay.actionsAt(800);
    expect(last).toMatchObject({ move: { x: 0, y: 0 }, aim: { x: 300, y: 50 }, shoot: true, interact: true, attack: false });
    expect(replay.finished).toBe(true);
  });

  it('uszkodzone nagranie nie nadaje się do odtworzenia i nie wywala gry', () => {
    const rec = { meta: META, entries: '0,1,x,0,5,5', count: 1, firstAtMs: 0, durationMs: 10, truncated: false };
    expect(canReplay(rec)).toBe(false);
    expect(() => new InputReplay(rec)).toThrow();
    expect(canReplay({ ...rec, entries: '', count: 0 })).toBe(false);
  });

  it('zapis nagrań: ostatnie 3, limit rozmiaru, uszkodzony JSON → pusto', () => {
    const rec = (n: number) => ({ meta: { ...META, floor: n }, entries: '0,0,0,0,0,0;'.repeat(2000).slice(0, -1), count: 2000, firstAtMs: 0, durationMs: 1, truncated: false });
    expect(trimRecordings([rec(1), rec(2), rec(3), rec(4)]).map((r) => r.meta.floor)).toEqual([2, 3, 4]);
    const small = trimRecordings([rec(1), rec(2), rec(3)], 40_000);
    expect(small.length).toBeLessThan(3);
    expect(small[small.length - 1]!.meta.floor).toBe(3);
    expect(parseRecordings('nie json')).toEqual([]);
    expect(parseRecordings('[1,{"entries":"a","meta":{}}]')).toHaveLength(1);
  });
});

class FakeStorage {
  readonly data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
}

describe('hub: nagrania wejść (krok 56)', () => {
  it('puls zapisuje nagranie, następna sesja je widzi w raporcie i w JSON-ie', () => {
    const fake = new FakeStorage();
    const make = (now: number) => new DiagnosticsHub(new DiagnosticStorage(fake), {}, () => now, new InputRecordingStorage(fake));
    const a = make(1000);
    a.startRecording(META, 0);
    a.recordInput(idle({ move: { x: 1, y: 0 } }), 10);
    a.recordInput(idle({ move: { x: 0, y: 1 } }), 500);
    a.heartbeat(60, 100);
    const b = make(9000);
    expect(b.report()).toContain('piętro 3, seed 42, barbarian: 2 zmian wejścia');
    const json = JSON.parse(b.lastRecordingJson()!);
    expect(json.meta.runSeed).toBe(42);
    expect(canReplay(json)).toBe(true);
  });

  it('nowe piętro zamyka poprzednie nagranie (obok siebie, w limicie)', () => {
    const fake = new FakeStorage();
    const hub = new DiagnosticsHub(new DiagnosticStorage(fake), {}, () => 1, new InputRecordingStorage(fake));
    for (let floor = 1; floor <= 5; floor++) {
      hub.startRecording({ ...META, floor, startedAt: floor }, 0);
      hub.recordInput(idle({ move: { x: 1, y: 0 } }), 5);
    }
    hub.flushInputs();
    const stored = JSON.parse(fake.getItem('tower-crawler.inputs.v1')!) as Array<{ meta: { floor: number } }>;
    expect(stored.map((r) => r.meta.floor)).toEqual([3, 4, 5]);
  });
});
