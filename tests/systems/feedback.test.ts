import { describe, expect, it } from 'vitest';
import { FEEDBACK_CONFIG } from '@/config/feedbackConfig';
import { DiagnosticLog } from '@/systems/Diagnostics';
import { buildEnvelope } from '@/systems/ReportEnvelope';
import { buildFeedbackText, describeFeedbackContext, normalizeFeedback } from '@/systems/Feedback';
import { REPORT_LIMITS, validateReport } from '../../worker/src/reports.js';

describe('czat „Napisz do autora” (krok 133)', () => {
  it('porządkuje wiadomość: spacje, znaki sterujące, nadmiar pustych linii, limit długości', () => {
    expect(normalizeFeedback('  boss bije   za mocno \r\n')).toEqual({ ok: true, message: 'boss bije   za mocno' });
    expect(normalizeFeedback('a\u0007b\n\n\n\n\nc')).toEqual({ ok: true, message: 'ab\n\nc' });
    const long = normalizeFeedback('ż'.repeat(FEEDBACK_CONFIG.maxChars + 50));
    expect(long.ok && [...long.message].length).toBe(FEEDBACK_CONFIG.maxChars);
    expect(normalizeFeedback('   ')).toEqual({ ok: false, reason: 'too-short' });
    expect(normalizeFeedback('x')).toEqual({ ok: false, reason: 'too-short' });
  });

  it('kontekst: tylko znane pola gry, wersja i platforma; słowa testera na górze', () => {
    const state = { scene: 'game', floor: 4, hero: 'archer', hp: 30, maxHp: 85, gold: 120, bossFight: true };
    expect(describeFeedbackContext({ state, platform: 'pc', build: 'production', playerName: null })).toBe(
      'piętro 4 · archer · HP 30/85 · złoto 120 · walka z bossem · pc · production',
    );
    expect(describeFeedbackContext({ state: {}, platform: 'mobile', build: 'production', playerName: null })).toBe('mobile · production');
    const text = buildFeedbackText('Dodajcie mapę', { state, platform: 'pc', build: 'production', playerName: 'Wicio' });
    expect(text.startsWith('Dodajcie mapę\n')).toBe(true);
    expect(text).toContain('Od: Wicio');
  });

  it('koperta z imieniem przechodzi walidację workera; złe imię jest pomijane, nie psuje zgłoszenia', () => {
    const log = new DiagnosticLog('sess1', 1000, { ua: 'x' });
    const make = (playerName: string | null) =>
      buildEnvelope({ kind: 'feedback', build: 'production', clientId: 'a1b2c3d4e5f60718', sessions: [log.snapshot()], reportText: 'Pomysł', playerName });
    const ok = validateReport(make('Wicio'));
    expect(ok.ok && ok.report.playerName).toBe('Wicio');
    expect(make('<script>').client).not.toHaveProperty('name');
    expect(validateReport(make('<script>')).ok).toBe(true);
    // Limity gry nie mogą przekraczać limitów workera.
    expect(FEEDBACK_CONFIG.maxChars + 400).toBeLessThan(REPORT_LIMITS.maxTextChars);
  });
});
