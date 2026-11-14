import type { HintDevice } from '@/config/inputHintConfig';
import { PAD_ACTIVITY_THRESHOLD } from '@/config/inputHintConfig';
import { currentPlatform } from '@/core/platform';
import { hintDevice, padActive } from '@/systems/inputHints';
import type { PadSnapshot } from '@/systems/gamepadInput';

type PcDevice = Exclude<HintDevice, 'touch'>;

/**
 * Ostatnio użyte urządzenie (krok U9c): klawisz albo mysz — klawiatura, przycisk albo gałka pada — pad.
 * Ekrany i HUD czytają `lastDevice.current` i słuchają zmian, żeby podpowiedzi mówiły o tym, co gracz trzyma.
 */
class LastDevice {
  private pc: PcDevice = 'keyboard';
  private readonly watchers = new Set<() => void>();
  private installed = false;

  get current(): HintDevice {
    return hintDevice(currentPlatform() === 'mobile', this.pc);
  }

  use(device: PcDevice): void {
    if (device === this.pc) return;
    this.pc = device;
    for (const watcher of this.watchers) watcher();
  }

  /** Pad z migawki — wołane co klatkę przez ekrany, które i tak czytają pad. */
  notePad(snapshot: PadSnapshot | null): void {
    if (this.pc !== 'pad' && padActive(snapshot, PAD_ACTIVITY_THRESHOLD)) this.use('pad');
  }

  watch(watcher: () => void): () => void {
    this.watchers.add(watcher);
    return () => this.watchers.delete(watcher);
  }

  /** Klawiatura i mysz na całym oknie (wersja PC). */
  install(target: Window): void {
    if (this.installed) return;
    this.installed = true;
    const keyboard = (): void => this.use('keyboard');
    target.addEventListener('keydown', keyboard, true);
    target.addEventListener('mousedown', keyboard, true);
  }
}

export const lastDevice = new LastDevice();
