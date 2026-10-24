import Phaser from 'phaser';
import { SceneKey } from '@/core/types';
import { DEATH_TIMING } from '@/config/deathScreenConfig';
import type { TouchButtonSpec } from '@/config/touchConfig';
import { TOUCH_BUTTONS, TOUCH_DEATH_BUTTONS, TOUCH_LABELS, TOUCH_SHOT_HOLD_MS, TOUCH_STICK, TOUCH_TAP_MAX_MS } from '@/config/touchConfig';
import type { GameScene } from '@/scenes/GameScene';
import { MenuCommand } from '@/systems/gamepadInput';
import { stickState, stickToMovement } from '@/systems/touchAim';
import { touchState } from '@/mobile/TouchState';

export const TOUCH_SCENE_KEY = 'TouchScene';

type ButtonId = 'attack' | 'shoot' | 'dash' | 'interact';
/** Przyciski ataku działają jak gałki zakotwiczone w środku przycisku. */
type StickButton = 'attack' | 'shoot';

/** Palec na ekranie: identyfikator dotyku i pozycja w pikselach płótna (poza płótnem: < 0 albo > 960/540). */
interface TouchPoint {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

interface Stick {
  readonly pointerId: number;
  readonly originX: number;
  readonly originY: number;
  knobX: number;
  knobY: number;
  /** Kiedy kciuk dotknął przycisku (ms, performance.now) — dla przycisków ataku. */
  readonly downAt: number;
}

interface DeathButton {
  readonly label: string;
  readonly x: number;
  readonly action: () => void;
}

const STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'monospace',
  fontSize: '13px',
  color: '#e8e8f0',
  stroke: '#000000',
  strokeThickness: 3,
};
const BUTTON_ALPHA = 0.35;
const BUTTON_ACTIVE_ALPHA = 0.75;
const STICK_ALPHA = 0.3;

/**
 * Sterowanie dotykowe wersji mobilnej (krok 96; przeniesione z gałęzi testowej, kroki „49–49d”).
 * Lewa część ekranu — pływająca gałka ruchu. Prawa ręka (krok 96a, układ właściciela): duże kółko ataku
 * podstawowego (LPM), nad nim i w prawo atak PPM (strzał / promień / salwa), po lewej zryw, nad zrywem E
 * (tylko gdy coś zrobi); pauza pod minimapą. Przyciski ataku: przeciągnij — celujesz, stuknij — celuje samo.
 * Scena nad grą i HUD-em: tylko zapisuje `touchState` i rysuje; na ekranie śmierci daje przyciski zamiast klawiszy R / C / M.
 *
 * Dotyku słuchamy zdarzeniami przeglądarki na całej stronie (#game), nie przez Phasera — Phaser śledzi palce
 * tylko nad płótnem, a kciuki na telefonie leżą przy krawędziach, często w czarnych pasach obok płótna.
 * Menu, wybór bohatera, nagroda i pauza działają na zwykłym dotyku Phasera (stukanie w napisy i karty).
 */
