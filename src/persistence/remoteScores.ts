import type { RemoteScoreSource } from '@/persistence/SharedHighscores';

/**
 * Adapter wspólnej listy dla wybranej usługi. Dopóki usługa nie jest skonfigurowana,
 * zwraca null i gra zostaje przy liście lokalnej.
 */
export function createRemoteScoreSource(): RemoteScoreSource | null {
  return null;
}
