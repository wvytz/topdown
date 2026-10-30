import type { MusicNote, MusicThemeDefinition } from '@/core/audioTypes';
import { MUSIC_MIX } from '@/config/audioConfig';
import { barDuration, composeBar } from '@/systems/MusicComposer';

interface Track {
  readonly theme: MusicThemeDefinition;
  readonly output: GainNode;
  /** Wejście echa (stab i pingi), które samo wpada do `output`. */
  readonly echo: AudioNode;
  bar: number;
  nextBarAt: number;
  stopped: boolean;
}

const midiToHz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

/**
 * Odtwarzacz muzyki (krok 116, głosy house'u od kroku 139): nuty z `composeBar` planowane na zegarze Web Audio
 * z wyprzedzeniem (`MUSIC_MIX.lookaheadS`), więc rytm nie zależy od klatek gry. Zmiana utworu — przenikanie dwóch
 * ścieżek. Głosy to proste syntezatory: stopa (sinus z opadającą wysokością), hi-haty i klask (szum za filtrem),
 * bas z zamykającym się filtrem, stab, dron i ping z echem.
 */
export class MusicPlayer {
  private current: Track | null = null;
  private intense = false;
  private readonly timer: ReturnType<typeof setInterval>;
  private readonly noise: AudioBuffer;

