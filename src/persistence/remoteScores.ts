import type { ScoreEntry } from '@/systems/Highscores';
import type { RemoteScoreSource } from '@/persistence/SharedHighscores';

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

/** Adapter workera Cloudflare (`worker/`): GET/POST na `<adres>/scores`. */
export function createWorkerScoreSource(baseUrl: string, fetchFn: FetchFn): RemoteScoreSource {
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/scores`;
  return {
    async fetchTop(limit, signal) {
      const response = await fetchFn(`${endpoint}?limit=${limit}`, { signal });
      if (!response.ok) throw new Error(`scores: HTTP ${response.status}`);
      const data: unknown = await response.json();
      if (!Array.isArray(data)) throw new Error('scores: zła odpowiedź');
      return data as ScoreEntry[];
    },
    async submit(entry, signal) {
      const response = await fetchFn(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: entry.score, floor: entry.floor, timestamp: entry.timestamp }),
        signal,
      });
      if (!response.ok) throw new Error(`scores: HTTP ${response.status}`);
    },
  };
}

/**
 * Wspólna lista z adresu `VITE_SCORES_URL` (plik `.env.production` / `.env.local`).
 * Bez adresu zwraca null i gra zostaje przy liście lokalnej.
 */
export function createRemoteScoreSource(): RemoteScoreSource | null {
  const url: unknown = import.meta.env.VITE_SCORES_URL;
  if (typeof url !== 'string' || url.trim() === '' || typeof fetch !== 'function') return null;
  return createWorkerScoreSource(url.trim(), (input, init) => fetch(input, init));
}
