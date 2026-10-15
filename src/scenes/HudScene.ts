import Phaser from 'phaser';
import type { BeamHudData, BossHudData, DeathSummary, HudSceneData, HudSource, RangedHudData } from '@/core/types';
import type { RankedEntry } from '@/systems/Highscores';
import { SceneKey } from '@/core/types';

const BAR_X = 16;
const BAR_WIDTH = 200;
const HP_BAR_Y = 40;
const HP_BAR_HEIGHT = 14;
const DASH_BAR_Y = HP_BAR_Y + HP_BAR_HEIGHT + 4;
const DASH_BAR_HEIGHT = 4;
const CHARGES_Y = DASH_BAR_Y + DASH_BAR_HEIGHT + 3;
const CHARGE_HEIGHT = 5;
const CHARGE_GAP = 3;
/** Pierwsza linia tekstu pod paskami. */
/** Promień Czarodziejki: cienki pasek pod kulami. */
const BEAM_Y = CHARGES_Y + CHARGE_HEIGHT + 2;
const BEAM_HEIGHT = 3;
const TEXT_Y = BEAM_Y + BEAM_HEIGHT + 4;
const BOSS_BAR_WIDTH = 420;
const BOSS_BAR_HEIGHT = 12;
const BOSS_BAR_Y = 470;
/** Plansza bossa (wejście na arenę, wściekłość): czas, pojawianie się i wygasanie. */
const BANNER_MS = 3000;
const BANNER_FADE_IN_MS = 300;
const BANNER_FADE_OUT_MS = 900;
const BANNER_Y = 150;
/** Podium (3) + separator + wiersz bieżącego runu. */
const DEATH_ROWS = 5;

/** Podpowiedź sterowania: Czarodziejka ma kule i promień zamiast ciosu i strzału. */
function helpLine(sorceress: boolean): string {
  const attacks = sorceress ? 'LPM — kule energii · PPM — promień (przytrzymaj)' : 'LPM — atak · PPM — strzał';
  const devHelp = import.meta.env.DEV ? '   [DEV] B — pokonaj bossa' : '';
  return `WASD — ruch · ${attacks} · Spacja — dash · E — kapliczka${devHelp}`;
}
const DEATH_HEADERS: Record<DeathSummary['source'], string> = {
  local: 'NAJLEPSZE WSPINACZKI',
  pending: 'NAJLEPSZE WSPINACZKI · łączenie…',
  shared: 'NAJLEPSZE WSPINACZKI · WSZYSCY GRACZE',
};

