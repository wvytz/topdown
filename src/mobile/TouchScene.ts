import Phaser from 'phaser';
import { SceneKey } from '@/core/types';
import { DEATH_TIMING } from '@/config/deathScreenConfig';
import { TOUCH_BUTTONS, TOUCH_DEATH_BUTTONS, TOUCH_LABELS, TOUCH_SHOT_HOLD_MS, TOUCH_STICK, TOUCH_TAP_MAX_MS } from '@/config/touchConfig';
import type { GameScene } from '@/scenes/GameScene';
import { MenuCommand } from '@/systems/gamepadInput';
import { stickState, stickToMovement } from '@/systems/touchAim';
import { buttonAt, followStickOrigin, placeButton, type ScreenButton } from '@/systems/touchLayout';
import { touchState } from '@/mobile/TouchState';
import { TouchOverlay, type OverlayButton, type OverlayStick } from '@/mobile/TouchOverlay';

export const TOUCH_SCENE_KEY = 'TouchScene';

type ButtonId = 'attack' | 'shoot' | 'dash' | 'interact' | 'ultimate';
/** Przyciski ataku działają jak gałki zakotwiczone w środku przycisku. */
type StickButton = 'attack' | 'shoot';

/** Palec na ekranie: identyfikator dotyku i pozycja w pikselach CSS strony (krok 141; wcześniej płótna). */
interface TouchPoint {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

interface Stick {
  readonly pointerId: number;
  originX: number;
  originY: number;
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
const BUTTONS: readonly ButtonId[] = ['attack', 'shoot', 'dash', 'interact', 'ultimate'];

/**
 * Sterowanie dotykowe wersji mobilnej (krok 96; przeniesione z gałęzi testowej, kroki „49–49d”).
 * Lewa część ekranu — pływająca gałka ruchu, która idzie za kciukiem. Prawa ręka (krok 96a, układ właściciela):
 * duże kółko ataku podstawowego (LPM), nad nim i w prawo atak PPM (strzał / promień / salwa), po lewej zryw,
 * nad zrywem E (tylko gdy coś zrobi); pauza pod minimapą. Duże kółko atakuje od razu przy dotknięciu i celuje
 * samo, przeciągnięcie przejmuje cel; PPM: przeciągnij — celujesz, stuknij — celuje samo.
 * Krok 141 (tester: „ciężkie i niewygodne”): gałka i przyciski walki w pikselach CSS ekranu, przy jego
 * krawędziach — na szerokim telefonie w czarnych pasach obok płótna; rysuje je `TouchOverlay`.
 * Scena nad grą i HUD-em: tylko zapisuje `touchState`; pauza i przyciski ekranu śmierci (zamiast R / C / M)
 * zostają na płótnie gry.
 *
 * Dotyku słuchamy zdarzeniami przeglądarki na całej stronie (#game), nie przez Phasera — Phaser śledzi palce
 * tylko nad płótnem, a kciuki na telefonie leżą przy krawędziach, często w czarnych pasach obok płótna.
 * Menu, wybór bohatera, nagroda i pauza działają na zwykłym dotyku Phasera (stukanie w napisy i karty).
 */
export class TouchScene extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics;
  private pauseLabel!: Phaser.GameObjects.Text;
  private overlay!: TouchOverlay;
  private page!: HTMLElement;
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
  /** Pasek mocy ultimate pełny (krok 98) — przycisk świeci. */
  private ultimateReady = false;
  private deathButtons: DeathButton[] = [];
  /** Od kiedy ekran śmierci czeka na gracza — przyciski wchodzą razem z napisem, nie pod kciukiem z walki. */
  private deathSince: number | null = null;

  constructor() {
    // Działa od startu gry: pierwszy dotyk (np. na ekranie startowym) włącza sterowanie dotykowe.
    super({ key: TOUCH_SCENE_KEY, active: true });
  }

