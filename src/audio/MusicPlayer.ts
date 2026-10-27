import type { MusicNote, MusicThemeDefinition } from '@/core/audioTypes';
import { MUSIC_MIX } from '@/config/audioConfig';
import { barDuration, composeBar } from '@/systems/MusicComposer';

interface Track {
  readonly theme: MusicThemeDefinition;
  readonly output: GainNode;
  bar: number;
  nextBarAt: number;
  stopped: boolean;
}

const midiToHz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

/**
 * Odtwarzacz muzyki (krok 116): nuty z `composeBar` planowane na zegarze Web Audio z wyprzedzeniem
 * (`MUSIC_MIX.lookaheadS`), więc rytm nie zależy od klatek gry. Zmiana utworu — przenikanie dwóch ścieżek.
 * Głosy to proste syntezatory: pad (dwie rozstrojone piły za filtrem), bas, dzwonek i bęben-serce.
 */
export class MusicPlayer {
  private current: Track | null = null;
  private intense = false;
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(
    private readonly ctx: AudioContext,
    private readonly destination: AudioNode,
  ) {
    this.timer = setInterval(() => this.schedule(), MUSIC_MIX.tickMs);
  }

  get theme(): MusicThemeDefinition | null {
    return this.current?.theme ?? null;
  }

  play(theme: MusicThemeDefinition | null): void {
    if (this.current?.theme === theme) return;
    if (this.current) this.fadeOut(this.current);
    this.current = theme ? this.startTrack(theme) : null;
    this.schedule();
  }

  /** Walka z bossem: bęben, gęstsze dzwonki — od następnego taktu. */
  setIntense(intense: boolean): void {
    this.intense = intense;
  }

  dispose(): void {
    clearInterval(this.timer);
    if (this.current) this.fadeOut(this.current);
    this.current = null;
  }

  private startTrack(theme: MusicThemeDefinition): Track {
    const output = this.ctx.createGain();
    const now = this.ctx.currentTime;
    output.gain.setValueAtTime(0, now);
    output.gain.linearRampToValueAtTime(MUSIC_MIX.master, now + MUSIC_MIX.crossfadeS);
    output.connect(this.destination);
    return { theme, output, bar: 0, nextBarAt: now + 0.1, stopped: false };
  }

  private fadeOut(track: Track): void {
    track.stopped = true;
    const now = this.ctx.currentTime;
    track.output.gain.cancelScheduledValues(now);
    track.output.gain.setValueAtTime(track.output.gain.value, now);
    track.output.gain.linearRampToValueAtTime(0, now + MUSIC_MIX.crossfadeS);
    setTimeout(() => track.output.disconnect(), (MUSIC_MIX.crossfadeS + 4) * 1000);
  }

  private schedule(): void {
    const track = this.current;
    if (!track || track.stopped) return;
    const now = this.ctx.currentTime;
    // Karta w tle (timer zwolnił) — nie nadrabiamy zaległych taktów, tylko gramy dalej od teraz.
    if (track.nextBarAt < now) track.nextBarAt = now + 0.05;
    while (track.nextBarAt < now + MUSIC_MIX.lookaheadS) {
      for (const note of composeBar(track.theme, track.bar, this.intense)) this.playNote(note, track.nextBarAt + note.at, track.output);
      track.bar++;
      track.nextBarAt += barDuration(track.theme);
    }
  }

  private playNote(note: MusicNote, at: number, out: AudioNode): void {
    switch (note.voice) {
      case 'pad':
        return this.pad(note, at, out);
      case 'bass':
        return this.bass(note, at, out);
      case 'bell':
        return this.bell(note, at, out);
      case 'drum':
        return this.drum(note, at, out);
    }
  }

  /** Obwiednia: narastanie, podtrzymanie do końca nuty, wygasanie. */
  private envelope(at: number, peak: number, attack: number, hold: number, release: number): GainNode {
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(peak, at + attack);
    gain.gain.setValueAtTime(peak, at + Math.max(attack, hold));
    gain.gain.linearRampToValueAtTime(0, at + Math.max(attack, hold) + release);
    return gain;
  }

  private oscillator(type: OscillatorType, hz: number, at: number, until: number, detuneCents = 0): OscillatorNode {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(hz, at);
    osc.detune.setValueAtTime(detuneCents, at);
    osc.start(at);
    osc.stop(until);
    return osc;
  }

  private lowpass(hz: number): BiquadFilterNode {
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = hz;
    return filter;
  }

  private pad(note: MusicNote, at: number, out: AudioNode): void {
    const mix = MUSIC_MIX.pad;
    const end = at + note.duration + mix.release;
    const env = this.envelope(at, mix.gain * note.velocity, mix.attack, note.duration, mix.release);
    const filter = this.lowpass(mix.lowpass);
    for (const detune of [-mix.detuneCents, mix.detuneCents]) this.oscillator('sawtooth', midiToHz(note.midi), at, end, detune).connect(filter);
    filter.connect(env).connect(out);
  }

  private bass(note: MusicNote, at: number, out: AudioNode): void {
    const mix = MUSIC_MIX.bass;
    const end = at + note.duration + mix.release;
    const env = this.envelope(at, mix.gain * note.velocity, mix.attack, note.duration, mix.release);
    this.oscillator('triangle', midiToHz(note.midi), at, end).connect(this.lowpass(mix.lowpass)).connect(env).connect(out);
  }

  /** Dzwonek: ton podstawowy i cichy alikwot, za filtrem. */
  private bell(note: MusicNote, at: number, out: AudioNode): void {
    const mix = MUSIC_MIX.bell;
    const end = at + mix.attack + mix.release;
    const hz = midiToHz(note.midi);
    const filter = this.lowpass(mix.lowpass);
    filter.connect(out);
    for (const [ratio, level] of [[1, 1], [mix.overtoneRatio, mix.overtoneLevel]] as const) {
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(mix.gain * note.velocity * level, at + mix.attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      this.oscillator('sine', hz * ratio, at, end).connect(gain).connect(filter);
    }
  }

  /** Bęben: sinus z opadającą wysokością — głuche uderzenie serca. */
  private drum(note: MusicNote, at: number, out: AudioNode): void {
    const mix = MUSIC_MIX.drum;
    const end = at + mix.decay;
    const osc = this.oscillator('sine', mix.pitchFrom, at, end);
    osc.frequency.exponentialRampToValueAtTime(mix.pitchTo, end);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(mix.gain * note.velocity, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain).connect(out);
  }
}
