/** Tryb gry wybrany na ekranie wyboru — czyste dane, bez zależności od Phasera. */
export enum RunMode {
  /** Zwykła wspinaczka: piętra, pokoje, boss na końcu piętra. */
  Tower = 'tower',
  /** Areny bossów (krok 90, tryb testowy): sama arena, boss i jego pomocnicy, nagroda i teleport dalej. */
  BossRush = 'boss-rush',
  /** Wybór piętra (krok 91): zwykła wspinaczka od piętra, którego bossa gracz już pokonał. */
  FloorSelect = 'floor-select',
}
