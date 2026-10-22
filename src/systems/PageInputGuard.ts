/**
 * Strażnik wejścia na stronie (krok 92): kliknięcia poza planszą nie mogą psuć sterowania.
 *
 * Objaw z testu w MS Edge: PPM w ciemne pole obok płótna otwierał menu kontekstowe przeglądarki,
 * menu „zjadało” puszczenie klawisza ruchu i bohater szedł sam w jedną stronę.
 * Phaser wyłącza menu tylko na płótnie, a kliknięcia poza nim i tak przetwarza (nasłuch na `window`).
 *
 * Moduł nie zna Phasera ani DOM-u wprost: dostaje cele zdarzeń i funkcje, więc da się go testować w Node.
 */

/** Powód zwolnienia wciśniętych klawiszy — trafia do dziennika diagnostyki. */
export type InputReleaseReason = 'hidden' | 'contextmenu';

export interface PageInputGuardOptions {
  /** `window` — tu nasłuch w fazie przechwytywania, zanim zobaczy zdarzenie Phaser. */
  readonly window: EventTarget;
  /** `document` — widoczność karty. */
  readonly document: EventTarget & { readonly hidden: boolean };
  /** Czy cel zdarzenia to tło gry (strona, kontener, płótno), a nie nakładka DOM (np. raport F9). */
  readonly isGameSurface: (target: EventTarget | null) => boolean;
  /** Czy cel to samo płótno gry — kliknięcia na nim należą do gry. */
  readonly isCanvas: (target: EventTarget | null) => boolean;
  /** Puszcza wszystkie wciśnięte klawisze we wszystkich scenach. */
  readonly releaseInputs: (reason: InputReleaseReason) => void;
}

/** Faza przechwytywania jako obiekt — `true` źle zdejmuje nasłuch w EventTarget z Node (testy). */
const CAPTURE: AddEventListenerOptions = { capture: true };

/** Instaluje strażnika; zwraca funkcję, która go zdejmuje. */
export function installPageInputGuard(options: PageInputGuardOptions): () => void {
  const { window: win, document: doc, isGameSurface, isCanvas, releaseInputs } = options;

  // Klik myszą poza płótnem (ale nie w nakładkę): nie trafia do gry i nie zmienia fokusu ani zaznaczenia.
  // Phaser pomija zdarzenia z `defaultPrevented`, więc nie odda strzału w ciemne pole.
  const onPointerOutside = (event: Event): void => {
    if (isGameSurface(event.target) && !isCanvas(event.target)) event.preventDefault();
  };
  // Menu kontekstowe nigdy nie otwiera się nad grą — także obok płótna.
  const onContextMenuCapture = (event: Event): void => {
    if (isGameSurface(event.target)) event.preventDefault();
  };
  // Menu jednak się otworzy (np. nad nakładką F9): puszczenie klawisza do gry nie dotrze, więc puszczamy je od razu.
  const onContextMenuBubble = (event: Event): void => {
    if (!event.defaultPrevented) releaseInputs('contextmenu');
  };
  // Ukryta karta nie dostaje `keyup`; Phaser czyści klawisze tylko przy `blur` okna.
  const onVisibility = (): void => {
    if (doc.hidden) releaseInputs('hidden');
  };

  win.addEventListener('mousedown', onPointerOutside, CAPTURE);
  win.addEventListener('contextmenu', onContextMenuCapture, CAPTURE);
  win.addEventListener('contextmenu', onContextMenuBubble);
  doc.addEventListener('visibilitychange', onVisibility);

  return () => {
    win.removeEventListener('mousedown', onPointerOutside, CAPTURE);
    win.removeEventListener('contextmenu', onContextMenuCapture, CAPTURE);
    win.removeEventListener('contextmenu', onContextMenuBubble);
    doc.removeEventListener('visibilitychange', onVisibility);
  };
}