export class TouchScene extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics;
  private labels = new Map<ButtonId | 'pause', Phaser.GameObjects.Text>();
  private deathLabels: Phaser.GameObjects.Text[] = [];
  private moveStick: Stick | null = null;
  /**
   * Przyciski ataku jako gałki (krok 96a): duże kółko (LPM) i PPM. Przeciągnięcie od przycisku wybiera
   * kierunek i atakuje — obrót o 180° i atak jednym kciukiem; przytrzymanie bez przeciągania atakuje
   * z celowaniem samym; krótkie stuknięcie — jeden atak w najbliższego wroga.
   */
  private sticks: Record<StickButton, Stick | null> = { attack: null, shoot: null };
  /** Palec, który dotknął przycisku pauzy — pauza rusza po jego puszczeniu (inaczej to samo puszczenie by ją zamknęło). */
  private pausePointer: number | null = null;
  private kit: keyof typeof TOUCH_LABELS.attack = 'melee';
  /** E coś teraz zrobi (schody, kapliczka) — tylko wtedy przycisk E jest widoczny i działa. */
  private canInteract = false;
  private deathButtons: DeathButton[] = [];
  /** Od kiedy ekran śmierci czeka na gracza — przyciski wchodzą razem z napisem, nie pod kciukiem z walki. */
  private deathSince: number | null = null;

  constructor() {
    // Działa od startu gry: pierwszy dotyk (np. na ekranie startowym) włącza sterowanie dotykowe.
    super({ key: TOUCH_SCENE_KEY, active: true });
  }

  create(): void {
    this.gfx = this.add.graphics();
    const ids: readonly (ButtonId | 'pause')[] = ['attack', 'shoot', 'dash', 'interact', 'pause'];
    for (const id of ids) {
      const size = id === 'attack' ? '16px' : '13px';
      this.labels.set(id, this.add.text(0, 0, '', { ...STYLE, fontSize: size }).setOrigin(0.5).setVisible(false));
    }
    const page = document.getElementById('game') ?? document.body;
    const listen = (type: string, handler: (point: TouchPoint) => void): void => {
      page.addEventListener(
        type,
        (event) => {
          const touchEvent = event as TouchEvent;
          // Poza płótnem: bez udawanych kliknięć myszą i gestów przeglądarki (na płótnie robi to Phaser).
          if (touchEvent.target !== this.game.canvas && touchEvent.cancelable) touchEvent.preventDefault();
          for (const touch of Array.from(touchEvent.changedTouches)) handler(this.toCanvas(touch));
        },
        { passive: false },
      );
    };
    listen('touchstart', (p) => this.onDown(p));
    listen('touchmove', (p) => this.onMove(p));
    listen('touchend', (p) => this.onUp(p));
    listen('touchcancel', (p) => this.onUp(p));
  }

  /** Pozycja palca w pikselach płótna — także poza nim, w czarnych pasach. */
  private toCanvas(touch: Touch): TouchPoint {
    const rect = this.game.canvas.getBoundingClientRect();
    return {
      id: touch.identifier,
      x: ((touch.clientX - rect.left) * this.scale.width) / rect.width,
      y: ((touch.clientY - rect.top) * this.scale.height) / rect.height,
    };
  }

  override update(): void {
    this.scene.bringToTop();
    const game = this.playingScene();
    if (!game) {
      this.releaseAll();
    } else {
      // Przytrzymanie przycisku ataku bez przeciągania: po chwili atak z celowaniem samym.
      const now = performance.now();
      if (this.sticks.attack && !touchState.attack && now - this.sticks.attack.downAt >= TOUCH_SHOT_HOLD_MS) touchState.attack = true;
      if (this.sticks.shoot && !touchState.shoot && now - this.sticks.shoot.downAt >= TOUCH_SHOT_HOLD_MS) touchState.shoot = true;
    }
    this.layoutDeathButtons();
    this.draw(game !== null);
  }

  /** Scena gry, gdy trwa i przyjmuje sterowanie: nie pauza, nie nagroda, nie ekran śmierci. */
  private playingScene(): GameScene | null {
    if (!touchState.engaged || !this.scene.isActive(SceneKey.Game)) return null;
    const game = this.scene.get(SceneKey.Game) as GameScene;
    const hud = game.getHudData();
    if (hud.isPlayerDead || hud.death) return null;
    this.kit = game.heroKit;
    this.canInteract = hud.canInteract;
    return game;
  }

  private onDown(pointer: TouchPoint): void {
    touchState.engaged = true;

    const deathButton = this.deathButtons.find((b) => this.inDeathButton(b, pointer));
    if (deathButton) {
      deathButton.action();
      return;
    }
    if (!this.playingScene()) return;

    if (this.onPauseButton(pointer)) {
      this.pausePointer = pointer.id;
      return;
    }
    const button = this.buttonAt(pointer.x, pointer.y);
    if (button === 'dash') {
      touchState.queueDash();
    } else if (button === 'interact') {
      touchState.queueInteract();
    } else if (button === 'attack' || button === 'shoot') {
      if (this.sticks[button]) return;
      // Środek gałki w środku przycisku: kierunek to strona, w którą kciuk zjedzie z przycisku.
      const c = this.buttonCenter(button);
      this.sticks[button] = { pointerId: pointer.id, originX: c.x, originY: c.y, knobX: c.x, knobY: c.y, downAt: performance.now() };
      // Atak rusza dopiero po przeciągnięciu albo przytrzymaniu (update) — nie w starą stronę.
      if (button === 'attack') {
        touchState.attack = false;
        touchState.aim = null;
      } else {
        touchState.shoot = false;
        touchState.shotAim = null;
      }
    } else if (pointer.x < this.scale.width * TOUCH_STICK.moveZoneWidth && !this.moveStick) {
      this.moveStick = { pointerId: pointer.id, originX: pointer.x, originY: pointer.y, knobX: pointer.x, knobY: pointer.y, downAt: performance.now() };
    }
  }

  private onMove(pointer: TouchPoint): void {
    if (this.moveStick?.pointerId === pointer.id) {
      touchState.move = stickToMovement(this.updateStick(this.moveStick, pointer));
    } else if (this.sticks.attack?.pointerId === pointer.id) {
      const stick = this.updateStick(this.sticks.attack, pointer);
      touchState.aim = stick.strength > 0 ? stick.direction : null;
      if (touchState.aim) touchState.attack = true;
    } else if (this.sticks.shoot?.pointerId === pointer.id) {
      const stick = this.updateStick(this.sticks.shoot, pointer);
      touchState.shotAim = stick.strength > 0 ? stick.direction : null;
      if (touchState.shotAim) touchState.shoot = true;
    }
  }

  private onUp(pointer: TouchPoint): void {
    if (this.pausePointer === pointer.id) {
      this.pausePointer = null;
      const game = this.playingScene();
      if (game && this.onPauseButton(pointer)) {
        this.releaseAll();
        game.requestPause();
      }
    }
    if (this.moveStick?.pointerId === pointer.id) {
      this.moveStick = null;
      touchState.move = { x: 0, y: 0 };
    }
    const attack = this.sticks.attack;
    if (attack?.pointerId === pointer.id) {
      // Krótkie stuknięcie bez przeciągnięcia (jak w Brawl Stars): jeden atak w najbliższego wroga.
      if (!touchState.attack && performance.now() - attack.downAt <= TOUCH_TAP_MAX_MS) touchState.queueAttack();
      this.sticks.attack = null;
      touchState.attack = false;
      touchState.aim = null;
    }
    if (this.sticks.shoot?.pointerId === pointer.id) {
      if (!touchState.shoot) touchState.queueShot();
      this.sticks.shoot = null;
      touchState.shoot = false;
      touchState.shotAim = null;
    }
  }

  /** Gałka za kciukiem: gałka nie wychodzi poza promień, kierunek i siła z czystej funkcji. */
  private updateStick(stick: Stick, pointer: TouchPoint) {
    const dx = pointer.x - stick.originX;
    const dy = pointer.y - stick.originY;
    const state = stickState(dx, dy, TOUCH_STICK.radius, TOUCH_STICK.deadzone);
    const length = Math.hypot(dx, dy);
    const clamp = length > TOUCH_STICK.radius ? TOUCH_STICK.radius / length : 1;
    stick.knobX = stick.originX + dx * clamp;
    stick.knobY = stick.originY + dy * clamp;
    return state;
  }

  private releaseAll(): void {
    this.moveStick = null;
    this.sticks = { attack: null, shoot: null };
    touchState.release();
  }

  private spec(id: ButtonId): TouchButtonSpec {
    return TOUCH_BUTTONS[id];
  }

  private buttonCenter(id: ButtonId): { x: number; y: number } {
    const spec = this.spec(id);
    return { x: this.scale.width - spec.right, y: this.scale.height - spec.bottom };
  }

  /** Przycisk pod kciukiem; przy nakładających się strefach wygrywa najbliższy środek. */
  private buttonAt(x: number, y: number): ButtonId | null {
    let best: ButtonId | null = null;
    let bestDistance = Infinity;
    for (const id of ['attack', 'shoot', 'dash', 'interact'] as const) {
      if (id === 'interact' && !this.canInteract) continue;
      const c = this.buttonCenter(id);
      const distance = Math.hypot(x - c.x, y - c.y);
      if (distance <= this.spec(id).radius * TOUCH_BUTTONS.hitSlop && distance < bestDistance) {
        best = id;
        bestDistance = distance;
      }
    }
    return best;
  }

  private pauseCenter(): { x: number; y: number } {
    return { x: this.scale.width - TOUCH_BUTTONS.pause.right, y: TOUCH_BUTTONS.pause.top };
  }

  private onPauseButton(pointer: TouchPoint): boolean {
    const c = this.pauseCenter();
    return Math.hypot(pointer.x - c.x, pointer.y - c.y) <= TOUCH_BUTTONS.pause.radius * TOUCH_BUTTONS.hitSlop * 1.3;
  }

  /** Ekran śmierci na dotyku: imię (okno przeglądarki z klawiaturą telefonu) albo nowa wspinaczka / bohater / menu. */
  private layoutDeathButtons(): void {
    const game = touchState.engaged && this.scene.isActive(SceneKey.Game) ? (this.scene.get(SceneKey.Game) as GameScene) : null;
    const choice = game?.deathChoice ?? null;
    if (choice === null) this.deathSince = null;
    else this.deathSince ??= this.time.now;
    const ready = this.deathSince !== null && this.time.now - this.deathSince >= DEATH_TIMING.promptAt;
    if (game && ready && choice === 'name') {
      this.deathButtons = this.row([
        ['PODAJ IMIĘ', () => game.submitPlayerName(window.prompt('Imię na tablicę wyników:'))],
        ['BEZ IMIENIA', () => game.submitPlayerName(null)],
      ]);
    } else if (game && ready && choice === 'restart') {
      this.deathButtons = this.row([
        ['NOWA WSPINACZKA', () => game.deathCommand(MenuCommand.Confirm)],
        ['ZMIEŃ BOHATERA', () => game.deathCommand(MenuCommand.Alt)],
        ['MENU', () => game.deathCommand(MenuCommand.Back)],
      ]);
    } else {
      this.deathButtons = [];
    }
    while (this.deathLabels.length < this.deathButtons.length) {
      this.deathLabels.push(this.add.text(0, 0, '', { ...STYLE, fontSize: '15px' }).setOrigin(0.5));
    }
    this.deathLabels.forEach((label, i) => {
      const button = this.deathButtons[i];
      label.setVisible(Boolean(button));
      if (button) label.setText(button.label).setPosition(button.x, TOUCH_DEATH_BUTTONS.y);
    });
  }

  /** Przyciski w rzędzie, wyśrodkowane. */
  private row(buttons: readonly (readonly [string, () => void])[]): DeathButton[] {
    const { width, gap } = TOUCH_DEATH_BUTTONS;
    const total = buttons.length * width + (buttons.length - 1) * gap;
    const left = this.scale.width / 2 - total / 2 + width / 2;
    return buttons.map(([label, action], i) => ({ label, action, x: left + i * (width + gap) }));
  }

  private inDeathButton(button: DeathButton, pointer: TouchPoint): boolean {
    const { y, width, height } = TOUCH_DEATH_BUTTONS;
    return Math.abs(pointer.x - button.x) <= width / 2 && Math.abs(pointer.y - y) <= height / 2;
  }

  private draw(playing: boolean): void {
    const g = this.gfx.clear();
    for (const button of this.deathButtons) {
      const { y, width, height } = TOUCH_DEATH_BUTTONS;
      g.fillStyle(0x1a1a24, 0.85).fillRect(button.x - width / 2, y - height / 2, width, height);
      g.lineStyle(2, 0xf1e2a9, 0.9).strokeRect(button.x - width / 2, y - height / 2, width, height);
    }
    for (const [id, label] of this.labels) {
      const visible = playing && (id !== 'interact' || this.canInteract);
      label.setVisible(visible);
      if (!visible) continue;
      if (id === 'pause') {
        const c = this.pauseCenter();
        g.fillStyle(0x202030, BUTTON_ALPHA).fillCircle(c.x, c.y, TOUCH_BUTTONS.pause.radius);
        g.lineStyle(2, 0xe8e8f0, 0.5).strokeCircle(c.x, c.y, TOUCH_BUTTONS.pause.radius);
        label.setText(TOUCH_LABELS.pause).setPosition(c.x, c.y);
        continue;
      }
      const c = this.buttonCenter(id);
      const { radius } = this.spec(id);
      const active = (id === 'attack' && touchState.attack) || (id === 'shoot' && touchState.shoot);
      g.fillStyle(active ? 0x39c0d8 : 0x202030, active ? BUTTON_ACTIVE_ALPHA : BUTTON_ALPHA).fillCircle(c.x, c.y, radius);
      g.lineStyle(id === 'attack' ? 3 : 2, 0xe8e8f0, id === 'attack' ? 0.7 : 0.5).strokeCircle(c.x, c.y, radius);
      const text = id === 'attack' || id === 'shoot' ? TOUCH_LABELS[id][this.kit] : TOUCH_LABELS[id];
      label.setText(text).setPosition(c.x, c.y);
    }
    if (!playing) return;
    if (this.moveStick) this.drawStick(g, this.moveStick, TOUCH_STICK.radius);
    for (const id of ['attack', 'shoot'] as const) {
      const stick = this.sticks[id];
      // Przycisk ataku: obwódka zasięgu przeciągnięcia i gałka pod kciukiem.
      if (stick) this.drawStick(g, stick, TOUCH_STICK.radius + this.spec(id).radius * 0.5);
    }
  }

  private drawStick(g: Phaser.GameObjects.Graphics, stick: Stick, radius: number): void {
    g.fillStyle(0x202030, STICK_ALPHA).fillCircle(stick.originX, stick.originY, radius);
    g.lineStyle(2, 0xe8e8f0, 0.4).strokeCircle(stick.originX, stick.originY, radius);
    g.fillStyle(0xe8e8f0, 0.5).fillCircle(stick.knobX, stick.knobY, TOUCH_STICK.radius * 0.4);
  }
}
