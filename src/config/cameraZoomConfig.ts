/**
 * Skala bazowa 2,0 (krok 18): od niej liczymy skalę płótna na ekranie (`canvasScale`), więc interfejs i płótno
 * zostają jak przy zoomie 2,0 — oddala się tylko kamera.
 */
export const BASE_CAMERA_ZOOM = 2;

/**
 * Zoom kamery 1,6 (decyzja właściciela 11.11.2026 po próbie `?zoom=1.6` z kroku 167: „ustaw ten 1.6 jako domyślny”).
 * Pole widzenia ok. 25% szersze w każdą stronę. Wszystko, co zależy od widoku (światło, mgła, pyłki, gwarantowany
 * widok Kiterów), liczy się z `CAMERA_CONFIG.zoom`.
 */
export const DEFAULT_CAMERA_ZOOM = 1.6;
