import type { AudioSettings, MusicTheme, MusicThemeDefinition } from '@/core/audioTypes';
import { LoopCue, SoundCue } from '@/core/audioTypes';
import type { Vector2 } from '@/core/types';
import {
  AUDIO_SETTINGS_RULES,
  LOOP_FADE_S,
  LOOP_RECIPES,
  MUSIC_DUCK,
  MUSIC_PRESETS,
  SOUND_GATE_CONFIG,
  SOUND_GATE_RULES,
  SOUND_RECIPES,
  SFX_TONE,
  SOUND_SPACE,
} from '@/config/audioConfig';
import { MusicPlayer } from '@/audio/MusicPlayer';
import { diag } from '@/diagnostics/DiagnosticsHub';
import { AudioSettingsStorage } from '@/persistence/AudioSettingsStorage';
import { HighscoreStorage } from '@/persistence/HighscoreStorage';
import { channelGains, cyclePreset, stepVolume, toggleMute } from '@/systems/AudioSettings';
import { renderSound } from '@/systems/SfxSynth';
import { applySfxTone } from '@/systems/SfxTone';
import { SoundGate } from '@/systems/SoundGate';
import { spatialize } from '@/systems/SoundSpace';

/** Pętla trzymana przez właścicieli (np. dwie Czarodziejki w co-opie — jeden dźwięk promienia). */
interface LoopVoice {
  readonly holders: Map<object, number>;
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
}

/** Pętla bez odświeżenia przez tyle ms gaśnie sama (pauza, koniec sceny). */
const LOOP_STALE_MS = 150;

/**
 * Dźwięk gry (krok 116): jeden obiekt na całą grę, jak dziennik `diag`. Efekty syntezuje raz do bufora
 * (`renderSound`), muzykę gra `MusicPlayer`. Przeglądarka pozwala włączyć dźwięk dopiero po geście gracza —
 * kontekst powstaje przy pierwszym klawiszu, kliknięciu, dotknięciu albo przycisku pada; wcześniejsze efekty
 * przepadają, a muzyka rusza od razu po odblokowaniu. Nigdy nie rzuca — brak dźwięku nie może psuć gry.
 */
export class SoundBoard {
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private music: MusicPlayer | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly gate = new SoundGate(SOUND_GATE_RULES, SOUND_GATE_CONFIG);
  private readonly loops = new Map<LoopCue, LoopVoice>();
  private listener: (() => Vector2) | null = null;
  private theme: MusicTheme | null = null;
  private intense = false;
  private duck = 1;
  private failed = false;
  private settingsValue: AudioSettings;
  private readonly watchers = new Set<(settings: AudioSettings) => void>();

  constructor(private readonly storage: AudioSettingsStorage) {
    this.settingsValue = storage.load();
  }

  /** Nasłuch pierwszego gestu (odblokowanie dźwięku). Wołane raz przy starcie gry. */
  install(target: Window): void {
    const unlock = (): void => this.unlock();
    for (const type of ['pointerdown', 'keydown', 'touchstart'] as const) target.addEventListener(type, unlock, { capture: true });
    setInterval(() => this.expireLoops(), LOOP_STALE_MS);
  }

  /** Tworzy albo wznawia kontekst dźwięku — tylko w geście gracza (klawisz, klik, przycisk pada). */
  unlock(): void {
    if (this.failed) return;
    try {
      if (!this.ctx) this.createContext();
      if (this.ctx?.state === 'suspended') void this.ctx.resume();
    } catch (error) {
      this.failed = true;
      diag.note('audio-unavailable', { error: String(error).slice(0, 120) }, 'warn');
    }
  }

  get settings(): AudioSettings {
    return this.settingsValue;
  }

  /** Ekran pauzy odświeża napisy, gdy ustawienia zmienią się klawiszem wyciszenia. */
  watch(onChange: (settings: AudioSettings) => void): () => void {
    this.watchers.add(onChange);
    return () => this.watchers.delete(onChange);
  }

  toggleMute(): void {
    this.update(toggleMute(this.settingsValue));
  }

  stepVolume(channel: 'music' | 'sfx', steps: number): void {
    this.update(stepVolume(this.settingsValue, channel, steps, AUDIO_SETTINGS_RULES));
  }

  /** Następny zestaw muzyki (krok 139) — bieżący klimat przechodzi płynnie w nowy styl. */
  cycleMusicPreset(step: 1 | -1): void {
    this.update(cyclePreset(this.settingsValue, AUDIO_SETTINGS_RULES, step));
    this.music?.play(this.themeDefinition());
  }

  /** Środek słuchu (środek kamery); null — dźwięki bez stereo i bez wyciszania odległych. */
  setListener(listener: (() => Vector2) | null): void {
    this.listener = listener;
  }

