import type { InputRecording, RecordingMeta } from '@/core/diagnosticsTypes';
import { DIAGNOSTICS } from '@/config/diagnosticsConfig';

/** Wejście gracza w jednej klatce — strukturalnie to samo, co `PlayerActions` (silnik), bez zależności od niego. */
export interface InputSample {
  readonly move: { readonly x: number; readonly y: number };
  readonly aim: { readonly x: number; readonly y: number };
  readonly attack: boolean;
  readonly dash: boolean;
  readonly shoot: boolean;
  readonly interact: boolean;
  readonly ultimate: boolean;
}

const ATTACK = 1;
const DASH = 2;
const SHOOT = 4;
const INTERACT = 8;
const ULTIMATE = 16;
const HELD = ATTACK | SHOOT;

interface Entry {
  readonly t: number;
  readonly mx: number;
  readonly my: number;
  readonly flags: number;
  readonly ax: number;
  readonly ay: number;
}

const flagsOf = (s: InputSample): number => (s.attack ? ATTACK : 0) | (s.dash ? DASH : 0) | (s.shoot ? SHOOT : 0) | (s.interact ? INTERACT : 0) | (s.ultimate ? ULTIMATE : 0);

/**
 * Nagrywa wejścia gracza od początku piętra (krok 56): zapisuje tylko zmiany (ruch, przyciski, jednorazowe dash/E
 * i celowanie, gdy przesunie się o `aimStepPx`). Z seedem i stanem runu na starcie piętra pozwala odtworzyć
 * przebieg (`InputReplay`). Gdy limit wpisów zostanie przekroczony, odrzuca najstarsze i oznacza nagranie jako przycięte.
 */
export class InputRecorder {
  private entries: Entry[] = [];
  private meta: RecordingMeta | null = null;
  private startAt = 0;
  private lastAt = 0;
  private last: Entry | null = null;
  private truncated = false;

  constructor(private readonly config: { readonly maxEntries: number; readonly aimStepPx: number } = DIAGNOSTICS.inputs) {}

  start(meta: RecordingMeta, now: number): void {
    this.meta = meta;
    this.startAt = now;
    this.lastAt = now;
    this.entries = [];
    this.last = null;
    this.truncated = false;
  }

  get active(): boolean {
    return this.meta !== null;
  }

  sample(input: InputSample, now: number): void {
    if (!this.meta) return;
    this.lastAt = now;
    const flags = flagsOf(input);
    const ax = Math.round(input.aim.x);
    const ay = Math.round(input.aim.y);
    const last = this.last;
    const pulse = (flags & (DASH | INTERACT | ULTIMATE)) !== 0;
    const changed =
      !last ||
      last.mx !== input.move.x ||
      last.my !== input.move.y ||
      (last.flags & HELD) !== (flags & HELD) ||
      pulse ||
      Math.hypot(ax - last.ax, ay - last.ay) >= this.config.aimStepPx;
    if (!changed) return;
    const entry: Entry = { t: Math.max(0, Math.round(now - this.startAt)), mx: input.move.x, my: input.move.y, flags, ax, ay };
    this.entries.push(entry);
    this.last = entry;
    if (this.entries.length > this.config.maxEntries) {
      this.entries.shift();
      this.truncated = true;
    }
  }

  /** Nagranie do zapisu; null przed `start`. */
  snapshot(): InputRecording | null {
    if (!this.meta) return null;
    let prev = this.entries[0]?.t ?? 0;
    const encoded = this.entries.map((e, i) => {
      const dt = i === 0 ? 0 : e.t - prev;
      prev = e.t;
      return `${dt},${e.mx},${e.my},${e.flags},${e.ax},${e.ay}`;
    });
    return {
      meta: this.meta,
      entries: encoded.join(';'),
      count: this.entries.length,
      firstAtMs: this.entries[0]?.t ?? 0,
      durationMs: Math.max(0, Math.round(this.lastAt - this.startAt)),
      truncated: this.truncated,
    };
  }
}

/** Czy nagranie dało się odczytać i odtworzyć (nieuszkodzone, nieprzycięte). */
export function canReplay(recording: InputRecording): boolean {
  return !recording.truncated && recording.count > 0 && decodeEntries(recording) !== null;
}

function decodeEntries(recording: InputRecording): Entry[] | null {
  if (recording.entries === '') return [];
  const out: Entry[] = [];
  let t = recording.firstAtMs;
  for (const [i, chunk] of recording.entries.split(';').entries()) {
    const parts = chunk.split(',').map(Number);
    if (parts.length !== 6 || parts.some((n) => !Number.isFinite(n))) return null;
    const [dt, mx, my, flags, ax, ay] = parts as [number, number, number, number, number, number];
    t = i === 0 ? recording.firstAtMs : t + dt;
    out.push({ t, mx, my, flags, ax, ay });
  }
  return out;
}

/** Odtwarza nagranie: `actionsAt(elapsedMs)` zwraca wejście jak z klawiatury (dash i E tylko w klatce wpisu). */
export class InputReplay {
  private readonly entries: Entry[];
  private index = 0;
  private current: Entry = { t: 0, mx: 0, my: 0, flags: 0, ax: 0, ay: 0 };

  constructor(private readonly recording: InputRecording) {
    const decoded = decodeEntries(recording);
    if (!decoded) throw new Error('InputReplay: uszkodzone nagranie.');
    this.entries = decoded;
  }

  get finished(): boolean {
    return this.index >= this.entries.length;
  }

  get durationMs(): number {
    return this.recording.durationMs;
  }

  actionsAt(elapsedMs: number): InputSample {
    let pulses = 0;
    while (this.index < this.entries.length && this.entries[this.index]!.t <= elapsedMs) {
      this.current = this.entries[this.index]!;
      pulses |= this.current.flags & (DASH | INTERACT | ULTIMATE);
      this.index++;
    }
    const { mx, my, flags, ax, ay } = this.current;
    return {
      move: { x: mx, y: my },
      aim: { x: ax, y: ay },
      attack: (flags & ATTACK) !== 0,
      shoot: (flags & SHOOT) !== 0,
      dash: (pulses & DASH) !== 0,
      interact: (pulses & INTERACT) !== 0,
      ultimate: (pulses & ULTIMATE) !== 0,
    };
  }
}
