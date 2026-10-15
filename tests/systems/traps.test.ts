import { describe, expect, it } from 'vitest';
import { BIOMES, BiomeId } from '@/config/biomeConfig';
import { DartTrapPhase, DartTrapState, SpikePhase, spikeCycleIndex, spikeGroupOffset, spikeState } from '@/systems/Traps';

const RUINS = BIOMES[BiomeId.TowerRuins];
const SPIKES = RUINS.traps!.spikes!;
const DARTS = RUINS.traps!.darts!;
const T = SPIKES.timing;

describe('pułapki ruin — konfiguracja (krok 48)', () => {
  it('tylko ruiny mają pułapki i rzeczy do rozbicia', () => {
    for (const biome of Object.values(BIOMES)) {
      expect(biome.traps !== null, biome.id).toBe(biome.id === BiomeId.TowerRuins);
      expect(biome.breakables !== null, biome.id).toBe(biome.id === BiomeId.TowerRuins);
    }
  });

  it('kolce ostrzegają co najmniej pół sekundy; strzałki mają telegraf', () => {
    expect(T.warnMs).toBeGreaterThanOrEqual(500);
    expect(DARTS.windupMs).toBeGreaterThanOrEqual(300);
  });
});

describe('cykl kolców', () => {
  it('schowane → ostrzeżenie → wysunięte, w pętli', () => {
    expect(spikeState(T, 0, 0).phase).toBe(SpikePhase.Down);
    expect(spikeState(T, 0, T.downMs).phase).toBe(SpikePhase.Warn);
    expect(spikeState(T, 0, T.downMs + T.warnMs).phase).toBe(SpikePhase.Up);
    expect(spikeState(T, 0, T.downMs + T.warnMs + T.upMs).phase).toBe(SpikePhase.Down);
  });

  it('grupy na zmianę: gdy jedna ma kolce w górze, druga jest schowana (da się przejść)', () => {
    const cycle = T.downMs + T.warnMs + T.upMs;
    for (let now = 0; now < cycle * 2; now += 50) {
      const a = spikeState(T, spikeGroupOffset(T, 0), now).phase;
      const b = spikeState(T, spikeGroupOffset(T, 1), now).phase;
      expect(a === SpikePhase.Up && b === SpikePhase.Up).toBe(false);
    }
  });

  it('jeden cykl = jedno trafienie', () => {
    const start = T.downMs + T.warnMs;
    expect(spikeCycleIndex(T, 0, start)).toBe(spikeCycleIndex(T, 0, start + T.upMs - 1));
  });
});

describe('pułapka ze strzałkami', () => {
  it('nadepnięcie uzbraja, po telegrafie salwa, potem odpoczynek do zejścia z płyty', () => {
    const trap = new DartTrapState(DARTS);
    expect(trap.update(false, 0)).toBe(0);
    expect(trap.phase).toBe(DartTrapPhase.Ready);
    expect(trap.update(true, 100)).toBe(0);
    expect(trap.phase).toBe(DartTrapPhase.Armed);
    expect(trap.update(false, 100 + DARTS.windupMs - 1)).toBe(0);
    let fired = trap.update(false, 100 + DARTS.windupMs);
    expect(fired).toBe(1);
    for (let t = 100 + DARTS.windupMs; t < 100 + DARTS.windupMs + DARTS.volleyIntervalMs * DARTS.volley; t += 20) fired += trap.update(false, t);
    expect(fired).toBe(DARTS.volley);
    expect(trap.phase).toBe(DartTrapPhase.Cooldown);
    const after = 100 + DARTS.windupMs + DARTS.volleyIntervalMs * DARTS.volley + DARTS.cooldownMs;
    trap.update(true, after);
    expect(trap.phase).toBe(DartTrapPhase.Cooldown); // gracz dalej na płycie
    trap.update(false, after + 10);
    expect(trap.phase).toBe(DartTrapPhase.Ready);
  });
});
