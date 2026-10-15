import Phaser from 'phaser';
import { SceneKey } from '@/core/types';
import { DEATH_TIMING } from '@/config/deathScreenConfig';
import { TOUCH_BUTTONS, TOUCH_SHOT_HOLD_MS, TOUCH_TAP_MAX_MS, TOUCH_DEATH_BUTTONS, TOUCH_STICK } from '@/config/inputConfig';
import { touchState } from '@/input/TouchState';
import type { GameScene } from '@/scenes/GameScene';
import { stickState, stickToMovement } from '@/systems/Aim';

type ButtonId = 'shoot' | 'dash' | 'interact';

interface Stick {
  readonly pointerId: number;
  readonly originX: number;
  readonly originY: number;
  knobX: number;
  knobY: number;
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
 * Sterowanie dotykowe (krok 49): pływające gałki (lewa — ruch, prawa — celowanie i atak) i przyciski
 * strzału/promienia (przytrzymaj i przeciągnij — kierunek strzału), zrywu i interakcji. Scena nad grą i HUD-em; tylko zapisuje touchState i rysuje.
 * Pokazuje się po pierwszym dotyku ekranu; mysz i klawiatura jej nie widzą.
 */
export class TouchScene extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics;
  private labels = new Map<ButtonId, Phaser.GameObjects.Text>();
  private deathLabels: Phaser.GameObjects.Text[] = [];
  private moveStick: Stick | null = null;
  private aimStick: Stick | null = null;
  /**
   * Przycisk strzału działa jak gałka (krok 49b): przytrzymanie strzela (salwa / promień), przeciągnięcie
   * od przycisku wybiera kierunek — obrót o 180° i salwa jednym kciukiem. Bez przeciągnięcia — bieżący kierunek.
   */
  private shotStick: Stick | null = null;
  /** Kiedy kciuk dotknął przycisku strzału (ms, performance.now). */
  private shotDownAt = 0;
  private sorceress = false;
  /** E coś teraz zrobi (schody, kapliczka) — tylko wtedy przycisk E jest widoczny i działa. */
  private canInteract = false;
  /** Gałka ataku: kiedy dotknięta i czy kciuk wyszedł poza martwą strefę (inaczej to stuknięcie). */
  private aimDownAt = 0;
  private aimMoved = false;
  private deathButtons: DeathButton[] = [];
  /** Od kiedy ekran śmierci czeka na gracza — przyciski wchodzą razem z napisem, nie pod kciukiem z walki. */
  private deathPromptSince: number | null = null;

  constructor() {
    // Działa od startu gry: pierwszy dotyk (np. na ekranie startowym) włącza sterowanie dotykowe.
    super({ key: SceneKey.Touch, active: true });
  }

