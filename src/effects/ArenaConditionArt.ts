import type Phaser from 'phaser';

/**
 * Rekwizyty zmiennych aren (krok 160): wiadro, butla chloru, wózek, żółty znak „ślisko”, lustro na stojaku,
 * słup z gniazdem, żywopłot. Od kroku U6 to pikselowe sprite'y z generatora `tools/arena_props.py`
 * (wcześniej figury rysowane w kodzie) — klucze i rozmiary bez zmian, więc gra kładzie je w tych samych miejscach.
 */
export const ARENA_ART = {
  bucket: 'arena-bucket',
  bucketTipped: 'arena-bucket-tipped',
  bottle: 'arena-bottle',
  cart: 'arena-cart',
  sign: 'arena-sign',
  mirror: 'arena-mirror',
  mirrorCracked: 'arena-mirror-cracked',
  pillar: 'arena-pillar',
  nest: 'arena-nest',
  nestBroken: 'arena-nest-broken',
  hedge: 'arena-hedge',
} as const;

/** Katalog plików z generatora (względem strony). */
const ARENA_ART_DIR = 'assets/sprites/arena';

/** Ładowane raz w BootScene: każdy rekwizyt to osobny plik `<klucz>.png`. */
export function loadArenaArt(scene: Phaser.Scene): void {
  for (const key of Object.values(ARENA_ART)) scene.load.image(key, `${ARENA_ART_DIR}/${key}.png`);
}