  /** Efekt jednorazowy; `at` — miejsce w świecie (stereo i odległość). */
  play(cue: SoundCue, at?: Vector2): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus || ctx.state !== 'running' || this.settingsValue.muted) return;
    if (!this.gate.allow(cue, performance.now())) return;
    try {
      const mix = at && this.listener ? spatialize(at, this.listener(), SOUND_SPACE) : { pan: 0, gain: 1 };
      const source = ctx.createBufferSource();
      source.buffer = this.buffer(cue, () => SOUND_RECIPES[cue]);
      const gain = ctx.createGain();
      gain.gain.value = mix.gain;
      const panner = ctx.createStereoPanner();
      panner.pan.value = mix.pan;
      source.connect(gain).connect(panner).connect(bus);
      source.start();
    } catch (error) {
      this.reportOnce(error);
    }
  }

  /**
   * Dźwięk ciągły: `active` co klatkę od właściciela (bohatera). Gra, dopóki ktokolwiek go trzyma;
   * bez odświeżenia (pauza, koniec sceny) wygasa sam po `LOOP_STALE_MS`.
   */
  hold(cue: LoopCue, owner: object, active: boolean): void {
    const voice = this.loops.get(cue);
    if (!active) {
      voice?.holders.delete(owner);
      if (voice && voice.holders.size === 0) this.stopLoop(cue, voice);
      return;
    }
    const now = performance.now();
    if (voice) {
      voice.holders.set(owner, now);
      return;
    }
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus || ctx.state !== 'running' || this.settingsValue.muted) return;
    try {
      const source = ctx.createBufferSource();
      source.buffer = this.buffer(`loop:${cue}`, () => LOOP_RECIPES[cue]);
      source.loop = true;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(1, ctx.currentTime + LOOP_FADE_S);
      source.connect(gain).connect(bus);
      source.start();
      this.loops.set(cue, { holders: new Map([[owner, now]]), source, gain });
    } catch (error) {
      this.reportOnce(error);
    }
  }

  /** Klimat muzyki (null — cisza). Ten sam klimat nie zaczyna utworu od nowa. */
  setMusic(theme: MusicTheme | null): void {
    this.theme = theme;
    this.music?.play(this.themeDefinition());
  }

  private themeDefinition(): MusicThemeDefinition | null {
    return this.theme ? MUSIC_PRESETS[this.settingsValue.preset][this.theme] : null;
  }

  /** Walka z bossem — muzyka nabiera tempa. */
  setMusicIntense(intense: boolean): void {
    this.intense = intense;
    this.music?.setIntense(intense);
  }

  /** Przyciszenie muzyki na pauzie (1 — pełna głośność). */
  setMusicDuck(factor: number): void {
    this.duck = factor;
    this.applyGains();
  }

  private update(settings: AudioSettings): void {
    this.settingsValue = settings;
    this.storage.save(settings);
    this.applyGains();
    if (settings.muted) for (const [cue, voice] of this.loops) this.stopLoop(cue, voice);
    for (const watcher of this.watchers) watcher(settings);
  }

  private createContext(): void {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    // Łagodny filtr całej szyny efektów (krok 116a) — bez ostrych gór.
    const soften = ctx.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = SFX_TONE.busLowpassHz;
    soften.Q.value = 0.5;
    this.sfxBus.connect(soften).connect(ctx.destination);
    this.musicBus.connect(ctx.destination);
    this.applyGains();
    this.music = new MusicPlayer(ctx, this.musicBus);
    this.music.setIntense(this.intense);
    this.music.play(this.themeDefinition());
    diag.note('audio-ready', { sampleRate: ctx.sampleRate, state: ctx.state });
  }

  private applyGains(): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || !this.musicBus) return;
    const gains = channelGains(this.settingsValue);
    const now = ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(gains.sfx, now, 0.02);
    this.musicBus.gain.setTargetAtTime(gains.music * this.duck, now, MUSIC_DUCK.fadeMs / 4000);
  }

  private buffer(key: string, recipe: () => (typeof SOUND_RECIPES)[SoundCue]): AudioBuffer {
    const cached = this.buffers.get(key);
    if (cached) return cached;
    const ctx = this.ctx as AudioContext;
    const samples = renderSound(applySfxTone(recipe(), SFX_TONE), ctx.sampleRate);
    const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buffer.copyToChannel(samples, 0);
    this.buffers.set(key, buffer);
    return buffer;
  }

  private stopLoop(cue: LoopCue, voice: LoopVoice): void {
    this.loops.delete(cue);
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      voice.gain.gain.cancelScheduledValues(ctx.currentTime);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, ctx.currentTime);
      voice.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + LOOP_FADE_S);
      voice.source.stop(ctx.currentTime + LOOP_FADE_S + 0.01);
    } catch (error) {
      this.reportOnce(error);
    }
  }

  private expireLoops(): void {
    const now = performance.now();
    for (const [cue, voice] of this.loops) {
      for (const [owner, at] of voice.holders) if (now - at > LOOP_STALE_MS) voice.holders.delete(owner);
      if (voice.holders.size === 0) this.stopLoop(cue, voice);
    }
  }

  private reported = false;
  private reportOnce(error: unknown): void {
    if (this.reported) return;
    this.reported = true;
    diag.note('audio-error', { error: String(error).slice(0, 120) }, 'warn');
  }
}

/** Dźwięk całej gry. */
export const sound = new SoundBoard(new AudioSettingsStorage(HighscoreStorage.browserStorage()));

export { LoopCue, SoundCue };