  constructor(
    private readonly ctx: AudioContext,
    private readonly destination: AudioNode,
  ) {
    this.noise = this.whiteNoise();
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

  /** Walka z bossem: szesnastkowe hi-haty, stab w każdym takcie, bez przełamań — od następnego taktu. */
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
    return { theme, output, echo: this.echoLine(theme, output), bar: 0, nextBarAt: now + 0.1, stopped: false };
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
      for (const note of composeBar(track.theme, track.bar, this.intense)) this.playNote(note, track.nextBarAt + note.at, track);
      track.bar++;
      track.nextBarAt += barDuration(track.theme);
    }
  }

  private playNote(note: MusicNote, at: number, track: Track): void {
    switch (note.voice) {
      case 'kick':
        return this.kick(note, at, track.output);
      case 'hat':
        return this.noiseHit(at, MUSIC_MIX.hat.gain * note.velocity, MUSIC_MIX.hat.decay, this.filter('highpass', MUSIC_MIX.hat.highpass), track.output);
      case 'openHat':
        return this.noiseHit(at, MUSIC_MIX.openHat.gain * note.velocity, MUSIC_MIX.openHat.decay, this.filter('highpass', MUSIC_MIX.openHat.highpass), track.output);
      case 'clap':
        return this.clap(note, at, track.output);
      case 'bass':
        return this.bass(note, at, track.output);
      case 'stab':
        return this.stab(note, at, track);
      case 'drone':
        return this.drone(note, at, track.output);
      case 'ping':
        return this.ping(note, at, track);
    }
  }

  /** Echo kropkowaną ósemką ze sprzężeniem przez filtr — przestrzeń dla staba i pingów. */
  private echoLine(theme: MusicThemeDefinition, out: AudioNode): AudioNode {
    const mix = MUSIC_MIX.echo;
    const input = this.ctx.createGain();
    const delay = this.ctx.createDelay(2);
    delay.delayTime.value = (60 / theme.bpm) * mix.beats;
    const feedback = this.ctx.createGain();
    feedback.gain.value = mix.feedback;
    const tone = this.filter('lowpass', mix.lowpass);
    input.connect(delay).connect(tone).connect(feedback).connect(delay);
    tone.connect(out);
    return input;
  }

  /** Sekunda białego szumu na hi-haty i klask (czysto dźwiękowa losowość, poza strumieniami RNG gry). */
  private whiteNoise(): AudioBuffer {
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
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

  /** Uderzenie: od razu szczyt, potem wykładnicze wygaszenie. */
  private decayGain(at: number, peak: number, decay: number): GainNode {
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(peak, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
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

  private filter(type: BiquadFilterType, hz: number, q?: number): BiquadFilterNode {
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = hz;
    if (q !== undefined) filter.Q.value = q;
    return filter;
  }

  private noiseHit(at: number, peak: number, decay: number, filter: BiquadFilterNode, out: AudioNode): void {
    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;
    source.connect(filter).connect(this.decayGain(at, peak, decay)).connect(out);
    source.start(at, Math.random() * 0.5);
    source.stop(at + decay + 0.02);
  }

  /** Stopa: sinus ze stromo opadającą wysokością. */
  private kick(note: MusicNote, at: number, out: AudioNode): void {
    const mix = MUSIC_MIX.kick;
    const osc = this.oscillator('sine', mix.pitchFrom, at, at + mix.decay);
    osc.frequency.exponentialRampToValueAtTime(mix.pitchTo, at + mix.pitchS);
    osc.connect(this.decayGain(at, mix.gain * note.velocity, mix.decay)).connect(out);
  }

  /** Klask: kilka krótkich zrywów szumu tuż po sobie, ostatni z ogonem. */
  private clap(note: MusicNote, at: number, out: AudioNode): void {
    const mix = MUSIC_MIX.clap;
    for (let i = 0; i < mix.bursts; i++) {
      const last = i === mix.bursts - 1;
      this.noiseHit(at + i * mix.burstGapS, mix.gain * note.velocity, last ? mix.decay : mix.burstGapS, this.filter('bandpass', mix.bandpass, mix.q), out);
    }
  }

  private bass(note: MusicNote, at: number, out: AudioNode): void {
    const mix = MUSIC_MIX.bass;
    const end = at + note.duration + mix.release;
    const env = this.envelope(at, mix.gain * note.velocity, mix.attack, note.duration, mix.release);
    const filter = this.filter('lowpass', mix.filterFrom);
    filter.frequency.setValueAtTime(mix.filterFrom, at);
    filter.frequency.exponentialRampToValueAtTime(mix.filterTo, at + mix.filterS);
    this.oscillator('sawtooth', midiToHz(note.midi), at, end).connect(filter).connect(env).connect(out);
  }

  private stab(note: MusicNote, at: number, track: Track): void {
    const mix = MUSIC_MIX.stab;
    const end = at + note.duration + mix.release;
    const env = this.envelope(at, mix.gain * note.velocity, mix.attack, note.duration * 0.3, mix.release);
    const filter = this.filter('lowpass', mix.lowpass);
    for (const detune of [-mix.detuneCents, mix.detuneCents]) this.oscillator('sawtooth', midiToHz(note.midi), at, end, detune).connect(filter);
    filter.connect(env);
    env.connect(track.output);
    this.send(env, track.echo, mix.echoSend);
  }

  private drone(note: MusicNote, at: number, out: AudioNode): void {
    const mix = MUSIC_MIX.drone;
    const end = at + note.duration + mix.release;
    const env = this.envelope(at, mix.gain * note.velocity, mix.attack, note.duration, mix.release);
    const filter = this.filter('lowpass', mix.lowpass);
    for (const detune of [-mix.detuneCents, mix.detuneCents]) this.oscillator('sine', midiToHz(note.midi), at, end, detune).connect(filter);
    filter.connect(env).connect(out);
  }

  /** Ping: czysty sinus z szybkim wygaszeniem, prawie cały w echu — odległy, niepokojący sygnał. */
  private ping(note: MusicNote, at: number, track: Track): void {
    const mix = MUSIC_MIX.ping;
    const gain = this.decayGain(at, mix.gain * note.velocity, mix.decay);
    this.oscillator('sine', midiToHz(note.midi), at, at + mix.decay).connect(gain);
    gain.connect(track.output);
    this.send(gain, track.echo, mix.echoSend);
  }

  private send(from: AudioNode, to: AudioNode, level: number): void {
    const gain = this.ctx.createGain();
    gain.gain.value = level;
    from.connect(gain).connect(to);
  }
}
