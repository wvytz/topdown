import { describe, expect, it } from 'vitest';
import { createWorkerScoreSource } from '@/persistence/remoteScores';

const signal = new AbortController().signal;

function fakeFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fn = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  };
  return { fn, calls };
}

describe('createWorkerScoreSource', () => {
  it('pobiera listę z /scores z limitem', async () => {
    const { fn, calls } = fakeFetch(200, [{ score: 5, floor: 1, timestamp: 1 }]);
    const source = createWorkerScoreSource('https://x.workers.dev/', fn);
    expect(await source.fetchTop(50, signal)).toEqual([{ score: 5, floor: 1, timestamp: 1 }]);
    expect(calls[0]?.url).toBe('https://x.workers.dev/scores?limit=50');
  });

  it('imię null z workera to brak imienia w grze', async () => {
    const { fn } = fakeFetch(200, [{ score: 5, floor: 1, timestamp: 1, name: null }, { score: 4, floor: 1, timestamp: 2, name: 'Wicio' }]);
    expect(await createWorkerScoreSource('u', fn).fetchTop(5, signal)).toEqual([
      { score: 5, floor: 1, timestamp: 1 },
      { score: 4, floor: 1, timestamp: 2, name: 'Wicio' },
    ]);
  });

  it('wysyła tylko pola wyniku jako JSON', async () => {
    const { fn, calls } = fakeFetch(201, { ok: true });
    const source = createWorkerScoreSource('https://x.workers.dev', fn);
    await source.submit({ score: 7, floor: 2, timestamp: 3, name: 'Wicio' }, signal);
    expect(calls[0]?.init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ score: 7, floor: 2, timestamp: 3, name: 'Wicio' });
  });

  it('błąd HTTP albo zła odpowiedź rzuca wyjątek (wtedy zostaje lista lokalna)', async () => {
    await expect(createWorkerScoreSource('u', fakeFetch(429, {}).fn).submit({ score: 1, floor: 1, timestamp: 1 }, signal)).rejects.toThrow();
    await expect(createWorkerScoreSource('u', fakeFetch(200, { a: 1 }).fn).fetchTop(5, signal)).rejects.toThrow();
  });
});
