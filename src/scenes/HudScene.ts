import Phaser from 'phaser';
import type { BossHudData, DeathSummary, HudSceneData, HudSource } from '@/core/types';
import type { RankedEntry } from '@/systems/Highscores';
import { SceneKey } from '@/core/types';

const BAR_X = 16;
const BAR_WIDTH = 200;
const HP_BAR_Y = 40;
const HP_BAR_HEIGHT = 14;
const DASH_BAR_Y = HP_BAR_Y + HP_BAR_HEIGHT + 4;
const DASH_BAR_HEIGHT = 4;
const BOSS_BAR_WIDTH = 420;
const BOSS_BAR_HEIGHT = 12;
const BOSS_BAR_Y = 470;
/** Podium (3) + separator + wiersz bieżącego runu. */
const DEATH_ROWS = 5;

function formatScoreRow(row: RankedEntry): string {
  const label = `${row.rank}. ${row.entry.score} złota · piętro ${row.entry.floor}`;
  return row.isCurrent ? `► ${label} ◄` : label;
}

/**
 * Osobna scena nakładki — nie podlega zoomowi ani przesuwaniu kamery gry.
 * Co klatkę odczytuje stan z HudSource (GameScene).
 */
export class HudScene extends Phaser.Scene {
  private source!: HudSource;
  private bars!: Phaser.GameObjects.Graphics;
  private floorText!: Phaser.GameObjects.Text;
  private hpText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private deathPanel!: Phaser.GameObjects.Container;
  private deathScoreText!: Phaser.GameObjects.Text;
  private deathRows: Phaser.GameObjects.Text[] = [];
  private bossNameText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private itemsText!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKey.Hud);
  }

  create(data: HudSceneData): void {
    this.source = data.source;

    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#e8e8f0',
      stroke: '#000000',
      strokeThickness: 4,
    };

    this.floorText = this.add.text(BAR_X, 12, '', style);
    this.bars = this.add.graphics();
    this.hpText = this.add.text(BAR_X + BAR_WIDTH + 8, HP_BAR_Y - 2, '', { ...style, fontSize: '13px' });
    this.hintText = this.add.text(BAR_X, DASH_BAR_Y + 12, '', { ...style, fontSize: '13px' });

    this.goldText = this.add.text(BAR_X, DASH_BAR_Y + 30, '', { ...style, fontSize: '14px', color: '#f5c542' });
    this.itemsText = this.add.text(BAR_X, DASH_BAR_Y + 50, '', { ...style, fontSize: '12px', color: '#c8c8d8' });
    this.toastText = this.add
      .text(this.scale.width / 2, 70, '', { ...style, fontSize: '18px', color: '#ffe08a' })
      .setOrigin(0.5);

    this.buildDeathPanel(style);

    this.bossNameText = this.add
      .text(this.scale.width / 2, BOSS_BAR_Y - 22, '', { ...style, fontSize: '15px', color: '#ffb0a0' })
      .setOrigin(0.5, 0)
      .setVisible(false);

    const help = 'WASD — ruch · LPM — atak · Spacja/PPM — dash · E — kapliczka';
    const devHelp = import.meta.env.DEV ? '   [DEV] B — pokonaj bossa' : '';
    this.add.text(BAR_X, this.scale.height - 28, help + devHelp, { ...style, fontSize: '12px', color: '#8080a0' });
  }

  override update(): void {
    const hud = this.source.getHudData();

    this.floorText.setText(`Piętro ${hud.floor}`);
    this.hpText.setText(`${hud.hp}/${hud.maxHp}`);

    const hpRatio = hud.maxHp > 0 ? hud.hp / hud.maxHp : 0;
    this.bars.clear();
    this.bars.fillStyle(0x000000, 0.6).fillRect(BAR_X - 2, HP_BAR_Y - 2, BAR_WIDTH + 4, HP_BAR_HEIGHT + 4);
    this.bars.fillStyle(0x4a1c1c, 1).fillRect(BAR_X, HP_BAR_Y, BAR_WIDTH, HP_BAR_HEIGHT);
    this.bars.fillStyle(hpRatio > 0.3 ? 0x3ddc84 : 0xff6b6b, 1).fillRect(BAR_X, HP_BAR_Y, BAR_WIDTH * hpRatio, HP_BAR_HEIGHT);
    this.bars.fillStyle(0x202030, 1).fillRect(BAR_X, DASH_BAR_Y, BAR_WIDTH, DASH_BAR_HEIGHT);
    this.bars
      .fillStyle(hud.dashReadiness >= 1 ? 0x6ec6ff : 0x3a6080, 1)
      .fillRect(BAR_X, DASH_BAR_Y, BAR_WIDTH * hud.dashReadiness, DASH_BAR_HEIGHT);

    if (hud.stairsUnlocked) {
      this.hintText.setText('Schody otwarte — wejdź na nie, aby wspiąć się wyżej').setColor('#e0b84a');
    } else if (hud.boss) {
      this.hintText.setText('Pokonaj bossa, aby otworzyć schody · unikaj czerwonych stref').setColor('#ffb0a0');
    } else {
      this.hintText.setText(`Wrogowie: ${hud.enemiesAlive} · znajdź komnatę bossa (czerwone kraty)`).setColor('#a0a0b0');
    }

    this.goldText.setText(`Złoto (wynik): ${hud.gold}`);
    this.itemsText.setText(hud.items.map((i) => (i.count > 1 ? `${i.name} ×${i.count}` : i.name)).join(' · '));

    // Komunikat wygasa w ostatniej sekundzie wyświetlania.
    this.toastText.setText(hud.toast?.text ?? '');
    this.toastText.setAlpha(hud.toast ? Math.min(1, hud.toast.remainingMs / 1000 + 0.2) : 0);

    this.updateDeathPanel(hud.death);
    this.drawBossBar(hud.boss);
  }

  /** Panel śmierci: wynik runu + skrócona tablica (podium i ewentualnie miejsce tego runu). */
  private buildDeathPanel(style: Phaser.Types.GameObjects.Text.TextStyle): void {
    const cx = this.scale.width / 2;
    const top = 120;
    const backdrop = this.add.rectangle(cx, top + 135, 460, 300, 0x0b0b10, 0.85).setStrokeStyle(2, 0x3a3346);
    const title = this.add
      .text(cx, top + 10, 'POLEGŁEŚ', { ...style, fontSize: '32px', color: '#ff6b6b', strokeThickness: 6 })
      .setOrigin(0.5, 0);
    this.deathScoreText = this.add.text(cx, top + 56, '', { ...style, fontSize: '16px', color: '#f5c542' }).setOrigin(0.5, 0);
    const header = this.add
      .text(cx, top + 92, 'NAJLEPSZE WSPINACZKI', { ...style, fontSize: '13px', color: '#a0a0b8' })
      .setOrigin(0.5, 0);
    this.deathRows = Array.from({ length: DEATH_ROWS }, (_, i) =>
      this.add.text(cx, top + 116 + i * 22, '', { ...style, fontSize: '15px' }).setOrigin(0.5, 0),
    );
    const restart = this.add
      .text(cx, top + 250, 'R — nowa wspinaczka', { ...style, fontSize: '15px', color: '#e8e8f0' })
      .setOrigin(0.5, 0);

    this.deathPanel = this.add.container(0, 0, [backdrop, title, this.deathScoreText, header, ...this.deathRows, restart]);
    this.deathPanel.setVisible(false);
  }

  private updateDeathPanel(death: DeathSummary | null): void {
    this.deathPanel.setVisible(death !== null);
    if (!death) return;

    this.deathScoreText.setText(`Wynik: ${death.score} złota · piętro ${death.floor} · miejsce ${death.rank}`);

    const lines: Array<{ text: string; current: boolean }> = death.board.top.map((row) => ({
      text: formatScoreRow(row),
      current: row.isCurrent,
    }));
    if (death.board.current) {
      lines.push({ text: '· · ·', current: false });
      lines.push({ text: formatScoreRow(death.board.current), current: true });
    }

    this.deathRows.forEach((row, i) => {
      const line = lines[i];
      row.setVisible(line !== undefined);
      if (line) row.setText(line.text).setColor(line.current ? '#ffe08a' : '#c8c8d8');
    });
  }

  private drawBossBar(boss: BossHudData | null): void {
    this.bossNameText.setVisible(boss !== null);
    if (!boss) return;

    const x = (this.scale.width - BOSS_BAR_WIDTH) / 2;
    const ratio = boss.maxHp > 0 ? boss.hp / boss.maxHp : 0;
    this.bossNameText.setText(boss.enraged ? `${boss.name} — wściekły!` : boss.name);
    this.bars.fillStyle(0x000000, 0.6).fillRect(x - 2, BOSS_BAR_Y - 2, BOSS_BAR_WIDTH + 4, BOSS_BAR_HEIGHT + 4);
    this.bars.fillStyle(0x3a1010, 1).fillRect(x, BOSS_BAR_Y, BOSS_BAR_WIDTH, BOSS_BAR_HEIGHT);
    this.bars.fillStyle(boss.enraged ? 0xff5a36 : 0xc0392b, 1).fillRect(x, BOSS_BAR_Y, BOSS_BAR_WIDTH * ratio, BOSS_BAR_HEIGHT);
  }
}
