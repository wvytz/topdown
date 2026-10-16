import { DIAGNOSTICS } from '@/config/diagnosticsConfig';
import type { ReportEnvelope, SendResult } from '@/systems/ReportEnvelope';

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

/** Cel wysyłki zgłoszeń; konkretną usługę podpina adapter (dziś worker Cloudflare, `POST <adres>/reports`). */
export interface ReportSink {
  send(envelope: ReportEnvelope): Promise<SendResult>;
}

/** Adapter workera: tłumaczy odpowiedzi HTTP na wynik wysyłki; błąd sieci i limit czasu nie rzucają wyjątku. */
export function createWorkerReportSink(baseUrl: string, fetchFn: FetchFn, timeoutMs: number = DIAGNOSTICS.reports.timeoutMs): ReportSink {
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/reports`;
  return {
    async send(envelope) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchFn(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(envelope),
          signal: controller.signal,
        });
        if (response.status === 201 || response.status === 200) {
          const data = (await response.json().catch(() => ({}))) as { id?: number; duplicate?: boolean };
          return { ok: true, ...(typeof data.id === 'number' ? { id: data.id } : {}), ...(data.duplicate ? { duplicate: true } : {}) };
        }
        if (response.status === 413) return { ok: false, reason: 'too-large' };
        if (response.status === 429) return { ok: false, reason: 'rate-limited', retryAfterS: Number(response.headers.get('Retry-After')) || 3600 };
        if (response.status === 503) return { ok: false, reason: 'unavailable', retryAfterS: Number(response.headers.get('Retry-After')) || 3600 };
        return { ok: false, reason: 'rejected' };
      } catch {
        return { ok: false, reason: 'network' };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** Cel z adresu `VITE_SCORES_URL` (ten sam worker co wyniki); null, gdy adresu brak — wtedy przycisk wysyłki się nie pokazuje. */
export function createRemoteReportSink(): ReportSink | null {
  const url: unknown = import.meta.env.VITE_SCORES_URL;
  if (typeof url !== 'string' || url.trim() === '' || typeof fetch !== 'function') return null;
  return createWorkerReportSink(url.trim(), (input, init) => fetch(input, init));
}