  create(): void {
    this.gfx = this.add.graphics();
    this.pauseLabel = this.add.text(0, 0, '', { ...STYLE, fontSize: '16px' }).setOrigin(0.5).setVisible(false);
    const page = document.getElementById('game') ?? document.body;
    this.page = page;
    this.overlay = new TouchOverlay(page);
    const listen = (type: string, handler: (point: TouchPoint) => void): void => {
      page.addEventListener(
        type,
        (event) => {
          const touchEvent = event as TouchEvent;
          // Poza płótnem: bez udawanych kliknięć myszą i gestów przeglądarki (na płótnie robi to Phaser).
          if (touchEvent.target !== this.game.canvas && touchEvent.cancelable) touchEvent.preventDefault();
          for (const touch of Array.from(touchEvent.changedTouches)) handler(this.toScreen(touch));
        },
        { passive: false },
      );
    };
    listen('touchstart', (p) => this.onDown(p));
    listen('touchmove', (p) => this.onMove(p));
    listen('touchend', (p) => this.onUp(p));
    listen('touchcancel', (p) => this.onUp(p));
  }

  /** Pozycja palca w pikselach CSS strony (przyciski walki i gałka ruchu). */
  private toScreen(touch: Touch): TouchPoint {
    const rect = this.page.getBoundingClientRect();
    return { id: touch.identifier, x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  }

  /** Punkt ekranu w pikselach płótna gry — także poza nim, w czarnych pasach (pauza, ekran śmierci). */
  private toCanvas(point: TouchPoint): TouchPoint {
    const page = this.page.getBoundingClientRect();
    const rect = this.game.canvas.getBoundingClientRect();
    return {
      id: point.id,
      x: ((point.x + page.left - rect.left) * this.scale.width) / rect.width,
      y: ((point.y + page.top - rect.top) * this.scale.height) / rect.height,
    };
  }

  /** Przyciski walki na ekranie bieżącego rozmiaru, liczone od krawędzi bezpiecznego obszaru. */
  private screenButtons(): Record<ButtonId, ScreenButton> {
    const { width, height } = this.overlay.screen;
    const safe = this.overlay.safeArea;
    const screen = { width: width - safe.right, height: height - safe.bottom };
    return {
      attack: placeButton(TOUCH_BUTTONS.attack, screen),
      shoot: placeButton(TOUCH_BUTTONS.shoot, screen),
      dash: placeButton(TOUCH_BUTTONS.dash, screen),
      interact: placeButton(TOUCH_BUTTONS.interact, screen),
      ultimate: placeButton(TOUCH_BUTTONS.ultimate, screen),
    };
  }

  override update(): void {
    this.scene.bringToTop();
    this.overlay.fit(this.page.clientWidth, this.page.clientHeight);
    const game = this.playingScene();
    if (!game) {
      this.releaseAll();
    } else {
      // Przytrzymanie PPM bez przeciągania: po chwili strzał z celowaniem samym.
      const now = performance.now();
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
    this.ultimateReady = (hud.ultimate?.charge ?? 0) >= 1;
    return game;
  }

  private onDown(pointer: TouchPoint): void {
    touchState.engaged = true;

    const onCanvas = this.toCanvas(pointer);
    const deathButton = this.deathButtons.find((b) => this.inDeathButton(b, onCanvas));
    if (deathButton) {
      deathButton.action();
      return;
    }
    if (!this.playingScene()) return;

    if (this.onPauseButton(onCanvas)) {
      this.pausePointer = pointer.id;
      return;
    }
    const button = buttonAt(this.screenButtons(), pointer, TOUCH_BUTTONS.hitSlop, (id) => id !== 'interact' || this.canInteract);
    if (button === 'dash') {
      touchState.queueDash();
    } else if (button === 'interact') {
      touchState.queueInteract();
    } else if (button === 'ultimate') {
      touchState.queueUltimate();
    } else if (button === 'attack' || button === 'shoot') {
      if (this.sticks[button]) return;
      // Środek gałki w środku przycisku: kierunek to strona, w którą kciuk zjedzie z przycisku.
      const c = this.screenButtons()[button];
      this.sticks[button] = { pointerId: pointer.id, originX: c.x, originY: c.y, knobX: c.x, knobY: c.y, downAt: performance.now() };
      if (button === 'attack') {
        // Krok 141 (gra zręcznościowa): cios od razu przy dotknięciu, z celowaniem samym w najbliższego wroga;
        // przeciągnięcie przejmuje cel. Kolejka — żeby stuknięcie krótsze od klatki też dało cios.
        touchState.attack = true;
        touchState.aim = null;
        touchState.queueAttack();
      } else {
        // PPM rusza dopiero po przeciągnięciu albo przytrzymaniu (update) — ładunek nie leci w starą stronę.
        touchState.shoot = false;
        touchState.shotAim = null;
      }
    } else if (pointer.x < this.scale.width * TOUCH_STICK.moveZoneWidth && !this.moveStick) {
      this.moveStick = { pointerId: pointer.id, originX: pointer.x, originY: pointer.y, knobX: pointer.x, knobY: pointer.y, downAt: performance.now() };
    }
  }

  private onMove(pointer: TouchPoint): void {
    if (this.moveStick?.pointerId === pointer.id) {
      // Gałka ruchu idzie za kciukiem: zawrócenie nie wymaga cofania kciuka przez cały dawny środek.
      const origin = followStickOrigin({ x: this.moveStick.originX, y: this.moveStick.originY }, pointer, TOUCH_STICK.radius);
      this.moveStick.originX = origin.x;
      this.moveStick.originY = origin.y;
      touchState.move = stickToMovement(this.updateStick(this.moveStick, pointer, TOUCH_STICK.radius));
    } else if (this.sticks.attack?.pointerId === pointer.id) {
      const stick = this.updateStick(this.sticks.attack, pointer, TOUCH_STICK.aimRadius);
      touchState.aim = stick.strength > 0 ? stick.direction : null;
      if (touchState.aim) touchState.attack = true;
    } else if (this.sticks.shoot?.pointerId === pointer.id) {
      const stick = this.updateStick(this.sticks.shoot, pointer, TOUCH_STICK.aimRadius);
      touchState.shotAim = stick.strength > 0 ? stick.direction : null;
      if (touchState.shotAim) touchState.shoot = true;
    }
  }

  private onUp(pointer: TouchPoint): void {
    if (this.pausePointer === pointer.id) {
      this.pausePointer = null;
      const game = this.playingScene();
      if (game && this.onPauseButton(this.toCanvas(pointer))) {
        this.releaseAll();
        game.requestPause();
      }
    }
    if (this.moveStick?.pointerId === pointer.id) {
      this.moveStick = null;
      touchState.move = { x: 0, y: 0 };
    }
    if (this.sticks.attack?.pointerId === pointer.id) {
      this.sticks.attack = null;
      touchState.attack = false;
      touchState.aim = null;
    }
    const shoot = this.sticks.shoot;
    if (shoot?.pointerId === pointer.id) {
      // Krótkie stuknięcie bez przeciągnięcia (jak w Brawl Stars): jeden strzał w najbliższego wroga.
      if (!touchState.shoot && performance.now() - shoot.downAt <= TOUCH_TAP_MAX_MS) touchState.queueShot();
      this.sticks.shoot = null;
      touchState.shoot = false;
      touchState.shotAim = null;
    }
  }

  /** Gałka za kciukiem: gałka nie wychodzi poza promień, kierunek i siła z czystej funkcji. */
  private updateStick(stick: Stick, pointer: TouchPoint, radius: number) {
    const dx = pointer.x - stick.originX;
    const dy = pointer.y - stick.originY;
    const state = stickState(dx, dy, radius, TOUCH_STICK.deadzone);
    const length = Math.hypot(dx, dy);
    const clamp = length > radius ? radius / length : 1;
    stick.knobX = stick.originX + dx * clamp;
    stick.knobY = stick.originY + dy * clamp;
    return state;
  }

  private releaseAll(): void {
    this.moveStick = null;
    this.sticks = { attack: null, shoot: null };
    touchState.release();
  }

  private pauseCenter(): { x: number; y: number } {
    return { x: this.scale.width - TOUCH_BUTTONS.pause.right, y: TOUCH_BUTTONS.pause.top };
  }

  private onPauseButton(pointer: TouchPoint): boolean {
    const c = this.pauseCenter();
    const { width, height } = TOUCH_BUTTONS.pause;
    const slop = TOUCH_BUTTONS.hitSlop;
    // Niski przycisk: w pionie strefa jeszcze o 8 px większa, żeby kciuk nie chybiał.
    return Math.abs(pointer.x - c.x) <= (width / 2) * slop && Math.abs(pointer.y - c.y) <= (height / 2) * slop + 8;
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
    this.pauseLabel.setVisible(playing);
    if (!playing) {
      this.overlay.draw(null);
      return;
    }
    this.drawPauseButton(g, this.pauseLabel);

    const screen = this.screenButtons();
    const buttons: OverlayButton[] = [];
    for (const id of BUTTONS) {
      if (id === 'interact' && !this.canInteract) continue;
      const active = (id === 'attack' && touchState.attack) || (id === 'shoot' && touchState.shoot);
      const ready = id === 'ultimate' && this.ultimateReady;
      const label = id === 'attack' || id === 'shoot' || id === 'ultimate' ? TOUCH_LABELS[id][this.kit] : TOUCH_LABELS[id];
      buttons.push({ ...screen[id], label, state: active ? 'active' : ready ? 'ready' : 'idle', primary: id === 'attack' });
    }
    const sticks: OverlayStick[] = [];
    if (this.moveStick) sticks.push({ ...this.moveStick, radius: TOUCH_STICK.radius });
    for (const id of ['attack', 'shoot'] as const) {
      const stick = this.sticks[id];
      // Przycisk ataku: obwódka zasięgu przeciągnięcia i gałka pod kciukiem.
      if (stick) sticks.push({ ...stick, radius: TOUCH_STICK.aimRadius });
    }
    const { left, bottom } = TOUCH_STICK.restHint;
    const restX = left + this.overlay.safeArea.left;
    const restY = this.overlay.screen.height - this.overlay.safeArea.bottom - bottom;
    const restHint = this.moveStick ? null : { originX: restX, originY: restY, knobX: restX, knobY: restY, radius: TOUCH_STICK.radius };
    this.overlay.draw({ buttons, sticks, restHint });
  }

  /** Pauza: ciemna pigułka ze złotą obwódką, ikonka ⏸ i podpis — widać ją od razu, w przeciwieństwie do samego „II”. */
  private drawPauseButton(g: Phaser.GameObjects.Graphics, label: Phaser.GameObjects.Text): void {
    const c = this.pauseCenter();
    const { width, height } = TOUCH_BUTTONS.pause;
    const left = c.x - width / 2;
    const top = c.y - height / 2;
    g.fillStyle(0x1a1a24, 0.8).fillRoundedRect(left, top, width, height, height / 2);
    g.lineStyle(2, 0xf1e2a9, 0.9).strokeRoundedRect(left, top, width, height, height / 2);
    // Ikonka: dwie pionowe belki po lewej, podpis obok.
    const iconX = left + 16;
    g.fillStyle(0xf1e2a9, 1).fillRect(iconX - 5, c.y - 7, 4, 14).fillRect(iconX + 2, c.y - 7, 4, 14);
    label.setText(TOUCH_LABELS.pause).setColor('#f1e2a9').setPosition(c.x + 9, c.y);
  }
}
