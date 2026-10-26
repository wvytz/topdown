import Phaser from 'phaser';
import { PHYSICS_STEP_CONFIG } from '@/config/gameConfig';
import { physicsSteps } from '@/systems/PhysicsStep';

/** Prywatny akumulator czasu świata Arcade (Phaser 3.90). */
interface WorldInternals {
  _elapsed: number;
}

/**
 * Fizyka zsynchronizowana z klatką obrazu (krok 114). Phaser liczy domyślnie stałe 60 kroków/s: na monitorze 144 Hz
 * ciała ruszały się tylko w ok. 60 ze 144 klatek, a kamera za bohaterem szarpała. Tu każda klatka robi
 * `physicsSteps(delta)` równych kroków — przy 60 Hz to dalej jeden krok 1/60 s, przy 144 Hz jeden krok 1/144 s.
 *
 * Phaser wiąże `world.update` ze zdarzeniem UPDATE sceny przy starcie, więc nie podmieniamy metody: tuż przed nim
 * (PRE_UPDATE, ta sama delta) ustawiamy długość kroku i akumulator tak, by świat zrobił dokładnie `steps` kroków.
 */
export function installSmoothPhysics(scene: Phaser.Scene, config = PHYSICS_STEP_CONFIG): void {
  const world = scene.physics.world;
  const prepare = (_time: number, delta: number): void => {
    const { steps, stepMs } = physicsSteps(delta, config.maxStepMs, config.maxStepsPerFrame);
    world.setFPS(1000 / stepMs);
    // Po dodaniu delty akumulator wyniesie (steps + ½) kroku: dokładnie `steps` kroków, połówka chroni przed zaokrągleniem.
    (world as unknown as WorldInternals)._elapsed = steps === 0 ? -delta : (steps + 0.5) * stepMs - delta;
  };
  scene.events.on(Phaser.Scenes.Events.PRE_UPDATE, prepare);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.PRE_UPDATE, prepare));
}