function formatScoreRow(row: RankedEntry): string {
  const label = `${row.rank}. ${row.entry.name ?? '—'} · ${row.entry.score} złota · piętro ${row.entry.floor}`;
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
  private modifierText!: Phaser.GameObjects.Text;
  private hpText!: Phaser.GameObjects.Text;
  private helpText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private deathPanel!: Phaser.GameObjects.Container;
  private deathScoreText!: Phaser.GameObjects.Text;
  private deathRows: Phaser.GameObjects.Text[] = [];
  private deathHeader!: Phaser.GameObjects.Text;
  private deathRestart!: Phaser.GameObjects.Text;
  private bossNameText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private itemsText!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private bannerTitle!: Phaser.GameObjects.Text;
  private bannerSubtitle!: Phaser.GameObjects.Text;
  private bannerStartedAt = -Infinity;
  /** Co już ogłoszono w tej walce (przebudzenie, wściekłość) — plansza pokazuje się raz. */
  private bannerBoss: BossHudData | null = null;

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
    this.modifierText = this.add.text(BAR_X + BAR_WIDTH + 70, 16, '', { ...style, fontSize: '13px', color: '#ffb070' });
    this.bars = this.add.graphics();
    this.hpText = this.add.text(BAR_X + BAR_WIDTH + 8, HP_BAR_Y - 2, '', { ...style, fontSize: '13px' });
    this.hintText = this.add.text(BAR_X, TEXT_Y, '', { ...style, fontSize: '13px' });

    this.goldText = this.add.text(BAR_X, TEXT_Y + 18, '', { ...style, fontSize: '14px', color: '#f5c542' });
    this.itemsText = this.add.text(BAR_X, TEXT_Y + 38, '', {
      ...style,
      fontSize: '12px',
      color: '#c8c8d8',
      wordWrap: { width: 460 },
    });
    this.toastText = this.add
      .text(this.scale.width / 2, 70, '', { ...style, fontSize: '18px', color: '#ffe08a' })
      .setOrigin(0.5);

    this.buildDeathPanel(style);

    this.bossNameText = this.add
      .text(this.scale.width / 2, BOSS_BAR_Y - 22, '', { ...style, fontSize: '15px', color: '#ffb0a0' })
      .setOrigin(0.5, 0)
      .setVisible(false);

    this.bannerTitle = this.add
      .text(this.scale.width / 2, BANNER_Y, '', { ...style, fontSize: '30px', color: '#f0d27a', strokeThickness: 6 })
      .setOrigin(0.5)
      .setAlpha(0);
    this.bannerSubtitle = this.add
      .text(this.scale.width / 2, BANNER_Y + 30, '', { ...style, fontSize: '16px', color: '#d8c0ff' })
      .setOrigin(0.5)
      .setAlpha(0);

    this.helpText = this.add.text(BAR_X, this.scale.height - 28, '', { ...style, fontSize: '12px', color: '#8080a0' });
  }

  override update(): void {
    const hud = this.source.getHudData();

    this.floorText.setText(`Piętro ${hud.floor}`);
    const modifier = hud.floorModifier;
    this.modifierText.setText(modifier ? `${modifier.name}: ${modifier.description}` : '');
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
    this.drawCharges(hud.ranged);
    this.drawBeam(hud.beam);
    this.helpText.setText(helpLine(hud.beam !== null));

    if (hud.stairsUnlocked) {
      this.hintText.setText('Schody otwarte — wejdź na nie, aby wspiąć się wyżej').setColor('#e0b84a');
    } else if (hud.boss) {
      this.hintText.setText('Pokonaj bossa, aby otworzyć schody · unikaj czerwonych stref').setColor('#ffb0a0');
    } else {
      this.hintText.setText(`Wrogowie: ${hud.enemiesAlive} · znajdź komnatę bossa (zakratowane schody)`).setColor('#a0a0b0');
    }

    this.goldText.setText(`Złoto (wynik): ${hud.gold}`);
    this.itemsText.setText(hud.items.map((i) => (i.count > 1 ? `${i.name} ×${i.count}` : i.name)).join(' · '));

    // Komunikat wygasa w ostatniej sekundzie wyświetlania.
    this.toastText.setText(hud.toast?.text ?? '');
    this.toastText.setAlpha(hud.toast ? Math.min(1, hud.toast.remainingMs / 1000 + 0.2) : 0);

    this.updateDeathPanel(hud.death);
    this.drawBossBar(hud.boss);
    this.updateBanner(hud.boss);
  }

  /** Plansza: imię i tytuł bossa przy przebudzeniu, okrzyk przy wściekłości (tylko bossowie z tytułem). */
  private updateBanner(boss: BossHudData | null): void {
    const now = this.time.now;
    const previous = this.bannerBoss;
    this.bannerBoss = boss;
    if (boss?.title) {
      if (!previous) this.showBanner(boss.name, boss.title, now);
      else if (boss.enraged && !previous.enraged) this.showBanner(boss.enragedLabel, boss.name, now);
    }
    const age = now - this.bannerStartedAt;
    const alpha =
      age < 0 || age >= BANNER_MS
        ? 0
        : Math.min(1, age / BANNER_FADE_IN_MS, (BANNER_MS - age) / BANNER_FADE_OUT_MS);
    this.bannerTitle.setAlpha(alpha);
    this.bannerSubtitle.setAlpha(alpha);
  }

  private showBanner(title: string, subtitle: string, now: number): void {
    this.bannerTitle.setText(title);
    this.bannerSubtitle.setText(subtitle);
    this.bannerStartedAt = now;
  }

  /** Ładunki strzału: pełne segmenty + częściowo wypełniony segment, który się ładuje. */
  private drawCharges(ranged: RangedHudData): void {
    const count = Math.max(1, ranged.maxCharges);
    const width = (BAR_WIDTH - CHARGE_GAP * (count - 1)) / count;
    for (let i = 0; i < count; i++) {
      const x = BAR_X + i * (width + CHARGE_GAP);
      this.bars.fillStyle(0x202030, 1).fillRect(x, CHARGES_Y, width, CHARGE_HEIGHT);
      if (i < ranged.charges) {
        this.bars.fillStyle(0x5ee0c8, 1).fillRect(x, CHARGES_Y, width, CHARGE_HEIGHT);
      } else if (i === ranged.charges) {
        this.bars.fillStyle(0x2f7064, 1).fillRect(x, CHARGES_Y, width * ranged.rechargeProgress, CHARGE_HEIGHT);
      }
    }
  }

  /** Promień: w trakcie — pozostały czas (jasny), w blokadzie — odnowienie (ciemny), gotowy — pełny. */
  private drawBeam(beam: BeamHudData | null): void {
    if (!beam) return;
    this.bars.fillStyle(0x202030, 1).fillRect(BAR_X, BEAM_Y, BAR_WIDTH, BEAM_HEIGHT);
    const color = beam.active ? 0xe4fbfb : beam.readiness >= 1 ? 0x39c0d8 : 0x1d7f9c;
    this.bars.fillStyle(color, 1).fillRect(BAR_X, BEAM_Y, BAR_WIDTH * beam.readiness, BEAM_HEIGHT);
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
    const header = (this.deathHeader = this.add
      .text(cx, top + 92, 'NAJLEPSZE WSPINACZKI', { ...style, fontSize: '13px', color: '#a0a0b8' })
      .setOrigin(0.5, 0));
    this.deathRows = Array.from({ length: DEATH_ROWS }, (_, i) =>
      this.add.text(cx, top + 116 + i * 22, '', { ...style, fontSize: '15px' }).setOrigin(0.5, 0),
    );
    const restart = (this.deathRestart = this.add
      .text(cx, top + 250, 'R — nowa wspinaczka', { ...style, fontSize: '15px', color: '#e8e8f0' })
      .setOrigin(0.5, 0));

    this.deathPanel = this.add.container(0, 0, [backdrop, title, this.deathScoreText, header, ...this.deathRows, restart]);
    this.deathPanel.setVisible(false);
  }

  private updateDeathPanel(death: DeathSummary | null): void {
    this.deathPanel.setVisible(death !== null);
    if (!death) return;

    const place = death.nameEntry === null ? ` · miejsce ${death.rank}` : '';
    this.deathScoreText.setText(`Wynik: ${death.score} złota · piętro ${death.floor}${place}`);
    this.deathRestart.setVisible(death.nameEntry === null);
    if (death.nameEntry !== null) {
      // Wpisywanie imienia: zamiast tablicy jedno pole z kursorem.
      this.deathHeader.setText('TWOJE IMIĘ NA TABLICY WYNIKÓW');
      const hint = 'Enter — zapisz · Esc — bez imienia';
      this.deathRows.forEach((row, i) => {
        row.setVisible(i <= 1);
        if (i === 0) row.setText(`${death.nameEntry}_`).setColor('#ffe08a');
        if (i === 1) row.setText(hint).setColor('#a0a0b8');
      });
      return;
    }
    this.deathHeader.setText(DEATH_HEADERS[death.source]);

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
    this.bossNameText.setText(boss.enraged ? `${boss.name} — ${boss.enragedLabel}` : boss.name);
    this.bars.fillStyle(0x000000, 0.6).fillRect(x - 2, BOSS_BAR_Y - 2, BOSS_BAR_WIDTH + 4, BOSS_BAR_HEIGHT + 4);
    this.bars.fillStyle(0x3a1010, 1).fillRect(x, BOSS_BAR_Y, BOSS_BAR_WIDTH, BOSS_BAR_HEIGHT);
    this.bars.fillStyle(boss.enraged ? 0xff5a36 : 0xc0392b, 1).fillRect(x, BOSS_BAR_Y, BOSS_BAR_WIDTH * ratio, BOSS_BAR_HEIGHT);
  }
}