  create(): void {
    this.gfx = this.add.graphics();
    const labels: Record<ButtonId, string> = { shoot: 'STRZAŁ', dash: 'ZRYW', interact: 'E' };
    for (const id of Object.keys(labels) as ButtonId[]) {
      this.labels.set(id, this.add.text(0, 0, labels[id], STYLE).setOrigin(0.5).setVisible(false));
    }
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => this.onUp(p));
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, (p: Phaser.Input.Pointer) => this.onUp(p));
  }

  override update(): void {
    this.scene.bringToTop();
    const game = this.playingScene();
    if (!game) this.releaseAll();
    else if (this.shotStick && !touchState.shoot && performance.now() - this.shotDownAt >= TOUCH_SHOT_HOLD_MS) {
      touchState.shoot = true;
    }
    this.layoutDeathButtons();
    this.draw(game !== null);
  }

  /** Gra trwa i przyjmuje sterowanie: nie pauza (wybór nagrody), nie ekran śmierci. */
  private playingScene(): GameScene | null {
    if (!touchState.engaged || !this.scene.isActive(SceneKey.Game)) return null;
    const game = this.scene.get(SceneKey.Game) as GameScene;
    const hud = game.getHudData();
    if (hud.isPlayerDead || hud.death) return null;
    this.sorceress = hud.beam !== null;
    this.canInteract = hud.canInteract;
    return game;
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    if (!pointer.wasTouch) return;
    touchState.engaged = true;
    touchState.lastUsedAt = performance.now();

    const deathButton = this.deathButtons.find((b) => this.inDeathButton(b, pointer));
    if (deathButton) {
      deathButton.action();
      return;
    }
    if (!this.playingScene()) return;

    const button = this.buttonAt(pointer.x, pointer.y);
    if (button === 'dash') {
      touchState.queueDash();
    } else if (button === 'interact') {
      touchState.queueInteract();
    } else if (button === 'shoot') {
      if (!this.shotStick) {
        // Środek gałki w środku przycisku: kierunek to strona, w którą kciuk zjedzie z przycisku.
        const c = this.buttonCenter('shoot');
        this.shotStick = { pointerId: pointer.id, originX: c.x, originY: c.y, knobX: c.x, knobY: c.y };
        this.shotDownAt = performance.now();
        // Strzał rusza dopiero po przeciągnięciu albo przytrzymaniu (update) — nie w starą stronę.
        touchState.shoot = false;
        touchState.shotAim = null;
      }
    } else if (pointer.x < this.scale.width * TOUCH_STICK.moveZoneWidth) {
      if (!this.moveStick) this.moveStick = this.newStick(pointer);
    } else if (!this.aimStick) {
      this.aimStick = this.newStick(pointer);
      this.aimDownAt = performance.now();
      this.aimMoved = false;
    }
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    if (!pointer.wasTouch) return;
    touchState.lastUsedAt = performance.now();
    if (this.moveStick?.pointerId === pointer.id) {
      touchState.move = stickToMovement(this.updateStick(this.moveStick, pointer));
    } else if (this.aimStick?.pointerId === pointer.id) {
      const stick = this.updateStick(this.aimStick, pointer);
      touchState.aim = stick.strength > 0 ? stick.direction : null;
      if (touchState.aim) this.aimMoved = true;
    } else if (this.shotStick?.pointerId === pointer.id) {
      const stick = this.updateStick(this.shotStick, pointer);
      touchState.shotAim = stick.strength > 0 ? stick.direction : null;
      if (touchState.shotAim) touchState.shoot = true;
    }
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    if (this.moveStick?.pointerId === pointer.id) {
      this.moveStick = null;
      touchState.move = { x: 0, y: 0 };
    }
    if (this.aimStick?.pointerId === pointer.id) {
      // Stuknięcie strefy ataku (jak w Brawl Stars): jeden cios w najbliższego wroga.
      if (!this.aimMoved && performance.now() - this.aimDownAt <= TOUCH_TAP_MAX_MS) touchState.queueAttack();
      this.aimStick = null;
      touchState.aim = null;
    }
    if (this.shotStick?.pointerId === pointer.id) {
      // Krótkie stuknięcie bez przeciągnięcia: jeden strzał w najbliższego wroga.
      if (!touchState.shoot) touchState.queueShot();
      this.shotStick = null;
      touchState.shoot = false;
      touchState.shotAim = null;
    }
  }

  private newStick(pointer: Phaser.Input.Pointer): Stick {
    return { pointerId: pointer.id, originX: pointer.x, originY: pointer.y, knobX: pointer.x, knobY: pointer.y };
  }

  /** Gałka za kciukiem: gałka nie wychodzi poza promień, kierunek i siła z czystej funkcji. */
  private updateStick(stick: Stick, pointer: Phaser.Input.Pointer) {
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
    this.aimStick = null;
    this.shotStick = null;
    touchState.release();
  }

  private buttonCenter(id: ButtonId): { x: number; y: number } {
    const spec = TOUCH_BUTTONS[id];
    return { x: this.scale.width - spec.right, y: this.scale.height - spec.bottom };
  }

  private buttonAt(x: number, y: number): ButtonId | null {
    for (const id of ['shoot', 'dash', 'interact'] as const) {
      if (id === 'interact' && !this.canInteract) continue;
      const c = this.buttonCenter(id);
      if (Math.hypot(x - c.x, y - c.y) <= TOUCH_BUTTONS.radius * 1.15) return id;
    }
    return null;
  }

  /** Ekran śmierci na dotyku: imię (okno przeglądarki z klawiaturą telefonu) albo nowa wspinaczka. */
  private layoutDeathButtons(): void {
    const game = touchState.engaged && this.scene.isActive(SceneKey.Game) ? (this.scene.get(SceneKey.Game) as GameScene) : null;
    const prompt = game?.deathPrompt ?? null;
    if (prompt === null) this.deathPromptSince = null;
    else this.deathPromptSince ??= this.time.now;
    const ready = this.deathPromptSince !== null && this.time.now - this.deathPromptSince >= DEATH_TIMING.promptAt;
    const { width, gap } = TOUCH_DEATH_BUTTONS;
    const left = this.scale.width / 2 - (width + gap) / 2;
    const right = this.scale.width / 2 + (width + gap) / 2;
    if (game && ready && prompt === 'name') {
      this.deathButtons = [
        { label: 'PODAJ IMIĘ', x: left, action: () => game.submitPlayerName(window.prompt('Imię na tablicę wyników:') ?? null) },
        { label: 'BEZ IMIENIA', x: right, action: () => game.submitPlayerName(null) },
      ];
    } else if (game && ready && prompt === 'restart') {
      this.deathButtons = [
        { label: 'NOWA WSPINACZKA', x: left, action: () => game.startNewRun() },
        { label: 'ZMIEŃ BOHATERA', x: right, action: () => game.changeHero() },
      ];
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

  private inDeathButton(button: DeathButton, pointer: Phaser.Input.Pointer): boolean {
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
      const c = this.buttonCenter(id);
      const active = id === 'shoot' ? touchState.shoot : false;
      g.fillStyle(active ? 0x39c0d8 : 0x202030, active ? BUTTON_ACTIVE_ALPHA : BUTTON_ALPHA).fillCircle(c.x, c.y, TOUCH_BUTTONS.radius);
      g.lineStyle(2, 0xe8e8f0, 0.5).strokeCircle(c.x, c.y, TOUCH_BUTTONS.radius);
      if (id === 'shoot') label.setText(this.sorceress ? 'PROMIEŃ' : 'STRZAŁ');
      label.setPosition(c.x, c.y);
    }
    if (!playing) return;
    for (const stick of [this.moveStick, this.aimStick, this.shotStick]) {
      if (!stick) continue;
      g.fillStyle(0x202030, STICK_ALPHA).fillCircle(stick.originX, stick.originY, TOUCH_STICK.radius);
      g.lineStyle(2, 0xe8e8f0, 0.4).strokeCircle(stick.originX, stick.originY, TOUCH_STICK.radius);
      g.fillStyle(0xe8e8f0, 0.5).fillCircle(stick.knobX, stick.knobY, TOUCH_STICK.radius * 0.4);
    }
  }
}
