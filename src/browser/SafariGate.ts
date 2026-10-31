import { shouldBlockBrowser } from '@/core/browserGate';

/**
 * Ekran zamiast gry na Safari (krok 142, decyzja właściciela). Zwykły DOM nad stroną, zanim wystartuje Phaser —
 * wspólny dla wersji PC i mobilnej. Decyzję podejmuje czysta funkcja `shouldBlockBrowser` (furtka `?safari=0|1`).
 */

interface BrowserLink {
  readonly label: string;
  readonly href: string;
}

const GOOD_BROWSERS: readonly BrowserLink[] = [
  { label: 'Firefox', href: 'https://www.mozilla.org/pl/firefox/new/' },
  { label: 'DuckDuckGo', href: 'https://duckduckgo.com/app' },
  { label: 'Brave', href: 'https://brave.com/download/' },
];

const CHROME: BrowserLink = { label: "Chrome'owi", href: 'https://www.google.com/chrome/' };

const STYLE = `
#safari-gate {
  position: fixed; inset: 0; z-index: 100; overflow-y: auto; touch-action: pan-y;
  display: flex; align-items: center; justify-content: center; box-sizing: border-box; padding: 24px 16px;
  background: radial-gradient(ellipse at 50% 35%, #2a0d10 0%, #0e0e12 55%, #07060b 100%);
  color: #f1e2a9; font: 16px/1.5 monospace; text-align: center;
  -webkit-user-select: text; user-select: text;
}
#safari-gate .box { max-width: 520px; width: 100%; }
#safari-gate img { width: 72px; height: 72px; image-rendering: pixelated; filter: drop-shadow(0 0 18px #b3242a88); }
#safari-gate .title { margin: 8px 0 20px; font-size: 13px; letter-spacing: 6px; color: #a0a0b8; }
#safari-gate h1 { margin: 0 0 16px; font-size: 24px; line-height: 1.3; color: #e2493f; text-shadow: 0 2px 0 #000; }
#safari-gate p { margin: 0 0 14px; }
#safari-gate .links { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin: 4px 0 22px; }
#safari-gate .links a {
  display: inline-block; min-width: 120px; padding: 10px 14px; border: 2px solid #f1e2a9; background: #1a1720;
  color: #f1e2a9; text-decoration: none; font-weight: bold; box-shadow: 0 3px 0 #000;
}
#safari-gate .links a:hover, #safari-gate .links a:focus-visible { background: #f1e2a9; color: #0e0e12; outline: none; }
#safari-gate .chrome { color: #8a8698; }
#safari-gate .chrome a { color: #8a8698; }
#safari-gate .note { margin-top: 26px; font-size: 12px; color: #6d6a7a; }
`;

/** Zwraca `true`, gdy pokazano ekran blokady — wtedy gry nie startujemy. */
export function showSafariGateIfNeeded(win: Window = window): boolean {
  const isBrave = 'brave' in win.navigator; // Brave na iPhonie ma user-agent Safari, ale wystawia navigator.brave
  if (!shouldBlockBrowser(win.navigator.userAgent, win.location.search, isBrave)) return false;
  const doc = win.document;
  const style = doc.createElement('style');
  style.textContent = STYLE;
  doc.head.appendChild(style);
  doc.title = 'TOP DOWN — nie na Safari';

  const gate = doc.createElement('div');
  gate.id = 'safari-gate';
  const box = doc.createElement('div');
  box.className = 'box';
  gate.appendChild(box);

  const icon = doc.createElement('img');
  icon.src = `${import.meta.env.BASE_URL}icons/favicon.svg`;
  icon.alt = '';
  box.appendChild(icon);
  box.appendChild(textEl(doc, 'div', 'TOP DOWN', 'title'));
  box.appendChild(textEl(doc, 'h1', 'Na Safari tej gry nie odpalisz.'));
  box.appendChild(textEl(doc, 'p', "Zainstaluj Firefoxa, DuckDuckGo albo Brave'a…"));

  const links = doc.createElement('div');
  links.className = 'links';
  for (const link of GOOD_BROWSERS) links.appendChild(anchor(doc, link));
  box.appendChild(links);

  const chrome = textEl(doc, 'p', '…albo oddaj wszystkie swoje informacje ', 'chrome');
  chrome.appendChild(anchor(doc, CHROME));
  chrome.appendChild(doc.createTextNode('.'));
  box.appendChild(chrome);
  box.appendChild(textEl(doc, 'p', 'Potem wróć pod ten sam adres — wieża poczeka.', 'note'));

  doc.body.appendChild(gate);
  return true;
}

function textEl(doc: Document, tag: string, text: string, className?: string): HTMLElement {
  const el = doc.createElement(tag);
  el.textContent = text;
  if (className) el.className = className;
  return el;
}

function anchor(doc: Document, link: BrowserLink): HTMLAnchorElement {
  const a = doc.createElement('a');
  a.href = link.href;
  a.textContent = link.label;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}
