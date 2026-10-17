import type Phaser from 'phaser';
import { DIAGNOSTICS } from '@/config/diagnosticsConfig';
import { DiagnosticsHub, setDiagnostics } from '@/diagnostics/DiagnosticsHub';
import { ReportOverlay } from '@/diagnostics/ReportOverlay';
import { HighscoreStorage } from '@/persistence/HighscoreStorage';
import { AutoReportConsentStore } from '@/persistence/AutoReportConsent';
import { getClientId } from '@/persistence/ClientId';
import { AutoReportPolicy } from '@/systems/AutoReport';
import { createRemoteReportSink } from '@/persistence/remoteReports';
import { FrameMonitor } from '@/systems/Diagnostics';
import type { DiagData } from '@/systems/Diagnostics';

interface PerformanceWithMemory extends Performance {
  readonly memory?: { readonly usedJSHeapSize: number };
}

const heapMB = (): number | null => {
  const used = (performance as PerformanceWithMemory).memory?.usedJSHeapSize;
  return typeof used === 'number' ? Math.round(used / 1_048_576) : null;
};

function environment(): DiagData {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    ua: navigator.userAgent,
    platform: navigator.platform,
    lang: navigator.language,
    screen: `${screen.width}x${screen.height}@${window.devicePixelRatio || 1}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    cores: navigator.hardwareConcurrency ?? null,
    deviceMemoryGB: nav.deviceMemory ?? null,
    build: import.meta.env.MODE,
    page: location.pathname,
  };
}

/**
 * Włącza dziennik diagnostyczny (krok 55):
 *  - błędy: `window.onerror`, odrzucone obietnice i wyjątki w pętli gry (pętla Phasera po wyjątku zamierałaby na stałe —
 *    łapiemy go w `game.step`, zapisujemy i gramy dalej);
 *  - niespotykane zdarzenia: zacięcia i mulenie (monitor klatek), utrata kontekstu WebGL, odcięcie karty, wysoka sterta;
 *  - puls co kilka sekund ze stanem gry — po twardym wyrzuceniu następna sesja pokaże, co było przed urwaniem;
 *  - raport pod klawiszem F9 i w nakładce po błędzie (kopiuj → wklej autorowi).
 */
export function installDiagnostics(game: Phaser.Game): DiagnosticsHub {
  const hub = DiagnosticsHub.create(environment());
  setDiagnostics(hub);
  // Wysyłka raportów do workera (krok 57) — tylko gdy skonfigurowano `VITE_SCORES_URL`; ręczna, z przycisku w F9.
  hub.setReporting(createRemoteReportSink(), getClientId(HighscoreStorage.browserStorage()), import.meta.env.MODE);
  const consent = new AutoReportConsentStore(HighscoreStorage.browserStorage());
  const overlay = new ReportOverlay(hub, consent);
  const policy = new AutoReportPolicy();
  hub.note('session-start', { href: location.search || null });

  hub.onEvent((kind, level, message) => {
    policy.onEvent(Date.now(), kind, level);
    if (level === 'error' && kind.startsWith('error:') && hub.errorCount <= 3) overlay.showError(message);
  });

  // Awaria (krok 58): po krótkim zebraniu zdarzeń wysyłamy zgłoszenie `crash` — tylko za zgodą gracza; bez decyzji pytamy raz.
  const sendCrashReport = () => {
    void hub.sendReport('crash', true, true).then((result) => {
      if (result.ok) overlay.showNotice('Raport o awarii wysłano autorowi — dziękuję!');
    });
  };
  if (hub.previousEndedAbnormally) policy.onEvent(Date.now(), 'previous-session-ended-abnormally', 'warn');
  window.setInterval(() => {
    if (!hub.canSendReports) return;
    const decision = policy.poll(Date.now(), consent.load());
    if (decision === 'send') sendCrashReport();
    else if (decision === 'ask') {
      overlay.askConsent(hub.previousEndedAbnormally && hub.errorCount === 0 ? 'Poprzednia gra urwała się nagle.' : 'W grze wystąpił błąd.', (sendNow) => {
        if (sendNow && policy.claimPending()) sendCrashReport();
        else policy.dismissPending();
      });
    }
  }, 1000);

  window.addEventListener('error', (e) => {
    hub.error('window', e.error ?? e.message, { file: e.filename ? e.filename.split('/').pop() ?? null : null, line: e.lineno ?? null, col: e.colno ?? null });
  });
  window.addEventListener('unhandledrejection', (e) => hub.error('promise', e.reason));

  // Wyjątek w kroku gry nie może zatrzymać pętli: Phaser planuje następną klatkę dopiero po udanej obsłudze bieżącej.
  const monitor = new FrameMonitor();
  const step = game.step.bind(game);
  let lastTime = -1;
  game.step = (time: number, delta: number) => {
    try {
      step(time, delta);
    } catch (error) {
      hub.error('loop', error);
    }
    if (lastTime >= 0) {
      for (const anomaly of monitor.frame(time - lastTime, time)) {
        if (anomaly.kind === 'stall') hub.note('frame-stall', { deltaMs: anomaly.deltaMs, hidden: document.hidden }, 'warn', 'Zacięcie klatki');
        else hub.note('low-fps', { fps: anomaly.fps }, 'warn', 'Niski FPS');
      }
    }
    lastTime = time;
  };

  game.events.once('ready', () => {
    const canvas = game.canvas;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      hub.note('webgl-context-lost', undefined, 'error', 'Utracono kontekst WebGL (karta graficzna/pamięć)');
    });
    canvas.addEventListener('webglcontextrestored', () => hub.note('webgl-context-restored', undefined, 'warn', 'Przywrócono kontekst WebGL'));
  });

  document.addEventListener('visibilitychange', () => hub.note('visibility', { hidden: document.hidden }));
  const clean = () => hub.markCleanEnd();
  window.addEventListener('pagehide', clean);
  window.addEventListener('beforeunload', clean);

  let heapWarned = false;
  window.setInterval(() => {
    const heap = heapMB();
    if (!heapWarned && heap !== null && heap >= DIAGNOSTICS.highHeapMB) {
      heapWarned = true;
      hub.note('high-heap', { heapMB: heap }, 'warn', 'Wysokie zużycie pamięci');
    }
    hub.heartbeat(Math.round(game.loop.actualFps * 10) / 10, heap);
  }, DIAGNOSTICS.heartbeatMs);

  window.addEventListener('keydown', (e) => {
    if (e.key === DIAGNOSTICS.reportKey) {
      e.preventDefault();
      overlay.togglePanel();
    }
  });
  return hub;
}
