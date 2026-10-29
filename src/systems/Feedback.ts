import { FEEDBACK_CONFIG } from '@/config/feedbackConfig';
import type { DiagData } from '@/systems/Diagnostics';

/**
 * Czat „Napisz do autora” (krok 133) — czysta logika: porządkowanie wiadomości i dopisanie kontekstu gry,
 * żeby autor wiedział, skąd wiadomość przyszła (piętro, bohater, tryb, wersja). Wysyłka — `DiagnosticsHub.sendFeedback`,
 * okienko — `diagnostics/FeedbackBox.ts`.
 */

export type FeedbackCheck = { readonly ok: true; readonly message: string } | { readonly ok: false; readonly reason: 'too-short' };

/** Usuwa znaki sterujące, przycina spacje i nadmiar pustych linii, obcina do limitu. */
export function normalizeFeedback(raw: string, config: { readonly minChars: number; readonly maxChars: number; readonly maxBlankLines: number } = FEEDBACK_CONFIG): FeedbackCheck {
  const blank = '\n'.repeat(config.maxBlankLines + 1);
  const cleaned = raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .replace(new RegExp(`\\n{${config.maxBlankLines + 2},}`, 'g'), blank)
    .trim();
  const message = [...cleaned].slice(0, config.maxChars).join('').trim();
  if ([...message].length < config.minChars) return { ok: false, reason: 'too-short' };
  return { ok: true, message };
}

export interface FeedbackContext {
  /** Stan gry z dziennika (`DiagnosticsHub.currentState`) — piętro, bohater, złoto… albo pusty poza grą. */
  readonly state: DiagData;
  readonly platform: string;
  readonly build: string;
  readonly playerName: string | null;
}

/** Linijka kontekstu pod wiadomością: tylko to, co jest znane. */
export function describeFeedbackContext(context: FeedbackContext): string {
  const s = context.state;
  const parts: string[] = [];
  if (typeof s.floor === 'number') parts.push(`piętro ${s.floor}`);
  if (typeof s.hero === 'string') parts.push(s.hero);
  if (typeof s.hp === 'number' && typeof s.maxHp === 'number') parts.push(`HP ${s.hp}/${s.maxHp}`);
  if (typeof s.gold === 'number') parts.push(`złoto ${s.gold}`);
  if (s.bossFight === true) parts.push('walka z bossem');
  if (typeof s.scene === 'string' && s.scene !== 'game') parts.push(`ekran: ${s.scene}`);
  parts.push(context.platform, context.build);
  return parts.join(' · ');
}

/** Treść zgłoszenia: najpierw słowa testera (to widzi autor na liście), pod kreską kontekst gry. */
export function buildFeedbackText(message: string, context: FeedbackContext): string {
  const who = context.playerName ? `Od: ${context.playerName}\n` : '';
  return `${message}\n\n———\n${who}${describeFeedbackContext(context)}`;
}
