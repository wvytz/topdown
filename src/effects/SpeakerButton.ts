import Phaser from 'phaser';
import { SPEAKER_BUTTON } from '@/config/audioConfig';
import { sound } from '@/audio/SoundBoard';

/**
 * Głośnik w prawym górnym rogu ekranu startowego (krok 120). Gra startuje wyciszona; kliknięcie (stuknięcie)
 * włącza dźwięk i wycisza go z powrotem — wspólne ustawienie z N i pauzą, zapamiętane w localStorage.
 * Kliknięcie nie przewija intra (zatrzymuje zdarzenie przed nasłuchem sceny).
 */
export class SpeakerButton {
  private readonly icon: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private hovered = false;

  constructor(scene: Phaser.Scene, depth: number) {
    const B = SPEAKER_BUTTON;
    const x = scene.scale.width - B.marginX;
    const y = B.marginY;
    this.icon = scene.add.graphics({ x, y }).setDepth(depth);
    this.label = scene.add
      .text(x - B.radius - 8, y, '', { fontFamily: 'monospace', fontSize: '11px', color: '#a0a0b8', stroke: '#000000', strokeThickness: 3 })
      .setOrigin(1, 0.5)
      .setDepth(depth)
      .setAlpha(0);
    const hit = scene.add
      .zone(x, y, B.radius * 2 + 8, B.radius * 2 + 8)
      .setDepth(depth)
      .setInteractive({ useHandCursor: true });
    type Stop = Phaser.Types.Input.EventData;
    hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Stop) => event.stopPropagation());
    hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Stop) => {
      event.stopPropagation();
      sound.toggleMute();
    });
    hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => this.setHover(true));
    hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => this.setHover(false));
    const unwatch = sound.watch(() => this.draw());
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, unwatch);
    this.draw();
  }

  private setHover(on: boolean): void {
    this.hovered = on;
    this.label.setAlpha(on ? 1 : 0);
    this.draw();
  }

  private draw(): void {
    const B = SPEAKER_BUTTON;
    const C = B.colors;
    const muted = sound.settings.muted;
    const color = this.hovered ? C.hover : C.icon;
    const g = this.icon.clear();
    g.fillStyle(C.fill, C.fillAlpha).fillCircle(0, 0, B.radius);
    g.lineStyle(2, C.border, 1).strokeCircle(0, 0, B.radius);
    // Głośnik: prostokąt i lejek.
    g.fillStyle(color, 1);
    g.fillRect(-9, -3, 4, 6);
    g.fillTriangle(-6, 0, 1, -8, 1, 8);
    if (muted) {
      g.lineStyle(2, C.muted, 1);
      g.lineBetween(4, -4, 10, 4);
      g.lineBetween(4, 4, 10, -4);
    } else {
      g.lineStyle(2, color, 1);
      g.beginPath().arc(1, 0, 6, -0.8, 0.8).strokePath();
      g.beginPath().arc(1, 0, 10, -0.8, 0.8).strokePath();
    }
    this.label.setText(muted ? B.label.off : B.label.on);
  }
}
