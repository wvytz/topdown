import type { MusicNote, MusicThemeDefinition } from '@/core/audioTypes';
import { MusicPreset } from '@/core/audioTypes';
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
 * Odtwarzacz muzyki (krok 116, zestaw Horror od kroku 139): nuty z `composeBar` planowane na zegarze Web Audio
 * z wyprzedzeniem (`MUSIC_MIX.lookaheadS`), więc rytm nie zależy od klatek gry. Zmiana utworu albo zestawu —
 * przenikanie dwóch ścieżek. Głosy to proste syntezatory. Lucent: pad (dwie rozstrojone piły za filtrem), bas,
 * dzwonek i bęben-serce. Horror: stopa (sinus z opadającą wysokością), hi-haty i klask (szum za filtrem),
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
    if (track.theme.preset === MusicPreset.Lucent) {
      switch (note.voice) {
        case 'pad':
          return this.pad(note, at, track.output);
        case 'bass':
          return this.softBass(note, at, track.output);
        case 'bell':
          return this.bell(note, at, track.output);
        case 'drum':
          return this.drum(note, at, track.output);
        default:
          return;
      }
    }
    const mix = MUSIC_MIX.horror;
    switch (note.voice) {
      case 'kick':
        return this.kick(note, at, track.output);
      case 'hat':
        return this.noiseHit(at, mix.hat.gain * note.velocity, mix.hat.decay, this.filter('highpass', mix.hat.highpass), track.output);
      case 'openHat':
        return this.noiseHit(at, mix.openHat.gain * note.velocity, mix.openHat.decay, this.filter('highpass', mix.openHat.highpass), track.output);
      case 'clap':
        return this.clap(note, at, track.output);
      case 'bass':
        return this.pluckBass(note, at, track.output);
      case 'stab':
        return this.stab(note, at, track);
      case 'drone':
        return this.drone(note, at, track.output);
      case 'ping':
        return this.ping(note, at, track);
      default:
    }
  }

  /** Echo kropkowaną ósemką ze sprzężeniem przez filtr — przestrzeń dla staba i pingów. */
  private echoLine(theme: MusicThemeDefinition, out: AudioNode): AudioNode {
    const mix = MUSIC_MIX.horror.echo;
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
    const mix = MUSIC_MIX.horror.kick;
    const osc = this.oscillator('sine', mix.pitchFrom, at, at + mix.decay);
    osc.frequency.exponentialRampToValueAtTime(mix.pitchTo, at + mix.pitchS);
    osc.connect(this.decayGain(at, mix.gain * note.velocity, mix.decay)).connect(out);
  }

  /** Klask: kilka krótkich zrywów szumu tuż po sobie, ostatni z ogonem. */
  private clap(note: MusicNote, at: number, out: AudioNode): void {
    const mix = MUSIC_MIX.horror.clap;
    for (let i = 0; i < mix.bursts; i++) {
      const last = i === mix.bursts - 1;
      this.noiseHit(at + i * mix.burstGapS, mix.gain * note.velocity, last ? mix.decay : mix.burstGapS, this.filter('bandpass', mix.bandpass, mix.q), out);
    }
  }

  private pluckBass(note: MusicNote, at: number, out: AudioNode): void {
    const mix = MUSIC_MIX.horror.bass;
    const end = at + note.duration + mix.release;
    const env = this.envelope(at, mix.gain * note.velocity, mix.attack, note.duration, mix.release);
    const filter = this.filter('lowpass', mix.filterFrom);
    filter.frequency.setValueAtTime(mix.filterFrom, at);
    filter.frequency.exponentialRampToValueAtTime(mix.filterTo, at + mix.filterS);
    this.oscillator('sawtooth', midiToHz(note.midi), at, end).connect(filter).connect(env).connect(out);
  }

  private stab(note: MusicNote, at: number, track: Track): void {
    const mix = MUSIC_MIX.horror.stab;
    const end = at + note.duration + mix.release;
    const env = this.envelope(at, mix.gain * note.velocity, mix.attack, note.duration * 0.3, mix.release);
    const filter = this.filter('lowpass', mix.lowpass);
    for (const detune of [-mix.detuneCents, mix.detuneCents]) this.oscillator('sawtooth', midiToHz(note.midi), at, end, detune).connect(filter);
    filter.connect(env);
    env.connect(track.output);
    this.send(env, track.echo, mix.echoSend);
  }

  private drone(note: MusicNote, at: number, out: AudioNode): void {
    const mix = MUSIC_MIX.horror.drone;
    const end = at + note.duration + mix.release;
    const env = this.envelope(at, mix.gain * note.velocity, mix.attack, note.duration, mix.release);
    const filter = this.filter('lowpass', mix.lowpass);
    for (const detune of [-mix.detuneCents, mix.detuneCents]) this.oscillator('sine', midiToHz(note.midi), at, end, detune).connect(filter);
    filter.connect(env).connect(out);
  }

  /** Ping: czysty sinus z szybkim wygaszeniem, prawie cały w echu — odległy, niepokojący sygnał. */
  private ping(note: MusicNote, at: number, track: Track): void {
    const mix = MUSIC_MIX.horror.ping;
    const gain = this.decayGain(at, mix.gain * note.velocity, mix.decay);
    this.oscillator('sine', midiToHz(note.midi), at, at + mix.decay).connect(gain);
    gain.connect(track.output);
    this.send(gain, track.echo, mix.echoSend);
  }

  // --- Lucent (krok 116) ---

  private pad(note: MusicNote, at: number, out: AudioNode): void {
    const mix = MUSIC_MIX.lucent.pad;
    const end = at + note.duration + mix.release;
    const env = this.envelope(at, mix.gain * note.velocity, mix.attack, note.duration, mix.release);
    const filter = this.filter('lowpass', mix.lowpass);
    for (const detune of [-mix.detuneCents, mix.detuneCents]) this.oscillator('sawtooth', midiToHz(note.midi), at, end, detune).connect(filter);
    filter.connect(env).connect(out);
  }

  private softBass(note: MusicNote, at: number, out: AudioNode): void {
    const mix = MUSIC_MIX.lucent.bass;
    const end = at + note.duration + mix.release;
    const env = this.envelope(at, mix.gain * note.velocity, mix.attack, note.duration, mix.release);
    this.oscillator('triangle', midiToHz(note.midi), at, end).connect(this.filter('lowpass', mix.lowpass)).connect(env).connect(out);
  }

  /** Dzwonek: ton podstawowy i cichy alikwot, za filtrem. */
  private bell(note: MusicNote, at: number, out: AudioNode): void {
    const mix = MUSIC_MIX.lucent.bell;
    const end = at + mix.attack + mix.release;
    const hz = midiToHz(note.midi);
    const filter = this.filter('lowpass', mix.lowpass);
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
    const mix = MUSIC_MIX.lucent.drum;
    const end = at + mix.decay;
    const osc = this.oscillator('sine', mix.pitchFrom, at, end);
    osc.frequency.exponentialRampToValueAtTime(mix.pitchTo, end);
    osc.connect(this.decayGain(at, mix.gain * note.velocity, mix.decay)).connect(out);
  }

  private send(from: AudioNode, to: AudioNode, level: number): void {
    const gain = this.ctx.createGain();
    gain.gain.value = level;
    from.connect(gain).connect(to);
  }
}
