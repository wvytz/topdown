/**
 * Podpowiedzi sterowania zależne od urządzenia (krok U9c): klawiatura z myszą, pad albo dotyk.
 * Gra pokazuje napisy dla urządzenia, którego gracz użył ostatnio (telefon — zawsze dotyk).
 */
export type HintDevice = 'keyboard' | 'pad' | 'touch';

/** Tekst dla każdego urządzenia. */
export type DeviceText = Readonly<Record<HintDevice, string>>;

/** Pad liczy się jako „używany”, gdy przycisk albo gałka przekroczy ten próg. */
export const PAD_ACTIVITY_THRESHOLD = 0.5;

export const INPUT_HINTS = {
  menuMain: {
    keyboard: '↑ ↓  WYBÓR   ·   ENTER — OK',
    pad: 'KRZYŻAK  WYBÓR   ·   A — OK',
    touch: 'STUKNIJ POZYCJĘ',
  },
  menuSub: {
    keyboard: '↑ ↓  WYBÓR   ·   ENTER — OK   ·   ESC — WRÓĆ',
    pad: 'KRZYŻAK  WYBÓR   ·   A — OK   ·   B — WRÓĆ',
    touch: 'STUKNIJ POZYCJĘ   ·   „WRÓĆ” — POWRÓT',
  },
  menuFloor: {
    keyboard: '← →  PIĘTRO   ·   ENTER — DALEJ   ·   ESC — WRÓĆ',
    pad: '← →  PIĘTRO   ·   A — DALEJ   ·   B — WRÓĆ',
    touch: 'STUKNIJ ◂ ▸ — PIĘTRO   ·   NAZWĘ — DALEJ',
  },
  slotDelete: {
    keyboard: 'X / DELETE — usuń zapis',
    pad: 'Y — usuń zapis',
    touch: 'Stuknij „USUŃ ZAPIS”',
  },
  slotDeleteConfirm: {
    keyboard: 'Naciśnij X ponownie, by usunąć',
    pad: 'Naciśnij Y ponownie, by usunąć',
    touch: 'Stuknij „USUŃ ZAPIS” ponownie, by usunąć',
  },
  heroSelect: {
    keyboard: '← →  BOHATER   ·   ↑ ↓  TRYB   ·   ENTER — START   ·   ESC — MENU',
    pad: '← →  BOHATER   ·   ↑ ↓  TRYB   ·   A — START   ·   B — MENU',
    touch: 'STUKNIJ BOHATERA, BY ZACZĄĆ',
  },
  heroSelectNoMode: {
    keyboard: '← →  BOHATER   ·   ENTER — START   ·   ESC — MENU',
    pad: '← →  BOHATER   ·   A — START   ·   B — MENU',
    touch: 'STUKNIJ BOHATERA, BY ZACZĄĆ',
  },
  /** Linia sterowania w HUD (PC); `{attacks}` — ataki bohatera. Na telefonie przyciski są podpisane, więc pusto. */
  hud: {
    keyboard: 'WASD — ruch · {attacks} · R — ultimate · Spacja — dash · E — kapliczka, schody',
    pad: 'Gałka — ruch · {attacks} · RB — ultimate · A — dash · Y — kapliczka, schody',
    touch: '',
  },
  hudAttacks: {
    keyboard: { melee: 'LPM — atak · PPM — strzał', sorcery: 'LPM — kule energii · PPM — Wyrwa (przytrzymaj, rośnie)' },
    pad: { melee: 'X / RT — atak · B / LT — strzał', sorcery: 'X / RT — kule energii · B / LT — Wyrwa (przytrzymaj)' },
    touch: { melee: '', sorcery: '' },
  },
  /** „Naciśnij E” przy schodach i kapliczce. */
  pressInteract: { keyboard: 'Naciśnij E', pad: 'Naciśnij Y', touch: 'Stuknij E' },
  /** Przycisk usuwania zapisu na dotyk (menu → Wczytaj grę). */
  deleteButton: 'USUŃ ZAPIS',
} as const satisfies Record<string, unknown>;
