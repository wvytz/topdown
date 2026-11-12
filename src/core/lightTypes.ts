/** Rodzaje świateł dynamicznych (krok U3, „Światło 2.0”): kto świeci w warstwie mroku poza pochodniami i ogniem. */
export enum LightKind {
  /** Pocisk wroga — niebezpieczeństwo widać pierwsze, także w „Mroku” i Zaduchu. */
  EnemyShot = 'enemy-shot',
  /** Pocisk bohatera (strzała, strzał, fala ostrza). */
  Shot = 'shot',
  /** Magia Czarodziejki: kule, rozprysk, Supernowa, teleport. */
  Magic = 'magic',
  /** Promień-Wyrwa Czarodziejki (światła w odstępach wzdłuż promienia). */
  Beam = 'beam',
  /** Wybuch strefy (sok, szlam, wybuchy bez ognia — ogień ma własne światło z kroku 144). */
  Blast = 'blast',
}

/** Jedno światło dynamiczne w świecie: środek, promień (px świata) i rodzaj (barwa poświaty, kolejność). */
export interface LightSource {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly kind: LightKind;
  /** Barwa poświaty inna niż barwa rodzaju (np. wybuch soku w barwie swojego pierścienia). */
  readonly color?: number;
}

/** Co światło dynamiczne robi na jednym poziomie jakości. Niska = nic (gra sprzed upgradu). */
export interface DynamicLightLevel {
  /** Pociski (bohaterów i wrogów) rozświetlają mrok. */
  readonly shots: boolean;
  /** Wybuchy i magia błyskają światłem, które gaśnie (przy „mniej błysków” — wyłączone). */
  readonly flashes: boolean;
  /** Promień Czarodziejki rozświetla mrok wzdłuż siebie. */
  readonly beam: boolean;
  /** Barwna poświata (mieszanie ADD) nad mrokiem — światło ma kolor źródła. */
  readonly tint: boolean;
  /** Zimne światło Czarnego Słońca z jednej strony kadru (STYLEGUIDE §13.7). */
  readonly blackSun: boolean;
  /** Najwięcej świateł dynamicznych w kadrze naraz (nawała z łucznikiem nie może zjeść klatki). */
  readonly maxLights: number;
}
